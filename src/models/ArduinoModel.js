"use strict";

const V_CC  = 5.0;
const V_33  = 3.3;

const R_OUT_HIGH_0    = 28.0;
const R_OUT_LOW_0     = 22.0;
const R_OUT_HIGH_DROOP = 120.0;
const R_OUT_LOW_DROOP  = 80.0;
const R_OUT_CLAMP     = 300.0;
const V_SAT_HIGH_0    = 0.05;
const V_SAT_LOW_0     = 0.05;
const V_SAT_HIGH_SLOPE = 0.8;
const V_SAT_LOW_SLOPE  = 0.6;

const R_PULLUP_NOM   = 32_000;
const R_PULLUP_MIN   = 20_000;
const R_PULLUP_MAX   = 50_000;
const R_PULLDOWN_NOM = 32_000;
const R_HIGH_Z       = 1.5e9;
const R_FLOAT_ANCHOR = 2.5e12;
const R_LEAKAGE_IN   = 200e6;
const R_LEAKAGE_OUT  = 80e6;

const DIODE_IS_ESD  = 8e-13;
const DIODE_N_ESD   = 1.0;
const DIODE_VF_NOM  = 0.65;

const BOD_LEVELS     = { "4.3": 4.3, "2.7": 2.7, "1.8": 1.8 };
const BOD_DEFAULT    = 2.7;
const BOD_HYST       = 0.1;
const POWER_ON_DELAY = 0.060;

const R_VCC_RAIL     = 0.06;
const R_GND_RAIL     = 0.02;
const R_MCU_IDLE     = 600;
const R_MCU_RUNNING  = 300;
const R_MCU_HEAVY    = 150;
const C_DECOUPLE     = 100e-9;

const I_MAX_PIN      = 0.040;
const I_WARN_PIN     = 0.020;
const I_MAX_TOTAL    = 0.200;
const I_WARN_TOTAL   = 0.150;
const V_OVER_ABS     = 6.5;
const V_LATCHUP_THR  = 6.0;
const I_REVERSE_MAX  = 0.050;

const DIGITAL_HIGH_THR   = 3.0;
const DIGITAL_LOW_THR    = 1.5;
const FLOAT_NOISE_AMP    = 0.42;
const FLOAT_NOISE_BIAS   = 0.5;
const ADC_NOISE_RMS      = 1.2;
const ADC_THERMAL_COEFF  = 0.15;
const ADC_DNL_MAX        = 0.5;
const ADC_FLOAT_ALPHA    = 0.65;

const PWM_FREQ_MAP = { 5: 976, 6: 976, 9: 490, 10: 490, 3: 490, 11: 490 };
const PWM_PINS     = new Set([3, 5, 6, 9, 10, 11]);

const DIGITAL_PINS = ["0","1","2","3","4","5","6","7","8","9","10","11","12","13"];
const ANALOG_PINS  = ["A0","A1","A2","A3","A4","A5"];

const OVERCURRENT_TICKS_WARN   = 2;
const OVERCURRENT_TICKS_DAMAGE = 10;
const GROUND_BOUNCE_R          = 0.08;

const THETA_JA_MCU   = 60.0;
const TAU_THERMAL_MCU = 8.0;
const TJ_MAX_MCU      = 125.0;
const TJ_WARN_MCU     = 100.0;

const _floatPhase = new Map();
function _floatNoise(key, t) {
  if (!_floatPhase.has(key)) _floatPhase.set(key, Math.random() * 2000);
  const ph = _floatPhase.get(key);
  const slow = Math.sin(ph + t * 0.31 + Math.sin(t * 0.07) * 2.8);
  const fast = Math.sin(ph * 1.73 + t * 3.7 + Math.cos(t * 0.19) * 1.4);
  const rand = (Math.random() - 0.5) * 0.35;
  return FLOAT_NOISE_BIAS + FLOAT_NOISE_AMP * (0.5 * slow + 0.3 * fast + 0.2 * rand);
}

function _pullupVariation(compId) {
  let hash = 0;
  for (let i = 0; i < compId.length; i++) hash = (hash * 31 + compId.charCodeAt(i)) >>> 0;
  const norm = (hash % 10000) / 10000.0;
  return R_PULLUP_MIN + norm * (R_PULLUP_MAX - R_PULLUP_MIN);
}

