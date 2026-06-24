"use strict";

const V_MIN       = 3.0;
const V_MAX       = 5.5;
const R_LOAD      = 2_000;
const R_PULLUP    = 5_100;
const R_UNPOWERED = 1_000_000;
const V_SIG_HIGH  = 0.9;

const ARDUINO_TYPES = ["arduino", "uno", "mega", "nano", "micro", "esp32", "esp8266"];

export default class DHT11Model {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "SIG", "GND"]);
    const VCC  = nets["VCC"];
    const SIG  = nets["SIG"];
    const GND  = nets["GND"];
    if (!VCC || !GND) return;

    const vcc     = electrical.netVoltage.get(VCC) ?? 0;
    const powered = vcc >= V_MIN && vcc <= V_MAX;

    electrical.circuits.push({
      id:   `${comp.id}_load`,
      type: "RESISTOR",
      a:    VCC,
      b:    GND,
      ohms: powered ? R_LOAD : R_UNPOWERED,
    });

    if (SIG) {
      if (powered) {
        electrical.circuits.push({
          id:   `${comp.id}_pullup`,
          type: "PULLUP",
          a:    VCC,
          b:    SIG,
          ohms: R_PULLUP,
        });

        electrical.circuits.push({
          id:      `${comp.id}_sig_out`,
          type:    "RESISTOR",
          a:       SIG,
          b:       GND,
          ohms:    10_000_000,
          vOffset: (vcc * V_SIG_HIGH) * 0.05,
        });
      } else {
        electrical.circuits.push({
          id:   `${comp.id}_sig_float`,
          type: "RESISTOR",
          a:    SIG,
          b:    GND,
          ohms: R_UNPOWERED,
        });
      }
    }

    comp._powered = powered;
    comp._vcc     = vcc;
    comp._sigNet  = SIG;
    comp._vccNet  = VCC;
    comp._gndNet  = GND;

    if (SIG) {
      DHT11Model._detectArduinoPin(comp, SIG, solver);
    }
  }

  static _detectArduinoPin(comp, sigNet, solver) {
    const netlist = solver.wireSystem?.lastNetlist;
    if (!netlist) return;

    const sigPins = netlist.nets.get(sigNet);
    if (!sigPins) return;

    const arduino = solver.registry?.getAll?.().find(c =>
      ARDUINO_TYPES.some(t => c.type?.toLowerCase().includes(t))
    );
    if (!arduino) return;

    for (const pk of sigPins) {
      if (typeof pk !== "string") continue;
      if (!pk.startsWith(arduino.id + ":")) continue;
      const pinStr = pk.split(":")[1];
      const pinNum = parseInt(pinStr, 10);
      if (!isNaN(pinNum)) {
        comp._dataPin = pinNum;
        if (comp.instance) comp.instance._dataPin = pinNum;
      } else {
        const aMatch = pinStr.match(/^[Aa](\d+)$/);
        if (aMatch) {
          const p = 14 + parseInt(aMatch[1], 10);
          comp._dataPin = p;
          if (comp.instance) comp.instance._dataPin = p;
        }
      }
      break;
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const vcc     = electrical.netVoltage.get(comp._vccNet) ?? 0;
    const powered = vcc >= V_MIN && vcc <= V_MAX;

    comp._powered = powered;
    comp._vcc     = vcc;

    inst.powered     = powered;
    inst.temperature = inst._userTemp ?? 25.0;
    inst.humidity    = inst._userHum  ?? 50.0;

    if (!Number.isFinite(inst.temperature)) inst.temperature = 25.0;
    if (!Number.isFinite(inst.humidity))    inst.humidity    = 50.0;
    inst.humidity    = Math.max(0, Math.min(100, inst.humidity));
    inst.temperature = Math.max(-40, Math.min(80, inst.temperature));

    inst.updatePhysics?.({
      powered,
      vcc,
      temperature: inst.temperature,
      humidity:    inst.humidity,
    });

    if (powered && !comp._wasOn) {
      comp._wasOn = true;
      inst.startHeatWaves?.();
    }
    if (!powered && comp._wasOn) {
      comp._wasOn = false;
      inst.stopHeatWaves?.();
    }

    if (comp._sigNet) {
      const vSig = electrical.netVoltage.get(comp._sigNet) ?? 0;
      inst._sigVoltage = vSig;
    }
  }

  static reset(comp) {
    comp._powered = false;
    comp._wasOn   = false;
    comp._vcc     = 0;
    comp._vccNet  = null;
    comp._gndNet  = null;
    comp._sigNet  = null;
    comp._dataPin = null;

    const inst = comp.instance;
    if (!inst) return;
    inst.powered     = false;
    inst.temperature = 25.0;
    inst.humidity    = 50.0;
    inst._heatActive = false;
    inst._dataPin    = null;
    inst._sigVoltage = 0;
    inst.stopHeatWaves?.();
    inst.controlsGroup?.setAttribute("visibility", "hidden");
  }
}