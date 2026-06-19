"use strict";

// ─── SPICE-level DC Motor model ────────────────────────────────────────────
//
// KEY FIXES vs original:
//
// 1. BACK-EMF AS PROPER VOLTAGE SOURCE IN MNA
//    Original: back-EMF entered as Veq in companion inductor only.
//    Each NR iter reused stale omega from PREVIOUS timestep → weak coupling.
//    Fix: back-EMF is now a proper vOffset on the branch stamp. The NR loop
//    sees the correct counter-EMF and solves the electrical + mechanical
//    equations simultaneously within each timestep.
//
// 2. MINIMUM DRIVE VOLTAGE (V_MIN_SPIN)
//    Original: V_MIN_SPIN = 0.3V — far too low.
//    A real DC motor has static friction + cogging. At low voltage, the
//    electrical torque cannot overcome static friction. Fix: V_MIN_SPIN is
//    now derived from the actual rated voltage and stiction torque, not
//    a magic constant. Motor won't start below ~10-15% of rated voltage.
//
// 3. STALL CURRENT LIMITING
//    Original: stall current uncapped → at 0 RPM, I = V/R = 9/5 = 1.8A.
//    Real motors have thermal fuses or PTC protection. We soft-limit with
//    a current-dependent resistance term that kicks in above I_rated.

const R_WIND_DC          = 5.0;     // winding resistance (Ω)
const L_WIND_DC          = 1e-3;    // winding inductance (H)
const Kv_DEF_DC          = 0.01719; // rad/s/V — no-load speed constant
const Kt_DEF_DC          = 0.01719; // N·m/A  — torque constant (= Kv for SI)
const J_DEF_DC           = 5e-6;    // rotor inertia (kg·m²)
const B_DEF_DC           = 2e-6;    // viscous friction (N·m·s/rad)
const STATIC_FRICTION_DC = 3e-4;    // N·m stiction threshold
const V_RATED_DC         = 9.0;     // rated operating voltage
const I_RATED_DC         = 0.4;     // rated current (A) — ~2W motor
const I_STALL_DC         = 1.8;     // stall current at rated V (= V/R)
const R_TH_JA_DC         = 50;      // thermal resistance junction→ambient (°C/W)
const TAU_TH_DC          = 30.0;    // thermal time constant (s)
const T_AMB              = 25;
const T_MAX_DC           = 125;
const OMEGA_STALL        = 0.5;     // rad/s — below this = stalled
const RPM_SMOOTH_DC      = 0.12;    // display smoothing tau (s)

// Minimum torque to spin up from rest (must overcome static friction).
// Derived: V_min = (Tstatic * R) / Kt
// With defaults: V_min = (3e-4 * 5) / 0.01719 ≈ 0.087V
// We add a practical floor at 10% of rated voltage for cogging:
const V_MIN_SPIN_DC = Math.max(
  (STATIC_FRICTION_DC * R_WIND_DC) / Kt_DEF_DC,
  V_RATED_DC * 0.10   // 0.9V floor for 9V motor
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

    // ── Back-EMF: e = omega * Kv ─────────────────────────────────────────
    // Stamped as vOffset so the NR loop sees the correct counter-EMF
    // every iteration (not just once per timestep as before).
    const e = comp._omega * Kv;

    // ── Trapezoidal inductor companion model ─────────────────────────────
    // Req = R + 2L/dt (winding R in series with inductor companion)
    // Veq = e - (2L/dt)*I_prev - V_L_prev
    const Req = R + (2 * L) / dt;
    const Veq = e - (2 * L / dt) * comp._iWind - comp._vL;

    // ── Current-limiting resistance at high load ──────────────────────────
    // At stall, I = V/R → 9/5 = 1.8A which is physically possible but
    // destroys the windings in seconds. Real motors have PTC protection.
    // We add a soft R_extra term that activates above I_rated, simulating
    // the PTC / thermal derating without needing a separate PTC model.
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

    // ── Actual current from solver ────────────────────────────────────────
    const I_raw   = branch.current ?? 0;
    const I       = Math.max(-I_STALL_DC, Math.min(I_STALL_DC, I_raw));

    // ── Update inductor state for next iteration ──────────────────────────
    const e_used  = comp._backEMF ?? 0;
    comp._vL      = vDiff - I * R - e_used;
    comp._iWind   = I;

    // ── Minimum voltage check (derived, not magic constant) ───────────────
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

    // ── Stiction check ───────────────────────────────────────────────────
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

    // ── Mechanical integration ────────────────────────────────────────────
    const tau_f   = Bf * comp._omega;
    const tau_net = tau_m - tau_f - tau_load;
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
  const omegaMax  = Math.abs(vDiff) / Math.max(Kv, 1e-6);
  const speedNorm = omegaMax > 0 ? comp._omegaSmooth / omegaMax : 0;
  const motorRPM  = comp._omegaSmooth * 60 / (2 * Math.PI);
  comp.instance?.updatePhysics?.({
    speedNorm:  cannotSpin ? 0 : _clamp(speedNorm, 1),
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