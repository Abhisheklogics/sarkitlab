"use strict";

const V_CC  = 5.0;
const V_33  = 3.3;

const R_OUT_HIGH_BASE = 35;
const R_OUT_LOW_BASE  = 35;
const R_OUT_CLAMP     = 200;
const V_SAT_HIGH      = 0.06;
const V_SAT_LOW       = 0.06;

const R_PULLUP    = 35_000;
const R_PULLDOWN  = 35_000;
const R_HIGH_Z    = 100e6;
const R_FLOAT_GND = 1e9;

const DIODE_IS = 1e-12;
const DIODE_N  = 1.0;

const R_LEAKAGE = 5_000_000;

const BOD_LEVELS     = { "4.3": 4.3, "2.7": 2.7, "1.8": 1.8 };
const BOD_DEFAULT    = 2.7;
const BOD_HYSTERESIS = 0.1;

const R_MCU_IDLE    = 500;
const R_MCU_RUNNING = 250;
const R_MCU_HEAVY   = 125;

const I_MAX_PIN   = 0.040;
const I_MAX_TOTAL = 0.200;

const DIGITAL_HIGH_THRESHOLD = 3.0;
const DIGITAL_LOW_THRESHOLD  = 1.5;

const PWM_FREQ = { 5: 976, 6: 976, 9: 490, 10: 490, 3: 490, 11: 490 };
const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);

const DIGITAL_PINS = ["0","1","2","3","4","5","6","7","8","9","10","11","12","13"];
const ANALOG_PINS  = ["A0","A1","A2","A3","A4","A5"];

const _floatPhase = new Map();
function _floatNoise(key, t) {
  if (!_floatPhase.has(key)) _floatPhase.set(key, Math.random() * 1000);
  const ph = _floatPhase.get(key);
  return 0.5 + 0.5 * Math.sin(ph + t * 0.3 + Math.random() * 0.1);
}

function _rOutHigh(I_abs) {
  const x = Math.min(I_abs / I_MAX_PIN, 1.0);
  return R_OUT_HIGH_BASE * (1 + 3 * x * x);
}
function _rOutLow(I_abs) {
  const x = Math.min(I_abs / I_MAX_PIN, 1.0);
  return R_OUT_LOW_BASE * (1 + 3 * x * x);
}

function _resolveOutputVoltage(engine, key, pinNum) {
  const raw = engine.digitalVoltages?.[key];

  if (raw === undefined || raw === null) return 0;

  if (raw === 0 || raw === false) return 0;
  if (raw === 1 || raw === true)  return V_CC;

  const duty = Math.max(0, Math.min(255, raw));

  if (PWM_PINS.has(pinNum)) {
    const pwmMode = engine.simState?.pwmMode ?? "average";
    if (pwmMode === "average") {
      return (duty / 255) * V_CC;
    }
    const freq    = PWM_FREQ[pinNum] ?? 490;
    const period  = 1 / freq;
    const simTime = engine.simState?.simTime ?? 0;
    const phase   = (simTime % period) / period;
    return phase < (duty / 255) ? V_CC : 0;
  }

  return duty >= 128 ? V_CC : 0;
}

export default class ArduinoModel {

  static solve(comp, electrical, solver) {
    const engine  = solver.simEngine;
    const gndNet  = solver.findNet(comp.id, "GND");
    const vcc5Net = solver.findNet(comp.id, "5V");
    const vcc33Net= solver.findNet(comp.id, "3.3V");
    if (!gndNet) return;

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

    if (vcc5Net) {
      const rMcu = comp._rMcu ?? R_MCU_RUNNING;
      electrical.circuits.push({
        id: `${comp.id}_mcu_idd`, type: "RESISTOR",
        a: vcc5Net, b: gndNet, ohms: rMcu,
      });
    }

    if (!comp._pinOvercurrent) comp._pinOvercurrent = {};
    if (!comp._pinWarnings)    comp._pinWarnings    = {};
    if (!comp._pinCurrents)    comp._pinCurrents    = {};
    if (!comp._floatT)         comp._floatT         = 0;

    const inReset = comp._resetState ?? false;
    const tonePin = engine?.toneState?.active ? engine.toneState.pin : null;

    for (const pinName of DIGITAL_PINS) {
      const net = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const pinNum = parseInt(pinName, 10);
      const key    = `D${pinNum}`;
      const mode   = inReset ? "INPUT" : (engine.pinStates?.[key]);
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
      const mode   = inReset ? "INPUT" : (engine.pinStates?.[key]);

      ArduinoModel._stampPin(
        comp, electrical, engine, solver,
        pinName, pinNum, key, net, gndNet, vcc5Net,
        mode, true, false, inReset
      );
    }
  }

