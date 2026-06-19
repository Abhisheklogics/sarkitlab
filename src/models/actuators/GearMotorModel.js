"use strict";

// ─── SPICE-level Gear Motor model ──────────────────────────────────────────
// Same electrical fixes as DCMotorModel, plus gearbox efficiency losses
// stamped correctly in the thermal model.

const R_WIND_G          = 5.0;
const L_WIND_G          = 1.2e-3;
const Kv_DEF_G          = 0.01719;
const Kt_DEF_G          = 0.01719;
const J_DEF_G           = 5e-6;
const B_DEF_G           = 2e-6;
const STATIC_FRICTION_G = 4e-4;    // slightly higher than plain DC — gear friction
const GEAR_RATIO        = 30;
const ETA               = 0.75;    // gearbox efficiency
const V_RATED_G         = 9.0;
const I_RATED_G         = 0.4;
const I_STALL_G         = 1.8;
const R_TH_JA_G         = 45;
const TAU_TH_G          = 35.0;
const T_MAX_G           = 120;
const RPM_SMOOTH_G      = 0.15;
const T_AMB             = 25;
const OMEGA_STALL       = 0.5;

// Derived minimum spin voltage (same logic as DCMotor)
const V_MIN_SPIN_G = Math.max(
  (STATIC_FRICTION_G * R_WIND_G) / Kt_DEF_G,
  V_RATED_G * 0.12   // 12% floor — geared motor needs slightly more
);

const PIN_PAIRS = [
  ["VCC","GND"], ["+","-"], ["A","B"], ["IN1","IN2"], ["M+","M-"],
];

function _findPins(comp, solver) {
  if (comp.pins?.[0]?.id && comp.pins?.[1]?.id) {
    const v = solver.findNet(comp.id, comp.pins[0].id);
    const g = solver.findNet(comp.id, comp.pins[1].id);
    if (v && g) return { VCC: v, GND: g };
  }
  for (const [vn, gn] of PIN_PAIRS) {
    const v = solver.findNet(comp.id, vn);
    const g = solver.findNet(comp.id, gn);
    if (v && g) return { VCC: v, GND: g };
  }
  return { VCC: null, GND: null };
}

function _init(comp) {
  if (comp._motorInit) return;
  comp._omega       = 0;
  comp._omegaSmooth = 0;
  comp._I           = 0;
  comp._tempC       = T_AMB;
  comp._overTemp    = false;
  comp._stalled     = false;
  comp._stalledMs   = 0;
  comp._motorInit   = true;
  comp._branch      = null;
  comp._iWind       = 0;
  comp._vL          = 0;
  comp._backEMF     = 0;
}

export default class GearMotorModel {

  static solve(comp, electrical, solver) {
    const { VCC, GND } = _findPins(comp, solver);
    if (!VCC || !GND) { comp.instance?.setOff?.(); return; }
    _init(comp);

    const dt  = Math.max(1e-9, solver._dt ?? solver.dt ?? 1e-4);
    const R   = Math.max(comp.resistance ?? R_WIND_G, 0.1);
    const L   = Math.max(comp.Lwind     ?? L_WIND_G, 1e-9);
    const Kv  = comp.Kv ?? Kv_DEF_G;

    // ── Back-EMF stamped as vOffset → NR sees it every iteration ─────────
    const e = comp._omega * Kv;

    const Req = R + (2 * L) / dt;
    const Veq = e - (2 * L / dt) * comp._iWind - comp._vL;

    // ── Stall-current limiting (same PTC soft model as DCMotor) ──────────
    const I_est   = Math.abs(comp._iWind);
    const I_rated = comp.Irated ?? I_RATED_G;
    const R_extra = I_est > I_rated
      ? R * 2.0 * Math.pow((I_est - I_rated) / I_rated, 1.5)
      : 0;
    const ReqTotal = Req + R_extra;

    const branch = {
      id:            comp.id,
      type:          "INDUCTOR",
      a:             VCC,
      b:             GND,
      inductance:    L,
      _companionInd: { Req: ReqTotal, Veq },
    };
    electrical.circuits.push(branch);
    comp._branch  = branch;
    comp._backEMF = e;
  }

