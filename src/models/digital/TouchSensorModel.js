"use strict";

// ─── Touch Sensor (TTP223) Model — SPICE level fix ────────────────────────
//
// FIXES vs original:
//
// 1. R_OUT: was 10Ω — wrong.
//    Real TTP223 has push-pull CMOS output (rail-to-rail driver).
//    Output impedance: ~1Ω (typical CMOS output driver).
//    With 10Ω and Arduino 50kΩ INPUT_PULLUP:
//      V_signal = Vcc * 50000/(50000+10) = 0.9998*Vcc — almost ok but
//      with multiple loads on the net the error compounds.
//    Fix: R_OUT = 1Ω — push-pull CMOS rail-to-rail.
//
// 2. VCC fallback iteration problem:
//    Original: if liveVcc < 0.5 use config fallback.
//    Problem: on iter 0 liveVcc = 0, so fallback is used.
//    On iter 1 liveVcc might be 4.8V (loaded), which is fine.
//    But if fallback was 5V and real VCC is 3.3V system,
//    first stamp was wrong and NR may not converge cleanly.
//    Fix: use comp._solvedVcc (persists across iters, updated in update()).
//    On first call ever: use config or 5V. After first solve: use real net.
//
// 3. VCC supply load: was 10kΩ (~0.5mA).
//    Real TTP223 quiescent: 1.5μA typical at 3V, max 3μA.
//    10kΩ at 5V = 0.5mA — 300× too high.
//    Fix: 2MΩ → ~2.5μA at 5V.
//
// 4. SENSOR_OUT is in CircuitSolver's HISTORY_TYPES → not sourceScaled. ✓
//    No change needed there.

const R_OUT      = 1;        // push-pull CMOS output driver (Ω)
const R_VCC_LOAD = 2_000_000; // TTP223 quiescent ~2.5μA at 5V

function pushBranch(electrical, branch) {
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

    if (!sigNet || !gndNet) return;

    // ── VCC: use persisted solved value, fall back to config/default ──────
    // comp._solvedVcc is set in update() after each successful solve.
    // This means NR iter 0 uses config, iter 1+ uses real solved VCC.
    // Much more stable than checking liveVcc > 0.5 inline.
    let vcc = comp._solvedVcc ?? (comp.instance?.vcc ?? 5.0);

    // Clamp to realistic range — if net not solved yet, use safe default
    if (!Number.isFinite(vcc) || vcc < 1.5) vcc = comp.instance?.vcc ?? 5.0;

    // ── Power check: TTP223 needs min 2V to operate ───────────────────────
    if (vcc < 2.0) return;

    // ── Output state ──────────────────────────────────────────────────────
    const isTouched     = comp.instance?.active === true
                       || comp.instance?.tilted === true;
    const outputVoltage = isTouched ? vcc : 0;

    // ── Stamp SIGNAL output (push-pull CMOS, near-zero R) ────────────────
    // type "SENSOR_OUT" → CircuitSolver HISTORY_TYPES excludes it from
    // sourceScale, so it is always stamped at full vOffset.
    pushBranch(electrical, {
      id:      `${comp.id}_out`,
      type:    "SENSOR_OUT",
      a:       sigNet,
      b:       gndNet,
      ohms:    R_OUT,
      vOffset: outputVoltage,
    });

    // ── VCC supply load (realistic quiescent current) ─────────────────────
    if (vccNet) {
      pushBranch(electrical, {
        id:   `${comp.id}_vcc_load`,
        type: "SENSOR_LOAD",
        a:    vccNet,
        b:    gndNet,
        ohms: R_VCC_LOAD,
      });
    }

    // Save nets for update()
    comp._nets = { vccNet, gndNet, sigNet };
  },

  update(comp, electrical, solver) {
    // ── Persist solved VCC for next solve() call ──────────────────────────
    if (comp._nets?.vccNet) {
      const liveVcc = electrical.netVoltage.get(comp._nets.vccNet) ?? 0;
      if (liveVcc > 1.5) comp._solvedVcc = liveVcc;
    }

    // ── Trigger electrical re-solve on state change ───────────────────────
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