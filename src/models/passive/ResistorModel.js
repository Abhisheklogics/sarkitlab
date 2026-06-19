"use strict";

const T_NOM = 27;
const R_MIN = 1e-6;
const R_MAX = 1e12;

export default class ResistorModel {

  static solve(comp, electrical, solver) {
    const T1 = solver.findNet(comp.id, "T1")
            ?? solver.findNet(comp.id, "A")
            ?? solver.findNet(comp.id, "P");
    const T2 = solver.findNet(comp.id, "T2")
            ?? solver.findNet(comp.id, "B")
            ?? solver.findNet(comp.id, "N");
    if (!T1 || !T2) return;

    const inst = comp.instance;

    const raw = inst?.ohms
             ?? inst?.resistance
             ?? comp.ohms
             ?? comp.resistance
             ?? 1000;

    const R_nom = Math.max(R_MIN, Math.min(R_MAX,
      typeof raw === "string" ? _parseR(raw) : Number(raw)
    ));

    const TC1  = inst?.tc1  ?? comp.tc1  ?? 0;
    const TC2  = inst?.tc2  ?? comp.tc2  ?? 0;
    const T_op = inst?.temperature ?? comp.temperature ?? T_NOM;
    const dT   = T_op - T_NOM;
    const R_eff = Math.max(R_MIN, R_nom * (1 + TC1 * dT + TC2 * dT * dT));

    electrical.circuits.push({
      id:     comp.id,
      type:   "RESISTOR",
      a:      T1,
      b:      T2,
      ohms:   R_eff,
      _R_nom: R_nom,
    });

    if (inst) {
      inst._nets = { T1, T2 };
      inst._Reff = R_eff;
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { T1, T2 } = inst._nets;
    const Va = electrical.netVoltage.get(T1) ?? 0;
    const Vb = electrical.netVoltage.get(T2) ?? 0;
    const Vr = Va - Vb;

    const branch = electrical.circuits.find(b => b.id === comp.id);
    const R      = branch?.ohms ?? inst._Reff ?? 1000;

    const I = Vr / Math.max(R, R_MIN);
    const P = Math.abs(Vr * I);

    inst.current = I;
    inst.voltage = Vr;
    inst.power   = P;
    inst.Reff    = R;

    const Pmax = inst?.maxPower ?? comp.maxPower ?? 0.25;
    if (P > Pmax)
      console.warn(`[Resistor] OVERPOW ${comp.id}: P=${P.toFixed(3)}W > ${Pmax}W rated`);
  }
}

function _parseR(val) {
  const s = String(val).toLowerCase().replace(/[ωΩ\s]/g, "").trim();
  if (/meg/i.test(s))         return parseFloat(s) * 1_000_000;
  if (/(\d)k/i.test(s))       return parseFloat(s) * 1_000;
  if (/(\d)g/i.test(s))       return parseFloat(s) * 1_000_000_000;
  if (/(\d)m(?!e)/i.test(s))  return parseFloat(s) * 1_000_000;
  if (/(\d)u/i.test(s))       return parseFloat(s) * 1e-6;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}