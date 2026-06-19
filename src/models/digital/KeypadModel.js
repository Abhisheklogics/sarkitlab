"use strict";

const R_CONTACT = 50;
const R_OPEN    = 1e9;

const ROW_IDS = ["R1", "R2", "R3", "R4"];
const COL_IDS = ["C1", "C2", "C3", "C4"];

const KEY_MAP_DEFAULT = [
  ['1','2','3','A'],
  ['4','5','6','B'],
  ['7','8','9','C'],
  ['*','0','#','D'],
];

export default class KeypadModel {

  static solve(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const rowNets = ROW_IDS.map(r => solver.findNet(comp.id, r));
    const colNets = COL_IDS.map(c => solver.findNet(comp.id, c));

    comp._rowNets = rowNets;
    comp._colNets = colNets;

    const pressedKey = inst.pressedKey;
    const keyMap     = inst.layout ?? KEY_MAP_DEFAULT;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const rowNet = rowNets[r];
        const colNet = colNets[c];
        if (!rowNet || !colNet) continue;

        electrical.circuits.push({
          id:   `${comp.id}_k${r}${c}`,
          type: "SWITCH",
          a:    rowNet,
          b:    colNet,
          ohms: (pressedKey !== null && pressedKey === (keyMap[r]?.[c] ?? null))
                ? R_CONTACT : R_OPEN,
        });
      }
    }
    KeypadModel._bindArduinoPins(comp, rowNets, colNets, solver);
  }

 static _bindArduinoPins(comp, rowNets, colNets, solver) {
  const inst = comp.instance;
  if (!inst) return;
  const netlist = solver.wireSystem?.lastNetlist;
  if (!netlist) return;

  // Arduino component dynamically dhundho — hardcoded "arduino" prefix nahi
  const ARDUINO_TYPES = ["arduino", "uno", "mega", "nano", "micro"];
  const arduinoComp = solver.registry?.getAll?.()
    .find(c => ARDUINO_TYPES.some(t => c.type?.toLowerCase().includes(t)));

  if (!arduinoComp) return;

  const getPin = (net) => {
    if (!net) return null;
    const pins = netlist.nets.get(net);
    if (!pins) return null;
    for (const pk of pins) {
      if (!pk.startsWith(arduinoComp.id + ":")) continue;
      const pinPart = pk.split(":")[1];
      // "D9" → 9, "9" → 9, "A0" → 14
      if (/^[Aa]\d+$/.test(pinPart)) {
        return 14 + parseInt(pinPart.slice(1), 10);
      }
      const p = parseInt(pinPart.replace(/^[Dd]/, ""), 10);
      if (!isNaN(p)) return p;
    }
    return null;
  };

  const rowPins = rowNets.map(getPin);
  const colPins = colNets.map(getPin);

  if (rowPins.some(p => p !== null)) inst.rowPins = rowPins;
  if (colPins.some(p => p !== null)) inst.colPins = colPins;
}

 static update(comp, electrical, solver) {
  const inst = comp.instance;
  if (!inst) return;

  const colNets = comp._colNets ?? [];

  for (let c = 0; c < 4; c++) {
    const colNet = colNets[c];
    if (!colNet) continue;
    const colV   = electrical.netVoltage.get(colNet) ?? 5;
    const colPin = inst.colPins?.[c];
    if (colPin == null || !inst.digitalInputs) continue;
    inst.digitalInputs[colPin] = colV < 0.8 ? 0 : 1;
  }

  // inst.codeParsed = true;  // ← YE LINE HATAO — SimEngine getKey() par set karta hai
}

  static reset(comp) {
    comp._rowNets = null;
    comp._colNets = null;
    const inst = comp.instance;
    if (!inst) return;
    inst.pressedKey = null;
    inst.codeParsed = false;
    if (inst.colPins && inst.digitalInputs) {
      for (const pin of inst.colPins) {
        if (pin != null) inst.digitalInputs[pin] = 1;
      }
    }
    inst._svg?.querySelectorAll(".kp-key").forEach(r => {
      r.setAttribute("opacity", "1");
      r.removeAttribute("filter");
      r._pressed = false;
    });
  }
}