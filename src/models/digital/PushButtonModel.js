"use strict";

const R_INTERNAL = 0.01;
const R_ON       = 0.1;
const R_OFF      = 1e9;

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

    // A1-A2 same side internal short — only if on different nets
    if (A1 && A2 && A1 !== A2) {
      pushBranch(electrical, {
        id: `${comp.id}_intA`, type: "WIRE",
        a: A1, b: A2, ohms: R_INTERNAL,
      });
    }

    // B1-B2 same side internal short — only if on different nets
    if (B1 && B2 && B1 !== B2) {
      pushBranch(electrical, {
        id: `${comp.id}_intB`, type: "WIRE",
        a: B1, b: B2, ohms: R_INTERNAL,
      });
    }

    // Contact side A vs side B
    // Pick one representative from each side
    const sideA = A1 ?? A2;
    const sideB = B1 ?? B2;
    if (!sideA || !sideB) return;

    // If A and B ended up on same net due to user wiring,
    // still stamp contact — solver will see 0V diff, no current
    const pressed = comp.instance?.active === true;

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: "SWITCH",
      a:    sideA,
      b:    sideB,
      ohms: pressed ? R_ON : R_OFF,
    });

    if (comp.instance) comp.instance._nets = { sideA, sideB };
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
      const engine = comp._engine
                  ?? comp.instance?._engine
                  ?? comp.instance?.simEngine;
      engine?.resolveElectrical?.();
    }
  },
};