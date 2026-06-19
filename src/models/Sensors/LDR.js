"use strict";

// LDR (Light Dependent Resistor) — Photoresistor
// Based on GL5528 datasheet (most common in kits)
//
// Real specs:
//   Dark resistance:  ~1MΩ  (0 lux)
//   10 lux:           ~50kΩ
//   100 lux:          ~8kΩ
//   1000 lux:         ~1kΩ
//
// Formula (from GL5528 datasheet curve fit):
//   R = R_dark / (lux ^ gamma)
//   R_dark = 37503, gamma = 0.699   ← same as VirtualLDR code
//
// Circuit model:
//   LDR = variable resistor between pin A and pin B
//   Resistance = f(lux) — updates every sim tick
//   Used in voltage divider: VCC → LDR → GND → Analog pin reads midpoint
//
// Solver stamp:
//   Simple resistor branch A↔B with R = f(lux)
//   CircuitSolver does the voltage divider math automatically

const R_DARK  = 37_503;
const GAMMA   = 0.699;
const R_MIN   =    100;   // minimum (very bright, 1000+ lux)
const R_MAX   = 500_000;  // maximum (very dark, ~10 lux)
const LUX_MIN =     10;
const LUX_MAX =  1_000;

function _ldrR(lux) {
  const safeLux = Math.max(0.1, lux);
  const R       = R_DARK / Math.pow(safeLux, GAMMA);
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
      id:   comp.id,
      type: "RESISTOR",
      a:    A,
      b:    B,
      ohms: R,
    });

    comp._netA = A;
    comp._netB = B;
    comp._R    = R;
    comp._lux  = lux;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const branch = electrical.circuits.find(b => b.id === comp.id);
    if (!branch) return;

    const Va = electrical.netVoltage.get(comp._netA) ?? 0;
    const Vb = electrical.netVoltage.get(comp._netB) ?? 0;
    const R  = comp._R ?? _ldrR(inst.lux ?? 300);
    const I  = R > 0 ? Math.abs(Va - Vb) / R : 0;
    const P  = I * I * R;

    // Push to instance for UI display
    inst.voltage    = Math.abs(Va - Vb);
    inst.current    = I;
    inst.resistance = R;
    inst.power      = P;

    // onLuxChange callback — if connected to analog pin,
    // sim engine reads inst.lux via LDR.getLux()
    // No extra action needed — solver already computed correct voltage
  }

  static reset(comp) {
    comp._netA = null;
    comp._netB = null;
    comp._R    = null;
    comp._lux  = 300;

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