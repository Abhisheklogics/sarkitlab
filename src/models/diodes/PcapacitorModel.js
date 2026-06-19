

const MAX_VOLTAGE       = 1e4;
const FORWARD_THRESHOLD = 0.05;

export default class PcapacitorModel {

  static solve(comp, electrical, solver) {
    const netP = solver.findNet(comp.id, "P")
              ?? solver.findNet(comp.id, "positive")
              ?? solver.findNet(comp.id, "A");
    const netN = solver.findNet(comp.id, "N")
              ?? solver.findNet(comp.id, "negative")
              ?? solver.findNet(comp.id, "B");
    if (!netP || !netN) return;

    const inst      = comp.instance;
    const C         = Math.max(1e-15, inst?.capacitance ?? 100e-6);
    const ESR       = Math.max(1e-9,  inst?.esr ?? _defaultESR(C));
    const polarized = inst?.polarized ?? true;
    const branchId  = comp.id;

    const Va0   = electrical.netVoltage.get(netP) ?? 0;
    const Vb0   = electrical.netVoltage.get(netN) ?? 0;
    const Vest  = Va0 - Vb0;
    const hist  = solver._capState?.get(branchId);
    const Vprev = hist?.V ?? Vest;
    const Iprev = hist?.I ?? 0;

    if (polarized && Vest < -FORWARD_THRESHOLD) {
      const Vbreakdown = inst?.maxVoltage ?? 25;
      const Vrev       = Math.abs(Vest);

      let ohms;
      if (Vrev >= Vbreakdown) {
        ohms = 0.1;
        if (!inst._breakdownWarned) {
          console.warn(`[PCap] BREAKDOWN ${comp.id}: ${Vrev.toFixed(2)}V >= rated ${Vbreakdown}V`);
          inst._breakdownWarned = true;
        }
      } else {
        const C_uF      = C * 1e6;
        const I_leakage = 0.01e-3 * C_uF * Math.max(Vrev, 0.01);
        const G_leakage = I_leakage / Math.max(Vrev, 0.01);
        ohms = Math.min(1.0 / Math.max(G_leakage, 1e-9), 1e6);
      }

      const branch = {
        id:   branchId,
        type: "RESISTOR",
        a:    netP,
        b:    netN,
        ohms,
      };
      electrical.circuits.push(branch);

      if (inst) {
        inst._nets            = { A: netP, B: netN };
        inst._branch          = branch;
        inst._reverseMode     = true;
        inst._breakdownWarned = inst._breakdownWarned ?? false;
      }
      return;
    }

    if (inst) inst._breakdownWarned = false;

    const dt      = Math.max(1e-15, solver._dt ?? 1e-4);
    const Geq     = 2.0 * C / dt;
    const Ieq     = Geq * Vprev + Iprev;
    const Geq_eff = 1.0 / (1.0 / Geq + ESR);
    const Ieq_eff = Ieq * (Geq_eff / Math.max(Geq, 1e-18));

    const branch = {
      id:            branchId,
      type:          "CAPACITOR",
      a:             netP,
      b:             netN,
      capacitance:   C,
      ohms:          ESR,
      _companionCap: { Geq: Geq_eff, Ieq: Ieq_eff },
    };

    electrical.circuits.push(branch);

    if (inst) {
      inst._nets        = { A: netP, B: netN };
      inst._branch      = branch;
      inst._reverseMode = false;
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
    const Vt = Math.max(-MAX_VOLTAGE, Math.min(MAX_VOLTAGE, Va - Vb));

    const C      = Math.max(1e-15, inst.capacitance ?? 100e-6);
    const ESR    = Math.max(1e-9,  inst.esr ?? _defaultESR(C));
    const Ic     = branch?.current ?? 0;
    const Vrated = inst.maxVoltage ?? 25;

    if (inst._reverseMode) {
      inst.Vcurrent      = Vt;
      inst.voltage       = Vt;
      inst.Icurrent      = Ic;
      inst.current       = Ic;
      inst.power         = Math.abs(Vt * Ic);
      inst.energyStored  = 0;
      inst.chargeStored  = 0;
      inst.chargePercent = 0;
      inst.updateVoltage?.(Vt);
      return;
    }

    const Vc = Vt - Ic * ESR;

    if (!solver._capState) solver._capState = new Map();
    solver._capState.set(branchId, { V: Vc, I: Ic });

    inst.Vcurrent      = Vc;
    inst.voltage       = Vc;
    inst.Icurrent      = Ic;
    inst.current       = Ic;
    inst.power         = Math.abs(Vt * Ic);
    inst.energyStored  = 0.5 * C * Vc * Vc;
    inst.chargeStored  = C * Math.abs(Vc);
    inst.chargePercent = Math.min(100, Math.abs(Vc) / Vrated * 100);

    inst.updateVoltage?.(Vc);

    if (Math.abs(Vc) > Vrated * 1.05)
      console.warn(`[PCap] OVERVOLTAGE ${comp.id}: ${Vc.toFixed(2)}V > ${Vrated}V`);
    if ((inst.polarized ?? true) && Vc < -0.3)
      console.warn(`[PCap] REVERSE POLARITY ${comp.id}: ${Vc.toFixed(2)}V`);
  }

  static reset(comp, solver) {
    if (solver?._capState) solver._capState.delete(comp.id);
    if (comp.instance) {
      comp.instance.voltage          = 0;
      comp.instance.Vcurrent         = 0;
      comp.instance.Icurrent         = 0;
      comp.instance.current          = 0;
      comp.instance.energyStored     = 0;
      comp.instance.chargeStored     = 0;
      comp.instance.chargePercent    = 0;
      comp.instance._reverseMode     = false;
      comp.instance._breakdownWarned = false;
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