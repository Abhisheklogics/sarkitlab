"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const LED_IS      = 1.6e-17;
const LED_N       = 2.0;
const LED_RS      = 8.0;
const I_OVERCUR   = 0.035;
const I_THRESHOLD = 0.0005;
const GMIN        = 1e-12;
const VT          = 0.02585;
const MAX_EXP_ARG = 40;
const T_NOM       = 300.15;
const BURN_TICKS  = 3;

function _tempScaleIs(Is, N, T) {
  const ratio = T / T_NOM;
  return Is * Math.pow(ratio, 3) * Math.exp((1.1 / (N * VT)) * (1 - 1 / ratio));
}

function _calcLedCurrent(Va, Vb, Is, N, Rs) {
  const Vterm = Va - Vb;
  if (Vterm <= 0) return 0;
  const nVt = N * VT;
  let Vj = Math.min(Vterm, MAX_EXP_ARG * nVt);
  for (let i = 0; i < 20; i++) {
    const expArg = Math.min(Vj / nVt, MAX_EXP_ARG);
    const expV   = Math.exp(expArg);
    const Id     = Is * (expV - 1.0);
    const Gd     = (Is * expV) / nVt;
    const f      = Vj + Id * Rs - Vterm;
    const df     = 1.0 + Gd * Rs;
    const dV     = f / df;
    Vj -= dV;
    Vj  = Math.max(0, Math.min(Vj, Vterm));
    if (Math.abs(dV) < 1e-12) break;
  }
  const expArg = Math.min(Vj / nVt, MAX_EXP_ARG);
  return Math.max(0, Is * (Math.exp(expArg) - 1.0));
}

function _ledNRStamp(Vd, Is, N, Vold) {
  const Vd_lim = limitJunctionVoltage(Vd, Vold, N, Is);
  const nVt    = N * VT;
  const Vd_c   = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd_lim));
  const expVal = Math.exp(Vd_c / nVt);
  const Id     = Is * (expVal - 1.0);
  const Gd     = (Is * expVal) / nVt + GMIN;
  const Ieq    = Id - Gd * Vd_c;
  return { Gd, Ieq, Vlim: Vd_c };
}

export default class LEDModel {

  static solve(comp, electrical, solver) {
    const anode   = solver.findNet(comp.id, "Anode")
                 ?? solver.findNet(comp.id, "A");
    const cathode = solver.findNet(comp.id, "Cathode")
                 ?? solver.findNet(comp.id, "K");
    if (!anode || !cathode) return;

    const inst   = comp.instance;
    const T      = Math.max(200, inst?.temperature ?? T_NOM);
    const Is_nom = inst?.saturationCurrent ?? comp.saturationCurrent ?? LED_IS;
    const N      = inst?.idealityFactor    ?? comp.idealityFactor    ?? LED_N;
    const Rs     = Math.max(1e-3, inst?.seriesResistance ?? comp.seriesResistance ?? LED_RS);
    const Cj0    = Math.max(0, inst?.junctionCapacitance ?? 0);
    const Vj_pot = inst?.junctionPotential ?? 0.75;
    const M      = inst?.gradingCoeff ?? 0.5;

    const Is = _tempScaleIs(Is_nom, N, T);

    const Va  = electrical.netVoltage.get(anode)   ?? 0;
    const Vk  = electrical.netVoltage.get(cathode) ?? 0;
    const Vd  = Va - Vk;
    const Vold = solver._junctionV?.get(comp.id) ?? Vd;
    const { Gd, Ieq, Vlim } = _ledNRStamp(Vd, Is, N, Vold);
    solver._junctionV?.set(comp.id, Vlim);

    electrical.circuits.push({
      id:       comp.id,
      type:     "LED",
      a:        anode,
      b:        cathode,
      Is,
      N,
      ohms:     Rs,
      _diodeNR: { Gd, Ieq },
    });

    if (Cj0 > 0 && solver._dt) {
      const Vcj = Math.min(Vd, Vj_pot * 0.99);
      const Cj  = Cj0 / Math.pow(Math.max(1 - Vcj / Vj_pot, 0.01), M);
      const dt  = Math.max(1e-15, solver._dt);
      const Geq = (2.0 * Cj) / dt;
      const Ieq_c = Geq * (solver._capState?.get(`${comp.id}_cj`) ?? Vd);
      electrical.circuits.push({
        id:            `${comp.id}_cj`,
        type:          "CAPACITOR",
        a:             anode,
        b:             cathode,
        capacitance:   Cj,
        ohms:          1e-6,
        _companionCap: { Geq, Ieq: Ieq_c },
      });
    }

    if (inst) inst._nets = { A: anode, K: cathode };
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    if (inst._burned) {
      inst.setOff?.();
      return;
    }

    const branch = electrical.circuits.find(b => b.id === comp.id);
    if (!branch) return;

    const Va = electrical.netVoltage.get(branch.a) ?? 0;
    const Vk = electrical.netVoltage.get(branch.b) ?? 0;

    const Is = branch.Is ?? LED_IS;
    const N  = branch.N  ?? LED_N;
    const Rs = branch.ohms ?? LED_RS;

    const current  = _calcLedCurrent(Va, Vk, Is, N, Rs);
    const I_rated  = inst.ratedCurrent ?? comp.ratedCurrent ?? 0.02;
    const Pmax     = inst.maxPower ?? comp.maxPower ?? 0.25;
    const Vd       = Va - Vk;
    const power    = Math.abs(Vd * current);

    inst.current   = current;
    inst.voltage   = Vd;
    inst.power     = power;

    if (current > I_THRESHOLD) {
      const flybackUntil = solver._flybackNets?.get(branch.a) ?? 0;
      const flybackBoost = Date.now() < flybackUntil ? 0.15 : 0;
      const intensity    = Math.min(1, Math.pow(Math.min(1, current / I_rated), 0.45) + flybackBoost);
      inst.setOn?.(intensity);

      if (current > I_OVERCUR) {
        inst._overcurrentTicks = (inst._overcurrentTicks ?? 0) + 1;
        if (inst._overcurrentTicks >= BURN_TICKS && !inst._burned) {
          inst._burned = true;
          console.warn(`[LED] BURNED ${comp.id}: ${(current * 1000).toFixed(1)}mA`);
        }
        const now = Date.now();
        if (!comp._lastWarn || now - comp._lastWarn > 3000) {
          comp._lastWarn = now;
          console.warn(`[LED] OVERCURRENT ${comp.id}: ${(current * 1000).toFixed(1)}mA`);
        }
      } else {
        inst._overcurrentTicks = 0;
      }
    } else {
      inst._overcurrentTicks = 0;
      inst.setOff?.();
    }

    if (power > Pmax)
      console.warn(`[LED] OVERPOW ${comp.id}: P=${power.toFixed(3)}W > ${Pmax}W rated`);
  }
}