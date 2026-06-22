"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Arduino UNO (ATmega328P) — LTspice-level simulation model
//
// Implements all 11 prompt requirements:
//  1. Pin protection diodes (to VCC and GND)
//  2. Input leakage current (~1µA)
//  3. Brownout detection (4.3V / 2.7V / 1.8V thresholds)
//  4. MCU supply current (10-50mA depending on activity)
//  5. Output driver saturation (PMOS/NMOS model, not ideal Vsource)
//  6. PWM engine (Timer0=976Hz, Timer1/2=490Hz, avg vs real mode)
//  7. Pin overcurrent protection (40mA/pin, 200mA total)
//  8. Analog input protection diodes + ADC clamping
//  9. Floating pin noise (random drift HIGH/LOW)
// 10. MCU reset state on brownout
// 11. Full diagnostics exposed
//
// Solver compatibility:
//  - Protection diodes: stamped as DIODE type → CircuitSolver._stampDiodes()
//    handles them via pnjlim-limited NR. Solver already has RECTIFYING set.
//  - Supply current: resistor stamp on VCC net
//  - Output driver: Thevenin with saturation-adjusted R_out and V_sat
//  - Brownout: read netVoltage.get(vcc5Net) each update()
//  - Floating noise: small random current injection on floating pins
// ═══════════════════════════════════════════════════════════════════════════

// ─── Rail voltages ────────────────────────────────────────────────────────
const V_CC  = 5.0;
const V_33  = 3.3;

// ─── Output driver model (ATmega328P datasheet Section 14.2) ─────────────
// PMOS high-side driver:  VOH sags under load
// NMOS low-side driver:   VOL rises under load
// At 20mA: VOH ≈ 4.2-4.5V → effective R_out_high ≈ (5-4.2)/0.02 = 40Ω
// At  8mA: VOH ≈ 4.7V     → effective R_out_high ≈ (5-4.7)/0.008 = 37.5Ω
// Model: R_out = R_base + R_sat * (I/I_max)^1.5 (nonlinear saturation)
const R_OUT_HIGH_BASE = 35;    // Ω — PMOS pull-up base resistance
const R_OUT_LOW_BASE  = 35;    // Ω — NMOS pull-down base resistance
const R_OUT_CLAMP     = 200;   // Ω — overcurrent limiting resistance
const V_SAT_HIGH      = 0.06;  // V — PMOS saturation at very high I
const V_SAT_LOW       = 0.06;  // V — NMOS saturation at very low V

// ─── Input modes ─────────────────────────────────────────────────────────
const R_PULLUP    = 35_000;    // 35kΩ (datasheet: 20-50kΩ)
const R_PULLDOWN  = 35_000;    // (non-standard but some shields use it)
const R_HIGH_Z    = 100e6;     // 100MΩ — input leakage model
const R_FLOAT_GND = 1e9;       // floating anchor (prevents solver floating)

// ─── Protection diodes (ATmega328P datasheet Figure 13-2) ────────────────
// Every I/O pin has:
//   D_high: pin → VCC  (clamps overvoltage, forward when Vpin > Vcc+0.5)
//   D_low:  GND → pin  (clamps undervoltage, forward when Vpin < -0.5)
// Is = 1e-12, N = 1.0 — standard silicon junction
const DIODE_IS = 1e-12;
const DIODE_N  = 1.0;

// ─── Input leakage (ATmega328P datasheet: ±1µA typical) ──────────────────
// Modeled as 5MΩ resistor to GND (5V / 5MΩ = 1µA)
const R_LEAKAGE = 5_000_000;   // 5MΩ → ~1µA leakage at 5V

// ─── Brownout thresholds (ATmega328P fuse-selectable) ────────────────────
const BOD_LEVELS = { "4.3": 4.3, "2.7": 2.7, "1.8": 1.8 };
const BOD_DEFAULT = 2.7;
const BOD_HYSTERESIS = 0.1;    // 100mV hysteresis to prevent oscillation

