

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

function _calcDiodeCurrent(Vj, Is, N) {
  const nVt  = N * VT;
  const Vj_c = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vj));
  return Is * (Math.exp(Vj_c / nVt) - 1.0);
}

function _diodeLinearize(Vd, Is, N, Vold) {
  const nVt  = N * VT;
  let Vd_lim = Vd;
  if (Vold !== undefined && Number.isFinite(Vold)) {
    Vd_lim = limitJunctionVoltage(Vd, Vold, N, Is);
  }
  const Vd_c   = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd_lim));
  const expVal = Math.exp(Vd_c / nVt);
  const Id     = Is * (expVal - 1.0);
  const Gd     = (Is * expVal) / nVt + GMIN;
  const Ieq    = Id - Gd * Vd_c;
  return { Gd, Ieq, Vlim: Vd_c };
}

export default class DiodeModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A")
           ?? solver.findNet(comp.id, "Anode");
    const K = solver.findNet(comp.id, "K")
           ?? solver.findNet(comp.id, "Cathode");
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
      const Gbr = 1.0 / Rz;
      const Vop = -(Vbr + Ibr * Rz);
      Gd        = Gbr + GMIN;
      Ieq       = -Ibr - Gbr * Vop;
      Vd_c      = Vd;
    } else {
      const result = _diodeLinearize(Vd, Is, N, Vold);
      Gd   = result.Gd;
      Ieq  = result.Ieq;
      Vd_c = result.Vlim;
    }

    solver._junctionV?.set(comp.id, Vd_c);

    electrical.circuits.push({
      id:       comp.id,
      type:     "DIODE",
      a:        A,
      b:        K,
      Is,
      N,
      ohms:     Rs,
      _Vbr:     Vbr,
      _Ibr:     Ibr,
      _diodeNR: { Gd, Ieq },
    });

    const Cj0 = Math.max(0, inst?.junctionCapacitance ?? 0);
    if (Cj0 > 0 && solver._dt) {
      const Vj_pot = inst?.junctionPotential ?? 0.75;
      const M      = inst?.gradingCoeff ?? 0.5;
      const Vcj    = Math.min(Vd, Vj_pot * 0.99);
      const Cj     = Cj0 / Math.pow(Math.max(1 - Vcj / Vj_pot, 0.01), M);
      const dt     = Math.max(1e-15, solver._dt);
      const capId  = `${comp.id}_cj`;
      const hist   = solver._capState?.get(capId);
      const Vprev  = hist?.V ?? Vd;
      const Iprev  = hist?.I ?? 0;
      const Geq    = (2.0 * Cj) / dt;
      const IeqCap = Geq * Vprev + Iprev;
      electrical.circuits.push({
        id:            capId,
        type:          "CAPACITOR",
        a:             A,
        b:             K,
        capacitance:   Cj,
        ohms:          1e-6,
        _companionCap: { Geq, Ieq: IeqCap },
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
    const Is     = branch?.Is  ?? 1e-14;
    const N      = branch?.N   ?? 1.0;
    const Rs     = Math.max(0.1, branch?.ohms ?? 0.5);
    const Vbr    = branch?._Vbr ?? Infinity;
    const Ibr    = branch?._Ibr ?? 1e-3;

    let I = 0;
    if (Number.isFinite(Vbr) && Vd < -Vbr) {
      I = -(Ibr + (Math.abs(Vd) - Vbr) / Math.max(Rs, 0.1));
    } else {
      I = _calcDiodeCurrent(Vd, Is, N);
    }

    const capId = `${comp.id}_cj`;
    const capBranch = electrical.circuits.find(b => b.id === capId);
    if (capBranch) {
      const Ic = capBranch.current ?? 0;
      const Vc = Vd - Ic * (capBranch.ohms ?? 1e-6);
      if (!solver._capState) solver._capState = new Map();
      solver._capState.set(capId, { V: Vc, I: Ic });
    }

    inst.conducting  = I > I_CONDUCT;
    inst.current     = I;
    inst.voltage     = Vd;
    inst.Vf          = Vd;
    inst.power       = Math.abs(Vd * I);
    inst.inBreakdown = Number.isFinite(Vbr) && Vd < -Vbr;

    inst.updateVisual?.(I > I_CONDUCT);

    const Pmax = inst?.maxPower ?? 0.5;
    if (inst.power > Pmax) {
      console.warn(`[DiodeModel] OVERPOW ${comp.id}: P=${inst.power.toFixed(3)}W > ${Pmax}W`);
    }
  }
}