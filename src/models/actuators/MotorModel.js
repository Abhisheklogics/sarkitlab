"use strict";

// ─── SPICE-level DC Motor model ────────────────────────────────────────────

const R_WIND_DC          = 5.0;
const L_WIND_DC          = 1e-3;
const Kv_DEF_DC          = 0.01719;
const Kt_DEF_DC          = 0.01719;
const J_DEF_DC           = 5e-6;
const B_DEF_DC           = 2e-6;
const STATIC_FRICTION_DC = 3e-4;
const V_RATED_DC         = 9.0;
const I_RATED_DC         = 0.4;
const I_STALL_DC         = 1.8;
const R_TH_JA_DC         = 50;
const TAU_TH_DC          = 30.0;
const T_AMB              = 25;
const T_MAX_DC           = 125;
const OMEGA_STALL        = 0.5;
const RPM_SMOOTH_DC      = 0.12;

const V_MIN_SPIN_DC = Math.max(
  (STATIC_FRICTION_DC * R_WIND_DC) / Kt_DEF_DC,
  V_RATED_DC * 0.10
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

export default class DCMotorModel {

  static solve(comp, electrical, solver) {
    const { VCC, GND } = _findPins(comp, solver);
    if (!VCC || !GND) { comp.instance?.setOff?.(); return; }
    _init(comp);

    const dt  = Math.max(1e-9, solver._dt ?? solver.dt ?? 1e-4);
    const R   = Math.max(comp.resistance ?? R_WIND_DC, 0.1);
    const L   = Math.max(comp.Lwind     ?? L_WIND_DC, 1e-9);
    const Kv  = comp.Kv ?? Kv_DEF_DC;

    const e = comp._omega * Kv;

    const Req = R + (2 * L) / dt;

    // FIX: _vL now updated at END of update() before next solve() call,
    // so Veq always uses the freshest inductor voltage from last timestep.
    // This eliminates the stale-vL drift at large dt.
    const Veq = e - (2 * L / dt) * comp._iWind - comp._vL;

    const I_est    = Math.abs(comp._iWind);
    const I_rated  = comp.Irated ?? I_RATED_DC;
    const R_extra  = I_est > I_rated
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

    const R       = Math.max(comp.resistance ?? R_WIND_DC, 0.1);
    const L       = Math.max(comp.Lwind     ?? L_WIND_DC, 1e-9);
    const Kv      = comp.Kv ?? Kv_DEF_DC;
    const Kt      = comp.Kt ?? Kt_DEF_DC;
    const J       = comp.J  ?? J_DEF_DC;
    const Bf      = comp.B  ?? B_DEF_DC;
    const Tstatic = comp.staticFriction ?? STATIC_FRICTION_DC;
    const vRated  = comp.ratedVoltage   ?? V_RATED_DC;

    const I_raw = branch.current ?? 0;
    const I     = Math.max(-I_STALL_DC, Math.min(I_STALL_DC, I_raw));

    // FIX: Update _vL AFTER reading current — this is the inductor voltage
    // for the NEXT timestep's Veq. Eliminates stale-vL lag.
    const e_used  = comp._backEMF ?? 0;
    const vL_new  = vDiff - I * R - e_used;
    comp._iWind   = I;
    // vL update deferred to end so solve() reads last timestep's value correctly.
    // We store tentative here; final commit after mechanical update.
    const vL_prev = comp._vL;
    comp._vL      = vL_new;

    const vMinSpin = comp.vMinSpin ?? V_MIN_SPIN_DC;
    if (Math.abs(vDiff) < vMinSpin) {
      const tau   = J / Math.max(Bf, 1e-9);
      comp._omega = comp._omega * Math.exp(-dt / Math.max(tau, dt));
      if (Math.abs(comp._omega) < OMEGA_STALL) comp._omega = 0;
      comp._stalled = false;
      comp._I = I;
      _smooth(comp, dt, RPM_SMOOTH_DC);
      _thermal(comp, I, R, Bf, dt);
      _toUI_dc(comp, vDiff, I, Kv, vRated, false);
      return;
    }

    const tau_m    = Kt * I;
    const tau_load = comp.loadTorque ?? 0;

    if (Math.abs(comp._omega) < OMEGA_STALL) {
      const tau_avail = Math.abs(tau_m) - tau_load;
      if (tau_avail < Tstatic) {
        comp._omega = 0;
        comp._stalledMs += dt * 1000;
        if (!comp._stalled) {
          comp._stalled = true;
          console.warn(
            `[DCMotor] ${comp.id}: STALLED (stiction) ` +
            `@ ${vDiff.toFixed(2)}V I=${(I*1000).toFixed(0)}mA ` +
            `tau_m=${tau_m.toExponential(2)} tau_static=${Tstatic.toExponential(2)}`
          );
        }
        _thermal(comp, I, R, Bf, dt);
        comp._I = I;
        _smooth(comp, dt, RPM_SMOOTH_DC);
        _toUI_dc(comp, vDiff, I, Kv, vRated, false);
        return;
      }
    }

    // FIX: Semi-implicit Euler for mechanical integration
    // omega_new = (omega*J + Kt*I*dt - tau_load*dt) / (J + Bf*dt)
    // This is unconditionally stable unlike explicit Euler at large dt.
    const J_eff    = comp.J ?? J_DEF_DC;
    const omega_new = (comp._omega * J_eff + (tau_m - tau_load) * dt)
                    / (J_eff + Bf * dt);

    const omegaMax = Math.abs(vDiff) / Math.max(Kv, 1e-6);
    // FIX: clamp to omegaMax (no 1.05 overshoot — that caused regen oscillation)
    comp._omega = _clamp(omega_new, omegaMax);

    if (vDiff >= 0 && comp._omega < 0) comp._omega = 0;
    if (vDiff <  0 && comp._omega > 0) comp._omega = 0;

    const isStalled = Math.abs(comp._omega) < OMEGA_STALL && Math.abs(tau_m - tau_load) < Tstatic;
    if (isStalled) {
      comp._stalledMs += dt * 1000;
      if (!comp._stalled) {
        comp._stalled = true;
        console.warn(`[DCMotor] ${comp.id}: STALLED @ ${vDiff.toFixed(2)}V I=${(I*1000).toFixed(0)}mA`);
      }
    } else {
      comp._stalledMs = 0;
      comp._stalled   = false;
    }

    _thermal(comp, I, R, Bf, dt);
    comp._I = I;
    _smooth(comp, dt, RPM_SMOOTH_DC);
    _toUI_dc(comp, vDiff, I, Kv, vRated, false);
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

function _thermal(comp, I, R, Bf, dt) {
  const P_loss = I * I * R + Bf * comp._omega * comp._omega;
  comp._tempC += (P_loss * R_TH_JA_DC - (comp._tempC - T_AMB)) * (dt / TAU_TH_DC);
  comp._tempC  = Math.max(T_AMB, Math.min(comp._tempC, T_MAX_DC));
  if (comp._tempC >= T_MAX_DC && !comp._overTemp) {
    comp._overTemp = true;
    console.warn(`[DCMotor] ${comp.id}: OVER-TEMP ${comp._tempC.toFixed(1)}°C`);
  } else if (comp._tempC < T_MAX_DC - 10) {
    comp._overTemp = false;
  }
}

function _toUI_dc(comp, vDiff, I, Kv, vRated, cannotSpin) {
  const omegaMax = Math.abs(vDiff) / Math.max(Kv, 1e-6);
  // FIX: guard omegaMax near-zero explicitly to prevent NaN/Inf speedNorm
  const speedNorm = omegaMax > 1e-6 ? _clamp(comp._omegaSmooth / omegaMax, 1) : 0;
  const motorRPM  = comp._omegaSmooth * 60 / (2 * Math.PI);
  comp.instance?.updatePhysics?.({
    speedNorm:  cannotSpin ? 0 : speedNorm,
    current:    Math.abs(I),
    voltage:    vDiff,
    motorRPM:   cannotSpin ? 0 : motorRPM,
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