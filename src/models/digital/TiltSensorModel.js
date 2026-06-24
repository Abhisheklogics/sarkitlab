"use strict";

const R_ON          = 0.5;
const R_OPEN        = 10_000_000;
const R_BALL_RATTLE = 50;
const RATTLE_MS     = 12;

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

    if (!pinA || !pinB || pinA === pinB) return;

    const isTilted = comp.instance?.tilted === true
                  || comp.instance?.active  === true;

    const now      = performance.now();
    const lastEdge = comp._lastEdgeTime ?? 0;
    const inRattle = (now - lastEdge) < RATTLE_MS;

    let rContact;
    if (!isTilted) {
      rContact = inRattle
        ? (Math.random() > 0.4 ? R_ON : R_BALL_RATTLE * (1 + Math.random() * 2))
        : R_ON;
    } else {
      rContact = inRattle
        ? (Math.random() > 0.6 ? R_OPEN : R_BALL_RATTLE * (10 + Math.random() * 20))
        : R_OPEN;
    }

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: !isTilted ? "SWITCH" : "RESISTOR",
      a:    pinA,
      b:    pinB,
      ohms: rContact,
    });
  },

  update(comp, electrical, solver) {
    const curr = (comp.instance?.tilted === true)
              || (comp.instance?.active  === true);
    if (comp._prevActive !== curr) {
      comp._lastEdgeTime = performance.now();
      comp._prevActive   = curr;
      const engine = solver.simEngine ?? comp._engine ?? comp.instance?._engine;
      engine?.resolveElectrical?.();
    }
  },
};