"use strict";

// ─── Sound Sensor (KY-038) Model — SPICE level ────────────────────────────
//
// FIXES vs original:
//
// 1. DOUT pull resistors were 100Ω (strong) vs 100kΩ (weak).
//    Problem: 100Ω pull to VCC + 100Ω pull to GND → Thevenin R = 50Ω.
//    Arduino input sees V = 5 * 50k/(50k+50) = 4.995V — ok but:
//    When DOUT LOW: 100Ω to GND vs whatever load → 5V into 100Ω = 50mA!
//    That would burn the sensor output.
//    Real LM393 open-collector output:
//      HIGH: pulled up through external/internal ~10kΩ to VCC
//      LOW:  collector pulled to GND through ~100Ω (saturated BJT, ~50mΩ Rce)
//    Fix: use proper open-collector model with correct impedances.
//
// 2. AOUT output impedance was 1kΩ — real KY-038 AOUT is buffered
//    through a resistor divider from LM393. Actual Zout ≈ 10kΩ.
//    1kΩ could source too much current into a low-impedance load.
//    Fix: 10kΩ output impedance.
//
// 3. Quiescent current: was Vsupply/0.005 = dynamic R based on V.
//    Real KY-038 quiescent: ~5mA at 5V (LM393 + mic bias + LED).
//    Fixed 1kΩ resistor gives 5mA at 5V → correct.

export default class SoundSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "DOUT", "AOUT"]);
    const { VCC, GND, DOUT, AOUT } = nets;

    if (!VCC || !GND) return;

    const Vvcc    = solver.getNetVoltage(VCC, electrical) ?? 0;
    const Vgnd    = solver.getNetVoltage(GND, electrical) ?? 0;
    const Vsupply = Vvcc - Vgnd;

    // Real sensor needs at least 4V to operate (LM393 Vcc min = 2V,
    // but electret mic bias needs ~4V for correct sensitivity)
    if (Vsupply < 4.0) return;

    // ── Quiescent current (~5mA: mic bias + LM393 + power LED) ──────────
    // Fixed 1kΩ → 5mA at 5V, 4.5mA at 4.5V — matches datasheet
    electrical.circuits.push({
      id:   comp.id + "_pwr",
      type: "RESISTOR",
      a:    VCC,
      b:    GND,
      ohms: 1000,
    });

    const inst = comp.instance;
    if (!inst) return;
    if (!inst._simStarted) return;

    const triggered = inst.isTriggered ?? false;

    // ── DOUT — LM393 open-collector output model ──────────────────────────
    //
    // LM393 is an OPEN-COLLECTOR comparator:
    //   Output HIGH: output transistor OFF → pin floated, pulled up by R_PULL
    //   Output LOW:  output transistor ON  → pin pulled hard to GND
    //
    // KY-038 has a 10kΩ pull-up resistor to VCC on DOUT.
    // So: HIGH = VCC pulled through 10kΩ (Vout ≈ VCC - small drop)
    //     LOW  = GND through saturated BJT (~50mΩ, modeled as 1Ω here)
    //
    // Arduino INPUT_PULLUP adds 50kΩ in parallel with the 10kΩ → Thevenin:
    //   HIGH: Rth = 10k||50k = 8.33kΩ, Vth = VCC → V_pin = VCC ✓
    //   LOW:  Rth = 1Ω || (10k+50k) ≈ 1Ω → V_pin ≈ 0V ✓

    if (DOUT) {
      if (triggered) {
        // Output HIGH: pull-up resistor to VCC (open collector = OFF)
        electrical.circuits.push({
          id:   comp.id + "_dout_pu",
          type: "RESISTOR",
          a:    VCC,
          b:    DOUT,
          ohms: 10_000,   // 10kΩ on-board pull-up
        });
        // Weak leakage to GND (off transistor leakage: ~100nA, model as 10MΩ)
        electrical.circuits.push({
          id:   comp.id + "_dout_leak",
          type: "RESISTOR",
          a:    DOUT,
          b:    GND,
          ohms: 10_000_000,
        });
      } else {
        // Output LOW: saturated BJT pulling to GND (~1Ω)
        electrical.circuits.push({
          id:   comp.id + "_dout_low",
          type: "RESISTOR",
          a:    DOUT,
          b:    GND,
          ohms: 1,        // saturated collector: Vce_sat ≈ 0.1V at 5mA
        });
        // Pull-up still present (it's a physical resistor on PCB)
        electrical.circuits.push({
          id:   comp.id + "_dout_pu_always",
          type: "RESISTOR",
          a:    VCC,
          b:    DOUT,
          ohms: 10_000,
        });
      }
    }

    // ── AOUT — analog proportional voltage ────────────────────────────────
    // Output through 10kΩ source impedance (resistor divider from LM393)
    // Range: GND to VCC proportional to sound level (0-1023 ADC scale)
    if (AOUT) {
      const Vout = Vsupply * (inst.analogValue / 1023) + Vgnd;
      electrical.circuits.push({
        id:      comp.id + "_aout",
        type:    "VOLTAGE_SOURCE",
        a:       AOUT,
        b:       GND,
        ohms:    10_000,   // ~10kΩ output impedance
        vOffset: Vout,
      });
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets = solver.getNets(comp, ["VCC", "GND", "DOUT"]);
    const { VCC, GND, DOUT } = nets;

    if (!VCC || !GND) {
      if (inst.pinDOUT != null && inst.digitalInputs)
        inst.digitalInputs[inst.pinDOUT] = 0;
      return;
    }

    const Vsupply = solver.getVoltageDiff(VCC, GND, electrical);
    if (Vsupply < 4.0 || !inst._simStarted) {
      if (inst.pinDOUT != null && inst.digitalInputs)
        inst.digitalInputs[inst.pinDOUT] = 0;
      return;
    }

    // Read actual solved DOUT net voltage → HIGH/LOW threshold at 2.5V
    if (DOUT && inst.pinDOUT != null && inst.digitalInputs) {
      const Vdout = solver.getNetVoltage(DOUT, electrical);
      inst.digitalInputs[inst.pinDOUT] = Vdout > 2.5 ? 1 : 0;
    }
  }
}