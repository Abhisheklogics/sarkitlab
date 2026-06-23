"use strict";

const SENSOR_DB = {
  "MQ-2": {
    name: "MQ-2", targetGas: "Smoke / LPG / Propane",
    ppmMin: 200, ppmMax: 10000,
    RL: 5000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 8,
    curve: [
      { ppm: 200,   rsr0: 3.2  },
      { ppm: 500,   rsr0: 2.0  },
      { ppm: 1000,  rsr0: 1.4  },
      { ppm: 2000,  rsr0: 0.98 },
      { ppm: 5000,  rsr0: 0.62 },
      { ppm: 10000, rsr0: 0.40 },
    ],
  },
  "MQ-3": {
    name: "MQ-3", targetGas: "Alcohol / Ethanol",
    ppmMin: 10, ppmMax: 500,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 50,
    warmupTau: 10,
    curve: [
      { ppm: 10,  rsr0: 6.5  },
      { ppm: 20,  rsr0: 4.2  },
      { ppm: 50,  rsr0: 2.5  },
      { ppm: 100, rsr0: 1.5  },
      { ppm: 200, rsr0: 0.9  },
      { ppm: 500, rsr0: 0.48 },
    ],
  },
  "MQ-4": {
    name: "MQ-4", targetGas: "Methane / Natural Gas",
    ppmMin: 200, ppmMax: 10000,
    RL: 20000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 8,
    curve: [
      { ppm: 200,   rsr0: 4.5  },
      { ppm: 500,   rsr0: 2.8  },
      { ppm: 1000,  rsr0: 1.9  },
      { ppm: 2000,  rsr0: 1.2  },
      { ppm: 5000,  rsr0: 0.7  },
      { ppm: 10000, rsr0: 0.45 },
    ],
  },
  "MQ-5": {
    name: "MQ-5", targetGas: "Natural Gas / LPG",
    ppmMin: 200, ppmMax: 10000,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 8,
    curve: [
      { ppm: 200,   rsr0: 5.0  },
      { ppm: 500,   rsr0: 3.0  },
      { ppm: 1000,  rsr0: 2.0  },
      { ppm: 2000,  rsr0: 1.3  },
      { ppm: 5000,  rsr0: 0.75 },
      { ppm: 10000, rsr0: 0.48 },
    ],
  },
  "MQ-6": {
    name: "MQ-6", targetGas: "LPG / Butane",
    ppmMin: 200, ppmMax: 10000,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 8,
    curve: [
      { ppm: 200,   rsr0: 4.8  },
      { ppm: 500,   rsr0: 2.9  },
      { ppm: 1000,  rsr0: 1.9  },
      { ppm: 2000,  rsr0: 1.25 },
      { ppm: 5000,  rsr0: 0.72 },
      { ppm: 10000, rsr0: 0.45 },
    ],
  },
  "MQ-7": {
    name: "MQ-7", targetGas: "Carbon Monoxide CO",
    ppmMin: 20, ppmMax: 2000,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 67,
    warmupTau: 10,
    heaterCycle: { highSec: 60, lowSec: 90, highV: 5.0, lowV: 1.4 },
    curve: [
      { ppm: 20,   rsr0: 4.5  },
      { ppm: 50,   rsr0: 2.8  },
      { ppm: 100,  rsr0: 1.8  },
      { ppm: 200,  rsr0: 1.1  },
      { ppm: 500,  rsr0: 0.6  },
      { ppm: 1000, rsr0: 0.38 },
      { ppm: 2000, rsr0: 0.22 },
    ],
  },
  "MQ-8": {
    name: "MQ-8", targetGas: "Hydrogen H₂",
    ppmMin: 100, ppmMax: 10000,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 7,
    curve: [
      { ppm: 100,   rsr0: 5.0  },
      { ppm: 300,   rsr0: 2.5  },
      { ppm: 500,   rsr0: 1.7  },
      { ppm: 1000,  rsr0: 1.0  },
      { ppm: 3000,  rsr0: 0.55 },
      { ppm: 10000, rsr0: 0.28 },
    ],
  },
  "MQ-9": {
    name: "MQ-9", targetGas: "CO / Combustible Gas",
    ppmMin: 10, ppmMax: 10000,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 8,
    curve: [
      { ppm: 10,    rsr0: 7.0  },
      { ppm: 50,    rsr0: 3.5  },
      { ppm: 100,   rsr0: 2.2  },
      { ppm: 500,   rsr0: 1.1  },
      { ppm: 1000,  rsr0: 0.72 },
      { ppm: 5000,  rsr0: 0.35 },
      { ppm: 10000, rsr0: 0.22 },
    ],
  },
  "MQ-131": {
    name: "MQ-131", targetGas: "Ozone O₃",
    ppmMin: 10, ppmMax: 1000,
    RL: 20000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 50,
    warmupTau: 12,
    curve: [
      { ppm: 10,   rsr0: 8.0  },
      { ppm: 20,   rsr0: 5.2  },
      { ppm: 50,   rsr0: 3.0  },
      { ppm: 100,  rsr0: 1.8  },
      { ppm: 300,  rsr0: 0.9  },
      { ppm: 1000, rsr0: 0.4  },
    ],
  },
  "MQ-135": {
    name: "MQ-135", targetGas: "Air Quality / NH₃ / CO₂",
    ppmMin: 10, ppmMax: 1000,
    RL: 10000, R0: 10000,
    heaterVoltage: 5.0, heaterResistance: 33,
    warmupTau: 9,
    curve: [
      { ppm: 10,   rsr0: 6.0  },
      { ppm: 20,   rsr0: 4.0  },
      { ppm: 50,   rsr0: 2.4  },
      { ppm: 100,  rsr0: 1.6  },
      { ppm: 300,  rsr0: 0.9  },
      { ppm: 1000, rsr0: 0.45 },
    ],
  },
};