  static _stampPin(
    comp, electrical, engine, solver,
    pinName, pinNum, key, net, gndNet, vcc5Net,
    mode, isAnalog, isTone, inReset
  ) {
    if (vcc5Net) {
      electrical.circuits.push({
        id: `${comp.id}_dprot_h_${pinName}`, type: "DIODE",
        a: net, b: vcc5Net, ohms: 0, Is: DIODE_IS, N: DIODE_N,
      });
    }
    electrical.circuits.push({
      id: `${comp.id}_dprot_l_${pinName}`, type: "DIODE",
      a: gndNet, b: net, ohms: 0, Is: DIODE_IS, N: DIODE_N,
    });

    if (mode !== "OUTPUT") {
      electrical.circuits.push({
        id: `${comp.id}_leak_${pinName}`, type: "RESISTOR",
        a: net, b: gndNet, ohms: R_LEAKAGE,
      });
    }

    if (mode === "OUTPUT" || isTone) {
      const overcurrent = comp._pinOvercurrent?.[key] ?? false;
      let targetV;

      if (isTone) {
        targetV = V_CC;
      } else if (overcurrent) {
        targetV = 0;
      } else {
        targetV = _resolveOutputVoltage(engine, key, pinNum);
      }

      let rEff;
      if (overcurrent) {
        rEff = R_OUT_CLAMP;
      } else {
        const I_prev = comp._pinCurrents?.[key] ?? 0;
        rEff = targetV > 2.5 ? _rOutHigh(I_prev) : _rOutLow(I_prev);
      }

      const vSat   = targetV > 2.5 ? (V_CC - V_SAT_HIGH) : V_SAT_LOW;
      const vStamp = targetV > 2.5 ? vSat : 0;

      electrical.circuits.push({
        id:       `${comp.id}_out_${pinName}`,
        type:     "ARDUINO_PIN_OUT",
        a:        net,
        b:        gndNet,
        ohms:     rEff,
        vOffset:  vStamp,
        _targetV: targetV,
        _rEff:    rEff,
      });
      return;
    }

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

    electrical.circuits.push({
      id: `${comp.id}_hz_${pinName}`, type: "INPUT_HIGH_Z",
      a: net, b: gndNet, ohms: R_HIGH_Z,
    });

    const hasExternalDriver = ArduinoModel._hasExternalDriver(
      net, electrical, comp.id, pinName
    );

    if (!hasExternalDriver) {
      const floatV = _floatNoise(key, comp._floatT ?? 0) * V_CC;
      electrical.circuits.push({
        id:      `${comp.id}_flt_${pinName}`, type: "DEFAULT",
        a:       net, b: gndNet,
        ohms:    R_FLOAT_GND,
        vOffset: floatV * 0.1,
      });
    }
  }

