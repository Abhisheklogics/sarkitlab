"use strict";

// HC-SR04 Ultrasonic Distance Sensor — Real Circuit Model
//
// Datasheet (Elecfreaks HC-SR04):
//   VCC          : 5V only (3.3V pe unreliable — internal op-amp needs 5V)
//   Operating I  : 15mA typical (active burst), ~2mA standby
//   TRIG input   : TTL HIGH ≥ 10µs pulse → fires 8-cycle 40kHz burst
//                  Input impedance: ~10kΩ (CMOS input, no strong pulldown)
//   ECHO output  : open-drain style — pulled HIGH to VCC via ~1kΩ internal
//                  during echo window, else LOW (pulled to GND via ~10kΩ)
//                  ECHO HIGH duration = 2 × distance / 340 m/s
//                  = distance_cm × 58 µs
//   Sensing range: 2cm – 400cm
//   Blind zone   : < 2cm (burst still in air)
//   Max range    : 400cm (echo too weak below ~0.1mV)
//   Angle        : 15° cone
//   Resolution   : ~0.3cm (300µs / 58µs per cm)
//
// Electrical model (what solver needs to stamp):
//   VCC→GND : 333Ω  (5V / 15mA = 333Ω — main supply load)
//   TRIG    : 10kΩ to GND (CMOS input impedance, keeps line defined)
//   ECHO    : controlled voltage source via R_ECHO
//             echoing → ECHO net pulled to VCC via 1kΩ (open-drain HIGH)
//             idle    → ECHO net pulled to GND via 10kΩ (pulled LOW)
//
// pulseIn() simulation:
//   Arduino calls pulseIn(echoPin, HIGH)
//   SimEngine intercepts → calls solver.getPulseWidth(echoNet)
//   inst.echoTime (µs) is set by inst.trigger() based on inst.distance
//
// Power check:
//   Sensor requires exactly 5V ± 0.5V. Below 4.5V → unreliable.
//   Model stamps high-R load when underpowered.

const V_MIN_OP   = 4.5;    // minimum for reliable operation
const V_MAX_OP   = 5.5;    // absolute max
const I_ACTIVE   = 0.015;  // 15mA operating (burst)
const I_STANDBY  = 0.002;  // 2mA standby
const R_LOAD_ACT = 333;    // 5V / 15mA
const R_LOAD_STB = 2500;   // 5V / 2mA
const R_TRIG_IN  = 10000;  // TRIG CMOS input impedance (~10kΩ)
const R_ECHO_HI  = 1000;   // ECHO HIGH: 1kΩ internal pull path to VCC
const R_ECHO_LO  = 10000;  // ECHO LOW:  10kΩ pull to GND
const R_OFF      = 1e6;    // unpowered

export default class HCSR04Model {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "trig", "echo"]);
    const VCC  = nets["VCC"];
    const GND  = nets["GND"];
    const TRIG = nets["trig"];
    const ECHO = nets["echo"];

    if (!VCC || !GND) return;
    electrical.gndNets.add(GND);

    const vcc      = electrical.netVoltage.get(VCC) ?? 0;
    const powered  = vcc >= V_MIN_OP && vcc <= V_MAX_OP;
    const echoing  = comp.instance?.triggered ?? false;

    // Main supply load — active vs standby vs off
    electrical.circuits.push({
      id:   comp.id,
      type: "SENSOR_OUT",
      a:    VCC,
      b:    GND,
      ohms: powered ? (echoing ? R_LOAD_ACT : R_LOAD_STB) : R_OFF,
    });

    // TRIG: CMOS input — 10kΩ to GND keeps line from floating
    // Does not pull strongly — Arduino easily overrides
    if (TRIG) {
      electrical.circuits.push({
        id:   `${comp.id}_trig`,
        type: "RESISTOR",
        a:    TRIG,
        b:    GND,
        ohms: R_TRIG_IN,
      });
    }

    // ECHO output:
    // Echoing  → internally driven HIGH via 1kΩ to VCC (open-drain HIGH)
    // Idle     → pulled LOW via 10kΩ to GND
    // Unpowered→ floating (1MΩ)
    if (ECHO) {
      if (!powered) {
        electrical.circuits.push({
          id: `${comp.id}_echo`, type: "SENSOR_OUT",
          a: GND, b: ECHO, ohms: R_OFF,
        });
      } else if (echoing) {
        electrical.circuits.push({
          id: `${comp.id}_echo`, type: "SENSOR_OUT",
          a: VCC, b: ECHO, ohms: R_ECHO_HI,
        });
      } else {
        electrical.circuits.push({
          id: `${comp.id}_echo`, type: "SENSOR_OUT",
          a: GND, b: ECHO, ohms: R_ECHO_LO,
        });
      }
    }

    comp._powered = powered;
    comp._vcc     = vcc;
    comp._trigNet = TRIG;
    comp._echoNet = ECHO;
    comp._vccNet  = VCC;
    comp._gndNet  = GND;

    if (comp.instance) {
      comp.instance._nets = { VCC, GND, TRIG, ECHO };
    }
  }

static update(comp, electrical, solver) {
  const inst = comp.instance;
  if (!inst) return;

  const powered  = comp._powered ?? false;
  const trigNet  = comp._trigNet;
  const trigV    = trigNet ? (electrical.netVoltage.get(trigNet) ?? 0) : 0;
  const trigHigh = trigV > 2.0;

  if (powered && trigHigh && !comp._lastTrigHigh) {
    inst.trigger?.();
  }
  comp._lastTrigHigh = trigHigh;

  // Powered state change track karo
  if (powered && !comp._wasOn) {
    comp._wasOn    = true;
    inst.powered   = true;
    inst.simEngine = solver.simEngine ?? null;
    inst.updatePowerState?.();
  }
  if (!powered && comp._wasOn) {
    comp._wasOn  = false;
    inst.powered = false;
    inst.triggered = false;
    inst.updatePowerState?.();
  }

  if (!powered && inst.triggered) {
    inst.triggered = false;
    inst.echoTime  = 0;
  }
}

  static reset(comp) {
    comp._powered      = false;
    comp._vcc          = 0;
    comp._trigNet      = null;
    comp._echoNet      = null;
    comp._vccNet       = null;
    comp._gndNet       = null;
    comp._lastTrigHigh = false;

    const inst = comp.instance;
    if (!inst) return;
    inst.powered   = false;
    inst.triggered = false;
    inst.distance  = 150;             // default 150cm
    inst.echoTime  = 150 * 58;        // 8700µs
    inst.reset?.();
  }
}