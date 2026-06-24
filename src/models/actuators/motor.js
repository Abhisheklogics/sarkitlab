"use strict";

const R_ON      = 1.2;
const R_ON_TOT  = R_ON * 2;
const R_FLY     = 100.0;
const V_CESAT   = 1.4;
const TTL_HIGH  = 2.0;
const I_MAX     = 0.600;
const GMIN      = 1e-9;

const BRIDGES = [
  { key:"b1", en:"p1",  inA:"p2",  inB:"p7",  outA:"p3",  outB:"p6"  },
  { key:"b2", en:"p9",  inA:"p10", inB:"p15", outA:"p11", outB:"p14" },
];

function _pushR(electrical, id, a, b, ohms) {
  if (!a || !b || a === b) return;
  electrical.circuits.push({ id, type: "RESISTOR", a, b, ohms });
}

function _pushSrc(electrical, id, a, b, ohms, vOffset) {
  if (!a || !b || a === b) return;
  electrical.circuits.push({ id, type: "VOLTAGE_SOURCE", a, b, ohms, vOffset });
}

export default class MotorDriverModel {

  static solve(comp, electrical, solver) {
    if (!comp._drvState) comp._drvState = {};

    const gndNet =
      solver.findNet(comp.id, "p4")  ??
      solver.findNet(comp.id, "p5")  ??
      solver.findNet(comp.id, "p12") ??
      solver.findNet(comp.id, "p13");
    if (!gndNet) return;

    const vlogicNet = solver.findNet(comp.id, "p16");
    const vmotNet   = solver.findNet(comp.id, "p8");

    const vlogic = vlogicNet ? (electrical.netVoltage.get(vlogicNet) ?? 0) : 0;
    const vmot   = vmotNet   ? (electrical.netVoltage.get(vmotNet)   ?? 0) : 0;
    const vgnd   = electrical.netVoltage.get(gndNet) ?? 0;

    const vlogicEff = Math.max(0, vlogic - vgnd);
    const vmotEff   = Math.max(0, vmot   - vgnd);

    if (vlogicEff < 4.5) {
      for (const br of BRIDGES) {
        const outANet = solver.findNet(comp.id, br.outA);
        const outBNet = solver.findNet(comp.id, br.outB);
        if (outANet) _pushR(electrical, `${comp.id}_${br.key}_offA`, outANet, gndNet, R_FLY);
        if (outBNet) _pushR(electrical, `${comp.id}_${br.key}_offB`, outBNet, gndNet, R_FLY);
        comp._drvState[br.key] = { dir: "OFF", duty: 0, Vmot: 0, current: 0 };
      }
      return;
    }

    for (const br of BRIDGES) {
      const enNet   = solver.findNet(comp.id, br.en);
      const inANet  = solver.findNet(comp.id, br.inA);
      const inBNet  = solver.findNet(comp.id, br.inB);
      const outANet = solver.findNet(comp.id, br.outA);
      const outBNet = solver.findNet(comp.id, br.outB);

      if (!outANet || !outBNet) continue;

      const enV  = enNet  ? (electrical.netVoltage.get(enNet)  ?? 0) : 0;
      const inAV = inANet ? (electrical.netVoltage.get(inANet) ?? 0) : 0;
      const inBV = inBNet ? (electrical.netVoltage.get(inBNet) ?? 0) : 0;

      const enabled = (enV  - vgnd) >= TTL_HIGH;
      const inAHi  = (inAV - vgnd) >= TTL_HIGH;
      const inBHi  = (inBV - vgnd) >= TTL_HIGH;

      if (!enabled) {
        _pushR(electrical, `${comp.id}_${br.key}_flyA`, outANet, gndNet, R_FLY);
        _pushR(electrical, `${comp.id}_${br.key}_flyB`, outBNet, gndNet, R_FLY);
        comp._drvState[br.key] = { dir: "COAST", duty: 0, Vmot: 0, current: 0 };
        continue;
      }

      const Vout = Math.max(0, vmotEff - V_CESAT);

      if (inAHi && !inBHi) {
        _pushSrc(electrical, `${comp.id}_${br.key}_mot`, outANet, outBNet, R_ON_TOT, Vout);
        comp._drvState[br.key] = { dir: "FORWARD", duty: 1, Vmot: Vout, current: 0 };

      } else if (!inAHi && inBHi) {
        _pushSrc(electrical, `${comp.id}_${br.key}_mot`, outBNet, outANet, R_ON_TOT, Vout);
        comp._drvState[br.key] = { dir: "REVERSE", duty: 1, Vmot: -Vout, current: 0 };

      } else if (inAHi && inBHi) {
        _pushR(electrical, `${comp.id}_${br.key}_brakeA`, outANet, gndNet, R_ON);
        _pushR(electrical, `${comp.id}_${br.key}_brakeB`, outBNet, gndNet, R_ON);
        comp._drvState[br.key] = { dir: "BRAKE", duty: 1, Vmot: 0, current: 0 };

      } else {
        _pushR(electrical, `${comp.id}_${br.key}_flyA`, outANet, gndNet, R_FLY);
        _pushR(electrical, `${comp.id}_${br.key}_flyB`, outBNet, gndNet, R_FLY);
        comp._drvState[br.key] = { dir: "COAST", duty: 0, Vmot: 0, current: 0 };
      }
    }
  }

  static update(comp, electrical, solver) {
    if (!comp._drvState) return;

    for (const br of BRIDGES) {
      const state = comp._drvState[br.key];
      if (!state) continue;

      const outANet = solver.findNet(comp.id, br.outA);
      const outBNet = solver.findNet(comp.id, br.outB);
      if (!outANet || !outBNet) continue;

      const Va = electrical.netVoltage.get(outANet) ?? 0;
      const Vb = electrical.netVoltage.get(outBNet) ?? 0;

      state.Vmot    = parseFloat((Va - Vb).toFixed(3));
      state.current = parseFloat(
        Math.abs(solver.getBranchCurrent(`${comp.id}_${br.key}_mot`) ?? 0).toFixed(4)
      );

      if (state.current > I_MAX && !comp._burned) {
        comp._burned = true;
        comp.instance?.setBurned?.(true);
        console.warn(`[MotorDriver] ${comp.id} overcurrent: ${(state.current*1000).toFixed(0)}mA`);
      }

      comp.instance?.updateBridge?.(br.key, state);
    }
  }

  static reset(comp) {
    comp._drvState = {};
    comp._burned   = false;
  }
}