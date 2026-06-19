"use strict";

const SENSOR_SPECS = {
  "MQ-2"  : { ppmMin:200,   ppmMax:10000, rsAir:100000, rl:5000,  rHeater:33, slope:3.5, baseline:150, threshold:450, smooth:0.12 },
  "MQ-3"  : { ppmMin:10,    ppmMax:500,   rsAir:200000, rl:10000, rHeater:50, slope:3.0, baseline:100, threshold:300, smooth:0.16 },
  "MQ-4"  : { ppmMin:200,   ppmMax:10000, rsAir:150000, rl:20000, rHeater:33, slope:3.2, baseline:120, threshold:350, smooth:0.10 },
  "MQ-5"  : { ppmMin:200,   ppmMax:10000, rsAir:100000, rl:10000, rHeater:33, slope:3.0, baseline:120, threshold:350, smooth:0.08 },
  "MQ-6"  : { ppmMin:200,   ppmMax:10000, rsAir:100000, rl:10000, rHeater:33, slope:3.0, baseline:130, threshold:350, smooth:0.12 },
  "MQ-7"  : { ppmMin:20,    ppmMax:2000,  rsAir:100000, rl:10000, rHeater:67, slope:3.3, baseline:80,  threshold:250, smooth:0.06 },
  "MQ-8"  : { ppmMin:100,   ppmMax:10000, rsAir:100000, rl:10000, rHeater:33, slope:2.8, baseline:90,  threshold:300, smooth:0.20 },
  "MQ-9"  : { ppmMin:10,    ppmMax:10000, rsAir:100000, rl:10000, rHeater:33, slope:3.0, baseline:100, threshold:400, smooth:0.08 },
  "MQ-131": { ppmMin:10,    ppmMax:1000,  rsAir:200000, rl:20000, rHeater:50, slope:2.5, baseline:50,  threshold:200, smooth:0.04 },
  "MQ-135": { ppmMin:10,    ppmMax:1000,  rsAir:100000, rl:10000, rHeater:33, slope:3.5, baseline:200, threshold:400, smooth:0.04 },
};

const ADC_MAX     = 1023;
const VREF        = 5.0;
const RS_FLOOR    = 50;
const DO_HYST     = 10;

function _push(electrical, branch) {
  if (branch.a == null && branch.b == null) return;
  electrical.circuits.push(branch);
}

function _computeRs(spec, intensity) {
  return Math.max(RS_FLOOR, spec.rsAir * Math.pow(10, -Math.max(0, Math.min(1, intensity)) * spec.slope));
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

    inst._powered = isPowered;
    if (!isPowered) inst._warmupDone = false;

    if (!isPowered) {
      _push(electrical, {
        id: `${comp.id}_unpowered`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND, ohms: 1e6,
      });
      return;
    }

    const spec     = SENSOR_SPECS[inst.modelName] ?? SENSOR_SPECS["MQ-2"];
    const hasAO    = nets.AO != null;
    const hasDO    = nets.DO != null;

    inst.setDigitalMode?.(hasAO, hasDO);

    const intensity = Math.max(0, Math.min(1, inst.gasIntensity ?? 0));
    const rs        = _computeRs(spec, intensity);

    if (hasAO) {
      _push(electrical, {
        id: `${comp.id}_rs`, type: "RESISTOR",
        a: nets.VCC, b: nets.AO,
        ohms: Math.max(RS_FLOOR, rs),
      });
      _push(electrical, {
        id: `${comp.id}_rl`, type: "RESISTOR",
        a: nets.AO, b: nets.GND,
        ohms: Math.max(RS_FLOOR, spec.rl),
      });
    } else {
      _push(electrical, {
        id: `${comp.id}_divider`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND,
        ohms: Math.max(RS_FLOOR, rs) + Math.max(RS_FLOOR, spec.rl),
      });
    }

    _push(electrical, {
      id: `${comp.id}_heater`, type: "RESISTOR",
      a: nets.VCC, b: nets.GND,
      ohms: Math.max(RS_FLOOR, spec.rHeater),
    });

    if (hasDO) {
      const vAO_now = hasAO
        ? Math.max(0, electrical.netVoltage.get(nets.AO) ?? 0)
        : (vVCC - vGND) * spec.rl / (rs + spec.rl);

      const adcEstimate = Math.round((vAO_now / VREF) * ADC_MAX);
      const threshold   = inst.userThreshold ?? spec.threshold;

      if (!inst._doTriggered && adcEstimate >= threshold)
        inst._doTriggered = true;
      else if (inst._doTriggered && adcEstimate < threshold - DO_HYST)
        inst._doTriggered = false;

      _push(electrical, {
        id: `${comp.id}_do_pu`, type: "RESISTOR",
        a: nets.VCC, b: nets.DO, ohms: 10000,
      });

      if (inst._doTriggered) {
        _push(electrical, {
          id: `${comp.id}_do_low`, type: "RESISTOR",
          a: nets.DO, b: nets.GND, ohms: 50,
        });
      }
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets  = solver.getNets(comp, ["VCC", "GND", "AO", "DO"]);
    if (!nets.VCC || !nets.GND) return;

    const spec      = SENSOR_SPECS[inst.modelName] ?? SENSOR_SPECS["MQ-2"];
    const vVCC      = electrical.netVoltage.get(nets.VCC) ?? 0;
    const vGND      = electrical.netVoltage.get(nets.GND) ?? 0;
    const isPowered = (vVCC - vGND) > 2.5;

    if (!isPowered) {
      if (inst._poweredPrev) {
        inst._poweredPrev = false;
        inst.setPowered?.(false);
      }
      inst._updateFromModel?.(spec.baseline, (spec.baseline / ADC_MAX) * VREF, false);
      return;
    }

    if (!inst._poweredPrev) {
      inst.startTime    = Date.now();
      inst._poweredPrev = true;
      inst.setPowered?.(true);
    }

    const elapsed    = (Date.now() - (inst.startTime ?? Date.now())) / 1000;
    const warmupSec  = spec.warmUpSec ?? 20;
    if (elapsed >= warmupSec) inst._warmupDone = true;

    if (nets.AO) {
      const vAO       = Math.max(0, electrical.netVoltage.get(nets.AO) ?? 0);
      const targetADC = Math.round((vAO / VREF) * ADC_MAX);

      if (inst._panelPPMChanged) {
        inst.currentAnalog    = targetADC;
        inst._panelPPMChanged = false;
      } else {
        inst.currentAnalog += (targetADC - inst.currentAnalog) * spec.smooth;
      }
      inst.currentAnalog = Math.max(0, Math.min(ADC_MAX, inst.currentAnalog));
      inst.outputVoltage = (inst.currentAnalog / ADC_MAX) * VREF;
    } else {
      const intensity    = Math.max(0, Math.min(1, inst.gasIntensity ?? 0));
      const rs           = _computeRs(spec, intensity);
      const vSupply      = vVCC - vGND;
      const vAO_calc     = vSupply > 0.1 ? vSupply * spec.rl / (rs + spec.rl) : 0;
      inst.currentAnalog = Math.round((vAO_calc / VREF) * ADC_MAX);
      inst.outputVoltage = vAO_calc;
    }

    let triggered = inst._doTriggered ?? false;
    if (nets.DO) {
      const vDO = Math.max(0, electrical.netVoltage.get(nets.DO) ?? VREF);
      triggered = vDO < 2.5;
      inst._doTriggered = triggered;
    }

    inst.isTriggered = triggered;
    inst._updateFromModel?.(inst.currentAnalog, inst.outputVoltage, triggered);
  }
}