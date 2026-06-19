"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const SEG_IS  = 1.2e-17;
const SEG_N   = 2.0;
const SEG_RS  = 8.0;
const SEG_Cj0 = 0;

const VT          = 0.02585;
const MAX_EXP_ARG = 40;
const I_THRESHOLD = 0.0005;
const I_RATED     = 0.015;
const GMIN        = 1e-12;
const T_NOM       = 300.15;

const SEGMENTS = ["A", "B", "C", "D", "E", "F", "G", "DP"];

function _tempScaleIs(Is, N, T) {
  const ratio = T / T_NOM;
  return Is * Math.pow(ratio, 3) * Math.exp((1.1 / (N * VT)) * (1 - 1 / ratio));
}

function _calcCurrent(Va, Vb, Is, N, Rs) {
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

function _nrStamp(Vd, Is, N, Vold) {
  const Vd_lim = limitJunctionVoltage(Vd, Vold, N, Is);
  const nVt    = N * VT;
  const Vd_c   = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd_lim));
  const expVal = Math.exp(Vd_c / nVt);
  const Id     = Is * (expVal - 1.0);
  const Gd     = (Is * expVal) / nVt + GMIN;
  const Ieq    = Id - Gd * Vd_c;
  return { Gd, Ieq, Vlim: Vd_c };
}

export default class SevenSegmentModel {

  static solve(comp, electrical, solver) {
    const common = solver.findNet(comp.id, "common")
                ?? solver.findNet(comp.id, "COM")
                ?? solver.findNet(comp.id, "CC")
                ?? solver.findNet(comp.id, "CA");
    if (!common) return;

    const inst = comp.instance;
    const T    = Math.max(200, inst?.temperature ?? T_NOM);
    const Is   = _tempScaleIs(SEG_IS, SEG_N, T);

    for (const seg of SEGMENTS) {
      const segNet = solver.findNet(comp.id, seg)
                  ?? solver.findNet(comp.id, seg.toLowerCase());
      if (!segNet) continue;

      const bId  = `${comp.id}_${seg}`;
      const Va   = electrical.netVoltage.get(segNet) ?? 0;
      const Vk   = electrical.netVoltage.get(common) ?? 0;
      const Vd   = Va - Vk;
      const Vold = solver._junctionV?.get(bId) ?? Vd;
      const { Gd, Ieq, Vlim } = _nrStamp(Vd, Is, SEG_N, Vold);
      solver._junctionV?.set(bId, Vlim);

      electrical.circuits.push({
        id:       bId,
        type:     "LED_SEGMENT",
        a:        segNet,
        b:        common,
        Is,
        N:        SEG_N,
        ohms:     SEG_RS,
        _diodeNR: { Gd, Ieq },
      });
    }
  }

  static update(comp, electrical, solver) {
    if (!comp.instance) return;

    const inst = comp.instance;
    const T    = Math.max(200, inst?.temperature ?? T_NOM);
    const Is   = _tempScaleIs(SEG_IS, SEG_N, T);

    for (const seg of SEGMENTS) {
      const bId    = `${comp.id}_${seg}`;
      const branch = electrical.circuits.find(b => b.id === bId);
      if (!branch) continue;

      const Va = electrical.netVoltage.get(branch.a) ?? 0;
      const Vk = electrical.netVoltage.get(branch.b) ?? 0;

      const current   = _calcCurrent(Va, Vk, Is, SEG_N, SEG_RS);
      const Vd        = Va - Vk;
      const power     = Math.abs(Vd * current);
      const powered   = current > I_THRESHOLD;
      const intensity = powered
        ? Math.pow(Math.min(1, current / I_RATED), 0.4)
        : 0;

      inst.setSegment?.(seg, powered ? 1 : 0, intensity);

      if (power > 0.1)
        console.warn(`[7Seg] OVERPOW ${comp.id}/${seg}: P=${power.toFixed(3)}W`);

      if (current > 0.035) {
        const now = Date.now();
        if (!comp[`_lastWarn_${seg}`] || now - comp[`_lastWarn_${seg}`] > 3000) {
          comp[`_lastWarn_${seg}`] = now;
          console.warn(`[7Seg] OVERCURRENT ${comp.id}/${seg}: ${(current * 1000).toFixed(1)}mA`);
        }
      }
    }
  }
}