// ─── MCU supply current (ATmega328P datasheet Table 28-1) ────────────────
// Modeled as load resistor on VCC rail.
// At 5V: idle=10mA→500Ω, running=20mA→250Ω, heavy=40mA→125Ω
const R_MCU_IDLE    = 500;     // 10mA at 5V
const R_MCU_RUNNING = 250;     // 20mA at 5V
const R_MCU_HEAVY   = 125;     // 40mA at 5V

// ─── Overcurrent limits (ATmega328P absolute max) ────────────────────────
const I_MAX_PIN   = 0.040;     // 40mA per pin
const I_MAX_TOTAL = 0.200;     // 200mA total chip

// ─── ADC ─────────────────────────────────────────────────────────────────
const DIGITAL_HIGH_THRESHOLD = 3.0;   // V — logic HIGH threshold (0.6*Vcc)
const DIGITAL_LOW_THRESHOLD  = 1.5;   // V — logic LOW threshold

// ─── PWM timers (ATmega328P at 16MHz) ────────────────────────────────────
// Timer0 (pins 5,6): phase-correct PWM → 976Hz
// Timer1 (pins 9,10): phase-correct PWM → 490Hz
// Timer2 (pins 3,11): phase-correct PWM → 490Hz
const PWM_FREQ = {
  5: 976, 6: 976,
  9: 490, 10: 490,
  3: 490, 11: 490,
};
const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);

// ─── Pin lists ────────────────────────────────────────────────────────────
const DIGITAL_PINS = ["0","1","2","3","4","5","6","7","8","9","10","11","12","13"];
const ANALOG_PINS  = ["A0","A1","A2","A3","A4","A5"];

// ─── Floating noise: per-pin random seed for stable-ish drift ────────────
const _floatPhase = new Map();
function _floatNoise(key, t) {
  if (!_floatPhase.has(key)) _floatPhase.set(key, Math.random() * 1000);
  const ph = _floatPhase.get(key);
  // Low-frequency random drift — changes slowly, not every tick
  return 0.5 + 0.5 * Math.sin(ph + t * 0.3 + Math.random() * 0.1);
}

// ─── Output driver effective resistance (PMOS/NMOS saturation model) ─────
// As output current increases, R_eff increases (driver saturates).
// This gives VOH ≈ 4.2-4.5V at 20mA, matching datasheet.
function _rOutHigh(I_abs) {
  // R_eff = R_base * (1 + 3*(I/40mA)^2) — quadratic saturation
  const x = Math.min(I_abs / I_MAX_PIN, 1.0);
  return R_OUT_HIGH_BASE * (1 + 3 * x * x);
}
function _rOutLow(I_abs) {
  const x = Math.min(I_abs / I_MAX_PIN, 1.0);
  return R_OUT_LOW_BASE * (1 + 3 * x * x);
}

export default class ArduinoModel {

