"use strict";

// Soil Moisture Sensor (Capacitive / Resistive) — Real Circuit Model
//
// Two common variants exist — both share same pinout (VCC, GND, SIG/AO):
//
// ── Variant A: Resistive (older, common red PCB — matches the SVG) ──────────
//   Works by measuring resistance between two probes immersed in soil.
//   Wet soil = low resistance = more current = higher output voltage
//   Dry soil = high resistance = less current = lower output voltage
//
//   Internal circuit:
//     LM393 comparator on PCB
//     Probe resistance R_soil varies: ~1kΩ (very wet) to ~500kΩ (very dry)
//     Voltage divider: VCC → R_fixed(10kΩ) → probe → GND
//     AO output ≈ VCC × R_probe / (R_fixed + R_probe)
//       Wet (R=1kΩ)  : AO ≈ 5 × 1k/(10k+1k)  = 0.45V
//       Dry (R=500kΩ): AO ≈ 5 × 500k/(10k+500k) = 4.9V
//     Note: INVERTED — wetter = LOWER voltage on AO
//     analogRead() range: wet=~200, dry=~900  (Arduino 10-bit, 5V ref)
//
//   Supply current: ~35mA (resistive probes draw current continuously)
//   VCC range     : 3.3V – 5V
//
// ── Variant B: Capacitive (newer, black PCB) ─────────────────────────────────
//   Measures capacitance change — no electrolysis, longer lifespan
//   NE555 oscillator + capacitance sensing
//   Supply current: ~5mA
//   Output: still 0–VCC analog (inverted: wet=lower V)
//
// Model uses Variant A (matches SVG red PCB):
//   VCC→GND : R_supply (accounts for LM393 + probe current)
//   SIG(AO) : voltage divider output — analog voltage based on moisture%
//             Wet 100%  → R_probe = 500Ω  → AO ≈ 0.24V
//             Dry 0%    → R_probe = 500kΩ → AO ≈ 4.95V
//             Linear interpolation between these in log scale
//
// Solver stamp:
//   SIG net gets a Thevenin equivalent:
//     Vth  = VCC × R_probe / (R_fixed + R_probe)
//     Rth  = R_fixed || R_probe  (parallel combination)
//   Stamped as: vOffset = Vth, ohms = Rth

const V_MIN     = 3.0;      // minimum operating voltage
const V_MAX     = 5.5;
const R_FIXED   = 10000;    // 10kΩ fixed resistor in voltage divider
const R_WET     = 500;      // ~500Ω probe resistance at 100% moisture
const R_DRY     = 500000;   // ~500kΩ probe resistance at 0% moisture
const I_QUIESCE = 0.003;    // 3mA quiescent (LM393 + PCB)
const R_OFF     = 1e6;

export default class SoilMoistureModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "SIG"]);
    const VCC  = nets["VCC"];
    const GND  = nets["GND"];
    const SIG  = nets["SIG"];

    if (!VCC || !GND) return;
    electrical.gndNets.add(GND);

    const vcc     = electrical.netVoltage.get(VCC) ?? 0;
    const powered = vcc >= V_MIN && vcc <= V_MAX;

    // Quiescent supply load (LM393 comparator, PCB logic)
    const Rq = powered ? (vcc / I_QUIESCE) : R_OFF;
    electrical.circuits.push({
      id:   comp.id,
      type: "SENSOR_OUT",
      a:    VCC,
      b:    GND,
      ohms: Math.max(Rq, 50),
    });

    // SIG / AO output — Thevenin equivalent of voltage divider
    if (SIG && powered) {
      const moisture = comp.instance?.readMoisture?.() ?? 50.0;  // 0–100%

      // R_probe: log-scale interpolation (resistance is roughly log-linear with moisture)
      // moisture 100% → R_WET, moisture 0% → R_DRY
      const logW   = Math.log10(R_WET);
      const logD   = Math.log10(R_DRY);
      const logR   = logD + (moisture / 100.0) * (logW - logD);
      const R_probe = Math.pow(10, logR);

      // Thevenin: Vth = VCC × R_probe / (R_fixed + R_probe)  [INVERTED]
      // Dry = high R_probe = high Vth; Wet = low R_probe = low Vth
      const Vth = vcc * R_probe / (R_FIXED + R_probe);
      const Rth = (R_FIXED * R_probe) / (R_FIXED + R_probe);   // parallel

      electrical.circuits.push({
        id:      `${comp.id}_sig`,
        type:    "SENSOR_OUT",
        a:       VCC,   // Thevenin source referenced to GND via vOffset
        b:       SIG,
        ohms:    Rth,
        vOffset: Vth - vcc,   // net effect: SIG sits at Vth above GND
        // Stamping note: branch a=VCC, b=SIG, vOffset makes
        // V_SIG = V_VCC - (V_VCC - Vth) = Vth  ✓
      });

      comp._lastVth   = Vth;
      comp._lastRprobe = R_probe;
    }

    comp._powered = powered;
    comp._vcc     = vcc;
    comp._sigNet  = SIG;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const powered = comp._powered ?? false;
    inst.updatePhysics?.({ powered, vcc: comp._vcc ?? 0 });

    // Expose analog voltage on SIG branch for analogRead() simulation
    if (comp._sigNet && powered) {
      const sigV = electrical.netVoltage.get(comp._sigNet) ?? 0;
      comp._sigVoltage = sigV;
      // SimEngine's analogRead() should read this via solver.getNetVoltage()
      // No extra work needed here — netVoltage map is already updated
    }
  }

  static reset(comp) {
    comp._powered    = false;
    comp._vcc        = 0;
    comp._sigNet     = null;
    comp._lastVth    = 0;
    comp._lastRprobe = R_DRY;
    comp._sigVoltage = 0;

    const inst = comp.instance;
    if (!inst) return;
    inst.powered = false;
    inst.controlsGroup?.setAttribute("visibility", "hidden");
  }
}