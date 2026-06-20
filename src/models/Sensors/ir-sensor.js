"use strict";

const R_IR_LOAD = 10_000;
const R_IR_OUT  = 100;

export default class IRSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "OUT"]);

    if (nets.VCC && nets.GND) {
      electrical.circuits.push({
        id: `${comp.id}_load`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND, ohms: R_IR_LOAD,
      });
    }

    if (nets.OUT && nets.GND && nets.VCC) {
      const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
      const gnd     = electrical.netVoltage.get(nets.GND) ?? 0;
      const powered = (vcc - gnd) >= 3.0;
      const isHigh  = powered && (comp.instance?.state === 1);

      electrical.circuits.push({
        id:      `${comp.id}_out`,
        type:    "SENSOR_OUT",
        a:       nets.OUT,
        b:       isHigh ? nets.VCC : nets.GND,
        ohms:    R_IR_OUT,
        vOffset: isHigh ? (vcc - gnd) : 0,
      });
    }

    if (comp.instance) comp.instance._nets = nets;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const nets    = inst._nets;
    const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
    const gnd     = electrical.netVoltage.get(nets.GND) ?? 0;
    const powered = (vcc - gnd) >= 3.0;

    inst._powered = powered;
    if (!powered) return;

    if (nets.OUT) {
      const vOut   = electrical.netVoltage.get(nets.OUT) ?? 0;
      const isHigh = (vOut - gnd) > (vcc - gnd) * 0.5;
      IRSensorModel._updateArduinoPin(inst, nets.OUT, isHigh ? 1 : 0, solver);
    }
  }

  static _updateArduinoPin(inst, outNet, val, solver) {
    const arduino = solver.registry?.getAll?.()
      .find(c => c.type?.toLowerCase().includes("arduino"));
    if (!arduino) return;

    const pins = solver.wireSystem?.lastNetlist?.nets?.get(outNet);
    if (!pins) return;

    for (const ref of pins) {
      if (typeof ref === "string" && ref.startsWith(arduino.id + ":")) {
        const pinStr = ref.split(":")[1];
        const key    = isNaN(pinStr) ? pinStr : `D${Number(pinStr)}`;
        if (solver.simEngine?.digitalInputs)
          solver.simEngine.digitalInputs[key] = val;
        break;
      }
    }
  }
}