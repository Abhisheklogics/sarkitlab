"use strict";

const R_TOUCHED  = 100;
const R_OPEN     = 10_000_000;
const R_LOAD     = 47_000;
const V_MIN_POWER = 2.5;

export  class TouchSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "OUT", "SIG"]);
    const VCC  = nets["VCC"];
    const GND  = nets["GND"];
    const OUT  = nets["OUT"] ?? nets["SIG"];

    if (VCC && GND) {
      electrical.circuits.push({
        id: `${comp.id}_load`, type: "RESISTOR",
        a: VCC, b: GND, ohms: R_LOAD,
      });
    }

    if (!OUT || !GND) return;

    const vcc     = VCC ? (electrical.netVoltage.get(VCC) ?? 0) : 0;
    const powered = VCC ? (vcc >= V_MIN_POWER) : false;

    if (!powered) {
      electrical.circuits.push({
        id: `${comp.id}_out`, type: "RESISTOR",
        a: OUT, b: GND, ohms: R_OPEN,
      });
      return;
    }

    const isTouched = comp.instance?.touched === true
                   || comp.instance?.active  === true
                   || comp.instance?.state   === 1;

    electrical.circuits.push({
      id:      `${comp.id}_out`,
      type:    "RESISTOR",
      a:       OUT,
      b:       GND,
      ohms:    isTouched ? R_TOUCHED : R_OPEN,
      vOffset: isTouched ? vcc * 0.95 : 0,
    });

    comp._outNet = OUT;
    comp._gndNet = GND;
    comp._vccNet = VCC;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const vcc     = electrical.netVoltage.get(comp._vccNet) ?? 0;
    const powered = comp._vccNet ? (vcc >= V_MIN_POWER) : false;
    inst._powered = powered;

    const prevState = comp._prevTouchState ?? false;
    const currState = inst.touched === true
                   || inst.active  === true
                   || inst.state   === 1;

    if (currState !== prevState) {
      comp._prevTouchState = currState;
      const engine = solver.simEngine ?? comp._engine ?? inst._engine;
      engine?.resolveElectrical?.();
    }

    if (comp._outNet) {
      inst._outVoltage = electrical.netVoltage.get(comp._outNet) ?? 0;
    }

    const led = comp.svg?.querySelector?.("#statusLED");
    if (led) {
      led.setAttribute("fill", currState ? "#00e676" : "#1a3a1a");
    }
  }
}