"use strict";

const R_ON       = 0.05;
const R_OFF      = 1e9;
const R_FLOAT_PD = 1_000_000;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const ToggleSwitchModel = {

  solve(comp, electrical, solver) {
    const comNet = solver.findNet(comp.id, "COM") ?? solver.findNet(comp.id, "C")   ?? solver.findNet(comp.id, "common");
    const t1Net  = solver.findNet(comp.id, "T1")  ?? solver.findNet(comp.id, "NO")  ?? solver.findNet(comp.id, "1");
    const t2Net  = solver.findNet(comp.id, "T2")  ?? solver.findNet(comp.id, "NC")  ?? solver.findNet(comp.id, "2");
    const gndNet = solver.findNet(comp.id, "GND") ?? solver.findNet(comp.id, "G");

    const isOn = comp.instance?.active === true;

    if (comNet) {
      if (t1Net) {
        pushBranch(electrical, { id: `${comp.id}_T1`, type: "SWITCH", a: comNet, b: t1Net, ohms: isOn ? R_ON : R_OFF });
        if (!isOn && gndNet) {
          pushBranch(electrical, { id: `${comp.id}_T1_pd`, type: "RESISTOR", a: t1Net, b: gndNet, ohms: R_FLOAT_PD });
        }
      }
      if (t2Net) {
        pushBranch(electrical, { id: `${comp.id}_T2`, type: "SWITCH", a: comNet, b: t2Net, ohms: isOn ? R_OFF : R_ON });
        if (isOn && gndNet) {
          pushBranch(electrical, { id: `${comp.id}_T2_pd`, type: "RESISTOR", a: t2Net, b: gndNet, ohms: R_FLOAT_PD });
        }
      }
      return;
    }

    if (t1Net && t2Net) {
      pushBranch(electrical, { id: `${comp.id}_contact`, type: "SWITCH", a: t1Net, b: t2Net, ohms: isOn ? R_ON : R_OFF });
      if (!isOn && gndNet) {
        pushBranch(electrical, { id: `${comp.id}_spst_pd`, type: "RESISTOR", a: t2Net, b: gndNet, ohms: R_FLOAT_PD });
      }
    }
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
      const engine = comp._engine ?? comp.instance?._engine ?? comp.instance?.simEngine;
      engine?.resolveElectrical?.();
    }
  },
};