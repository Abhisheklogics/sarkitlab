"use strict";

// ─── Touch Sensor (TTP223 / capacitive touch module) ─────────────────────────
//
// Physical behavior:
//   - 3 pins: VCC (power), GND, SIGNAL (digital output)
//   - Internal: comparator + capacitive sense pad
//   - Output is ACTIVE-HIGH: SIGNAL = VCC when touched, GND when not touched
//
// Simulation model:
//   The sensor is a self-powered digital output device.
//   We model it as a voltage source on the SIGNAL pin:
//
//     Touched:     SIGNAL net driven to VCC voltage  via low R (R_OUT)
//     Not touched: SIGNAL net driven to 0V (GND)     via low R (R_OUT)
//
//   This is correct because:
//     - A real TTP223 actively drives its output HIGH or LOW (push-pull)
//     - It does NOT float — it always drives, regardless of pullup/pulldown
//     - The Arduino sees a clean HIGH or LOW regardless of INPUT_PULLUP
//
// MNA stamping:
//   Branch: SIGNAL → GND, ohms=R_OUT, vOffset=outputVoltage
//   The vOffset creates a Thevenin equivalent: V_signal = vOffset = 0 or VCC
//
//   IMPORTANT: vOffset here is NOT an independent source being stepped —
//   it represents the output of an internal comparator (a model artifact).
//   We mark it as type "SENSOR_OUT" so CircuitSolver does NOT apply
//   sourceScale to it during source stepping (same logic as CAPACITOR/INDUCTOR
//   history voltages which use HISTORY_TYPES exclusion).
//
//   If CircuitSolver's HISTORY_TYPES does not include "SENSOR_OUT", add it,
//   OR set the branch ohms low enough that vOffset dominates regardless of scale.
//   The safest approach (used here): stamp vOffset directly and keep R_OUT
//   small so the output voltage is well-defined.
//
// VCC sensing:
//   We read the VCC net voltage from electricalState if it is connected,
//   falling back to 5.0V (Arduino Uno default) or 3.3V if the component
//   config says so. This makes the model correct for both 5V and 3.3V systems.
//
// Pin aliases:
//   VCC:    VCC → VDD → 3V3 → 5V → PWR
//   GND:    GND → VSS → 0V
//   SIGNAL: SIGNAL → SIG → OUT → DO → IO → S

const R_OUT      = 10;    // output driver impedance (Ω) — low, so output is stiff
const R_VCC_LOAD = 10000; // supply current draw model (10kΩ, ~0.5mA at 5V)

function pushBranch(electrical, branch) {
  // Require both nodes to be valid and distinct
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const TouchSensorModel = {

  solve(comp, electrical, solver) {
    // ── Resolve pin nets ──────────────────────────────────────────────────
    const vccNet = solver.findNet(comp.id, "VCC")
               ?? solver.findNet(comp.id, "VDD")
               ?? solver.findNet(comp.id, "3V3")
               ?? solver.findNet(comp.id, "5V")
               ?? solver.findNet(comp.id, "PWR");

    const gndNet = solver.findNet(comp.id, "GND")
               ?? solver.findNet(comp.id, "VSS")
               ?? solver.findNet(comp.id, "0V");

    const sigNet = solver.findNet(comp.id, "SIGNAL")
               ?? solver.findNet(comp.id, "SIG")
               ?? solver.findNet(comp.id, "OUT")
               ?? solver.findNet(comp.id, "DO")
               ?? solver.findNet(comp.id, "IO")
               ?? solver.findNet(comp.id, "S");

    // SIGNAL and GND must both be wired for the output to do anything
    if (!sigNet || !gndNet) return;

    // ── Determine supply voltage ──────────────────────────────────────────
    // Prefer reading the live VCC net voltage so the model works correctly
    // in both 5V (Uno) and 3.3V (ESP32) systems.
    // If VCC pin is not wired, fall back to component config, then 5V.
  let vcc;
if (vccNet) {
  const liveVcc = electrical.netVoltage.get(vccNet) ?? 0;
  vcc = liveVcc > 0.5 ? liveVcc : (comp.instance?.vcc ?? 5.0);
} else {
  // FIX: VCC wire nahi lagi to sensor powered nahi — output force 0
  vcc = 0;  // <-- yahi badlo, ?? 5.0 hata do
}

    // ── Determine output state ────────────────────────────────────────────
    // active=true or tilted=true → sensor is touched → output HIGH
    const isTouched = comp.instance?.active === true
                   || comp.instance?.tilted === true;

  const outputVoltage = isTouched ? vcc : 0;

    // ── Stamp SIGNAL output branch ────────────────────────────────────────
    // Model: Thevenin source — SIGNAL pin is driven to outputVoltage
    // through R_OUT from the GND reference.
    // type "SENSOR_OUT" → CircuitSolver must NOT apply sourceScale here
    // (this is an internal comparator output, not a user-controlled source).
    // Add "SENSOR_OUT" to HISTORY_TYPES in CircuitSolver if not already present.
    pushBranch(electrical, {
      id:      `${comp.id}_out`,
      type:    "SENSOR_OUT",
      a:       sigNet,
      b:       gndNet,
      ohms:    R_OUT,
      vOffset: outputVoltage,
    });

    // ── Stamp VCC supply load ─────────────────────────────────────────────
    // Models the sensor's own current draw so the power rail sees a realistic
    // load. Only stamp if VCC is actually wired — otherwise the branch would
    // have a=null which pushBranch rejects anyway, but being explicit is cleaner.
    if (vccNet) {
      pushBranch(electrical, {
        id:   `${comp.id}_vcc_load`,
        type: "SENSOR_LOAD",
        a:    vccNet,
        b:    gndNet,
        ohms: R_VCC_LOAD,
      });
    }
  },

  update(comp, electrical, solver) {
    const curr = (comp.instance?.active === true)
              || (comp.instance?.tilted === true);

    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
      const engine = comp._engine
                  ?? comp.instance?._engine
                  ?? comp.instance?.simEngine;
      engine?.resolveElectrical?.();
    }
  },
};