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
    const VCC  = nets["VCC"];
    const GND  = nets["GND"];
    const OUT  = nets["OUT"];

    if (VCC && GND) {
      electrical.circuits.push({
        id: `${comp.id}_load`, type: "RESISTOR",
        a: VCC, b: GND, ohms: R_VIB_LOAD,
      });
    }

    if (!OUT || !GND) return;

    const vcc     = VCC ? (electrical.netVoltage.get(VCC) ?? 0) : V_VCC;
    const powered = VCC ? (vcc >= V_MIN_POWER) : true;

    const isVibrating = comp.instance?.state   === 1
                     || comp.instance?.active  === true
                     || comp.instance?.vibrating === true;

    const pinOUT  = comp.instance?.pinOUT;
    const modeKey = pinOUT != null ? `D${pinOUT}` : null;
    const mode    = modeKey
      ? (solver.simEngine?.pinStates?.[modeKey] ?? "INPUT")
      : "INPUT";

    if (!powered) {
      electrical.circuits.push({
        id: `${comp.id}_out`, type: "RESISTOR",
        a: OUT, b: GND, ohms: R_VIB_OPEN,
      });
      return;
    }

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
        a:    OUT,
        b:    GND,
        ohms: rContact,
      });
    } else {
      if (isVibrating && VCC) {
        electrical.circuits.push({
          id:      `${comp.id}_out`,
          type:    "RESISTOR",
          a:       OUT,
          b:       GND,
          ohms:    rContact,
          vOffset: vcc * 0.95,
        });
      } else {
        electrical.circuits.push({
          id:   `${comp.id}_out`,
          type: "RESISTOR",
          a:    OUT,
          b:    GND,
          ohms: R_VIB_OPEN,
        });
      }
    }

    comp._outNet = OUT;
    comp._gndNet = GND;
    comp._vccNet = VCC;
    comp._mode   = mode;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const vcc     = electrical.netVoltage.get(comp._vccNet) ?? 0;
    const powered = comp._vccNet ? (vcc >= V_MIN_POWER) : true;
    inst._powered = powered;

    if (!powered) {
      inst.stopAutoVibrate?.();
      inst._setState?.(0);
      return;
    }

    const prevState = comp._prevVibState ?? 0;
    const currState = inst.state ?? (inst.active ? 1 : 0);
    if (currState !== prevState) {
      comp._lastEdgeTime = performance.now();
      comp._prevVibState = currState;
      const engine = solver.simEngine ?? comp._engine ?? inst._engine;
      engine?.resolveElectrical?.();
    }

    if (inst.pinOUT == null && comp._outNet) {
      VibrationSensorModel._autoDetectPin(inst, comp._outNet, solver);
    }

    if (inst.pinOUT != null) {
      inst.stopAutoVibrate?.();
    } else {
      inst.startAutoVibrate?.();
    }

    const led = comp.svg?.querySelector?.("#statusLED");
    if (led) {
      led.setAttribute("fill", currState === 1 ? "#ff1744" : "#330000");
    }
  }

  static _autoDetectPin(inst, outNet, solver) {
    const arduino = solver.registry?.getAll?.()
      .find(c => ["arduino","uno","mega","nano","micro","esp32","esp8266"]
        .some(t => c.type?.toLowerCase().includes(t)));
    if (!arduino) return;

    const pins = solver.wireSystem?.lastNetlist?.nets?.get(outNet);
    if (!pins) return;

    for (const ref of pins) {
      if (typeof ref === "string" && ref.startsWith(arduino.id + ":")) {
        const pinStr = ref.split(":")[1];
        const pinNum = parseInt(pinStr, 10);
        inst.setOutputPin?.(isNaN(pinNum) ? pinStr : pinNum);
        break;
      }
    }
  }
}