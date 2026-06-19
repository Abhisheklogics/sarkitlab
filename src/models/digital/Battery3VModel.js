"use strict";

const VOC_FRESH_3    = 3.0;
const V_CUTOFF_3     = 2.0;
const CAPACITY_MAH_3 = 220;
const I_MAX_3        = 0.015;
const I_CRITICAL_3   = 0.005;
const PEUKERT_K_3    = 1.45;
const I_REF_3        = 0.0002;
const RP_3           = 12.0;
const CP_3           = 1.2;
const TAU_RINT_3     = 0.10;

function _vocFromSOC3(soc) {
  if      (soc >= 0.75) return 2.98 + (3.00 - 2.98) * ((soc - 0.75) / 0.25);
  else if (soc >= 0.50) return 2.90 + (2.98 - 2.90) * ((soc - 0.50) / 0.25);
  else if (soc >= 0.25) return 2.60 + (2.90 - 2.60) * ((soc - 0.25) / 0.25);
  else if (soc >= 0.10) return 2.20 + (2.60 - 2.20) * ((soc - 0.10) / 0.15);
  else if (soc >  0.00) return 2.00 + (2.20 - 2.00) * (soc           / 0.10);
  return 2.00;
}

function _rintFromSOC3(soc) {
  if      (soc >= 0.75) return 15  + (25  - 15)  * ((1.00 - soc) / 0.25);
  else if (soc >= 0.50) return 25  + (40  - 25)  * ((0.75 - soc) / 0.25);
  else if (soc >= 0.25) return 40  + (80  - 40)  * ((0.50 - soc) / 0.25);
  else if (soc >= 0.10) return 80  + (150 - 80)  * ((0.25 - soc) / 0.15);
  else if (soc >  0.00) return 150 + (250 - 150) * ((0.10 - soc) / 0.10);
  return 250;
}

function _peukertCap3(I_abs) {
  if (I_abs <= I_REF_3) return CAPACITY_MAH_3;
  return CAPACITY_MAH_3 * Math.pow(I_REF_3 / Math.max(I_abs, I_REF_3), PEUKERT_K_3 - 1);
}

function _init3(comp) {
  if (comp._battInit3) return;
  comp._capacityUsedMAh = 0;
  comp._soc             = 1.0;
  comp._vPolar          = 0;
  comp._Iprev           = 0;
  comp._rint            = 15.0;
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

    const capEff = _peukertCap3(Math.abs(comp._Iprev));
    comp._soc = Math.max(0, Math.min(1,
      1 - comp._capacityUsedMAh / Math.max(capEff, 1e-6)
    ));

    const vocScale = (comp.voltage ?? VOC_FRESH_3) / VOC_FRESH_3;
    const voc      = _vocFromSOC3(comp._soc) * vocScale;
    const vTh      = Math.max(0, voc - comp._vPolar);

    const branch = {
      id:      comp.id,
      type:    "BATTERY",
      a:       POS,
      b:       NEG,
      ohms:    Math.max(comp._rint, 15),
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
      comp._capacityUsedMAh += I_raw * (dt / 3600) * 1000;
    }

    const rintTarget = _rintFromSOC3(comp._soc);
    const alphaR     = 1 - Math.exp(-dt / Math.max(TAU_RINT_3, 1e-9));
    comp._rint       = Math.max(15, comp._rint + alphaR * (rintTarget - comp._rint));

    const tau    = Math.max(RP_3 * CP_3, 1e-9);
    const alpha  = 1 - Math.exp(-dt / tau);
    comp._vPolar = comp._vPolar + alpha * (RP_3 * I_raw - comp._vPolar);
    comp._Iprev  = comp._branch.current ?? 0;

    const voc       = comp._voc ?? VOC_FRESH_3;
    const rint      = comp._rint;
    const vterminal = Math.max(0, voc - comp._vPolar - I_raw * rint);
    const collapsed = vterminal < V_CUTOFF_3;
    const overload  = I_raw > I_CRITICAL_3;
    const critical  = I_raw > I_MAX_3 * 0.9;
    const dead      = collapsed || comp._soc <= 0;
    const capRem    = Math.max(0, CAPACITY_MAH_3 - comp._capacityUsedMAh);

    if (overload || critical) {
      const now = Date.now();
      if (!comp._lastWarn3 || now - comp._lastWarn3 > 5000) {
        comp._lastWarn3 = now;
        console.warn(`[CR2032] ${comp.id}: OVERLOAD I=${(I_raw*1000).toFixed(2)}mA Vt=${vterminal.toFixed(3)}V Rint=${rint.toFixed(1)}Ω SOC=${(comp._soc*100).toFixed(0)}%`);
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
    comp._rint            = 15.0;
    comp._depleted        = false;
    comp._battInit3       = false;
    comp._branch          = null;
    comp._voc             = undefined;
    comp._lastWarn3       = undefined;
  }
}