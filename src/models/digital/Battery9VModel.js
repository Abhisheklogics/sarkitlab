"use strict";

const VOC_FRESH_9    = 9.4;
const V_CUTOFF_9     = 6.0;
const CAPACITY_MAH_9 = 550;
const I_MAX_9        = 2.0;
const PEUKERT_K_9    = 1.18;
const I_REF_9        = 0.005;   // FIX: was 0.020 — PP3 datasheet ref is 5mA, not 20mA
const I_MODERATE_9   = 0.100;
const I_STRONG_9     = 0.300;
const I_SEVERE_9     = 0.500;
const RP_9           = 4.0;
const CP_9           = 3.0;     // FIX: was 8.0 → tau was 32s, now 12s (realistic ~10-15s)
const TAU_RINT_9     = 0.08;
const RINT_FLOOR_9   = 1.5;

function _vocFromSOC9(soc) {
  // FIX: boundaries made exclusive on lower end to remove discontinuity at 0.25
  if      (soc >= 0.75) return 8.80 + (9.40 - 8.80) * ((soc - 0.75) / 0.25);
  else if (soc >= 0.50) return 8.00 + (8.80 - 8.00) * ((soc - 0.50) / 0.25);
  else if (soc >= 0.25) return 7.00 + (8.00 - 7.00) * ((soc - 0.25) / 0.25);
  else if (soc >  0.00) return 6.00 + (7.00 - 6.00) * (soc           / 0.25);  // FIX: was duplicate 0.25 boundary
  return 6.00;
}

function _rintFromSOC9(soc) {
  if      (soc >= 0.75) return 1.5  + (3.0  - 1.5)  * ((1.00 - soc) / 0.25);
  else if (soc >= 0.50) return 3.0  + (6.0  - 3.0)  * ((0.75 - soc) / 0.25);
  else if (soc >= 0.25) return 6.0  + (15.0 - 6.0)  * ((0.50 - soc) / 0.25);
  else if (soc >  0.00) return 15.0 + (35.0 - 15.0) * ((0.25 - soc) / 0.25);
  return 35.0;
}

// FIX: Peukert as a scaling factor, not a capacity divisor
// Prevents SOC jump when I changes mid-simulation
function _peukertFactor9(I_abs) {
  if (I_abs <= I_REF_9) return 1.0;
  return Math.pow(I_REF_9 / Math.max(I_abs, 1e-9), PEUKERT_K_9 - 1);
}

function _overloadLevel9(I) {
  if (I >= I_SEVERE_9)   return "SEVERE";
  if (I >= I_STRONG_9)   return "STRONG";
  if (I >= I_MODERATE_9) return "MODERATE";
  return "NORMAL";
}

function _init9(comp) {
  if (comp._battInit9) return;
  comp._capacityUsedMAh = 0;
  comp._soc             = 1.0;
  comp._vPolar          = 0;
  comp._Iprev           = 0;
  comp._rint            = RINT_FLOOR_9;
  comp._voc             = VOC_FRESH_9;
  comp._branch          = null;
  comp._battInit9       = true;
}

