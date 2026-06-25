"use strict";

const V_MIN_POWER = 3.0;
const R_LOAD      = 1_000;
const R_PULLUP    = 10_000;
const R_SAT       = 1;
const R_OPEN      = 10_000_000;
const R_AOUT      = 10_000;

export default class FlameSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "DOUT", "AOUT"]);
    const { VCC, GND, DOUT, AOUT } = nets;

    if (!VCC || !GND) return;

    const vcc     = electrical.netVoltage.get(VCC) ?? 0;
    const powered = vcc >= V_MIN_POWER;

    electrical.circuits.push({
      id: `${comp.id}_pwr`, type: "RESISTOR",
      a: VCC, b: GND,
      ohms: powered ? R_LOAD : R_OPEN,
    });

    if (!powered) return;

    const inst      = comp.instance;
    const triggered = inst?.isTriggered === true;

    if (DOUT) {
      electrical.circuits.push({
        id: `${comp.id}_dout_pu`, type: "PULLUP",
        a: VCC, b: DOUT, ohms: R_PULLUP,
      });

      if (triggered) {
        electrical.circuits.push({
          id: `${comp.id}_dout_low`, type: "RESISTOR",
          a: DOUT, b: GND, ohms: R_SAT,
        });
      } else {
        electrical.circuits.push({
          id: `${comp.id}_dout_leak`, type: "RESISTOR",
          a: DOUT, b: GND, ohms: R_OPEN,
        });
      }
    }

    if (AOUT) {
      const analogVal = inst?.analogValue ?? 0;
      const Vout      = vcc * (analogVal / 1023);
      electrical.circuits.push({
        id:      `${comp.id}_aout`, type: "RESISTOR",
        a:       AOUT, b: GND,
        ohms:    R_AOUT,
        vOffset: Vout,
      });
    }

    comp._nets = nets;
    comp._vcc  = vcc;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets = comp._nets;
    if (!nets) return;

    const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
    const powered = vcc >= V_MIN_POWER;
    inst._powered = powered;

    if (!powered) {
      if (inst.pinDOUT != null && inst.digitalInputs)
        inst.digitalInputs[inst.pinDOUT] = 0;
      return;
    }

    if (nets.DOUT) {
      const vDout  = electrical.netVoltage.get(nets.DOUT) ?? 0;
      const isHigh = vDout >= 2.5;
      inst._doutVoltage = vDout;

      if (inst.pinDOUT != null && inst.digitalInputs)
        inst.digitalInputs[inst.pinDOUT] = isHigh ? 1 : 0;
    }

    const prevTriggered = comp._prevTriggered ?? false;
    if (inst.isTriggered !== prevTriggered) {
      comp._prevTriggered = inst.isTriggered;
      solver.simEngine?.resolveElectrical?.();
    }
  }
}