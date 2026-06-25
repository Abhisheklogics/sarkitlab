"use strict";

const R_LOAD    = 10_000;
const R_OUT_LOW = 1;
const R_OUT_HIGH = 10_000;
const R_OPEN    = 10_000_000;
const V_MIN_POWER = 3.0;

export default class IRSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "OUT"]);
    const { VCC, GND, OUT } = nets;

    if (!VCC || !GND) return;

    const vcc     = electrical.netVoltage.get(VCC) ?? 0;
    const powered = vcc >= V_MIN_POWER;

    electrical.circuits.push({
      id: `${comp.id}_load`, type: "RESISTOR",
      a: VCC, b: GND,
      ohms: powered ? R_LOAD : R_OPEN,
    });

    if (!OUT || !powered) return;

    const state  = comp.instance?.state ?? 0;
    const isHigh = state === 1;

    electrical.circuits.push({
      id: `${comp.id}_pu`, type: "PULLUP",
      a: VCC, b: OUT, ohms: R_OUT_HIGH,
    });

    if (isHigh) {
      electrical.circuits.push({
        id: `${comp.id}_out_leak`, type: "RESISTOR",
        a: OUT, b: GND, ohms: R_OPEN,
      });
    } else {
      electrical.circuits.push({
        id: `${comp.id}_out_low`, type: "RESISTOR",
        a: OUT, b: GND, ohms: R_OUT_LOW,
      });
    }

    comp._nets    = nets;
    comp._vcc     = vcc;
    comp._powered = powered;
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
      IRSensorModel._pushToArduino(nets.OUT, 0, solver);
      return;
    }

    if (nets.OUT) {
      const vOut   = electrical.netVoltage.get(nets.OUT) ?? 0;
      const isHigh = vOut >= 2.5;
      inst._outVoltage = vOut;
      IRSensorModel._pushToArduino(nets.OUT, isHigh ? 1 : 0, solver);
    }

    const prevState = comp._prevState ?? -1;
    const currState = inst.state ?? 0;
    if (currState !== prevState) {
      comp._prevState = currState;
      solver.simEngine?.resolveElectrical?.();
    }
  }

  static _pushToArduino(outNet, val, solver) {
    if (!outNet) return;
    const netlist = solver.wireSystem?.lastNetlist;
    if (!netlist) return;

    const arduino = solver.registry?.getAll?.().find(c =>
      ["arduino","uno","mega","nano","micro","esp32","esp8266"]
        .some(t => c.type?.toLowerCase().includes(t))
    );
    if (!arduino) return;

    const pins = netlist.nets.get(outNet);
    if (!pins) return;

    for (const ref of pins) {
      if (typeof ref !== "string") continue;
      if (!ref.startsWith(arduino.id + ":")) continue;
      const pinStr = ref.split(":")[1];
      const pinNum = parseInt(pinStr, 10);
      const key    = isNaN(pinNum) ? pinStr : `D${pinNum}`;
      if (solver.simEngine?.digitalInputs)
        solver.simEngine.digitalInputs[key] = val;
      break;
    }
  }
}