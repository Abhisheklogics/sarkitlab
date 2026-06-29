"use strict";

const VOC_FRESH_3    = 3.0;
const V_CUTOFF_3     = 2.0;
const CAPACITY_MAH_3 = 220;
const I_MAX_3        = 0.200;
const I_CONT_3       = 0.010;
const I_PULSE_3      = 0.040;
const I_CRITICAL_3   = 0.100;
const PEUKERT_K_3    = 1.45;
const I_REF_3        = 0.0002;
const RP_3           = 12.0;
const CP_3           = 0.3;
const TAU_RINT_3     = 0.10;
const RINT_FLOOR_3   = 10.0;

function _vocFromSOC3(soc) {
  if      (soc >= 0.75) return 2.98 + (3.00 - 2.98) * ((soc - 0.75) / 0.25);
  else if (soc >= 0.50) return 2.90 + (2.98 - 2.90) * ((soc - 0.50) / 0.25);
  else if (soc >= 0.25) return 2.60 + (2.90 - 2.60) * ((soc - 0.25) / 0.25);
  else if (soc >= 0.10) return 2.20 + (2.60 - 2.20) * ((soc - 0.10) / 0.15);
  else if (soc >  0.00) return 2.00 + (2.20 - 2.00) * (soc           / 0.10);
  return 2.00;
}

function _rintFromSOC3(soc) {
  if      (soc >= 0.75) return 10  + (20  - 10)  * ((1.00 - soc) / 0.25);
  else if (soc >= 0.50) return 20  + (35  - 20)  * ((0.75 - soc) / 0.25);
  else if (soc >= 0.25) return 35  + (70  - 35)  * ((0.50 - soc) / 0.25);
  else if (soc >= 0.10) return 70  + (130 - 70)  * ((0.25 - soc) / 0.15);
  else if (soc >  0.00) return 130 + (220 - 130) * ((0.10 - soc) / 0.10);
  return 220;
}

function _peukertFactor3(I_abs) {
  if (I_abs <= I_REF_3) return 1.0;
  return Math.pow(I_REF_3 / Math.max(I_abs, I_REF_3), PEUKERT_K_3 - 1);
}

function _warnLevel3(I) {
  if (I >= I_CRITICAL_3) return "CRITICAL";
  if (I >= I_PULSE_3)    return "HIGH";
  if (I >= I_CONT_3)     return "MODERATE";
  return null;
}

function _init3(comp) {
  if (comp._battInit3) return;
  comp._capacityUsedMAh = 0;
  comp._soc             = 1.0;
  comp._vPolar          = 0;
  comp._Iprev           = 0;
  comp._rint            = RINT_FLOOR_3;
  comp._voc             = VOC_FRESH_3;
  comp._branch          = null;
  comp._battInit3       = true;
}

export default class Battery3VModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["+", "-"]);
    const POS  = nets["+"];
    const NEG  = nets["-"];
    if (!POS || !NEG) return;

    _init3(comp);

    comp._soc = Math.max(0, Math.min(1,
      1 - comp._capacityUsedMAh / CAPACITY_MAH_3
    ));

    const vocScale = (comp.voltage ?? VOC_FRESH_3) / VOC_FRESH_3;
    const voc      = _vocFromSOC3(comp._soc) * vocScale;
    const vTh      = Math.max(0, voc - comp._vPolar);

    const branch = {
      id:      comp.id,
      type:    "BATTERY",
      a:       POS,
      b:       NEG,
      ohms:    Math.max(comp._rint, RINT_FLOOR_3),
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
    _init3(comp);
    const inst = comp.instance;
    if (!inst?._nets || !comp._branch) return;

    const dt    = Math.min(Math.max(1e-9, solver._dt ?? solver.dt ?? 1e-4), 0.05);
    const I_raw = Math.min(Math.abs(comp._branch.current ?? 0), I_MAX_3);

    if (I_raw > 1e-6) {
      const pkFactor = _peukertFactor3(I_raw);
      comp._capacityUsedMAh += I_raw * pkFactor * (dt / 3600) * 1000;
    }

    const rintTarget = _rintFromSOC3(comp._soc);
    const alphaR     = 1 - Math.exp(-dt / Math.max(TAU_RINT_3, 1e-9));
    comp._rint       = Math.max(RINT_FLOOR_3, comp._rint + alphaR * (rintTarget - comp._rint));

    const tau    = Math.max(RP_3 * CP_3, 1e-9);
    const alpha  = 1 - Math.exp(-dt / tau);
    comp._vPolar = comp._vPolar + alpha * (RP_3 * I_raw - comp._vPolar);
    comp._Iprev  = comp._branch.current ?? 0;

    const voc       = comp._voc ?? VOC_FRESH_3;
    const rint      = comp._rint;
    const vterminal = Math.max(0, voc - comp._vPolar - I_raw * rint);
    const collapsed = vterminal < V_CUTOFF_3;
    const level     = _warnLevel3(I_raw);
    const overload  = level !== null;
    const dead      = collapsed || comp._soc <= 0;
    const capRem    = Math.max(0, CAPACITY_MAH_3 - comp._capacityUsedMAh);

    if (overload) {
      const now = Date.now();
      if (!comp._lastWarn3 || now - comp._lastWarn3 > 5000) {
        comp._lastWarn3 = now;
        console.warn(`[CR2032] ${comp.id}: ${level} I=${(I_raw*1000).toFixed(2)}mA Vt=${vterminal.toFixed(3)}V Rint=${rint.toFixed(1)}Ω SOC=${(comp._soc*100).toFixed(0)}%`);
      }
    }

    if (comp._soc <= 0 && !comp._depleted) {
      comp._depleted = true;
      console.warn(`[CR2032] ${comp.id}: DEPLETED`);
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
    comp._rint            = RINT_FLOOR_3;
    comp._depleted        = false;
    comp._battInit3       = false;
    comp._branch          = null;
    comp._voc             = undefined;
    comp._lastWarn3       = undefined;
  }

  static get VOC_FRESH()  { return VOC_FRESH_3; }
  static get RINT_FRESH() { return RINT_FLOOR_3; }
}