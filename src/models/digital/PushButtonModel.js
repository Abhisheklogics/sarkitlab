"use strict";

const R_CLOSED      = 0.1;
const R_OPEN        = 1e9;
const R_INTERNAL    = 0.01;
const R_BOUNCE_LOW  = 15.0;
const R_BOUNCE_HIGH = 1e5;
const BOUNCE_MS     = 5;
const BOUNCE_FLIP_MS = 0.8;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const PushButtonModel = {

  solve(comp, electrical, solver) {
    const a1 = solver.findNet(comp.id, "A1");
    const a2 = solver.findNet(comp.id, "A2");
    const b1 = solver.findNet(comp.id, "B1");
    const b2 = solver.findNet(comp.id, "B2");

    if (a1 && a2 && a1 !== a2) {
      pushBranch(electrical, {
        id: `${comp.id}_intA`, type: "WIRE",
        a: a1, b: a2, ohms: R_INTERNAL,
      });
    }

    if (b1 && b2 && b1 !== b2) {
      pushBranch(electrical, {
        id: `${comp.id}_intB`, type: "WIRE",
        a: b1, b: b2, ohms: R_INTERNAL,
      });
    }

    const sideA = a1 ?? a2;
    const sideB = b1 ?? b2;

    if (!sideA || !sideB || sideA === sideB) return;

    const pressed    = comp.instance?.active === true;
    const inBounce   = comp._inBounce  ?? false;
    const bounceHigh = comp._bounceHigh ?? false;

    let rContact;
    if (pressed) {
      rContact = inBounce
        ? (bounceHigh ? R_BOUNCE_HIGH : R_BOUNCE_LOW)
        : R_CLOSED;
    } else {
      rContact = R_OPEN;
    }

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: "RESISTOR",
      a:    sideA,
      b:    sideB,
      ohms: rContact,
    });

    comp._sideA = sideA;
    comp._sideB = sideB;
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    const now  = performance.now();

    if (comp._prevActive !== curr) {
      comp._lastEdgeTime = now;
      comp._prevActive   = curr;
      comp._inBounce     = true;
      comp._bounceHigh   = false;
      comp._nextFlipTime = now + BOUNCE_FLIP_MS;
      const engine = solver.simEngine ?? comp.instance?._engine;
      engine?.resolveElectrical?.();
    }

    if (comp._inBounce) {
      const elapsed = now - (comp._lastEdgeTime ?? now);
      if (elapsed >= BOUNCE_MS) {
        comp._inBounce   = false;
        comp._bounceHigh = false;
      } else if (now >= (comp._nextFlipTime ?? now)) {
        comp._bounceHigh   = !comp._bounceHigh;
        comp._nextFlipTime = now + BOUNCE_FLIP_MS * (1.5 + Math.random());
      }
    }

    if (!comp._sideA || !comp._sideB) return;
    const Va = electrical.netVoltage.get(comp._sideA) ?? 0;
    const Vb = electrical.netVoltage.get(comp._sideB) ?? 0;
    if (comp.instance) {
      comp.instance._voltageA = Va;
      comp.instance._voltageB = Vb;
      comp.instance._inBounce = comp._inBounce ?? false;
    }
  },
};