"use strict";

const R_ON  = 0.1;
const R_OFF = 1e9;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const TiltSensorModel = {

  solve(comp, electrical, solver) {
    const pinA = solver.findNet(comp.id, "OUT")
              ?? solver.findNet(comp.id, "P1")
              ?? solver.findNet(comp.id, "T1")
              ?? solver.findNet(comp.id, "SIG")
              ?? solver.findNet(comp.id, "A")
              ?? solver.findNet(comp.id, "1");

    const pinB = solver.findNet(comp.id, "GND")
              ?? solver.findNet(comp.id, "P2")
              ?? solver.findNet(comp.id, "T2")
              ?? solver.findNet(comp.id, "B")
              ?? solver.findNet(comp.id, "2");

    if (!pinA || !pinB) return;

    const isTilted = comp.instance?.tilted === true
                  || comp.instance?.active  === true;

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: "SWITCH",
      a:    pinA,
      b:    pinB,
      ohms: isTilted ? R_OFF : R_ON,
    });
  },

  update(comp, electrical, solver) {
    const curr = (comp.instance?.tilted === true)
              || (comp.instance?.active  === true);
    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
      const engine = comp._engine
                  ?? comp.instance?._engine
                  ?? comp.instance?.simEngine;
      engine?.resolveElectrical?.();
    }
  },
};