"use strict";

const R_CLOSED       = 2.0;
const R_OPEN         = 1e9;
const R_BALL_LOW     = 40.0;
const R_BALL_HIGH    = 800.0;
const RATTLE_MS      = 12;
const RATTLE_FLIP_MS = 1.2;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const TiltSensorModel = {

  solve(comp, electrical, solver) {
    const pinOUT = solver.findNet(comp.id, "OUT")
                ?? solver.findNet(comp.id, "SIG");
    const pinGND = solver.findNet(comp.id, "GND");

    if (!pinOUT || !pinGND || pinOUT === pinGND) return;

    const isTilted   = comp.instance?.tilted === true
                    || comp.instance?.active  === true;
    const inRattle   = comp._inRattle   ?? false;
    const rattleHigh = comp._rattleHigh ?? false;

    let rContact;
    if (!isTilted) {
      rContact = inRattle
        ? (rattleHigh ? R_BALL_HIGH : R_BALL_LOW)
        : R_CLOSED;
    } else {
      rContact = inRattle
        ? (rattleHigh ? R_OPEN : R_BALL_HIGH)
        : R_OPEN;
    }

    pushBranch(electrical, {
      id:   `${comp.id}_contact`,
      type: "RESISTOR",
      a:    pinOUT,
      b:    pinGND,
      ohms: rContact,
    });

    comp._pinA = pinOUT;
    comp._pinB = pinGND;
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.tilted === true
              || comp.instance?.active  === true;
    const now  = performance.now();

    if (comp._prevActive !== curr) {
      comp._lastEdgeTime = now;
      comp._prevActive   = curr;
      comp._inRattle     = true;
      comp._rattleHigh   = false;
      comp._nextFlipTime = now + RATTLE_FLIP_MS;

      // VibrationSensorModel pattern: solver.simEngine guaranteed reference hai
      const engine = solver.simEngine ?? comp._simEngine ?? comp.instance?._simEngine ?? comp.instance?._engine;
      engine?.resolveElectrical?.();
    }

    if (comp._inRattle) {
      const elapsed = now - (comp._lastEdgeTime ?? now);
      if (elapsed >= RATTLE_MS) {
        comp._inRattle   = false;
        comp._rattleHigh = false;
      } else if (now >= (comp._nextFlipTime ?? now)) {
        comp._rattleHigh   = !comp._rattleHigh;
        comp._nextFlipTime = now + RATTLE_FLIP_MS * (1.2 + Math.random());
      }
    }

    if (!comp._pinA || !comp._pinB) return;

    const Va = electrical.netVoltage.get(comp._pinA) ?? 0;
    const Vb = electrical.netVoltage.get(comp._pinB) ?? 0;

    if (comp.instance) {
      comp.instance._voltageOUT = Va;
      comp.instance._voltageGND = Vb;
      comp.instance._inRattle   = comp._inRattle ?? false;
    }
  },
};