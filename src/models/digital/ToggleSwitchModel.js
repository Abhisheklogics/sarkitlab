"use strict";

const R_CLOSED = 0.1;
const R_OPEN   = 1e9;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const ToggleSwitchModel = {

  solve(comp, electrical, solver) {
    const comNet = solver.findNet(comp.id, "COM");
    const t1Net  = solver.findNet(comp.id, "T1");
    const t2Net  = solver.findNet(comp.id, "T2");

    const isOn = comp.instance?.active === true;

    if (comNet && t1Net && comNet !== t1Net) {
      pushBranch(electrical, {
        id:   `${comp.id}_T1`,
        type: "RESISTOR",
        a:    comNet,
        b:    t1Net,
        ohms: isOn ? R_CLOSED : R_OPEN,
      });
    }

    if (comNet && t2Net && comNet !== t2Net) {
      pushBranch(electrical, {
        id:   `${comp.id}_T2`,
        type: "RESISTOR",
        a:    comNet,
        b:    t2Net,
        ohms: isOn ? R_OPEN : R_CLOSED,
      });
    }

    if (!comNet && t1Net && t2Net && t1Net !== t2Net) {
      pushBranch(electrical, {
        id:   `${comp.id}_contact`,
        type: "RESISTOR",
        a:    t1Net,
        b:    t2Net,
        ohms: isOn ? R_CLOSED : R_OPEN,
      });
    }

    comp._comNet = comNet ?? null;
    comp._t1Net  = t1Net  ?? null;
    comp._t2Net  = t2Net  ?? null;
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
    }
    if (comp.instance) {
      if (comp._comNet) comp.instance._voltageCOM = electrical.netVoltage.get(comp._comNet) ?? 0;
      if (comp._t1Net)  comp.instance._voltageT1  = electrical.netVoltage.get(comp._t1Net)  ?? 0;
      if (comp._t2Net)  comp.instance._voltageT2  = electrical.netVoltage.get(comp._t2Net)  ?? 0;
    }
  },
};