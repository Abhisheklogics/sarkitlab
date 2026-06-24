"use strict";

const R_DARK   = 1_000_000;
const GAMMA    = 0.699;
const R_MIN    = 80;
const R_MAX    = 1_000_000;
const LUX_REF  = 10;
const R_AT_REF = 50_000;
const P_MAX    = 0.5;

function _ldrR(lux) {
  const safeLux = Math.max(0.01, lux);
  const R       = R_AT_REF * Math.pow(LUX_REF / safeLux, GAMMA);
  return Math.max(R_MIN, Math.min(R_MAX, R));
}

export default class LDRModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["A", "B"]);
    const A    = nets["A"];
    const B    = nets["B"];
    if (!A || !B) return;

    const inst = comp.instance;
    const lux  = inst?.lux ?? 300;
    const R    = _ldrR(lux);

    electrical.circuits.push({
      id:   `${comp.id}_ldr`,
      type: "RESISTOR",
      a:    A,
      b:    B,
      ohms: R,
    });

    comp._netA    = A;
    comp._netB    = B;
    comp._R       = R;
    comp._lux     = lux;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const Va = electrical.netVoltage.get(comp._netA) ?? 0;
    const Vb = electrical.netVoltage.get(comp._netB) ?? 0;
    const R  = comp._R ?? _ldrR(inst.lux ?? 300);
    const Vd = Math.abs(Va - Vb);
    const I  = R > 0 ? Vd / R : 0;
    const P  = I * I * R;

    inst.voltage    = Vd;
    inst.current    = I;
    inst.resistance = R;
    inst.power      = P;

    if (P > P_MAX && !comp._burnWarned) {
      comp._burnWarned = true;
      console.warn(
        `[LDRModel] Power dissipation ${P.toFixed(3)}W exceeds GL5528 max (0.5W).`
      );
    } else if (P <= P_MAX) {
      comp._burnWarned = false;
    }

    const lux     = inst.lux ?? 300;
    const newR    = _ldrR(lux);
    if (Math.abs(newR - (comp._R ?? newR)) > 1) {
      comp._R   = newR;
      comp._lux = lux;
      solver.simEngine?.resolveElectrical?.();
    }
  }

  static reset(comp) {
    comp._netA       = null;
    comp._netB       = null;
    comp._R          = null;
    comp._lux        = 300;
    comp._burnWarned = false;

    const inst = comp.instance;
    if (!inst) return;
    inst.lux        = 300;
    inst.voltage    = 0;
    inst.current    = 0;
    inst.resistance = _ldrR(300);
    inst.power      = 0;
    inst.reset?.();
  }
}