const ADC_MAX    = 1023;
const VREF       = 5.0;
const RS_FLOOR   = 50;
const DO_HYST_V  = 0.1;

function pushBranch(electrical, branch) {
  if (branch.a == null && branch.b == null) return;
  electrical.circuits.push(branch);
}

function interpolateRsR0(curve, ppm) {
  const logPPM = Math.log10(Math.max(ppm, 0.001));

  if (logPPM <= Math.log10(curve[0].ppm)) return curve[0].rsr0;
  if (logPPM >= Math.log10(curve[curve.length - 1].ppm)) return curve[curve.length - 1].rsr0;

  for (let i = 0; i < curve.length - 1; i++) {
    const logA = Math.log10(curve[i].ppm);
    const logB = Math.log10(curve[i + 1].ppm);
    if (logPPM >= logA && logPPM <= logB) {
      const logRsR0A = Math.log10(curve[i].rsr0);
      const logRsR0B = Math.log10(curve[i + 1].rsr0);
      const t        = (logPPM - logA) / (logB - logA);
      return Math.pow(10, logRsR0A + t * (logRsR0B - logRsR0A));
    }
  }
  return curve[curve.length - 1].rsr0;
}

function computeRs(spec, ppm, r0, warmupFactor) {
  const rsR0 = interpolateRsR0(spec.curve, ppm);
  const rs   = rsR0 * r0;
  const rsWithWarmup = rs + (spec.RL * 10) * (1 - warmupFactor);
  return Math.max(RS_FLOOR, rsWithWarmup);
}

function addThermalNoise() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

export default class GasSensorModel {