function _rOutHigh(I_abs, overcurrentTicks) {
  if (overcurrentTicks >= OVERCURRENT_TICKS_DAMAGE) return R_OUT_CLAMP;
  const x = Math.min(I_abs / I_MAX_PIN, 1.0);
  return R_OUT_HIGH_0 + R_OUT_HIGH_DROOP * x * x;
}

function _rOutLow(I_abs, overcurrentTicks) {
  if (overcurrentTicks >= OVERCURRENT_TICKS_DAMAGE) return R_OUT_CLAMP;
  const x = Math.min(I_abs / I_MAX_PIN, 1.0);
  return R_OUT_LOW_0 + R_OUT_LOW_DROOP * x * x;
}

function _vSatHigh(I_abs) {
  return V_SAT_HIGH_0 + V_SAT_HIGH_SLOPE * Math.min(I_abs / I_MAX_PIN, 1.0);
}

function _vSatLow(I_abs) {
  return V_SAT_LOW_0 + V_SAT_LOW_SLOPE * Math.min(I_abs / I_MAX_PIN, 1.0);
}

export default class ArduinoModel {

  static solve(comp, electrical, solver) {
    const engine = solver.simEngine;
    if (!engine) return;

    const gndNet   = solver.findNet(comp.id, "GND");
    const vcc5Net  = solver.findNet(comp.id, "5V");
    const vcc33Net = solver.findNet(comp.id, "3.3V");
    if (!gndNet) return;

    electrical.gndNets.add(gndNet);

    if (!comp._pullupR) {
      comp._pullupR = _pullupVariation(comp.id);
    }

    if (!comp._initDone) {
      comp._initDone      = true;
      comp._startupTimer  = 0.0;
      comp._inStartup     = true;
      comp._pinOvercurrent = {};
      comp._pinOcTicks     = {};
      comp._pinWarnings    = {};
      comp._pinCurrents    = {};
      comp._pinDamage      = {};
      comp._floatT         = 0.0;
      comp._tempRise       = 0.0;
      comp._latchupWarn    = false;
      comp._totalOcTicks   = 0;
    }

    const inReset = comp._resetState ?? false;

    if (vcc5Net) {
      const vcc_now = electrical.netVoltage.get(vcc5Net) ?? V_CC;
      const gndBounce = ArduinoModel._groundBounce(comp, electrical, gndNet);
      electrical.circuits.push({
        id: `${comp.id}_rail_5v`, type: "POWER_SOURCE",
        a: vcc5Net, b: gndNet,
        ohms: R_VCC_RAIL + gndBounce,
        vOffset: V_CC,
      });
      electrical.powerNets?.add(vcc5Net);
    }

    if (vcc33Net) {
      electrical.circuits.push({
        id: `${comp.id}_rail_3v3`, type: "POWER_SOURCE",
        a: vcc33Net, b: gndNet,
        ohms: R_VCC_RAIL * 2,
        vOffset: V_33,
      });
      electrical.powerNets?.add(vcc33Net);
    }

    if (vcc5Net) {
      const rMcu = comp._rMcu ?? R_MCU_RUNNING;
      electrical.circuits.push({
        id: `${comp.id}_mcu_idd`, type: "RESISTOR",
        a: vcc5Net, b: gndNet, ohms: rMcu,
      });

      if (C_DECOUPLE > 0 && solver.dt > 0) {
        const capId  = `${comp.id}_decouple`;
        const hist   = solver._capState?.get(capId);
        const Vprev  = hist?.V ?? V_CC;
        const Iprev  = hist?.I ?? 0.0;
        const Geq    = (2.0 * C_DECOUPLE) / solver.dt;
        electrical.circuits.push({
          id: capId, type: "CAPACITOR",
          a: vcc5Net, b: gndNet,
          capacitance:   C_DECOUPLE,
          _companionCap: { Geq, Ieq: Geq * Vprev + Iprev },
        });
      }
    }

    const tonePin = engine?.toneState?.active ? engine.toneState.pin : null;

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

  static _groundBounce(comp, electrical, gndNet) {
    let totalSwitching = 0;
    for (const b of electrical.circuits) {
      if (b.type === "ARDUINO_PIN_OUT" && (b.a === gndNet || b.b === gndNet)) {
        totalSwitching += Math.abs(b.current ?? 0);
      }
    }
    return GROUND_BOUNCE_R * Math.min(totalSwitching / I_MAX_PIN, 1.0);
  }

  static _stampPin(
    comp, electrical, engine, solver,
    pinName, pinNum, key, net, gndNet, vcc5Net,
    mode, isAnalog, isTone, inReset
  ) {
    if (vcc5Net) {
      electrical.circuits.push({
        id: `${comp.id}_dprot_h_${pinName}`, type: "DIODE",
        a: net, b: vcc5Net,
        ohms: 0.5, Is: DIODE_IS_ESD, N: DIODE_N_ESD,
      });
    }
    electrical.circuits.push({
      id: `${comp.id}_dprot_l_${pinName}`, type: "DIODE",
      a: gndNet, b: net,
      ohms: 0.5, Is: DIODE_IS_ESD, N: DIODE_N_ESD,
    });

    const vPin = electrical.netVoltage.get(net) ?? 0.0;
    if (vPin > V_OVER_ABS && !comp._overvoltageWarn?.[key]) {
      if (!comp._overvoltageWarn) comp._overvoltageWarn = {};
      comp._overvoltageWarn[key] = true;
      console.warn(`[Arduino] Pin ${key} overvoltage: ${vPin.toFixed(2)}V`);
      engine.onPinOvervoltage?.(key, vPin);
    } else if (vPin <= V_OVER_ABS && comp._overvoltageWarn?.[key]) {
      comp._overvoltageWarn[key] = false;
    }

    if (vPin > V_LATCHUP_THR && mode === "INPUT" && !comp._latchupWarn) {
      comp._latchupWarn = true;
      console.warn(`[Arduino] Latch-up risk on ${key}: ${vPin.toFixed(2)}V > ${V_LATCHUP_THR}V`);
      engine.onLatchupRisk?.(key, vPin);
    }

    const isDamaged = comp._pinDamage?.[key] ?? false;

    if (mode === "OUTPUT" || isTone) {
      const raw = engine.digitalVoltages[key] ?? 0;
      let targetV;

      if (isTone) {
        targetV = V_CC;
      } else if (raw === 0 || raw === false) {
        targetV = 0.0;
      } else if (raw === 1 || raw === true) {
        targetV = V_CC;
      } else {
        const duty = Math.max(0, Math.min(255, raw));
        if (PWM_PINS.has(pinNum)) {
          const pwmMode = engine.simState?.pwmMode ?? "average";
          if (pwmMode === "average") {
            targetV = (duty / 255.0) * V_CC;
          } else {
            const freq   = PWM_FREQ_MAP[pinNum] ?? 490;
            const period = 1.0 / freq;
            const simT   = engine.simState?.simTime ?? 0.0;
            const phase  = (simT % period) / period;
            targetV = phase < (duty / 255.0) ? V_CC : 0.0;
          }
        } else {
          targetV = duty >= 128 ? V_CC : 0.0;
        }
      }

      const ocTicks  = comp._pinOcTicks?.[key] ?? 0;
      const I_prev   = Math.abs(comp._pinCurrents?.[key] ?? 0.0);
      const vSatH    = _vSatHigh(I_prev);
      const vSatL    = _vSatLow(I_prev);

      let rEff, vEff;
      if (isDamaged) {
        rEff = R_OUT_CLAMP;
        vEff = targetV * 0.5;
      } else if (targetV > 2.5) {
        rEff = _rOutHigh(I_prev, ocTicks);
        vEff = V_CC - vSatH;
      } else {
        rEff = _rOutLow(I_prev, ocTicks);
        vEff = vSatL;
      }

      electrical.circuits.push({
        id:       `${comp.id}_out_${pinName}`,
        type:     "ARDUINO_PIN_OUT",
        a:        net,
        b:        gndNet,
        ohms:     rEff,
        vOffset:  vEff,
        _targetV: targetV,
        _rEff:    rEff,
        _vSat:    targetV > 2.5 ? vSatH : vSatL,
      });

      electrical.circuits.push({
        id: `${comp.id}_leak_out_${pinName}`, type: "RESISTOR",
        a: net, b: gndNet, ohms: R_LEAKAGE_OUT,
      });
      return;
    }

    electrical.circuits.push({
      id: `${comp.id}_leak_${pinName}`, type: "RESISTOR",
      a: net, b: gndNet, ohms: R_LEAKAGE_IN,
    });

    if (mode === "INPUT_PULLUP") {
      const Rpu = comp._pullupR ?? R_PULLUP_NOM;
      if (vcc5Net) {
        electrical.circuits.push({
          id: `${comp.id}_pu_${pinName}`, type: "PULLUP",
          a: vcc5Net, b: net, ohms: Rpu,
        });
      } else {
        electrical.circuits.push({
          id: `${comp.id}_pu_anchor_${pinName}`, type: "RESISTOR",
          a: net, b: gndNet, ohms: R_FLOAT_ANCHOR,
          vOffset: V_CC,
        });
      }
      electrical.circuits.push({
        id: `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
        a: net, b: gndNet, ohms: R_HIGH_Z,
      });
      return;
    }

    if (mode === "INPUT_PULLDOWN") {
      electrical.circuits.push({
        id: `${comp.id}_pd_${pinName}`, type: "PULLDOWN",
        a: net, b: gndNet, ohms: R_PULLDOWN_NOM,
      });
      electrical.circuits.push({
        id: `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
        a: net, b: gndNet, ohms: R_HIGH_Z,
      });
      return;
    }

    electrical.circuits.push({
      id: `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
      a: net, b: gndNet, ohms: R_HIGH_Z,
    });

    const floatV = _floatNoise(key, comp._floatT ?? 0.0) * V_CC;
    electrical.circuits.push({
      id: `${comp.id}_flt_${pinName}`, type: "DEFAULT",
      a: net, b: gndNet,
      ohms:    R_FLOAT_ANCHOR,
      vOffset: floatV * 0.12,
    });
  }

  static update(comp, electrical, solver) {
    const engine = solver.simEngine;
    if (!engine) return;
    const vRef = engine.simState?.aref ?? V_CC;

    if (!comp._pinOvercurrent)  comp._pinOvercurrent  = {};
    if (!comp._pinOcTicks)      comp._pinOcTicks      = {};
    if (!comp._pinWarnings)     comp._pinWarnings     = {};
    if (!comp._pinCurrents)     comp._pinCurrents     = {};
    if (!comp._pinDamage)       comp._pinDamage       = {};
    if (!engine._digitalNetV)   engine._digitalNetV   = {};
    if (comp._floatT == null)   comp._floatT          = 0.0;
    if (comp._tempRise == null) comp._tempRise        = 0.0;

    comp._floatT += solver.dt ?? 0.016;

    const vcc5Net = solver.findNet(comp.id, "5V");
    const gndNet  = solver.findNet(comp.id, "GND");
    let   vcc     = V_CC;
    if (vcc5Net) vcc = electrical.netVoltage.get(vcc5Net) ?? V_CC;
    let   vgnd    = 0.0;
    if (gndNet)  vgnd = electrical.netVoltage.get(gndNet) ?? 0.0;

    if (comp._inStartup) {
      comp._startupTimer = (comp._startupTimer ?? 0.0) + (solver.dt ?? 0.016);
      if (comp._startupTimer >= POWER_ON_DELAY) {
        comp._inStartup = false;
        comp._resetState = false;
        engine.onMCURestart?.();
      }
    }

    const bodLevel   = BOD_LEVELS[String(engine.simState?.bodLevel ?? "2.7")] ?? BOD_DEFAULT;
    const wasReset   = comp._resetState ?? false;
    const bodLow     = vcc < (bodLevel - BOD_HYST);
    const bodRecover = vcc > (bodLevel + BOD_HYST);

    if (!wasReset && !comp._inStartup && bodLow) {
      comp._resetState = true;
      comp._brownout   = true;
      console.warn(`[Arduino] BROWNOUT: VCC=${vcc.toFixed(3)}V < BOD=${bodLevel}V`);
      engine.onBrownout?.({ vcc, bodLevel });
      engine.onMCUReset?.();
    } else if (wasReset && bodRecover && !comp._inStartup) {
      comp._resetState  = false;
      comp._brownout    = false;
      comp._startupTimer = 0.0;
      comp._inStartup   = true;
    }

    let activeOutputs = 0;
    let switchingPins = 0;
    for (const pinName of DIGITAL_PINS) {
      const k = `D${parseInt(pinName, 10)}`;
      if (engine.pinStates[k] === "OUTPUT") {
        activeOutputs++;
        const v = engine.digitalVoltages[k] ?? 0;
        if (v > 0 && v < 255) switchingPins++;
      }
    }
    if (activeOutputs > 8 || switchingPins > 4) comp._rMcu = R_MCU_HEAVY;
    else if (activeOutputs > 2)                  comp._rMcu = R_MCU_RUNNING;
    else                                          comp._rMcu = R_MCU_IDLE;

    let totalOutputCurrent = 0.0;

    for (const pinName of DIGITAL_PINS) {
      const net = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const pinNum = parseInt(pinName, 10);
      const key    = `D${pinNum}`;
      const mode   = engine.pinStates[key];
      const netV   = electrical.netVoltage.get(net) ?? 0.0;

      if (mode === "OUTPUT") {
        const branch = electrical.circuits.find(b => b.id === `${comp.id}_out_${pinName}`);
        if (branch) {
          const targetV = branch._targetV ?? 0.0;
          const Vnet    = electrical.netVoltage.get(branch.a) ?? 0.0;
          const R       = branch._rEff ?? branch.ohms ?? R_OUT_HIGH_0;
          const vSrc    = targetV > 2.5 ? (V_CC - (branch._vSat ?? 0.05)) : (branch._vSat ?? 0.05);
          const I       = Math.abs((vSrc - Vnet) / Math.max(R, 0.1));

          comp._pinCurrents[key] = I;
          totalOutputCurrent    += I;

          const ocTicks_prev = comp._pinOcTicks[key] ?? 0;
          const isOver       = I > I_MAX_PIN;
          const isWarn       = I > I_WARN_PIN;

          if (isOver) {
            comp._pinOcTicks[key] = ocTicks_prev + 1;
          } else {
            comp._pinOcTicks[key] = Math.max(0, ocTicks_prev - 1);
          }

          const ocTicks_new = comp._pinOcTicks[key];
          comp._pinOvercurrent[key] = isOver;

          if (isOver && ocTicks_new === OVERCURRENT_TICKS_WARN) {
            comp._pinWarnings[key] = true;
            console.warn(`[Arduino] Pin ${key} overcurrent: ${(I*1000).toFixed(1)}mA > 40mA`);
            engine.onPinOvercurrent?.(key, I, ocTicks_new);
          }
          if (ocTicks_new >= OVERCURRENT_TICKS_DAMAGE && !comp._pinDamage[key]) {
            comp._pinDamage[key] = true;
            console.warn(`[Arduino] Pin ${key} DAMAGED by sustained overcurrent ${(I*1000).toFixed(1)}mA`);
            engine.onPinDamage?.(key, I);
          }
          if (!isOver && comp._pinWarnings[key]) {
            comp._pinWarnings[key] = false;
          }

          const reverseI = -((vSrc - Vnet) / Math.max(R, 0.1));
          if (reverseI > I_REVERSE_MAX && !comp._reverseWarn?.[key]) {
            if (!comp._reverseWarn) comp._reverseWarn = {};
            comp._reverseWarn[key] = true;
            console.warn(`[Arduino] Pin ${key} reverse current injection: ${(reverseI*1000).toFixed(1)}mA`);
            engine.onReverseCurrentInjection?.(key, reverseI);
          }
        }
      }

      engine._digitalNetV[key] = netV;
      if (mode !== "OUTPUT") {
        const isHigh = netV >= DIGITAL_HIGH_THR;
        const isLow  = netV <= DIGITAL_LOW_THR;
        let   dv;
        if (isHigh)      dv = 1;
        else if (isLow)  dv = 0;
        else             dv = Math.random() < 0.5 ? 1 : 0;

        if (engine.digitalInputs) engine.digitalInputs[key] = dv;
      }
    }

    const mcuIdd   = vcc / Math.max(comp._rMcu ?? R_MCU_RUNNING, 1.0);
    const totalI   = totalOutputCurrent + mcuIdd;

    const wasTotal = comp._totalOver ?? false;
    const isTotalWarn = totalI > I_WARN_TOTAL;
    const isTotalOver = totalI > I_MAX_TOTAL;
    comp._totalOver = isTotalOver;

    if (isTotalOver) {
      comp._totalOcTicks = (comp._totalOcTicks ?? 0) + 1;
      if (!wasTotal) {
        console.warn(`[Arduino] Total current ${(totalI*1000).toFixed(1)}mA > 200mA`);
        engine.onTotalOvercurrent?.(totalI);
      }
    } else {
      comp._totalOcTicks = Math.max(0, (comp._totalOcTicks ?? 0) - 1);
    }

    const Pdiss_mcu = vcc * mcuIdd;
    const dt = solver.dt ?? 0.016;
    const alpha_t = 1.0 - Math.exp(-dt / Math.max(TAU_THERMAL_MCU, 1e-3));
    comp._tempRise = (comp._tempRise ?? 0.0) * (1.0 - alpha_t)
                   + Pdiss_mcu * THETA_JA_MCU * alpha_t;
    const T_J_C = 25.0 + (comp._tempRise ?? 0.0);

    if (T_J_C > TJ_WARN_MCU && !comp._thermalWarn) {
      comp._thermalWarn = true;
      console.warn(`[Arduino] MCU junction temp ${T_J_C.toFixed(0)}°C > ${TJ_WARN_MCU}°C`);
      engine.onMCUThermalWarning?.(T_J_C);
    } else if (T_J_C <= TJ_WARN_MCU - 10.0) {
      comp._thermalWarn = false;
    }

    for (const pinName of ANALOG_PINS) {
      const net  = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const mode = engine.pinStates[pinName];
      if (mode === "OUTPUT") continue;

      let voltage = electrical.netVoltage.get(net) ?? 0.0;
      voltage = Math.max(0.0, Math.min(voltage, vRef));

      const bits    = engine.simState?.analogResolution ?? 10;
      const maxBits = (1 << bits) - 1;
      let   adcIdeal = (voltage / Math.max(vRef, 0.001)) * maxBits;

      const thermalNoise = (Math.random() - 0.5) * ADC_NOISE_RMS
                         * (1.0 + ADC_THERMAL_COEFF * ((comp._tempRise ?? 0.0) / 30.0));
      const dnl = (Math.random() - 0.5) * ADC_DNL_MAX;
      adcIdeal += thermalNoise + dnl;

      const isFloating = !ArduinoModel._hasExternalDriver(net, electrical, comp.id, pinName);
      let adcVal;
      if (isFloating) {
        const floatRaw  = _floatNoise(pinName, comp._floatT ?? 0.0) * maxBits;
        const floatNoise = (Math.random() - 0.5) * maxBits * 0.25;
        const prev = engine._analogCache?.[pinName] ?? floatRaw;
        adcVal = Math.round(prev * ADC_FLOAT_ALPHA + (floatRaw + floatNoise) * (1.0 - ADC_FLOAT_ALPHA));
      } else {
        adcVal = Math.round(adcIdeal);
      }
      adcVal = Math.max(0, Math.min(maxBits, adcVal));

      if (!engine._analogCache) engine._analogCache = {};
      const pinNum = 14 + parseInt(pinName.slice(1), 10);
      engine._analogCache[pinName] = adcVal;
      engine._analogCache[pinNum]  = adcVal;
      engine._digitalNetV[pinName] = voltage;

      if (engine.digitalInputs) {
        const dv = voltage >= DIGITAL_HIGH_THR ? 1 : 0;
        engine.digitalInputs[pinName] = dv;
        engine.digitalInputs[pinNum]  = dv;
      }
    }

    const decoupleCapBranch = electrical.circuits.find(b => b.id === `${comp.id}_decouple`);
    if (decoupleCapBranch?._companionCap) {
      const Va   = electrical.netVoltage.get(decoupleCapBranch.a) ?? V_CC;
      const Vb   = electrical.netVoltage.get(decoupleCapBranch.b) ?? 0.0;
      const Icap = decoupleCapBranch.current ?? 0.0;
      const Vc   = (Va - Vb) - Icap * (decoupleCapBranch.ohms ?? 0.0);
      if (!solver._capState) solver._capState = new Map();
      solver._capState.set(`${comp.id}_decouple`, { V: Vc, I: Icap });
    }

    comp._diagnostics = {
      vcc,
      vgnd,
      supplyRailSag:    V_CC - vcc,
      groundBounce:     vgnd,
      currentConsumption: totalI,
      mcuQuiescentCurrent: mcuIdd,
      brownout:    comp._brownout   ?? false,
      resetState:  comp._resetState ?? false,
      inStartup:   comp._inStartup  ?? false,
      pinCurrents: { ...comp._pinCurrents },
      pinDamage:   { ...comp._pinDamage   },
      totalCurrent: totalI,
      overCurrent:  isTotalOver,
      warnCurrent:  isTotalWarn,
      tjunction:    +T_J_C.toFixed(1),
      adcValues:    { ...(engine._analogCache ?? {}) },
      pullupR:      comp._pullupR,
    };
    engine.onDiagnostics?.(comp._diagnostics);
  }

  static _hasExternalDriver(net, electrical, compId, pinName) {
    for (const branch of electrical.circuits) {
      if (branch.a !== net && branch.b !== net) continue;
      if (branch.id?.startsWith(compId)) continue;
      if (branch.type === "INPUT_HIGH_Z" || branch.type === "DEFAULT") continue;
      return true;
    }
    return false;
  }
}