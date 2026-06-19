"use strict";
 
// ─── PushButtonModel ──────────────────────────────────────────────────────────
 
const R_INTERNAL    = 0.005;   // A1-A2 / B1-B2 same-side short (real: <10mΩ)
const R_ON          = 0.05;    // contact closed (real tactile: 20-100mΩ)
const R_OFF         = 1e8;     // contact open (real: >100MΩ)
const BOUNCE_MS     = 5;       // total bounce duration ms
const BOUNCE_COUNT  = 5;       // number of bounces
 
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
    if (!sideA || !sideB) return;
 
    // Bounce state: during bounce window, alternate R_ON/R_OFF rapidly
    const now        = solver._simTimeMs ?? 0;
    const bounceEnd  = comp._bounceEndMs ?? -1;
    const inBounce   = now < bounceEnd;
 
    let contactR;
    if (inBounce) {
      // Alternate every half-bounce-period
      const elapsed    = now - (bounceEnd - BOUNCE_MS);
      const halfPeriod = BOUNCE_MS / (BOUNCE_COUNT * 2);
      const phase      = Math.floor(elapsed / halfPeriod) % 2;
      // Last transition: settle to final pressed state
      const finalPressed = comp._bounceTarget ?? false;
      contactR = (phase === 0) === finalPressed ? R_ON : R_OFF;
    } else {
      const pressed = comp.instance?.active === true;
      contactR = pressed ? R_ON : R_OFF;
    }
 
    const branch = {
      id:   `${comp.id}_contact`,
      type: "SWITCH",
      a:    sideA,
      b:    sideB,
      ohms: contactR,
    };
    pushBranch(electrical, branch);
 
    if (comp.instance) {
      comp.instance._nets   = { sideA, sideB };
      comp.instance._branch = branch;
    }
  },
 
  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
 
    if (comp._prevActive !== curr) {
      // State changed — start bounce simulation
      comp._prevActive   = curr;
      comp._bounceEndMs  = (solver._simTimeMs ?? 0) + BOUNCE_MS;
      comp._bounceTarget = curr;
 
      // Notify solver to re-resolve next tick
      // Fix: use solver directly instead of broken engine chain
      if (solver._netCache) solver._netCache.clear();
      solver._cachedNetlist = null;
    }
  },
};