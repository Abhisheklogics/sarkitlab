"use strict";

// SW-520D real physics:
// Upright  → ball contacts both pins → CLOSED (conducting)
// Tilted   → ball rolls away         → OPEN   (no contact)
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

function findArduino(engine) {
  return engine.registry?.getAll().find(c =>
    c.type?.toLowerCase().includes("arduino") ||
    c.type?.toLowerCase().includes("uno")
  ) ?? null;
}

function updateDigitalInputs(engine, solver, electrical, nets) {
  const arduino = findArduino(engine);
  if (!arduino) return;

  for (let pin = 0; pin <= 19; pin++) {
    const key  = `D${pin}`;
    const mode = engine.pinStates[key];
    if (!mode || mode === "OUTPUT") continue;

    const pinStr = pin >= 14 ? `A${pin - 14}` : String(pin);
    const netId  = solver.findNet(arduino.id, pinStr)
                ?? solver.findNet(arduino.id, String(pin))
                ?? solver.findNet(arduino.id, `D${pin}`);

    if (!netId || !nets.has(netId)) continue;

    const voltage = electrical.netVoltage.get(netId) ?? 0;
    if (engine.digitalInputs) engine.digitalInputs[key] = voltage >= 2.5 ? 1 : 0;
  }
}

export const TiltSensorModel = {

  solve(comp, electrical, solver) {
    const pinOUT = solver.findNet(comp.id, "OUT")
                ?? solver.findNet(comp.id, "SIG");
    const pinGND = solver.findNet(comp.id, "GND");

    if (!pinOUT || !pinGND || pinOUT === pinGND) return;

    // isTilted=false → upright → CLOSED (ball conducting)
    // isTilted=true  → tilted  → OPEN   (ball rolled away)
    const isTilted   = comp.instance?.tilted === true
                    || comp.instance?.active  === true;
    const inRattle   = comp._inRattle   ?? false;
    const rattleHigh = comp._rattleHigh ?? false;
// TiltSensorModel.solve() ke andar sabse upar
console.log("TILT SOLVE:", comp.id, comp.type, comp.instance?.tilted, comp.instance?.active, comp.instance?._tilted);
    let rContact;
    if (!isTilted) {
      // upright = CLOSED
      rContact = inRattle
        ? (rattleHigh ? R_BALL_HIGH : R_BALL_LOW)
        : R_CLOSED;
    } else {
      // tilted = OPEN
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

    const engine = comp.instance?._simEngine ?? comp._simEngine ?? comp.instance?._engine;
    if (!engine?.loopRunning) return;

    updateDigitalInputs(
      engine, solver, electrical,
      new Set([comp._pinA, comp._pinB].filter(Boolean))
    );
  },
};