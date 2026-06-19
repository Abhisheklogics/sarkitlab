"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// LM7805 / 78xx Linear Regulator — SPICE-level Thevenin model
//
// Real 7805 behaviour:
//   • Needs ≥ 7V across IN→GND to regulate (2V dropout minimum).
//   • Output = 5.0V above GND when regulating.
//   • Below dropout: acts as a low-gain pass-through (Vout ≈ Vin − Vdropout).
//   • Quiescent current ~5-8mA flows IN→GND even at no load.
//   • Max output current 1A; internal current limit modelled by Rout floor.
//
// MNA stamp:
//   Branch OUT→GND: ohms = Rout, vOffset = Vout_target − Vgnd
//   (same Thevenin pattern as batteries and voltage sources)
//   Branch IN→GND:  ohms = Riq  (quiescent current sink)
// ═══════════════════════════════════════════════════════════════════════════

const VREG          = 5.0;    // regulated output voltage above GND
const VDROPOUT      = 2.0;    // minimum headroom required (V_IN − V_GND)
const VDROPOUT_MIN  = 1.0;    // below this: output collapses to 0
const ROUT_REG      = 0.5;    // output impedance while regulating (~0.5Ω)
const ROUT_DROPOUT  = 10.0;   // output impedance in dropout region
const ROUT_OFF      = 1e6;    // output impedance when input too low
const RIQ           = 1800;   // quiescent current path IN→GND  (5V/1800Ω ≈ 2.8mA)
const IOUT_MAX      = 1.0;    // 1A current limit
// At 5V regulated, minimum Rout to enforce 1A limit = 5/1 = 5Ω.
// ROUT_REG (0.5Ω) << 5Ω so the load sets the current in normal use.
// For a genuine current-limit: Rout_eff = max(ROUT_REG, Vout/IOUT_MAX).

export default class Regulator7805Model {

  static solve(comp, electrical, solver) {
    const { IN, GND, OUT } = solver.getNets(comp, ["IN", "GND", "OUT"]);

    // If any critical net is missing the component is not wired correctly;
    // push nothing so the rest of the circuit doesn't see a phantom source.
    if (!OUT || !GND) return;

    const vGnd = electrical.netVoltage.get(GND) ?? 0;
    const vIn  = IN ? (electrical.netVoltage.get(IN) ?? 0) : 0;
    const diff  = vIn - vGnd;           // headroom above GND rail

    // ── Determine operating region ────────────────────────────────────────
    let vOutTarget, Rout;

    if (diff >= VDROPOUT + VREG - VREG) {   // shorthand: diff >= VDROPOUT
      // Regulating: output is a stiff 5V source above GND
      const voutNominal = vGnd + VREG;
      // Current-limit clamp: if load would pull > IOUT_MAX,
      // raise effective Rout so solver sees resistance, not a short.
      const RlimitMin = VREG / Math.max(IOUT_MAX, 1e-6);
      vOutTarget = voutNominal;
      Rout       = Math.max(ROUT_REG, RlimitMin);

    } else if (diff >= VDROPOUT_MIN) {
      // Dropout region: Vout ≈ Vin − Vdropout_eff, soft pass-through
      const ratio    = (diff - VDROPOUT_MIN) / (VDROPOUT - VDROPOUT_MIN);
      vOutTarget     = vGnd + diff * ratio;   // linearly tapers to 0
      Rout           = ROUT_DROPOUT;

    } else {
      // Input too low — output collapses
      vOutTarget = vGnd;
      Rout       = ROUT_OFF;
    }

    // ── Thevenin stamp: output branch OUT → GND ──────────────────────────
    // vOffset is the open-circuit voltage ACROSS the branch (a → b = OUT → GND).
    electrical.circuits.push({
      id:      `${comp.id}_out`,
      type:    "REGULATOR",
      a:       OUT,
      b:       GND,
      ohms:    Rout,
      vOffset: vOutTarget - vGnd,   // voltage across OUT→GND terminals
    });

    // ── Quiescent current path: IN → GND ─────────────────────────────────
    // Models the ~5mA that always flows through the regulator body.
    // Without this the IN pin floats in circuits where nothing else
    // loads it, which makes the solver see an open input.
    if (IN) {
      electrical.circuits.push({
        id:   `${comp.id}_iq`,
        type: "WIRE",
        a:    IN,
        b:    GND,
        ohms: RIQ,
      });
    }

    // ── Debug state on instance ───────────────────────────────────────────
    const inst = comp.instance;
    if (inst) {
      inst._regState = {
        vIn,
        vGnd,
        diff,
        vOut: vOutTarget,
        regulating: diff >= VDROPOUT,
      };
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._regState) return;

    const { OUT, GND } = solver.getNets(comp, ["OUT", "GND"]);
    const vOut = OUT ? (electrical.netVoltage.get(OUT) ?? 0) : 0;
    const vGnd = GND ? (electrical.netVoltage.get(GND) ?? 0) : 0;

    inst.updatePhysics?.({
      vOut:       vOut - vGnd,
      regulating: inst._regState.regulating,
      vIn:        inst._regState.diff,
    });
  }
}