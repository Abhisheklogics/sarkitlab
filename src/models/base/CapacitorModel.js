"use strict";

export default class CapacitorModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A")
           ?? solver.findNet(comp.id, "T1")
           ?? solver.findNet(comp.id, "P")
           ?? solver.findNet(comp.id, "positive");
    const B = solver.findNet(comp.id, "B")
           ?? solver.findNet(comp.id, "T2")
           ?? solver.findNet(comp.id, "N")
           ?? solver.findNet(comp.id, "negative");
    if (!A || !B) return;

    const inst     = comp.instance;
    const C        = Math.max(1e-15, inst?.capacitance ?? 100e-6);
    const ESR      = Math.max(1e-9,  inst?.esr ?? _defaultESR(C));
    const branchId = comp.id;
    const dt       = Math.max(1e-15, solver._dt ?? 1e-4);

    const Va0   = electrical.netVoltage.get(A) ?? 0;
    const Vb0   = electrical.netVoltage.get(B) ?? 0;
    const hist  = solver._capState?.get(branchId);
    const Vprev = hist?.V ?? (Va0 - Vb0);
    const Iprev = hist?.I ?? 0;

    const Geq     = 2.0 * C / dt;
    const Ieq     = Geq * Vprev + Iprev;
    const Geq_eff = 1.0 / (1.0 / Geq + ESR);
    const Ieq_eff = Ieq * (Geq_eff / Math.max(Geq, 1e-18));

    const branch = {
      id:            branchId,
      type:          "CAPACITOR",
      a:             A,
      b:             B,
      capacitance:   C,
      ohms:          ESR,
      _companionCap: { Geq: Geq_eff, Ieq: Ieq_eff },
    };

    electrical.circuits.push(branch);

    if (inst) {
      inst._nets   = { A, B };
      inst._branch = branch;
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { A, B } = inst._nets;
    const branchId  = comp.id;
    const branch    = inst._branch;

    const Va = electrical.netVoltage.get(A) ?? 0;
    const Vb = electrical.netVoltage.get(B) ?? 0;
    const Vt = Math.max(-1e4, Math.min(1e4, Va - Vb));

    const C   = Math.max(1e-15, inst.capacitance ?? 100e-6);
    const ESR = Math.max(1e-9,  inst.esr ?? _defaultESR(C));
    const Ic  = branch?.current ?? 0;
    const Vc  = Vt - Ic * ESR;

    if (!solver._capState) solver._capState = new Map();
    solver._capState.set(branchId, { V: Vc, I: Ic });

    const Vrated = inst.maxVoltage ?? 50;

    inst.Vcurrent      = Vc;
    inst.voltage       = Vc;
    inst.Icurrent      = Ic;
    inst.current       = Ic;
    inst.energyStored  = 0.5 * C * Vc * Vc;
    inst.chargeStored  = C * Math.abs(Vc);
    inst.power         = Math.abs(Vt * Ic);
    inst.chargePercent = Math.min(100, Math.abs(Vc) / Vrated * 100);

    inst.updateVoltage?.(Vc);

    if (Math.abs(Vc) > Vrated * 1.05)
      console.warn(`[Cap] OVERVOLTAGE ${comp.id}: ${Vc.toFixed(2)}V > ${Vrated}V`);
    if ((inst.polarized ?? false) && Vc < -0.3)
      console.warn(`[Cap] REVERSE POLARITY ${comp.id}: ${Vc.toFixed(2)}V`);
  }

  static reset(comp, solver) {
    if (solver?._capState) solver._capState.delete(comp.id);
    if (comp.instance) {
      comp.instance.voltage       = 0;
      comp.instance.Vcurrent      = 0;
      comp.instance.Icurrent      = 0;
      comp.instance.current       = 0;
      comp.instance.energyStored  = 0;
      comp.instance.chargeStored  = 0;
      comp.instance.chargePercent = 0;
    }
  }
}

function _defaultESR(C) {
  if (C < 1e-9)   return 10;
  if (C < 100e-9) return 2;
  if (C < 1e-6)   return 0.5;
  if (C < 10e-6)  return 0.15;
  if (C < 100e-6) return 0.08;
  return 0.03;
}