  static update(comp, electrical, solver) {
    _init(comp);
    const dt     = Math.max(1e-9, solver._dt ?? solver.dt ?? 1e-4);
    const branch = comp._branch;
    if (!branch) { comp.instance?.setOff?.(); return; }

    const Va    = electrical.netVoltage.get(branch.a) ?? 0;
    const Vb    = electrical.netVoltage.get(branch.b) ?? 0;
    const vDiff = Va - Vb;

    const R          = Math.max(comp.resistance ?? R_WIND_G, 0.1);
    const L          = Math.max(comp.Lwind     ?? L_WIND_G, 1e-9);
    const Kv         = comp.Kv        ?? Kv_DEF_G;
    const Kt         = comp.Kt        ?? Kt_DEF_G;
    const J          = comp.J         ?? J_DEF_G;
    const Bf         = comp.B         ?? B_DEF_G;
    const Tstatic    = comp.staticFriction ?? STATIC_FRICTION_G;
    const gearRatio  = comp.gearRatio ?? GEAR_RATIO;
    const efficiency = comp.efficiency ?? ETA;
    const vRated     = comp.ratedVoltage ?? V_RATED_G;

    const I_raw  = branch.current ?? 0;
    const I      = Math.max(-I_STALL_G, Math.min(I_STALL_G, I_raw));

    const e_used  = comp._backEMF ?? 0;
    comp._vL      = vDiff - I * R - e_used;
    comp._iWind   = I;

    // ── Minimum voltage check ─────────────────────────────────────────────
    const vMinSpin = comp.vMinSpin ?? V_MIN_SPIN_G;
    if (Math.abs(vDiff) < vMinSpin) {
      const tau   = J / Math.max(Bf, 1e-9);
      comp._omega = comp._omega * Math.exp(-dt / Math.max(tau, dt));
      if (Math.abs(comp._omega) < OMEGA_STALL) comp._omega = 0;
      comp._stalled = false;
      comp._I = I;
      _smooth(comp, dt, RPM_SMOOTH_G);
      _thermal(comp, I, R, Bf, dt, Kt * I, efficiency);
      _toUI_gear(comp, vDiff, I, Kv, vRated, gearRatio, efficiency, false);
      return;
    }

    // ── Referred load torque (gear+efficiency losses) ─────────────────────
    // Motor output torque at shaft: tau_m = Kt * I
    // Load torque referred to motor shaft: tau_load_motor = tau_load / (N * eta)
    const tau_m          = Kt * I;
    const tau_load_motor = (comp.loadTorque ?? 0) /
                           Math.max(gearRatio * efficiency, 1e-6);

    // ── Stiction check ────────────────────────────────────────────────────
    if (Math.abs(comp._omega) < OMEGA_STALL) {
      const tau_avail = Math.abs(tau_m) - tau_load_motor;
      if (tau_avail < Tstatic) {
        comp._omega = 0;
        comp._stalledMs += dt * 1000;
        if (!comp._stalled) {
          comp._stalled = true;
          console.warn(
            `[GearMotor] ${comp.id}: STALLED (stiction) ` +
            `@ ${vDiff.toFixed(2)}V I=${(I*1000).toFixed(0)}mA`
          );
        }
        _thermal(comp, I, R, Bf, dt, tau_m, efficiency);
        comp._I = I;
        _smooth(comp, dt, RPM_SMOOTH_G);
        _toUI_gear(comp, vDiff, I, Kv, vRated, gearRatio, efficiency, false);
        return;
      }
    }

    // ── Mechanical integration ────────────────────────────────────────────
    const tau_f   = Bf * comp._omega;
    const tau_net = tau_m - tau_f - tau_load_motor;
    comp._omega += (tau_net / J) * dt;

    const omegaMax = Math.abs(vDiff) / Math.max(Kv, 1e-6);
    comp._omega    = _clamp(comp._omega, omegaMax * 1.05);

    if (vDiff >= 0 && comp._omega < 0) comp._omega = 0;
    if (vDiff <  0 && comp._omega > 0) comp._omega = 0;

    const isStalled = Math.abs(comp._omega) < OMEGA_STALL && Math.abs(tau_net) < 1e-6;
    if (isStalled) {
      comp._stalledMs += dt * 1000;
      if (!comp._stalled) {
        comp._stalled = true;
        console.warn(`[GearMotor] ${comp.id}: STALLED @ ${vDiff.toFixed(2)}V I=${(I*1000).toFixed(0)}mA`);
      }
    } else {
      comp._stalledMs = 0;
      comp._stalled   = false;
    }

    _thermal(comp, I, R, Bf, dt, tau_m, efficiency);
    comp._I = I;
    _smooth(comp, dt, RPM_SMOOTH_G);
    _toUI_gear(comp, vDiff, I, Kv, vRated, gearRatio, efficiency, false);
  }