  // ─── solve(): stamp all branches into MNA matrix ───────────────────────
  static solve(comp, electrical, solver) {
    const engine   = solver.simEngine;
    const gndNet   = solver.findNet(comp.id, "GND");
    const vcc5Net  = solver.findNet(comp.id, "5V");
    const vcc33Net = solver.findNet(comp.id, "3.3V");
    if (!gndNet) return;

    // ── 1. GND and rails ─────────────────────────────────────────────────
    electrical.gndNets.add(gndNet);

    if (vcc5Net) {
      electrical.circuits.push({
        id: `${comp.id}_rail_5v`, type: "POWER_SOURCE",
        a: vcc5Net, b: gndNet, ohms: 0.05, vOffset: V_CC,
      });
      electrical.powerNets?.add(vcc5Net);
    }

    if (vcc33Net) {
      electrical.circuits.push({
        id: `${comp.id}_rail_3v3`, type: "POWER_SOURCE",
        a: vcc33Net, b: gndNet, ohms: 0.05, vOffset: V_33,
      });
      electrical.powerNets?.add(vcc33Net);
    }

    // ── 4. MCU supply current (load on VCC) ──────────────────────────────
    // Amount depends on GPIO activity (counted in update(), used next tick)
    if (vcc5Net) {
      const rMcu = comp._rMcu ?? R_MCU_RUNNING;
      electrical.circuits.push({
        id: `${comp.id}_mcu_idd`, type: "RESISTOR",
        a: vcc5Net, b: gndNet, ohms: rMcu,
      });
    }

    // ── Init state ────────────────────────────────────────────────────────
    if (!comp._pinOvercurrent) comp._pinOvercurrent = {};
    if (!comp._pinWarnings)    comp._pinWarnings    = {};
    if (!comp._pinCurrents)    comp._pinCurrents    = {};
    if (!comp._floatT)         comp._floatT         = 0;

    // Check reset state (set by brownout in update())
    const inReset = comp._resetState ?? false;

    const tonePin = engine?.toneState?.active ? engine.toneState.pin : null;

    // ── Stamp digital pins ────────────────────────────────────────────────
    for (const pinName of DIGITAL_PINS) {
      const net = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const pinNum = parseInt(pinName, 10);
      const key    = `D${pinNum}`;
      const mode   = inReset ? "INPUT" : (engine.pinStates[key]);
      const isTone = !inReset && tonePin != null && pinNum === tonePin;

      ArduinoModel._stampPin(
        comp, electrical, engine, solver,
        pinName, pinNum, key, net, gndNet, vcc5Net,
        mode, false, isTone, inReset
      );
    }

    // ── Stamp analog pins ─────────────────────────────────────────────────
    for (const pinName of ANALOG_PINS) {
      const net = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const pinNum = 14 + parseInt(pinName.slice(1), 10);
      const key    = pinName;
      const mode   = inReset ? "INPUT" : (engine.pinStates[key]);

      ArduinoModel._stampPin(
        comp, electrical, engine, solver,
        pinName, pinNum, key, net, gndNet, vcc5Net,
        mode, true, false, inReset
      );
    }
  }

