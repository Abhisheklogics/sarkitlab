"use strict";

const R_INTERNAL    = 0.01;
const R_ON          = 0.05;
const R_OPEN        = 10_000_000;
const R_BOUNCE_LOW  = 5;
const R_BOUNCE_HIGH = 500_000;
const BOUNCE_MS     = 5;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const PushButtonModel = {

  solve(comp, electrical, solver) {
    const A1 = solver.findNet(comp.id, "A1");
    const A2 = solver.findNet(comp.id, "A2");
    const B1 = solver.findNet(comp.id, "B1");
    const B2 = solver.findNet(comp.id, "B2");

    if (A1 && A2 && A1 !== A2) {
      pushBranch(electrical, {
        id: `${comp.id}_intA`, type: "WIRE",
        a: A1, b: A2, ohms: R_INTERNAL,
      });
    }
    if (B1 && B2 && B1 !== B2) {
      pushBranch(electrical, {
        id: `${comp.id}_intB`, type: "WIRE",
        a: B1, b: B2, ohms: R_INTERNAL,
      });
    }

    const sideA = A1 ?? A2;
    const sideB = B1 ?? B2;
    if (!sideA || !sideB || sideA === sideB) return;

    const pressed  = comp.instance?.active === true;
    const now      = performance.now();
    const lastEdge = comp._lastEdgeTime ?? 0;
    const inBounce = (now - lastEdge) < BOUNCE_MS;

    let rContact;
    if (pressed) {
      rContact = inBounce
        ? (Math.random() > 0.5 ? R_BOUNCE_LOW : R_BOUNCE_HIGH)
        : R_ON;
    } else {
      rContact = R_OPEN;
    }

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: pressed ? "SWITCH" : "RESISTOR",
      a:    sideA,
      b:    sideB,
      ohms: rContact,
    });
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    if (comp._prevActive !== curr) {
      comp._lastEdgeTime = performance.now();
      comp._prevActive   = curr;
      const engine = solver.simEngine ?? comp._engine ?? comp.instance?._engine;
      engine?.resolveElectrical?.();
    }
  },
};