  static reset(comp) {
    comp._omega       = 0;
    comp._omegaSmooth = 0;
    comp._I           = 0;
    comp._tempC       = T_AMB;
    comp._overTemp    = false;
    comp._stalled     = false;
    comp._stalledMs   = 0;
    comp._motorInit   = true;
    comp._branch      = null;
    comp._iWind       = 0;
    comp._vL          = 0;
    comp._backEMF     = 0;
    comp.instance?.setOff?.();
    comp.instance?.reset?.();
  }
}

function _thermal(comp, I, R, Bf, dt, tau_m, efficiency) {
  const P_copper   = I * I * R;
  const P_friction = Bf * comp._omega * comp._omega;
  const P_mech     = Math.abs((tau_m ?? 0) * comp._omega);
  // Gearbox loss: (1-eta) fraction of mechanical power is heat
  const P_gear     = efficiency != null ? P_mech * (1.0 - efficiency) : 0;
  const P_loss     = P_copper + P_friction + P_gear;
  comp._tempC += (P_loss * R_TH_JA_G - (comp._tempC - T_AMB)) * (dt / TAU_TH_G);
  comp._tempC  = Math.max(T_AMB, Math.min(comp._tempC, T_MAX_G));
  if (comp._tempC >= T_MAX_G && !comp._overTemp) {
    comp._overTemp = true;
    console.warn(`[GearMotor] ${comp.id}: OVER-TEMP ${comp._tempC.toFixed(1)}°C`);
  } else if (comp._tempC < T_MAX_G - 10) {
    comp._overTemp = false;
  }
}

function _toUI_gear(comp, vDiff, I, Kv, vRated, gearRatio, efficiency, cannotSpin) {
  const omegaMax  = Math.abs(vDiff) / Math.max(Kv, 1e-6);
  const speedNorm = omegaMax > 0 ? comp._omegaSmooth / omegaMax : 0;
  const motorRPM  = comp._omegaSmooth * 60 / (2 * Math.PI);
  const outputRPM = motorRPM / gearRatio * efficiency;
  comp.instance?.updatePhysics?.({
    speedNorm:  cannotSpin ? 0 : _clamp(speedNorm, 1),
    current:    Math.abs(I),
    voltage:    vDiff,
    motorRPM:   cannotSpin ? 0 : motorRPM,
    outputRPM:  cannotSpin ? 0 : outputRPM,
    stalled:    comp._stalled  ?? false,
    overTemp:   comp._overTemp ?? false,
    cannotSpin: cannotSpin ?? false,
  });
}

function _smooth(comp, dt, tau) {
  const a = 1 - Math.exp(-dt / tau);
  comp._omegaSmooth += a * (comp._omega - comp._omegaSmooth);
}

function _clamp(v, limit) {
  return Math.max(-limit, Math.min(limit, v));
}