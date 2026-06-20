"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const VT          = 0.02585;
const MAX_EXP_ARG = 40;
const GMIN        = 1e-12;
const T_NOM       = 300.15;
const I_CONDUCT   = 1e-4;

function _tempScaleIs(Is, N, T) {
  const ratio = T / T_NOM;
  return Is * Math.pow(ratio, 3) * Math.exp((1.1 / (N * VT)) * (1 - 1 / ratio));
}

function _diodeLinearize(Vd, Is, N, Vold) {
  const nVt  = N * VT;
  let Vd_lim = Vd;
  if (Vold !== undefined && Number.isFinite(Vold))
    Vd_lim = limitJunctionVoltage(Vd, Vold, N, Is);
  const Vd_c   = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd_lim));
  const expVal = Math.exp(Vd_c / nVt);
  const Id     = Is * (expVal - 1.0);
  const Gd     = (Is * expVal) / nVt + GMIN;
  return { Gd, Ieq: Id - Gd * Vd_c, Vlim: Vd_c };
}

export default class DiodeModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A") ?? solver.findNet(comp.id, "Anode");
    const K = solver.findNet(comp.id, "K") ?? solver.findNet(comp.id, "Cathode");
    if (!A || !K) return;

    const inst   = comp.instance;
    const T      = Math.max(200, inst?.temperature ?? T_NOM);
    const Is_nom = inst?.Is ?? comp.Is ?? 1e-14;
    const N      = inst?.N  ?? comp.N  ?? 1.0;
    const Rs     = Math.max(0.1, inst?.seriesResistance ?? comp.seriesResistance ?? 0.5);
    const Vbr    = inst?.breakdownVoltage ?? comp.breakdownVoltage ?? Infinity;
    const Ibr    = inst?.breakdownCurrent ?? comp.breakdownCurrent ?? 1e-3;

    const Is   = _tempScaleIs(Is_nom, N, T);
    const Va   = electrical.netVoltage.get(A) ?? 0;
    const Vk   = electrical.netVoltage.get(K) ?? 0;
    const Vd   = Va - Vk;
    const Vold = solver._junctionV?.get(comp.id) ?? 0;

    let Gd, Ieq, Vd_c;

    if (Number.isFinite(Vbr) && Vd < -Vbr) {
      const Rz  = Math.max(Rs, 0.1);
      Gd        = 1.0 / Rz + GMIN;
      Ieq       = -Ibr - (Gd - GMIN) * Vbr;
      Vd_c      = Vd;
    } else {
      const r = _diodeLinearize(Vd, Is, N, Vold);
      Gd = r.Gd; Ieq = r.Ieq; Vd_c = r.Vlim;
    }

    solver._junctionV?.set(comp.id, Vd_c);

    electrical.circuits.push({
      id: comp.id, type: "DIODE",
      a: A, b: K, Is, N, ohms: Rs,
      _Vbr: Vbr, _Ibr: Ibr,
      _diodeNR: { Gd, Ieq },
    });

    if ((inst?.junctionCapacitance ?? 0) > 0 && solver._dt) {
      const Cj0    = inst.junctionCapacitance;
      const Vj_pot = inst?.junctionPotential ?? 0.75;
      const Mj     = inst?.gradingCoeff ?? 0.5;
      const Vcj    = Math.min(Vd, Vj_pot * 0.99);
      const Cj     = Cj0 / Math.pow(Math.max(1 - Vcj / Vj_pot, 0.01), Mj);
      const capId  = `${comp.id}_cj`;
      const hist   = solver._capState?.get(capId);
      const Vprev  = hist?.V ?? Vd;
      const Iprev  = hist?.I ?? 0;
      const Geq    = (2.0 * Cj) / Math.max(solver._dt, 1e-15);
      electrical.circuits.push({
        id: capId, type: "CAPACITOR",
        a: A, b: K, capacitance: Cj, ohms: 1e-6,
        _companionCap: { Geq, Ieq: Geq * Vprev + Iprev },
      });
    }

    if (inst) inst._nets = { A, K };
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { A, K } = inst._nets;
    const Va = electrical.netVoltage.get(A) ?? 0;
    const Vk = electrical.netVoltage.get(K) ?? 0;
    const Vd = Va - Vk;

    const branch = electrical.circuits.find(b => b.id === comp.id);
    const Is     = branch?.Is ?? 1e-14;
    const N      = branch?.N  ?? 1.0;
    const Vbr    = branch?._Vbr ?? Infinity;
    const Ibr    = branch?._Ibr ?? 1e-3;
    const Rs     = Math.max(0.1, branch?.ohms ?? 0.5);

    let I = 0;
    if (Number.isFinite(Vbr) && Vd < -Vbr) {
      I = -(Ibr + (Math.abs(Vd) - Vbr) / Math.max(Rs, 0.1));
    } else {
      const nVt  = N * VT;
      const Vd_c = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd));
      I = Is * (Math.exp(Vd_c / nVt) - 1.0);
      if (I < 0) I = 0;
    }

    const capId     = `${comp.id}_cj`;
    const capBranch = electrical.circuits.find(b => b.id === capId);
    if (capBranch) {
      const Ic = capBranch.current ?? 0;
      if (!solver._capState) solver._capState = new Map();
      solver._capState.set(capId, { V: Vd - Ic * (capBranch.ohms ?? 1e-6), I: Ic });
    }

    inst.conducting  = I > I_CONDUCT;
    inst.current     = I;
    inst.voltage     = Vd;
    inst.Vf          = Vd;
    inst.power       = Math.abs(Vd * I);
    inst.inBreakdown = Number.isFinite(Vbr) && Vd < -Vbr;
    inst.updateVisual?.(I > I_CONDUCT);

    if (inst.power > (inst?.maxPower ?? 0.5))
      console.warn(`[DiodeModel] OVERPOW ${comp.id}: P=${inst.power.toFixed(3)}W`);
  }
}