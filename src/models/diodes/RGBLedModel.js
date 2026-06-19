"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const CHANNEL_PARAMS = {
  R: { IS: 1.6e-17, N: 2.0, Rs: 15.0, Vf_nom: 2.0, Pmax: 0.1 },
  G: { IS: 4.4e-20, N: 2.0, Rs: 20.0, Vf_nom: 3.2, Pmax: 0.1 },
  B: { IS: 2.2e-23, N: 2.0, Rs: 20.0, Vf_nom: 3.4, Pmax: 0.1 },
};

const VT          = 0.02585;
const MAX_EXP_ARG = 40;
const I_THRESHOLD = 0.0005;
const I_RATED     = 0.02;
const GMIN        = 1e-12;
const T_NOM       = 300.15;

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

export default class RGBLedModel {

  static solve(comp, electrical, solver) {
    const nets   = solver.getNets(comp, ["R", "G", "B", "GND"]);
    const gndNet = nets["GND"];
    if (!gndNet) return;

    const inst = comp.instance;
    const T    = Math.max(200, inst?.temperature ?? T_NOM);

    for (const color of ["R", "G", "B"]) {
      if (!nets[color]) continue;
      const p  = CHANNEL_PARAMS[color];
      const Is = _tempScaleIs(p.IS, p.N, T);

      const Va   = electrical.netVoltage.get(nets[color]) ?? 0;
      const Vk   = electrical.netVoltage.get(gndNet)      ?? 0;
      const Vd   = Va - Vk;
      const bId  = `${comp.id}_${color}`;
      const Vold = solver._junctionV?.get(bId) ?? Vd;
      const { Gd, Ieq, Vlim } = _nrStamp(Vd, Is, p.N, Vold);
      solver._junctionV?.set(bId, Vlim);

      electrical.circuits.push({
        id:       bId,
        type:     "LED",
        a:        nets[color],
        b:        gndNet,
        Is,
        N:        p.N,
        ohms:     p.Rs,
        _diodeNR: { Gd, Ieq },
      });
    }

    if (inst) inst._colorNets = { ...nets };
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const T = Math.max(200, inst?.temperature ?? T_NOM);

    for (const color of ["R", "G", "B"]) {
      const bId   = `${comp.id}_${color}`;
      const branch = electrical.circuits.find(b => b.id === bId);
      if (!branch) continue;

      const Va  = electrical.netVoltage.get(branch.a) ?? 0;
      const Vk  = electrical.netVoltage.get(branch.b) ?? 0;
      const p   = CHANNEL_PARAMS[color];
      const Is  = _tempScaleIs(p.IS, p.N, T);

      const current = _calcCurrent(Va, Vk, Is, p.N, p.Rs);
      const Vd      = Va - Vk;
      const power   = Math.abs(Vd * current);

      const intensity = current > I_THRESHOLD
        ? Math.pow(Math.min(1, current / I_RATED), 0.45)
        : 0;

      inst.applyElectrical?.(current, intensity, color);

      if (power > p.Pmax)
        console.warn(`[RGB] OVERPOW ${comp.id}/${color}: P=${power.toFixed(3)}W > ${p.Pmax}W`);

      if (current > 0.035) {
        const now = Date.now();
        if (!comp[`_lastWarn_${color}`] || now - comp[`_lastWarn_${color}`] > 3000) {
          comp[`_lastWarn_${color}`] = now;
          console.warn(`[RGB] OVERCURRENT ${comp.id}/${color}: ${(current * 1000).toFixed(1)}mA`);
        }
      }
    }
  }
}