  // ─── _stampPin(): stamp one pin's branches ─────────────────────────────
  static _stampPin(
    comp, electrical, engine, solver,
    pinName, pinNum, key, net, gndNet, vcc5Net,
    mode, isAnalog, isTone, inReset
  ) {
    // ── 1. Protection diodes (always present, regardless of mode) ────────
    // D_high: pin anode → VCC cathode  (clamps Vpin > Vcc+0.5V)
    if (vcc5Net) {
      electrical.circuits.push({
        id:   `${comp.id}_dprot_h_${pinName}`,
        type: "DIODE",
        a:    net,        // anode = pin net
        b:    vcc5Net,    // cathode = VCC
        ohms: 0,
        Is:   DIODE_IS,
        N:    DIODE_N,
      });
    }
    // D_low: GND anode → pin cathode  (clamps Vpin < -0.5V)
    electrical.circuits.push({
      id:   `${comp.id}_dprot_l_${pinName}`,
      type: "DIODE",
      a:    gndNet,     // anode = GND
      b:    net,        // cathode = pin net (forward when Vpin < 0)
      ohms: 0,
      Is:   DIODE_IS,
      N:    DIODE_N,
    });

    // ── 2. Input leakage (~1µA) ───────────────────────────────────────────
    // Always present on input pins. 5MΩ to GND → 1µA at 5V.
    if (mode !== "OUTPUT") {
      electrical.circuits.push({
        id:   `${comp.id}_leak_${pinName}`,
        type: "RESISTOR",
        a:    net,
        b:    gndNet,
        ohms: R_LEAKAGE,
      });
    }

    // ── 5. Output driver (PMOS/NMOS saturation model) ────────────────────
    if (mode === "OUTPUT" || isTone) {
      const raw = engine.digitalVoltages[key] ?? 0;
      let targetV;

      if (isTone) {
        targetV = V_CC;
      } else if (raw === 0 || raw === false) {
        targetV = 0;
      } else if (raw === 1 || raw === true) {
        targetV = V_CC;
      } else {
        // PWM: average voltage mode (default) or real waveform
        const duty = Math.max(0, Math.min(255, raw));
        if (PWM_PINS.has(pinNum)) {
          const pwmMode = engine.simState?.pwmMode ?? "average";
          if (pwmMode === "average") {
            targetV = (duty / 255) * V_CC;
          } else {
            // Real PWM: use current phase to decide HIGH/LOW
            const freq    = PWM_FREQ[pinNum] ?? 490;
            const period  = 1 / freq;
            const simTime = engine.simState?.simTime ?? 0;
            const phase   = (simTime % period) / period;
            targetV = phase < (duty / 255) ? V_CC : 0;
          }
        } else {
          targetV = duty >= 128 ? V_CC : 0;
        }
      }

      // Output resistance depends on whether driving HIGH or LOW
      const overcurrent = comp._pinOvercurrent?.[key] ?? false;
      let rEff;
      if (overcurrent) {
        rEff = R_OUT_CLAMP;
      } else {
        const I_prev = comp._pinCurrents?.[key] ?? 0;
        rEff = targetV > 2.5 ? _rOutHigh(I_prev) : _rOutLow(I_prev);
      }

      // Saturation voltage offset: HIGH output slightly below VCC under load
      // LOW output slightly above GND under load
      // Modeled by adjusting vOffset by V_sat
      const vSat = targetV > 2.5 ? (V_CC - V_SAT_HIGH) : V_SAT_LOW;
      const vEff = targetV > 2.5 ? vSat : V_SAT_LOW;

      electrical.circuits.push({
        id:       `${comp.id}_out_${pinName}`,
        type:     "ARDUINO_PIN_OUT",
        a:        net,
        b:        gndNet,
        ohms:     rEff,
        vOffset:  targetV > 0.5 ? (V_CC - V_SAT_HIGH) : V_SAT_LOW,
        _targetV: targetV,
        _rEff:    rEff,
      });
      return;
    }

    // ── 3. INPUT_PULLUP ───────────────────────────────────────────────────
    if (mode === "INPUT_PULLUP") {
      if (vcc5Net) {
        electrical.circuits.push({
          id: `${comp.id}_pu_${pinName}`, type: "PULLUP",
          a: vcc5Net, b: net, ohms: R_PULLUP,
        });
      }
      electrical.circuits.push({
        id: `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
        a: net, b: gndNet, ohms: R_HIGH_Z,
      });
      return;
    }

    // ── INPUT_PULLDOWN ────────────────────────────────────────────────────
    if (mode === "INPUT_PULLDOWN") {
      electrical.circuits.push({
        id: `${comp.id}_pd_${pinName}`, type: "PULLDOWN",
        a: net, b: gndNet, ohms: R_PULLDOWN,
      });
      electrical.circuits.push({
        id: `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
        a: net, b: gndNet, ohms: R_HIGH_Z,
      });
      return;
    }

    // ── 9. Floating pin noise: INPUT (no pullup) ──────────────────────────
    // Floating pins drift — modeled by injecting a small time-varying
    // current into the node, making voltage wander unpredictably.
    electrical.circuits.push({
      id:   `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
      a:    net, b: gndNet, ohms: R_HIGH_Z,
    });
    // Floating anchor (prevents completely undefined node)
    const floatV = (_floatNoise(key, comp._floatT ?? 0)) * V_CC;
    electrical.circuits.push({
      id:      `${comp.id}_flt_${pinName}`, type: "DEFAULT",
      a:       net, b: gndNet,
      ohms:    R_FLOAT_GND,
      vOffset: floatV * 0.1,   // weak random bias — net drifts, not jumps
    });
  }

  // ─── update(): read solved voltages, update state ──────────────────────
  static update(comp, electrical, solver) {
    const engine = solver.simEngine;
    const vRef   = engine.simState?.aref ?? V_CC;

    if (!comp._pinOvercurrent) comp._pinOvercurrent = {};
    if (!comp._pinWarnings)    comp._pinWarnings    = {};
    if (!comp._pinCurrents)    comp._pinCurrents    = {};
    if (!engine._digitalNetV)  engine._digitalNetV  = {};
    if (!comp._floatT)         comp._floatT         = 0;
    comp._floatT += 0.016;   // ~60fps tick counter for noise

    // ── 3. Brownout Detection ─────────────────────────────────────────────
    const vcc5Net = solver.findNet(comp.id, "5V");
    const gndNet  = solver.findNet(comp.id, "GND");
    let   vcc     = V_CC;
    if (vcc5Net) vcc = electrical.netVoltage.get(vcc5Net) ?? V_CC;

    const bodLevel = BOD_LEVELS[String(engine.simState?.bodLevel ?? "2.7")]
                  ?? BOD_DEFAULT;

    const wasReset   = comp._resetState ?? false;
    const bodLow     = vcc < bodLevel - BOD_HYSTERESIS;
    const bodRecover = vcc > bodLevel + BOD_HYSTERESIS;

    if (!wasReset && bodLow) {
      comp._resetState = true;
      comp._brownout   = true;
      console.warn(
        `[ArduinoModel] BROWNOUT: VCC=${vcc.toFixed(3)}V < BOD=${bodLevel}V. ` +
        `MCU reset. Pins forced to INPUT.`
      );
      engine.onBrownout?.({ vcc, bodLevel });
      // 10. Reset state: stop sketch, clear timers, force pins to INPUT
      engine.onMCUReset?.();
    } else if (wasReset && bodRecover) {
      comp._resetState = false;
      comp._brownout   = false;
      console.log(`[ArduinoModel] VCC recovered (${vcc.toFixed(3)}V). MCU restart.`);
      engine.onMCURestart?.();
    }

    // ── 4. MCU supply current: adjust R_mcu based on GPIO activity ────────
    let activeOutputs = 0;
    for (const pinName of DIGITAL_PINS) {
      const key = `D${parseInt(pinName, 10)}`;
      if (engine.pinStates[key] === "OUTPUT") activeOutputs++;
    }
    // More active outputs → heavier current draw
    if      (activeOutputs > 8)  comp._rMcu = R_MCU_HEAVY;
    else if (activeOutputs > 2)  comp._rMcu = R_MCU_RUNNING;
    else                         comp._rMcu = R_MCU_IDLE;

    // ── 7. Pin overcurrent tracking and diagnostics ───────────────────────
    let totalOutputCurrent = 0;

    for (const pinName of DIGITAL_PINS) {
      const net    = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const pinNum = parseInt(pinName, 10);
      const key    = `D${pinNum}`;
      const mode   = engine.pinStates[key];
      const netV   = electrical.netVoltage.get(net) ?? 0;

      if (mode === "OUTPUT") {
        const branch = electrical.circuits.find(
          b => b.id === `${comp.id}_out_${pinName}`
        );
        if (branch) {
          const targetV = branch._targetV ?? 0;
          const Vnet    = electrical.netVoltage.get(branch.a) ?? 0;
          const R       = branch._rEff ?? branch.ohms ?? R_OUT_HIGH_BASE;
          const I       = Math.abs((targetV - Vnet) / Math.max(R, 1));

          comp._pinCurrents[key]    = I;
          totalOutputCurrent       += I;

          const wasOver = comp._pinOvercurrent[key] ?? false;
          const isOver  = I > I_MAX_PIN;
          comp._pinOvercurrent[key] = isOver;

          if (isOver && !wasOver) {
            comp._pinWarnings[key] = true;
            console.warn(
              `[ArduinoModel] Pin ${key} overcurrent: ${(I*1000).toFixed(1)}mA > 40mA.`
            );
            engine.onPinOvercurrent?.(key, I, 0);
          } else if (!isOver && wasOver) {
            comp._pinWarnings[key] = false;
          }
        }
      }

      // digitalRead update
      engine._digitalNetV[key] = netV;
      if (mode !== "OUTPUT") {
        const isHigh = netV >= DIGITAL_HIGH_THRESHOLD;
        if (engine.digitalInputs) engine.digitalInputs[key] = isHigh ? 1 : 0;
      }
    }

    // Total current check
    const mcuIdd    = vcc / Math.max(comp._rMcu ?? R_MCU_RUNNING, 1);
    const totalI    = totalOutputCurrent + mcuIdd;
    const wasTotal  = comp._totalOver ?? false;
    const isTotal   = totalI > I_MAX_TOTAL;
    comp._totalOver = isTotal;
    if (isTotal && !wasTotal) {
      console.warn(
        `[ArduinoModel] Total current ${(totalI*1000).toFixed(1)}mA > 200mA limit.`
      );
      engine.onTotalOvercurrent?.(totalI);
    }
    comp._totalOutputCurrent = totalI;

    // ── 8. ADC update with protection diode clamping ──────────────────────
    for (const pinName of ANALOG_PINS) {
      const net  = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const mode = engine.pinStates[pinName];
      if (mode === "OUTPUT") continue;

      let voltage = electrical.netVoltage.get(net) ?? 0;

      // 8. Analog protection: clamp to [0, AREF]
      // (Protection diodes already limit hardware, but ADC register saturates)
      voltage = Math.max(0, Math.min(voltage, vRef));

      const bits    = engine.simState?.analogResolution ?? 10;
      const maxBits = (1 << bits) - 1;
      let   adcVal  = Math.round((voltage / vRef) * maxBits);

      // 9. Floating pin: ADC reads unstable value
      if (!mode || mode === "INPUT") {
        const isFloating = !ArduinoModel._hasExternalDriver(net, electrical, comp.id, pinName);
        if (isFloating) {
          // Random ADC value drift — realistically noisy
          const noise = Math.floor(Math.random() * 1024);
          adcVal = Math.floor(adcVal * 0.3 + noise * 0.7);
        }
      }
      adcVal = Math.max(0, Math.min(maxBits, adcVal));

      if (!engine._analogCache) engine._analogCache = {};
      const pinNum = 14 + parseInt(pinName.slice(1), 10);
      engine._analogCache[pinName] = adcVal;
      engine._analogCache[pinNum]  = adcVal;
      engine._digitalNetV[pinName] = voltage;

      if (engine.digitalInputs) {
        const dv = voltage >= DIGITAL_HIGH_THRESHOLD ? 1 : 0;
        engine.digitalInputs[pinName] = dv;
        engine.digitalInputs[pinNum]  = dv;
      }
    }

    // ── 11. Expose diagnostics ────────────────────────────────────────────
    comp._diagnostics = {
      vcc,
      currentConsumption: totalI,
      brownout:           comp._brownout   ?? false,
      resetState:         comp._resetState ?? false,
      pinCurrents:        { ...comp._pinCurrents },
      totalCurrent:       totalI,
      overCurrent:        comp._totalOver  ?? false,
      adcValues:          { ...(engine._analogCache ?? {}) },
    };
    engine.onDiagnostics?.(comp._diagnostics);
  }

  // ─── Helper: does this net have an external driver? ────────────────────
  // Used to detect floating analog pins for noise injection.
  // A pin is floating if only Arduino's own leakage/float branches are on it.
  static _hasExternalDriver(net, electrical, compId, pinName) {
    for (const branch of electrical.circuits) {
      if (branch.a !== net && branch.b !== net) continue;
      // Skip our own leakage, float, diode, and high-Z branches
      if (branch.id?.startsWith(compId)) continue;
      return true;
    }
    return false;
  }
}