"use strict";

export default class CapacitorModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A") ?? solver.findNet(comp.id, "T1")
           ?? solver.findNet(comp.id, "P") ?? solver.findNet(comp.id, "positive");
    const B = solver.findNet(comp.id, "B") ?? solver.findNet(comp.id, "T2")
           ?? solver.findNet(comp.id, "N") ?? solver.findNet(comp.id, "negative");
    if (!A || !B) return;

    const inst     = comp.instance;
    const C        = Math.max(1e-15, inst?.capacitance ?? 100e-6);
    const ESR      = Math.max(1e-9,  inst?.esr ?? _defaultESR(C));
    const dt       = Math.max(1e-15, solver._dt ?? 1e-4);
    const hist     = solver._capState?.get(comp.id);
    const Va0      = electrical.netVoltage.get(A) ?? 0;
    const Vb0      = electrical.netVoltage.get(B) ?? 0;
    const Vprev    = hist?.V ?? (Va0 - Vb0);
    const Iprev    = hist?.I ?? 0;

    const Geq     = 2.0 * C / dt;
    const Ieq     = Geq * Vprev + Iprev;
    const Geq_eff = 1.0 / (1.0 / Geq + ESR);
    const Ieq_eff = Ieq * (Geq_eff / Math.max(Geq, 1e-18));

    const branch = {
      id: comp.id, type: "CAPACITOR",
      a: A, b: B, capacitance: C, ohms: ESR,
      _companionCap: { Geq: Geq_eff, Ieq: Ieq_eff },
    };
    electrical.circuits.push(branch);
    if (inst) { inst._nets = { A, B }; inst._branch = branch; }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { A, B } = inst._nets;
    const branch   = inst._branch;
    const Va       = electrical.netVoltage.get(A) ?? 0;
    const Vb       = electrical.netVoltage.get(B) ?? 0;
    const Vt       = Math.max(-1e4, Math.min(1e4, Va - Vb));
    const C        = Math.max(1e-15, inst.capacitance ?? 100e-6);
    const ESR      = Math.max(1e-9,  inst.esr ?? _defaultESR(C));
    const Ic       = branch?.current ?? 0;
    const Vc       = Vt - Ic * ESR;

    if (!solver._capState) solver._capState = new Map();
    solver._capState.set(comp.id, { V: Vc, I: Ic });

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
    solver?._capState?.delete(comp.id);
    if (comp.instance) {
      Object.assign(comp.instance, { voltage:0, Vcurrent:0, Icurrent:0, current:0, energyStored:0, chargeStored:0, chargePercent:0 });
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