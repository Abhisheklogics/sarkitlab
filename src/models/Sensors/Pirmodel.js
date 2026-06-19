"use strict";

const R_PIR_LOAD = 10_000;
const R_PIR_OUT  = 200;

export default class PIRModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "OUT"]);

    // Power load — sensor draws current when powered
    if (nets.VCC && nets.GND) {
      electrical.circuits.push({
        id  : `${comp.id}_load`,
        type: "RESISTOR",
        a   : nets.VCC,
        b   : nets.GND,
        ohms: R_PIR_LOAD,
      });
    }

    // OUT pin — high when motion detected, low otherwise
    // Active module — no pullup needed, drives its own output
    if (nets.OUT && nets.GND) {
      const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
      const gnd     = electrical.netVoltage.get(nets.GND) ?? 0;
      const powered = (vcc - gnd) >= 3.0;
      const isHigh  = powered && comp.instance?.state === 1;

      electrical.circuits.push({
        id      : `${comp.id}_out`,
        type    : "RESISTOR",
        a       : nets.OUT,
        b       : isHigh ? nets.VCC : nets.GND,
        ohms    : R_PIR_OUT,
      });
    }

    if (comp.instance) comp.instance._nets = nets;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets    = inst._nets;
    if (!nets) return;

    const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
    const gnd     = electrical.netVoltage.get(nets.GND) ?? 0;
    const powered = (vcc - gnd) >= 3.0;

    inst._powered = powered;

    // Not powered — force output low
    if (!powered) {
      if (inst.pinOUT !== null && inst.pinOUT !== undefined) {
        inst.digitalInputs[inst.pinOUT] = 0;
      }
      return;
    }

    // Auto-detect which Arduino pin is connected to OUT net
    if ((inst.pinOUT === null || inst.pinOUT === undefined) && nets.OUT) {
      PIRModel._autoDetectPin(inst, nets.OUT, solver);
    }

    // Update digitalInputs so Arduino digitalRead works
    if (inst.pinOUT !== null && inst.pinOUT !== undefined) {
      inst.digitalInputs[inst.pinOUT] = inst.state ?? 0;
    }
  }

  static _autoDetectPin(inst, outNet, solver) {
    const arduino = solver.registry?.getAll?.()
      .find(c => c.type?.toLowerCase().includes("arduino"));
    if (!arduino) return;

    const pins = solver.wireSystem?.lastNetlist?.nets?.get(outNet);
    if (!pins) return;

    for (const ref of pins) {
      if (typeof ref === "string" && ref.startsWith(arduino.id + ":")) {
        const pinStr = ref.split(":")[1];
        const pinNum = isNaN(pinStr) ? pinStr : Number(pinStr);
        inst.setOutputPin?.(pinNum);
        break;
      }
    }
  }
}