  static update(comp, electrical, solver) {
    const engine = solver.simEngine;
    const vRef   = engine.simState?.aref ?? V_CC;

    if (!comp._pinOvercurrent) comp._pinOvercurrent = {};
    if (!comp._pinWarnings)    comp._pinWarnings    = {};
    if (!comp._pinCurrents)    comp._pinCurrents    = {};
    if (!engine._digitalNetV)  engine._digitalNetV  = {};
    if (!comp._floatT)         comp._floatT         = 0;
    comp._floatT += 0.016;

    const vcc5Net = solver.findNet(comp.id, "5V");
    const gndNet  = solver.findNet(comp.id, "GND");
    let   vcc     = V_CC;
    if (vcc5Net) vcc = electrical.netVoltage.get(vcc5Net) ?? V_CC;

    const bodLevel   = BOD_LEVELS[String(engine.simState?.bodLevel ?? "2.7")] ?? BOD_DEFAULT;
    const wasReset   = comp._resetState ?? false;
    const bodLow     = vcc < bodLevel - BOD_HYSTERESIS;
    const bodRecover = vcc > bodLevel + BOD_HYSTERESIS;

    if (!wasReset && bodLow) {
      comp._resetState = true;
      comp._brownout   = true;
      console.warn(`[ArduinoModel] BROWNOUT: VCC=${vcc.toFixed(3)}V < BOD=${bodLevel}V.`);
      engine.onBrownout?.({ vcc, bodLevel });
      engine.onMCUReset?.();
    } else if (wasReset && bodRecover) {
      comp._resetState = false;
      comp._brownout   = false;
      engine.onMCURestart?.();
    }

    let activeOutputs = 0;
    for (const pinName of DIGITAL_PINS) {
      const key = `D${parseInt(pinName, 10)}`;
      if (engine.pinStates?.[key] === "OUTPUT") activeOutputs++;
    }
    if      (activeOutputs > 8) comp._rMcu = R_MCU_HEAVY;
    else if (activeOutputs > 2) comp._rMcu = R_MCU_RUNNING;
    else                        comp._rMcu = R_MCU_IDLE;

    let totalOutputCurrent = 0;

    for (const pinName of DIGITAL_PINS) {
      const net = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const pinNum = parseInt(pinName, 10);
      const key    = `D${pinNum}`;
      const mode   = engine.pinStates?.[key];
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

          comp._pinCurrents[key]  = I;
          totalOutputCurrent     += I;

          const wasOver = comp._pinOvercurrent[key] ?? false;
          const isOver  = I > I_MAX_PIN;
          comp._pinOvercurrent[key] = isOver;

          if (isOver && !wasOver) {
            comp._pinWarnings[key] = true;
            console.warn(`[ArduinoModel] Pin ${key} overcurrent: ${(I*1000).toFixed(1)}mA > 40mA.`);
            engine.onPinOvercurrent?.(key, I, 0);
          } else if (!isOver && wasOver) {
            comp._pinWarnings[key] = false;
          }
        }

        engine._digitalNetV[key] = netV;

      } else if (mode === "INPUT_PULLUP" || mode === "INPUT_PULLDOWN" || mode === "INPUT" || !mode) {

        engine._digitalNetV[key] = netV;

        const isHigh = netV >= DIGITAL_HIGH_THRESHOLD;
        const isLow  = netV <  DIGITAL_LOW_THRESHOLD;

        const hasExternalDriver = ArduinoModel._hasExternalDriver(
          net, electrical, comp.id, pinName
        );

        let readVal;
        if (!hasExternalDriver && (!mode || mode === "INPUT")) {
          readVal = Math.random() > 0.5 ? 1 : 0;
        } else {
          readVal = isHigh ? 1 : (isLow ? 0 : (engine.digitalInputs?.[key] ?? 0));
        }

        if (engine.digitalInputs) engine.digitalInputs[key] = readVal;
      }
    }

    const mcuIdd   = vcc / Math.max(comp._rMcu ?? R_MCU_RUNNING, 1);
    const totalI   = totalOutputCurrent + mcuIdd;
    const wasTotal = comp._totalOver ?? false;
    const isTotal  = totalI > I_MAX_TOTAL;
    comp._totalOver = isTotal;
    if (isTotal && !wasTotal) {
      console.warn(`[ArduinoModel] Total current ${(totalI*1000).toFixed(1)}mA > 200mA limit.`);
      engine.onTotalOvercurrent?.(totalI);
    }
    comp._totalOutputCurrent = totalI;

    if (!engine._analogCache) engine._analogCache = {};

    for (const pinName of ANALOG_PINS) {
      const net = solver.findNet(comp.id, pinName);
      if (!net) continue;
      const mode = engine.pinStates?.[pinName];
      if (mode === "OUTPUT") continue;

      let voltage = electrical.netVoltage.get(net) ?? 0;
      voltage = Math.max(0, Math.min(voltage, vRef));

      const bits    = engine.simState?.analogResolution ?? 10;
      const maxBits = (1 << bits) - 1;
      let   adcVal  = Math.round((voltage / vRef) * maxBits);

      if (!mode || mode === "INPUT") {
        const hasExternalDriver = ArduinoModel._hasExternalDriver(
          net, electrical, comp.id, pinName
        );
        if (!hasExternalDriver) {
          const noise = Math.floor(Math.random() * maxBits);
          adcVal = Math.floor(adcVal * 0.3 + noise * 0.7);
        }
      }

      adcVal = Math.max(0, Math.min(maxBits, adcVal));

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

    comp._diagnostics = {
      vcc,
      currentConsumption: totalI,
      brownout:           comp._brownout   ?? false,
      resetState:         comp._resetState ?? false,
      pinCurrents:        { ...comp._pinCurrents },
      totalCurrent:       totalI,
      overCurrent:        comp._totalOver  ?? false,
      adcValues:          { ...engine._analogCache },
    };
    engine.onDiagnostics?.(comp._diagnostics);
  }

  static _hasExternalDriver(net, electrical, compId, pinName) {
    for (const branch of electrical.circuits) {
      if (branch.a !== net && branch.b !== net) continue;
      if (branch.id?.startsWith(compId))        continue;
      const t = branch.type;
      if (
        t === "INPUT_HIGH_Z" ||
        t === "PULLUP"       ||
        t === "PULLDOWN"     ||
        t === "DEFAULT"
      ) continue;
      return true;
    }
    return false;
  }

  static reset(comp, solver) {
    comp._resetState         = false;
    comp._brownout           = false;
    comp._pinOvercurrent     = {};
    comp._pinWarnings        = {};
    comp._pinCurrents        = {};
    comp._totalOver          = false;
    comp._totalOutputCurrent = 0;
    comp._rMcu               = R_MCU_RUNNING;
    comp._floatT             = 0;
    comp._diagnostics        = null;

    const engine = solver?.simEngine;
    if (engine) {
      engine._digitalNetV  = {};
      engine._analogCache  = {};
    }
  }
}