"use strict";

const R_VIB_LOAD       = 10_000;
const R_VIB_ON         = 50;
const R_VIB_OPEN       = 10_000_000;
const R_VIB_RATTLE_MIN = 80;
const R_VIB_RATTLE_MAX = 200_000;
const V_VCC            = 5.0;
const V_MIN_POWER      = 2.5;
const RATTLE_MS        = 8;

export default class VibrationSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "OUT"]);

    if (nets.VCC && nets.GND) {
      electrical.circuits.push({
        id: `${comp.id}_load`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND, ohms: R_VIB_LOAD,
      });
    }

    if (!nets.OUT || !nets.GND) return;

    const isVibrating = comp.instance?.state === 1;
    const pinOUT      = comp.instance?.pinOUT;
    const modeKey     = pinOUT != null ? `D${pinOUT}` : null;
    const mode        = modeKey
      ? (solver.simEngine?.pinStates?.[modeKey] ?? "INPUT")
      : "INPUT";

    const now      = performance.now();
    const lastEdge = comp._lastEdgeTime ?? 0;
    const inRattle = (now - lastEdge) < RATTLE_MS;

    let rContact;
    if (isVibrating) {
      rContact = inRattle
        ? R_VIB_RATTLE_MIN + Math.random() * (R_VIB_RATTLE_MAX - R_VIB_RATTLE_MIN)
        : R_VIB_ON + Math.random() * 150;
    } else {
      rContact = R_VIB_OPEN;
    }

    if (mode === "INPUT_PULLUP") {
      electrical.circuits.push({
        id:   `${comp.id}_out`,
        type: "RESISTOR",
        a:    nets.OUT,
        b:    nets.GND,
        ohms: rContact,
      });
    } else {
      if (isVibrating && nets.VCC) {
        electrical.circuits.push({
          id:      `${comp.id}_out`,
          type:    "RESISTOR",
          a:       nets.OUT,
          b:       nets.GND,
          ohms:    rContact,
          vOffset: V_VCC,
        });
      } else {
        electrical.circuits.push({
          id:   `${comp.id}_out`,
          type: "RESISTOR",
          a:    nets.OUT,
          b:    nets.GND,
          ohms: R_VIB_OPEN,
        });
      }
    }

    if (comp.instance) comp.instance._nets = nets;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets = inst._nets;
    if (!nets) return;

    const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
    const gnd     = electrical.netVoltage.get(nets.GND) ?? 0;
    const powered = (vcc - gnd) >= V_MIN_POWER;

    inst._powered = powered;

    if (!powered) {
      inst.stopAutoVibrate?.();
      inst._setState?.(0);
      return;
    }

    const prevState = comp._prevVibState ?? 0;
    const currState = inst.state ?? 0;
    if (currState !== prevState) {
      comp._lastEdgeTime  = performance.now();
      comp._prevVibState  = currState;
    }

    if (inst.pinOUT == null && nets.OUT) {
      VibrationSensorModel._autoDetectPin(inst, nets.OUT, solver);
    }

    if (inst.pinOUT != null) {
      inst.stopAutoVibrate?.();
    } else {
      inst.startAutoVibrate?.();
    }

    const led = comp.svg?.querySelector?.("#statusLED");
    if (led) {
      led.setAttribute("fill", inst.state === 1 ? "#ff1744" : "#330000");
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
        inst.setOutputPin?.(isNaN(pinStr) ? pinStr : Number(pinStr));
        break;
      }
    }
  }
}