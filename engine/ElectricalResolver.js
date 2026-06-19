"use strict";

// ElectricalResolver: runs BEFORE CircuitSolver
// Only responsible for initial state setup — NOT for stamping Arduino rails
// ArduinoModel.solve() handles all Arduino stamping to avoid double-stamping

export default class ElectricalResolver {

  constructor(registry, simEngine) {
    this.registry  = registry;
    this.simEngine = simEngine;
  }

  resolve(netlist, digitalVoltages = {}, pinStates = {}) {
    const netVoltage = new Map();
    const netState   = new Map();
    const powerNets  = new Set();
    const gndNets    = new Set();
    const netCurrent = new Map();
    const circuits   = [];

    for (const netId of netlist.nets.keys()) {
      netVoltage.set(netId, 0);
      netState.set(netId, "FLOATING");
      netCurrent.set(netId, 0);
    }

   

    return { netVoltage, netState, powerNets, gndNets, netCurrent, circuits };
  }
}