export default class Battery9VModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["POS", "NEG"]);
    const POS  = nets["POS"];
    const NEG  = nets["NEG"];
    if (!POS || !NEG) return;

    _init9(comp);

    // FIX: SOC on nominal capacity only — no jump when Peukert factor changes
    comp._soc = Math.max(0, Math.min(1,
      1 - comp._capacityUsedMAh / CAPACITY_MAH_9
    ));

    const vocScale = (comp.voltage ?? VOC_FRESH_9) / VOC_FRESH_9;
    const voc      = _vocFromSOC9(comp._soc) * vocScale;
    const vTh      = Math.max(0, voc - comp._vPolar);

    const branch = {
      id:      comp.id,
      type:    "BATTERY",
      a:       POS,
      b:       NEG,
      ohms:    Math.max(comp._rint, RINT_FLOOR_9),
      vOffset: vTh,
    };
    electrical.circuits.push(branch);

    if (!electrical._batteryNEGs) electrical._batteryNEGs = new Map();
    if (!electrical.gndNets?.has(NEG)) {
      electrical._batteryNEGs.set(NEG, { comp, POS, NEG, voc: vTh, rint: comp._rint });
    }

    const inst = comp.instance;
    if (inst) { inst._nets = { POS, NEG }; inst._branch = branch; }
    comp._voc    = voc;
    comp._branch = branch;
  }

  static update(comp, electrical, solver) {
    _init9(comp);
    const inst = comp.instance;
    if (!inst?._nets || !comp._branch) return;

    const dt    = Math.min(Math.max(1e-9, solver._dt ?? solver.dt ?? 1e-4), 0.05);
    const I_raw = Math.min(Math.abs(comp._branch.current ?? 0), I_MAX_9);

    if (I_raw > 1e-6) {
      // FIX: Peukert scales consumed charge per tick, not total capacity
      const pkFactor = _peukertFactor9(I_raw);
      comp._capacityUsedMAh += I_raw * pkFactor * (dt / 3600) * 1000;
    }

    const rintTarget = _rintFromSOC9(comp._soc);
    const alphaR     = 1 - Math.exp(-dt / Math.max(TAU_RINT_9, 1e-9));
    comp._rint       = Math.max(RINT_FLOOR_9, comp._rint + alphaR * (rintTarget - comp._rint));

    // FIX: tau = RP_9 * CP_9 = 4 * 3 = 12s — realistic polarization time constant
    const tau    = Math.max(RP_9 * CP_9, 1e-9);
    const alpha  = 1 - Math.exp(-dt / tau);
    comp._vPolar = comp._vPolar + alpha * (RP_9 * I_raw - comp._vPolar);
    comp._Iprev  = comp._branch.current ?? 0;

    const voc       = comp._voc ?? VOC_FRESH_9;
    const rint      = comp._rint;
    const vterminal = Math.max(0, voc - comp._vPolar - I_raw * rint);
    const collapsed = vterminal < V_CUTOFF_9;
    const level     = _overloadLevel9(I_raw);
    const overload  = level !== "NORMAL";
    const dead      = collapsed || comp._soc <= 0;
    const capRem    = Math.max(0, CAPACITY_MAH_9 - comp._capacityUsedMAh);

    if (overload) {
      const now = Date.now();
      if (!comp._lastWarn9 || now - comp._lastWarn9 > 5000) {
        comp._lastWarn9 = now;
        console.warn(`[Battery9V] ${comp.id}: ${level} I=${(I_raw*1000).toFixed(0)}mA Vt=${vterminal.toFixed(2)}V Rint=${rint.toFixed(1)}Ω SOC=${(comp._soc*100).toFixed(0)}%`);
      }
    }

    if (comp._soc <= 0 && !comp._depleted) {
      comp._depleted = true;
      console.warn(`[Battery9V] ${comp.id}: DEPLETED`);
    } else if (comp._soc > 0.05) {
      comp._depleted = false;
    }

    inst.updatePhysics?.({
      soc:                  comp._soc,
      capacityUsedMAh:      comp._capacityUsedMAh,
      capacityRemainingMAh: capRem,
      voc,
      vterminal,
      current:              I_raw,
      rint,
      overload,
      collapsed,
      depleted:             comp._depleted ?? false,
      dead,
      polarizationVoltage:  comp._vPolar,
    });
  }

  static reset(comp) {
    comp._capacityUsedMAh = 0;
    comp._soc             = 1.0;
    comp._vPolar          = 0;
    comp._Iprev           = 0;
    comp._rint            = RINT_FLOOR_9;
    comp._depleted        = false;
    comp._battInit9       = false;
    comp._branch          = null;
    comp._voc             = undefined;
    comp._lastWarn9       = undefined;
  }

  static get VOC_FRESH()  { return VOC_FRESH_9; }
  static get RINT_FRESH() { return RINT_FLOOR_9; }
}