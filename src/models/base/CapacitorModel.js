"use strict";

const DT_MIN = 1e-4;
const DT_MAX = 0.05;

export default class CapacitorModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A") ?? solver.findNet(comp.id, "T1")
           ?? solver.findNet(comp.id, "P") ?? solver.findNet(comp.id, "positive");
    const B = solver.findNet(comp.id, "B") ?? solver.findNet(comp.id, "T2")
           ?? solver.findNet(comp.id, "N") ?? solver.findNet(comp.id, "negative");
    if (!A || !B) return;

    const inst   = comp.instance;
    const C      = Math.max(1e-15, inst?.capacitance ?? 100e-6);
    const ESR    = Math.max(1e-9,  inst?.esr ?? _defaultESR(C));
    const Vrated = inst?.maxVoltage ?? 50;
    const dt     = Math.min(Math.max(DT_MIN, solver._dt ?? DT_MIN), DT_MAX);

    const hist  = solver._capState?.get(comp.id);
    const Vprev = hist != null ? hist.V : 0;
    const Iprev = hist != null ? hist.I : 0;

    const Geq = 2.0 * C / dt;
    const Ieq = Geq * Vprev + Iprev;

    const branch = {
      id: comp.id, type: "CAPACITOR",
      a: A, b: B, capacitance: C, ohms: ESR,
      _companionCap: { Geq, Ieq },
      _modelManaged: true,
    };
    electrical.circuits.push(branch);

    electrical.circuits.push({
      id: `${comp.id}_leak`, type: "RESISTOR",
      a: A, b: B, ohms: _leakageR(C, inst?.leakageCurrent),
    });

    if (inst) {
      inst._nets   = { A, B };
      inst._branch = branch;
      inst._Vrated = Vrated;
    }
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
    const Vrated   = inst._Vrated ?? inst.maxVoltage ?? 50;

    if (!solver._capState) solver._capState = new Map();
    solver._capState.set(comp.id, { V: Vc, I: Ic });

    inst.Vcurrent      = Vc;
    inst.voltage       = Vc;
    inst.Icurrent      = Ic;
    inst.current       = Ic;
    inst.energyStored  = 0.5 * C * Vc * Vc;
    inst.chargeStored  = C * Math.abs(Vc);
    inst.power         = Math.abs(Vt * Ic);
    inst.chargePercent = Math.min(100, Math.abs(Vc) / Vrated * 100);
    inst.updateVoltage?.(Vc);

    if (Math.abs(Vc) > Vrated * 1.1 && !inst._overvoltageWarned) {
      inst._overvoltageWarned = true;
      inst.onOvervoltage?.();
    } else if (Math.abs(Vc) <= Vrated) {
      inst._overvoltageWarned = false;
    }

    if ((inst.polarized ?? false) && Vc < -0.3 && !inst._reverseWarned) {
      inst._reverseWarned = true;
      inst.onReversePolarity?.();
    }
  }

  static reset(comp, solver) {
    solver?._capState?.delete(comp.id);
    if (comp.instance) {
      Object.assign(comp.instance, {
        voltage: 0, Vcurrent: 0, Icurrent: 0, current: 0,
        energyStored: 0, chargeStored: 0, chargePercent: 0,
        _overvoltageWarned: false, _reverseWarned: false,
        _nets: null, _branch: null,
      });
    }
  }
}

function _leakageR(C, leakageCurrent) {
  if (leakageCurrent && leakageCurrent > 0) return Math.min(1e9, 5.0 / leakageCurrent);
  if (C >= 100e-6) return 500e3;
  if (C >= 10e-6)  return 1e6;
  if (C >= 1e-6)   return 5e6;
  if (C >= 100e-9) return 50e6;
  return 500e6;
}

function _defaultESR(C) {
  if (C < 1e-9)   return 10;
  if (C < 100e-9) return 2;
  if (C < 1e-6)   return 0.5;
  if (C < 10e-6)  return 0.15;
  if (C < 100e-6) return 0.08;
  return 0.03;
}