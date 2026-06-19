"use strict";

const V_MIN    = 3.0;
const V_MAX    = 5.5;
const R_LOAD   = 2000;
const R_PULLUP = 5000;

export default class DHT11Model {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "SIG", "GND"]);
    const VCC  = nets["VCC"];
    const SIG  = nets["SIG"];
    const GND  = nets["GND"];
    if (!VCC || !GND) return;

    electrical.gndNets.add(GND);

    const vcc     = electrical.netVoltage.get(VCC) ?? 0;
    const powered = vcc >= V_MIN && vcc <= V_MAX;

    electrical.circuits.push({
      id: comp.id, type: "SENSOR_OUT",
      a: VCC, b: GND,
      ohms: powered ? R_LOAD : 1e6,
    });

    if (SIG && powered) {
      electrical.circuits.push({
        id: `${comp.id}_pullup`, type: "RESISTOR",
        a: VCC, b: SIG, ohms: R_PULLUP,
      });
    }

    comp._powered = powered;
    comp._vcc     = vcc;
    comp._sigNet  = SIG;

    // SIG net se Arduino pin number nikalo — SimEngine matching ke liye
    if (SIG) {
      const netlist = solver.wireSystem?.lastNetlist;
      if (netlist) {
        const sigPins = netlist.nets.get(SIG);
        if (sigPins) {
          for (const pk of sigPins) {
            if (pk.startsWith("arduino")) {
              const p = parseInt(pk.split(":")[1]);
              if (!isNaN(p)) {
                comp._dataPin = p;
                if (comp.instance) comp.instance._dataPin = p;
              }
            }
          }
        }
      }
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const powered = comp._powered ?? false;
    const vcc     = comp._vcc     ?? 0;

    inst.powered     = powered;
    inst.temperature = inst._userTemp ?? 25.0;
    inst.humidity    = inst._userHum  ?? 50.0;

    inst.updatePhysics?.({ powered, vcc,
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
  }

  static reset(comp) {
    comp._powered = false;
    comp._wasOn   = false;
    comp._vcc     = 0;
    comp._sigNet  = null;
    comp._dataPin = null;

    const inst = comp.instance;
    if (!inst) return;
    inst.powered     = false;
    inst.temperature = 25.0;
    inst.humidity    = 50.0;
    inst._heatActive = false;
    inst._dataPin    = null;
    inst.stopHeatWaves?.();
    inst.controlsGroup?.setAttribute("visibility", "hidden");
  }
}