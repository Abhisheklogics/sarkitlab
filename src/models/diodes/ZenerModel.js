"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const VT          = 0.02585;
const MAX_EXP_ARG = 40;
const GMIN        = 1e-12;
const VF_THRESH   = 0.3;
const T_NOM       = 300.15;

function _tempScaleIs(Is, N, T) {
  const ratio = T / T_NOM;
  return Is * Math.pow(ratio, 3) * Math.exp((1.1 / (N * VT)) * (1 - 1 / ratio));
}

function _tempScaleVz(Vz, T) {
  const TCV = Vz < 5 ? -0.001 : Vz < 6 ? 0.0 : 0.001;
  return Vz + TCV * (T - T_NOM);
}

function _calcForwardCurrent(Vj, Is, N) {
  const nVt  = N * VT;
  const Vj_c = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vj));
  return Is * (Math.exp(Vj_c / nVt) - 1.0);
}

function _zenerLinearize(Vd, Is, N, Vz, Rz, Vold) {
  if (Vd >= 0) {
    const nVt    = N * VT;
    const Vd_lim = limitJunctionVoltage(Vd, Vold, N, Is);
    const Vd_c   = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd_lim));
    const expVal = Math.exp(Vd_c / nVt);
    const Id     = Is * (expVal - 1.0);
    const Gd     = (Is * expVal) / nVt + GMIN;
    return { Gd, Ieq: Id - Gd * Vd_c, Vlim: Vd_c };
  }

  const Vrev   = -Vd;
  const Rz_eff = Math.max(Rz, 0.5);
  const Vknee  = Vz * 0.8;

  if (Vrev < Vknee) {
    return { Gd: GMIN, Ieq: 0, Vlim: Vd };
  }

  if (Vrev < Vz) {
    const t  = (Vrev - Vknee) / Math.max(Vz - Vknee, 1e-9);
    const ts = t * t * (3 - 2 * t);
    const Gk = ts / Rz_eff;
    return { Gd: Gk + GMIN, Ieq: Gk * Vz * ts, Vlim: Vd };
  }

  const Gd  = 1.0 / Rz_eff;
  const Ieq = Gd * Vz;
  return { Gd, Ieq, Vlim: Vd };
}

export default class ZenerModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A") ?? solver.findNet(comp.id, "Anode");
    const K = solver.findNet(comp.id, "K") ?? solver.findNet(comp.id, "Cathode");
    if (!A || !K) return;

    const inst   = comp.instance;
    const T      = Math.max(200, inst?.temperature ?? T_NOM);
    const Is_nom = inst?.Is ?? 1e-14;
    const N      = inst?.N  ?? 1.0;
    const Vz_nom = Math.max(0.5, inst?.vz ?? 5.1);
    const Rz     = Math.max(0.5, inst?.rz ?? 5.0);
    const Cj0    = Math.max(0, inst?.junctionCapacitance ?? 0);
    const Vj_pot = inst?.junctionPotential ?? 0.75;
    const M      = inst?.gradingCoeff ?? 0.5;

    const Is = _tempScaleIs(Is_nom, N, T);
    const Vz = _tempScaleVz(Vz_nom, T);

    const Va   = electrical.netVoltage.get(A) ?? 0;
    const Vk   = electrical.netVoltage.get(K) ?? 0;
    const Vd   = Va - Vk;
    const Vold = solver._junctionV?.get(comp.id) ?? 0;

    const { Gd, Ieq, Vlim } = _zenerLinearize(Vd, Is, N, Vz, Rz, Vold);
    solver._junctionV?.set(comp.id, Vlim);

    electrical.circuits.push({
      id: comp.id, type: "ZENER",
      a: A, b: K, Is, N, Vz, Rz, ohms: Rz,
      _diodeNR: { Gd, Ieq },
    });

    if (Cj0 > 0 && solver._dt) {
      const Vcj_clamp = Math.min(Math.max(Vd, -Vz * 0.5), Vj_pot * 0.99);
      const Cj        = Cj0 / Math.pow(Math.max(1 - Vcj_clamp / Vj_pot, 0.01), M);
      const capId     = `${comp.id}_cjz`;
      const hist      = solver._capState?.get(capId);
      const Vprev     = hist?.V ?? Vd;
      const Iprev     = hist?.I ?? 0;
      const Geq       = (2.0 * Cj) / Math.max(solver._dt, 1e-15);
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
    const Vz     = Math.max(0.5, branch?.Vz ?? inst?.vz ?? 5.1);
    const Rz     = Math.max(0.5, branch?.Rz ?? inst?.rz ?? 5.0);
    const Is     = branch?.Is ?? inst?.Is ?? 1e-14;
    const N      = branch?.N  ?? inst?.N  ?? 1.0;

    let I = 0;
    if      (Vd >= VF_THRESH) I = _calcForwardCurrent(Vd, Is, N);
    else if (Vd < -Vz)        I = -((Math.abs(Vd) - Vz) / Math.max(Rz, 0.5));
    else                      I = -Is;

    const capId     = `${comp.id}_cjz`;
    const capBranch = electrical.circuits.find(b => b.id === capId);
    if (capBranch) {
      const Ic = capBranch.current ?? 0;
      const Vc = Vd - Ic * (capBranch.ohms ?? 1e-6);
      if (!solver._capState) solver._capState = new Map();
      solver._capState.set(capId, { V: Vc, I: Ic });
    }

    inst.voltage   = Vd;
    inst.current   = I;
    inst.power     = Math.abs(Vd * I);
    inst.state     = Vd > VF_THRESH ? "FORWARD" : Vd < -Vz ? "BREAKDOWN" : "OFF";
    inst.Vz_actual = Vz;
    inst.updateVisual?.(inst.state);

    if (inst.power > (inst?.maxPower ?? 0.5))
      console.warn(`[ZenerModel] OVERPOW ${comp.id}: P=${inst.power.toFixed(3)}W`);
  }
}