  static solve(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets = solver.getNets(comp, ["VCC", "GND", "AO", "DO"]);
    if (!nets.VCC || !nets.GND) return;

    const vVCC      = electrical.netVoltage.get(nets.VCC) ?? 0;
    const vGND      = electrical.netVoltage.get(nets.GND) ?? 0;
    const isPowered = (vVCC - vGND) > 2.5;

    inst.powered = isPowered;
    if (!isPowered) inst.warmupDone = false;

    if (!isPowered) {
      pushBranch(electrical, {
        id: `${comp.id}_unpowered`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND, ohms: 1e6,
      });
      return;
    }

    const spec       = SENSOR_DB[inst.modelName] ?? SENSOR_DB["MQ-2"];
    const hasAO      = nets.AO != null;
    const hasDO      = nets.DO != null;
    const warmup     = inst.warmupFactor ?? 0;
    const ppm        = inst.currentPPM ?? spec.ppmMin;
    const r0         = inst.calibratedR0 ?? spec.R0;
    const rs         = computeRs(spec, ppm, r0, warmup);

    inst.setDigitalMode?.(hasAO, hasDO);
    inst.lastRs   = rs;
    inst.lastRsR0 = rs / r0;

    let heaterR = spec.heaterResistance;
    if (spec.heaterCycle && inst.heaterPhase === "LOW") {
      heaterR = spec.heaterResistance * Math.pow(spec.heaterCycle.highV / spec.heaterCycle.lowV, 2);
    }

    if (hasAO) {
      pushBranch(electrical, {
        id: `${comp.id}_rs`, type: "SENSOR_RS",
        a: nets.VCC, b: nets.AO,
        ohms: Math.max(RS_FLOOR, rs),
      });
      pushBranch(electrical, {
        id: `${comp.id}_rl`, type: "SENSOR_RL",
        a: nets.AO, b: nets.GND,
        ohms: Math.max(RS_FLOOR, spec.RL),
      });
    } else {
      pushBranch(electrical, {
        id: `${comp.id}_divider`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND,
        ohms: Math.max(RS_FLOOR, rs) + Math.max(RS_FLOOR, spec.RL),
      });
    }

    pushBranch(electrical, {
      id: `${comp.id}_heater`, type: "RESISTOR",
      a: nets.VCC, b: nets.GND,
      ohms: Math.max(RS_FLOOR, heaterR),
    });

    if (hasDO) {
      const vAO = hasAO
        ? Math.max(0, electrical.netVoltage.get(nets.AO) ?? 0)
        : (vVCC - vGND) * spec.RL / (rs + spec.RL);

      const thrV = inst.thresholdVoltage ?? (VREF * 0.5);

      if (!inst.doTriggered && vAO > thrV)
        inst.doTriggered = true;
      else if (inst.doTriggered && vAO < thrV - DO_HYST_V)
        inst.doTriggered = false;

      pushBranch(electrical, {
        id: `${comp.id}_do_pu`, type: "RESISTOR",
        a: nets.VCC, b: nets.DO, ohms: 10000,
      });

      if (inst.doTriggered) {
        pushBranch(electrical, {
          id: `${comp.id}_do_low`, type: "RESISTOR",
          a: nets.DO, b: nets.GND, ohms: 50,
        });
      }
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets = solver.getNets(comp, ["VCC", "GND", "AO", "DO"]);
    if (!nets.VCC || !nets.GND) return;

    const spec      = SENSOR_DB[inst.modelName] ?? SENSOR_DB["MQ-2"];
    const vVCC      = electrical.netVoltage.get(nets.VCC) ?? 0;
    const vGND      = electrical.netVoltage.get(nets.GND) ?? 0;
    const isPowered = (vVCC - vGND) > 2.5;

    if (!isPowered) {
      if (inst.poweredPrev) {
        inst.poweredPrev = false;
        inst.setPowered?.(false);
      }
      inst.updateFromModel?.(spec.ppmMin, 0, 0, false);
      return;
    }

    if (!inst.poweredPrev) {
      inst.startTime   = Date.now();
      inst.poweredPrev = true;
      inst.setPowered?.(true);
    }

    const elapsed = (Date.now() - (inst.startTime ?? Date.now())) / 1000;
    inst.warmupFactor = 1 - Math.exp(-elapsed / spec.warmupTau);
    if (inst.warmupFactor >= 0.99) inst.warmupDone = true;

    if (spec.heaterCycle) {
      const cycleLen = spec.heaterCycle.highSec + spec.heaterCycle.lowSec;
      const phase    = elapsed % cycleLen;
      inst.heaterPhase = phase < spec.heaterCycle.highSec ? "HIGH" : "LOW";
    }

    const ppm    = inst.currentPPM ?? spec.ppmMin;
    const r0     = inst.calibratedR0 ?? spec.R0;
    const warmup = inst.warmupFactor ?? 0;
    const rs     = computeRs(spec, ppm, r0, warmup);

    let vAO = 0;
    if (nets.AO) {
      const rawV = Math.max(0, electrical.netVoltage.get(nets.AO) ?? 0);
      const noiseV = addThermalNoise() * 0.002;
      vAO = Math.max(0, Math.min(VREF, rawV + noiseV));
    } else {
      const vSupply = vVCC - vGND;
      vAO = vSupply > 0.1 ? vSupply * spec.RL / (rs + spec.RL) : 0;
    }

    const adcRaw  = (vAO / VREF) * ADC_MAX;
    const adcNoise = addThermalNoise() * 0.5;
    const adc      = Math.max(0, Math.min(ADC_MAX, Math.round(adcRaw + adcNoise)));

    inst.outputVoltage = vAO;
    inst.currentAnalog = adc;
    inst.lastRs        = rs;
    inst.lastRsR0      = rs / r0;

    let triggered = inst.doTriggered ?? false;
    if (nets.DO) {
      const vDO = Math.max(0, electrical.netVoltage.get(nets.DO) ?? VREF);
      triggered          = vDO < 2.5;
      inst.doTriggered   = triggered;
    }

    inst.isTriggered = triggered;
    inst.updateFromModel?.(ppm, vAO, adc, triggered);
  }

  static getSensorDB() { return SENSOR_DB; }

  static interpolateRsR0(curve, ppm) { return interpolateRsR0(curve, ppm); }
}