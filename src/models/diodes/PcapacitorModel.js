"use strict";

const FORWARD_THRESHOLD = 0.05;

export default class PcapacitorModel {

  static solve(comp, electrical, solver) {
    const netP = solver.findNet(comp.id, "P") ?? solver.findNet(comp.id, "positive") ?? solver.findNet(comp.id, "A");
    const netN = solver.findNet(comp.id, "N") ?? solver.findNet(comp.id, "negative") ?? solver.findNet(comp.id, "B");
    if (!netP || !netN) return;

    const inst         = comp.instance;
    const C            = Math.max(1e-15, inst?.capacitance ?? 100e-6);
    const ESR          = Math.max(1e-9,  inst?.esr ?? _defaultESR(C));
    const polarized    = inst?.polarized ?? true;
    const Vbreakdown   = inst?.maxVoltage ?? 25;

    const Va0   = electrical.netVoltage.get(netP) ?? 0;
    const Vb0   = electrical.netVoltage.get(netN) ?? 0;
    const Vest  = Va0 - Vb0;
    const hist  = solver._capState?.get(comp.id);
    const Vprev = hist?.V ?? Vest;
    const Iprev = hist?.I ?? 0;

    if (polarized && Vest < -FORWARD_THRESHOLD) {
      const Vrev = Math.abs(Vest);

      if (Vrev >= Vbreakdown) {
        if (!inst._damaged) {
          inst._damaged = true;
          console.warn(`[PCap] BREAKDOWN DAMAGE ${comp.id}: ${Vrev.toFixed(2)}V >= ${Vbreakdown}V`);
          inst.onBreakdown?.();
        }
        electrical.circuits.push({
          id: `${comp.id}_damaged`, type: "RESISTOR",
          a: netP, b: netN, ohms: 0.5,
        });
      } else {
        const C_uF      = C * 1e6;
        const I_leakage = Math.max(0.01e-3 * C_uF * Vrev, 1e-9);
        const Rleak     = Vrev / I_leakage;
        electrical.circuits.push({
          id: `${comp.id}_revleak`, type: "RESISTOR",
          a: netP, b: netN, ohms: Math.min(Rleak, 1e6),
        });
        if (!inst._reverseWarned) {
          inst._reverseWarned = true;
          console.warn(`[PCap] REVERSE POLARITY ${comp.id}: ${Vest.toFixed(2)}V`);
          inst.onReversePolarity?.();
        }
      }

      if (inst) {
        inst._nets = { A: netP, B: netN };
        inst._branch = null;
        inst._reverseMode = true;
      }
      return;
    }

    if (inst) {
      inst._reverseWarned = false;
      inst._reverseMode   = false;
    }

    const dt      = Math.max(1e-6, solver._dt ?? 1e-4);
    const Geq     = 2.0 * C / dt;
    const Ieq     = Geq * Vprev + Iprev;
    const Geq_eff = 1.0 / (1.0 / Geq + ESR);
    const Ieq_eff = Ieq * (Geq_eff / Math.max(Geq, 1e-18));

    const branch = {
      id: comp.id, type: "CAPACITOR",
      a: netP, b: netN, capacitance: C, ohms: ESR,
      _companionCap: { Geq: Geq_eff, Ieq: Ieq_eff },
    };
    electrical.circuits.push(branch);

    const Rleak = _leakageR(C, inst?.leakageCurrent);
    electrical.circuits.push({
      id: `${comp.id}_leak`, type: "RESISTOR",
      a: netP, b: netN, ohms: Rleak,
    });

    if (inst) { inst._nets = { A: netP, B: netN }; inst._branch = branch; }
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
    const Vrated   = inst.maxVoltage ?? 25;

    if (inst._reverseMode || inst._damaged) {
      Object.assign(inst, {
        Vcurrent: Vt, voltage: Vt, Icurrent: Ic, current: Ic,
        power: Math.abs(Vt * Ic), energyStored: 0, chargeStored: 0, chargePercent: 0,
      });
      inst.updateVoltage?.(Vt);
      return;
    }

    const Vc = Vt - Ic * ESR;
    if (!solver._capState) solver._capState = new Map();
    solver._capState.set(comp.id, { V: Vc, I: Ic });

    Object.assign(inst, {
      Vcurrent: Vc, voltage: Vc, Icurrent: Ic, current: Ic,
      power: Math.abs(Vt * Ic), energyStored: 0.5 * C * Vc * Vc,
      chargeStored: C * Math.abs(Vc), chargePercent: Math.min(100, Math.abs(Vc) / Vrated * 100),
    });
    inst.updateVoltage?.(Vc);

    if (Math.abs(Vc) > Vrated * 1.1 && !inst._overvoltageWarned) {
      inst._overvoltageWarned = true;
      console.warn(`[PCap] OVERVOLTAGE ${comp.id}: ${Vc.toFixed(2)}V > ${Vrated}V`);
      inst.onOvervoltage?.();
    } else if (Math.abs(Vc) <= Vrated) {
      inst._overvoltageWarned = false;
    }
  }

  static reset(comp, solver) {
    solver?._capState?.delete(comp.id);
    if (comp.instance) {
      Object.assign(comp.instance, {
        voltage: 0, Vcurrent: 0, Icurrent: 0, current: 0,
        energyStored: 0, chargeStored: 0, chargePercent: 0,
        _reverseMode: false, _reverseWarned: false,
        _damaged: false, _overvoltageWarned: false,
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