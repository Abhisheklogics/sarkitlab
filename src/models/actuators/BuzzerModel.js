"use strict";

// Real piezo buzzer physics:
//   Internal R ~150Ω
//   Below ~2mA: completely silent (not enough force to vibrate disc)
//   2–5mA: very faint, barely audible
//   5–30mA: normal operating range, volume rises with current
//   >30mA: max volume (clipped — piezo saturates mechanically)
//
// Examples at 5V pin (45Ω source R):
//   No resistor:  I = 5/(150+45)  = 25.6mA → loud
//   220Ω:         I = 5/(150+220+45) = 12mA → normal
//   1kΩ:          I = 5/(150+1000+45) = 4.1mA → very faint
//   4.7kΩ at 5V:  I = 5/(150+4700+45) = 1.0mA → silent ✓
//   4.7kΩ at 9V:  I = 9/(150+4700) = 1.86mA → silent ✓
//   220Ω at 9V:   I = 9/(150+220)  = 24.3mA → loud ✓
//   3.3V no R:    I = 3.3/150 = 22mA → normal ✓
//   3.3V + 1kΩ:   I = 3.3/1150 = 2.87mA → barely audible ✓

const R_INTERNAL  = 150;
const I_SILENCE   = 0.002;   // <2mA = silent
const I_FAINT     = 0.005;   // 2–5mA = barely audible
const I_RATED     = 0.025;   // 25mA = full volume
const DEFAULT_FREQ = 2000;

function currentToVolume(I) {
  if (I <= I_SILENCE) return 0;
  if (I <= I_FAINT) {
    // 2–5mA: linear ramp 0→0.15 (barely audible)
    return ((I - I_SILENCE) / (I_FAINT - I_SILENCE)) * 0.15;
  }
  if (I >= I_RATED) return 1.0;
  // 5–25mA: logarithmic curve (matches human hearing perception)
  const t = (I - I_FAINT) / (I_RATED - I_FAINT);
  return 0.15 + 0.85 * (Math.log10(1 + t * 9) / Math.log10(10));
}

export default class BuzzerModel {

  static solve(comp, electrical, solver) {
    const anode   = solver.findNet(comp.id, "Anode");
    const cathode = solver.findNet(comp.id, "Cathode");
    if (!anode || !cathode) return;

    electrical.circuits.push({
      id:   `${comp.id}_r`,
      type: "DEFAULT",
      a:    anode,
      b:    cathode,
      ohms: R_INTERNAL,
    });
  }

  static update(comp, electrical, solver) {
    const anode   = solver.findNet(comp.id, "Anode");
    const cathode = solver.findNet(comp.id, "Cathode");

    if (!anode || !cathode) {
      comp.instance?.stopTone?.();
      return;
    }

    const Va = electrical.netVoltage.get(anode)   ?? 0;
    const Vk = electrical.netVoltage.get(cathode) ?? 0;

    if (Va <= Vk) {
      comp.instance?.stopTone?.();
      return;
    }

    const branch  = electrical.circuits.find(b => b.id === `${comp.id}_r`);
    const current = branch ? Math.abs(branch.current ?? 0) : 0;

    const volume = currentToVolume(current);
    if (volume <= 0) {
      comp.instance?.stopTone?.();
      return;
    }

    const freq = BuzzerModel._resolveFreq(anode, comp, solver);
    comp.instance?.playTone?.(freq, volume);
  }

  static _resolveFreq(anodeNet, comp, solver) {
    const engine = solver.simEngine;

    if (engine?.toneState?.active) return engine.toneState.freq ?? DEFAULT_FREQ;

    const arduino = solver.registry?.getAll?.()
      .find(c => c.type?.toLowerCase().includes("arduino"));
    if (!arduino || !engine) return DEFAULT_FREQ;

    for (let p = 0; p <= 13; p++) {
      const pinNet = solver.findNet(arduino.id, String(p));
      if (pinNet !== anodeNet) continue;

      const pwmFreq = engine.pwmFrequency?.["D" + p];
      if (pwmFreq && pwmFreq > 0) return pwmFreq;

      const toneFreq = engine.toneFrequency?.["D" + p];
      if (toneFreq && toneFreq > 0) return toneFreq;
    }

    return DEFAULT_FREQ;
  }
}