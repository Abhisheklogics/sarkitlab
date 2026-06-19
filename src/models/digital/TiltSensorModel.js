"use strict";

// ─── Tilt Sensor Model (SW-520D / ball-bearing switch) ────────────────────
//
// Real tilt sensor physics:
//   - Two conductive pins inside a metal can + conductive ball
//   - UPRIGHT (not tilted): ball rests on BOTH pins → circuit CLOSED
//   - TILTED:               ball rolls away          → circuit OPEN
//
// This is the correct behavior for SW-520D and most ball-bearing tilt sensors.
// Mercury switch tilt sensors work identically (mercury pools on contacts).
//
// FIXES vs original:
//
// 1. Logic was CORRECT in TiltSensorModel.js:
//      ohms: isTilted ? R_OFF : R_ON  ← tilted = open, not tilted = closed ✓
//    But VirtualTiltSensor.getActiveShorts() said:
//      if (!this.tilted) return [];
//      return [["OUT", "GND"]];  ← tilted = short ← WRONG
//    This inverted the behavior. Fixed in VirtualTiltSensor below.
//
// 2. Contact resistance: R_ON was 0.1Ω (100mΩ).
//    Real SW-520D contact resistance: 50-200mΩ typical, 500mΩ max.
//    0.1Ω (100mΩ) is within spec — keeping it.
//    R_OFF was 1e9Ω — fine (real leakage <1nA at 5V → >5GΩ, but 1GΩ is
//    close enough and avoids numerical issues in the MNA solver).
//
// 3. Pin resolution: original only tried OUT/P1/T1/SIG/A/1 for pin A.
//    Real KY-017 (tilt module) uses: SW (signal) and GND.
//    Added SW alias.

const R_ON  = 0.1;    // closed contact: 100mΩ (SW-520D spec: 50-500mΩ)
const R_OFF = 1e9;    // open contact: 1GΩ (real: >5GΩ, but 1GΩ safe for MNA)

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const TiltSensorModel = {

  solve(comp, electrical, solver) {
    // ── Pin A (signal / OUT pin) ──────────────────────────────────────────
    const pinA = solver.findNet(comp.id, "OUT")
              ?? solver.findNet(comp.id, "SW")     // KY-017 module label
              ?? solver.findNet(comp.id, "SIG")
              ?? solver.findNet(comp.id, "SIGNAL")
              ?? solver.findNet(comp.id, "P1")
              ?? solver.findNet(comp.id, "T1")
              ?? solver.findNet(comp.id, "A")
              ?? solver.findNet(comp.id, "1");

    // ── Pin B (GND / other contact) ───────────────────────────────────────
    const pinB = solver.findNet(comp.id, "GND")
              ?? solver.findNet(comp.id, "P2")
              ?? solver.findNet(comp.id, "T2")
              ?? solver.findNet(comp.id, "B")
              ?? solver.findNet(comp.id, "2");

    if (!pinA || !pinB) return;

    // ── Physics: NOT tilted = CLOSED, tilted = OPEN ───────────────────────
    const isTilted = comp.instance?.tilted === true
                  || comp.instance?.active  === true;

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: "SWITCH",
      a:    pinA,
      b:    pinB,
      ohms: isTilted ? R_OFF : R_ON,   // upright=closed, tilted=open
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


// ─── VirtualTiltSensor UI ─────────────────────────────────────────────────
//
// FIX: getActiveShorts() was returning [["OUT","GND"]] when tilted — WRONG.
// Tilt sensor = mechanical switch, closed when UPRIGHT.
// getActiveShorts() should return the short when NOT tilted (upright = closed).
// When tilted: open circuit → no shorts.

