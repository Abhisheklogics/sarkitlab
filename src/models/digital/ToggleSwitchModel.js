"use strict";

const R_ON   = 0.05;
const R_OPEN = 10_000_000;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const ToggleSwitchModel = {

  solve(comp, electrical, solver) {
    const comNet = solver.findNet(comp.id, "COM")
                ?? solver.findNet(comp.id, "C")
                ?? solver.findNet(comp.id, "common")
                ?? solver.findNet(comp.id, "COMMON");

    const t1Net  = solver.findNet(comp.id, "T1")
                ?? solver.findNet(comp.id, "NO")
                ?? solver.findNet(comp.id, "1")
                ?? solver.findNet(comp.id, "OUT");

    const t2Net  = solver.findNet(comp.id, "T2")
                ?? solver.findNet(comp.id, "NC")
                ?? solver.findNet(comp.id, "2");

    const isOn = comp.instance?.active === true;

    if (comNet) {
      if (t1Net && comNet !== t1Net) {
        pushBranch(electrical, {
          id:   `${comp.id}_T1`,
          type: isOn ? "SWITCH" : "RESISTOR",
          a:    comNet,
          b:    t1Net,
          ohms: isOn ? R_ON : R_OPEN,
        });
      }
      if (t2Net && comNet !== t2Net) {
        pushBranch(electrical, {
          id:   `${comp.id}_T2`,
          type: !isOn ? "SWITCH" : "RESISTOR",
          a:    comNet,
          b:    t2Net,
          ohms: !isOn ? R_ON : R_OPEN,
        });
      }
      comp._comNet = comNet;
      comp._t1Net  = t1Net;
      comp._t2Net  = t2Net;
      return;
    }

    if (t1Net && t2Net && t1Net !== t2Net) {
      pushBranch(electrical, {
        id:   `${comp.id}_contact`,
        type: isOn ? "SWITCH" : "RESISTOR",
        a:    t1Net,
        b:    t2Net,
        ohms: isOn ? R_ON : R_OPEN,
      });
      comp._t1Net = t1Net;
      comp._t2Net = t2Net;
    }
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
      const engine = solver.simEngine ?? comp._engine ?? comp.instance?._engine;
      engine?.resolveElectrical?.();
    }

    const comV = comp._comNet ? (electrical.netVoltage.get(comp._comNet) ?? 0) : null;
    const t1V  = comp._t1Net  ? (electrical.netVoltage.get(comp._t1Net)  ?? 0) : null;
    const t2V  = comp._t2Net  ? (electrical.netVoltage.get(comp._t2Net)  ?? 0) : null;
    if (comp.instance) {
      if (comV !== null) comp.instance._voltageCOM = comV;
      if (t1V  !== null) comp.instance._voltageT1  = t1V;
      if (t2V  !== null) comp.instance._voltageT2  = t2V;
    }
  },
};