"use strict";

// ServoModel.js
const R_SERVO_LOAD = 100;       // typical servo power draw ~150mA @ 5V
const V_MIN_POWER = 4.0;     // below this servo is dead
const V_MAX_POWER    = 7.0;      // above this servo burns
const R_SIG_GOOD     = 2000;     // below this: full accuracy
const R_SIG_JITTER   = 5000;     // 2k-5k: partial/jitter
const R_SIG_DEAD     = 10000;    // above this: signal too weak, no move

function netV(map, id) { return id ? (map.get(id) ?? 0) : 0; }
function push(elec, b) { if (b.a != null || b.b != null) elec.circuits.push(b); }

export default class ServoModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "SIG"]);
    if (!nets.VCC || !nets.GND) return;

    // Power load — servo draws current from VCC-GND always when powered
    push(electrical, {
      id  : `${comp.id}_load`,
      type: "SERVO_LOAD",
      a   : nets.VCC,
      b   : nets.GND,
      ohms: R_SERVO_LOAD,
    });

   
    if (nets.SIG) {
      push(electrical, {
        id  : `${comp.id}_sig_z`,
        type: "RESISTOR",
        a   : nets.SIG,
        b   : nets.GND,
        ohms: 100000,
      });
    }
  }

  static update(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "SIG"]);
    if (!nets.VCC || !nets.GND) return;

    const vVCC  = netV(electrical.netVoltage, nets.VCC);
    const vGND  = netV(electrical.netVoltage, nets.GND);
    const vDiff = vVCC - vGND;
 console.log(`Servo VCC=${vVCC.toFixed(2)}V GND=${vGND.toFixed(2)}V diff=${vDiff.toFixed(2)}V nets=`, nets);
    // ── 1. Power check ────────────────────────────────────────────────────
    const powered = vDiff >= V_MIN_POWER && vDiff <= V_MAX_POWER;

    if (comp.instance) {
      comp.instance.powered = powered;
      comp.instance.voltage = vDiff;
    }

    if (!powered) {
      // Servo dead — no movement, hold last position
      comp.instance?.updateUI?.();
      return;
    }

    // ── 2. Signal pin check — MUST be connected ───────────────────────────
    // Real servo bina PWM signal ke move nahi karta
   if (!nets.SIG) {
  comp.instance?.updateUI?.();
  return;
}
const attachedPinKey = comp.instance?.attachedPinKey; // e.g. "D9"
if (attachedPinKey) {
  const arduino = solver._findArduinoComponent?.() 
    ?? solver.registry?.getAll?.().find(c => c.type?.toLowerCase().includes("arduino"));
  if (arduino) {
    const attachedNet = solver.findNet(arduino.id, attachedPinKey.replace("D",""));
    if (attachedNet !== nets.SIG) {
      // SIG physically galat pin se connected hai
      comp.instance?.updateUI?.();
      return;
    }
  }
}
    // ── 3. Signal resistance check ────────────────────────────────────────
    const sigR = ServoModel._getSeriesResistanceOnSig(nets.SIG, comp.id, electrical);

    let jitterFactor; // 1.0 = perfect, 0 = dead
    if (sigR <= R_SIG_GOOD) {
      jitterFactor = 1.0;                                          // full accuracy
    } else if (sigR <= R_SIG_JITTER) {
      // 2kΩ-5kΩ: linear degradation, jitter increases
      jitterFactor = 1.0 - ((sigR - R_SIG_GOOD) / (R_SIG_JITTER - R_SIG_GOOD)) * 0.6;
    } else if (sigR <= R_SIG_DEAD) {
      // 5kΩ-10kΩ: very poor signal
      jitterFactor = 0.4 - ((sigR - R_SIG_JITTER) / (R_SIG_DEAD - R_SIG_JITTER)) * 0.4;
    } else {
      // 10kΩ+: signal too weak — no movement
      if (comp.instance) comp.instance.speedFactor = 0;
      comp.instance?.updateUI?.();
      return;
    }

    if (comp.instance) comp.instance.speedFactor = jitterFactor;

    // ── 4. Move to target angle ───────────────────────────────────────────
    if (comp.instance?.targetAngle == null) return;

    let angle = Math.max(0, Math.min(180, comp.instance.targetAngle));

    // Jitter simulation: high resistance causes angle error
    if (jitterFactor < 1.0) {
      const jitterMag = (1.0 - jitterFactor) * 15; // max ±15° error at high R
      angle += (Math.random() * 2 - 1) * jitterMag;
      angle = Math.max(0, Math.min(180, angle));
    }

    // Speed scales slightly with VCC (higher voltage = faster servo)
    // Typical: 0.1s/60° @ 4.8V, 0.08s/60° @ 6V
    const vFactor    = Math.max(0, Math.min(1, (vDiff - V_MIN_POWER) / (V_MAX_POWER - V_MIN_POWER)));
    const baseDeg60  = 100 - vFactor * 20;          // 100ms @ 4.8V → 80ms @ 7V per 60°
    const angleDiff  = Math.abs(angle - (comp.instance.angle ?? 90));
    const duration   = Math.max(50, (angleDiff / 60) * baseDeg60 * (1 / Math.max(jitterFactor, 0.1)));
    const clamped    = Math.min(duration, 3000);

    comp.instance.setAngle?.(angle, clamped);
    comp.instance.targetAngle = null;
    comp.instance.updateUI?.();
  }

  // Signal pin par series resistance nikalo (actual resistors jo SIG net se connected hain)
  static _getSeriesResistanceOnSig(sigNet, compId, electrical) {
    let totalR = 0;
    for (const branch of electrical.circuits) {
      if (branch.id?.startsWith(compId)) continue;      // apne branches skip
      if (branch.type !== "RESISTOR" && branch.type !== "WIRE") continue;
      if (branch.a === sigNet || branch.b === sigNet) {
        const r = branch.ohms;
        if (r && Number.isFinite(r) && r > 0 && r < 1e8) {
          totalR += r;
        }
      }
    }
    return totalR;
  }
}