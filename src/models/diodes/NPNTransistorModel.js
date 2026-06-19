"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const VT_NOM   = 0.02585;
const T_NOM_K  = 300.0;
const KB_Q     = 8.617e-5;

const IS_F     = 1e-14;
const IS_R     = 1e-13;
const N_F      = 1.0;
const N_R      = 1.5;
const BETA_F   = 200;
const BETA_R   = 4;
const VA       = 100;
const VAR      = 10;
const IKF      = 0.01;
const IKR      = 0.01;
const ISE      = 1e-13;
const ISC      = 1e-12;
const NE       = 1.5;
const NC       = 2.0;
const RE       = 0.5;
const RC_OHMIC = 10.0;
const RB_MAX   = 200.0;
const RB_MIN   = 10.0;
const IRB      = 1e-4;
const CJE      = 25e-12;
const CJC      = 8e-12;
const VJE      = 0.75;
const VJC      = 0.75;
const MJE      = 0.33;
const MJC      = 0.33;
const TF       = 400e-12;
const TR       = 40e-9;
const XTI      = 3.0;
const XTB      = 0.0;
const EG       = 1.11;

const GMIN     = 1e-12;
const MAX_EXP  = 40;
const MIN_EXP  = -40;
const I_LEAK   = 1e-9;

const BASE_ALIASES      = ["B","b","base","Base","BASE","1"];
const COLLECTOR_ALIASES = ["C","c","collector","Collector","COLLECTOR","3"];
const EMITTER_ALIASES   = ["E","e","emitter","Emitter","EMITTER","2"];

function findPin(solver, comp, aliases) {
  for (const a of aliases) { const n = solver.findNet(comp.id, a); if (n) return n; }
  return null;
}

function safeExp(x) {
  return Math.exp(Math.max(MIN_EXP, Math.min(MAX_EXP, x)));
}

function tempScaleIS(IS, T_K) {
  return IS * Math.pow(T_K / T_NOM_K, XTI)
           * safeExp((EG / KB_Q) * (1 / T_NOM_K - 1 / T_K));
}

function thermalVoltage(T_K) {
  return KB_Q * T_K;
}

function dynamicRb(Ib) {
  if (Ib <= 0) return RB_MAX;
  return RB_MIN + (RB_MAX - RB_MIN) * IRB / (Math.abs(Ib) + IRB);
}

function junctionCap(Cj0, Vj, mj, Vbias) {
  const Vmax = 0.95 * Vj;
  const Veff = Math.min(Vbias, Vmax);
  return Cj0 * Math.pow(Math.max(1e-6, 1 - Veff / Vj), -mj);
}

function gpModel(vBE, vBC, IS_f, IS_r, vt, beta_f, beta_r) {
  const expBE  = safeExp(vBE / (N_F * vt));
  const expBC  = safeExp(vBC / (N_R * vt));
  const expBEe = safeExp(vBE / (NE  * vt));
  const expBCc = safeExp(vBC / (NC  * vt));

  const If = IS_f * (expBE - 1.0);
  const Ir = IS_r * (expBC - 1.0);

  const q1  = 1.0 + Math.max(0, vBE) / VA + Math.max(0, -vBC) / VAR;
  const q2f = Math.abs(If) / IKF;
  const q2r = Math.abs(Ir) / IKR;
  const qb  = q1 / 2.0 + Math.sqrt((q1 / 2.0) ** 2 + q2f + q2r);

  const Ic_transport = (If - Ir) / qb;

  const dIf_dvBE  = (IS_f * expBE)  / (N_F * vt);
  const dIr_dvBC  = (IS_r * expBC)  / (N_R * vt);
  const dIbe_dvBE = (ISE  * expBEe) / (NE  * vt);
  const dIbc_dvBC = (ISC  * expBCc) / (NC  * vt);

  const gm_be = dIf_dvBE / qb + GMIN;
  const gm_bc = dIr_dvBC / qb + GMIN;

  const Gbe_total = gm_be / Math.max(beta_f, 1) + dIbe_dvBE + GMIN;
  const Gbc_total = gm_bc / Math.max(beta_r, 1) + dIbc_dvBC + GMIN;

  return {
    If, Ir, Ic_transport, qb,
    gm_be, gm_bc, Gbe_total, Gbc_total,
    dIf_dvBE, dIr_dvBC,
    expBE, expBC,
  };
}

export default class NPNTransistorModel {

  static solve(comp, electrical, solver) {
    const netB = findPin(solver, comp, BASE_ALIASES);
    const netC = findPin(solver, comp, COLLECTOR_ALIASES);
    const netE = findPin(solver, comp, EMITTER_ALIASES);
    if (!netB || !netC || !netE) return;

    const vB = electrical.netVoltage.get(netB) ?? 0;
    const vC = electrical.netVoltage.get(netC) ?? 0;
    const vE = electrical.netVoltage.get(netE) ?? 0;

    const inst   = comp.instance;
    const T_K    = Math.max(250, Math.min(450, T_NOM_K + (inst?._tempRise ?? 0)));
    const vt     = thermalVoltage(T_K);
    const IS_f   = tempScaleIS(IS_F, T_K);
    const IS_r   = tempScaleIS(IS_R, T_K);
    const beta_f = Math.max(1, (comp.beta ?? inst?.beta ?? BETA_F) * Math.pow(T_K / T_NOM_K, XTB));
    const beta_r = Math.max(1, BETA_R * Math.pow(T_K / T_NOM_K, XTB));

    const Ib_prev = Math.max(0, inst?._lastIb ?? 0);
    const Rb      = dynamicRb(Ib_prev);

    const vBE_raw = vB - vE;
    const vBC_raw = vB - vC;

    const vBE_prev = solver._junctionV?.get(`${comp.id}_be`) ?? vBE_raw;
    const vBC_prev = solver._junctionV?.get(`${comp.id}_bc`) ?? vBC_raw;

    const vBE_lim = limitJunctionVoltage(vBE_raw, vBE_prev, N_F, IS_f);
    const vBC_lim = limitJunctionVoltage(vBC_raw, vBC_prev, N_R, IS_r);

    const vBE_c = Math.max(MIN_EXP * N_F * vt, Math.min(MAX_EXP * N_F * vt, vBE_lim));
    const vBC_c = Math.max(MIN_EXP * N_R * vt, Math.min(MAX_EXP * N_R * vt, vBC_lim));

    solver._junctionV?.set(`${comp.id}_be`, vBE_c);
    solver._junctionV?.set(`${comp.id}_bc`, vBC_c);

    const {
      If, Ir, Ic_transport, qb,
      gm_be, gm_bc, Gbe_total, Gbc_total,
      expBE, expBC,
    } = gpModel(vBE_c, vBC_c, IS_f, IS_r, vt, beta_f, beta_r);

    const Ic_op     = Math.max(0, Ic_transport) + I_LEAK;
    const gce_early = Ic_op / Math.max(VA, 1.0);
    const Gce       = gce_early + GMIN;

    const Ibe_eq = (IS_f / Math.max(beta_f, 1)) * (expBE - 1.0)
                 + ISE * (safeExp(vBE_c / (NE * vt)) - 1.0)
                 - Gbe_total * vBE_c;

    const Ibc_eq = (IS_r / Math.max(beta_r, 1)) * (expBC - 1.0)
                 + ISC * (safeExp(vBC_c / (NC * vt)) - 1.0)
                 - Gbc_total * vBC_c;

    const Ice_dc = Ic_op;
    const Ice_eq = Ice_dc - Gce * (vC - vE);

    const Gbe_re = RE > 1e-6 ? 1.0 / (1.0 / Math.max(Gbe_total, GMIN) + RE) : Gbe_total;
    const Gce_rc = RC_OHMIC > 1e-6 ? 1.0 / (1.0 / Math.max(Gce, GMIN) + RC_OHMIC) : Gce;

    const Ibe_eq_re = RE > 1e-6 ? Ibe_eq * (Gbe_re / Math.max(Gbe_total, GMIN)) : Ibe_eq;
    const Ice_eq_rc = RC_OHMIC > 1e-6 ? Ice_eq * (Gce_rc / Math.max(Gce, GMIN)) : Ice_eq;

    electrical.circuits.push({
      id:      `${comp.id}_bjt`,
      type:    "TRANSISTOR_CE",
      a:       null,
      b:       null,
      _stamps: [
        { a: netB, b: netE, g: Gbe_re },
        { a: netB, b: netC, g: Gbc_total },
        { a: netC, b: netE, g: Gce_rc },

        { a: netC, b: netE, ctrlA: netB, ctrlB: netE, gm:  gm_be },
        { a: netC, b: netE, ctrlA: netB, ctrlB: netC, gm: -gm_bc },

        { a: netB, b: netE, i: -Ibe_eq_re },
        { a: netB, b: netC, i: -Ibc_eq    },
        { a: netC, b: netE, i: -Ice_eq_rc },

        { a: netB, b: netE, g: 1.0 / Math.max(Rb, RB_MIN) },
      ],
    });

    const Cbe_total = Math.max(0,
      TF * gm_be +
      junctionCap(CJE, VJE, MJE, Math.min(vBE_c, 0.95 * VJE))
    );
    const Cbc_total = Math.max(0,
      TR * Math.max(0, -Ir) / vt +
      junctionCap(CJC, VJC, MJC, Math.min(vBC_c, 0.95 * VJC))
    );

    if (Cbe_total > 1e-18 && solver.dt > 0) {
      const capId = `${comp.id}_cbe`;
      const hist  = solver._capState?.get(capId);
      const Vprev = hist?.V ?? vBE_c;
      const Iprev = hist?.I ?? 0;
      const Geq   = (2.0 * Cbe_total) / solver.dt;
      electrical.circuits.push({
        id:            capId,
        type:          "CAPACITOR",
        a:             netB,
        b:             netE,
        capacitance:   Cbe_total,
        _companionCap: { Geq, Ieq: Geq * Vprev + Iprev },
      });
    }

    if (Cbc_total > 1e-18 && solver.dt > 0) {
      const capId = `${comp.id}_cbc`;
      const hist  = solver._capState?.get(capId);
      const Vprev = hist?.V ?? vBC_c;
      const Iprev = hist?.I ?? 0;
      const Geq   = (2.0 * Cbc_total) / solver.dt;
      electrical.circuits.push({
        id:            capId,
        type:          "CAPACITOR",
        a:             netB,
        b:             netC,
        capacitance:   Cbc_total,
        _companionCap: { Geq, Ieq: Geq * Vprev + Iprev },
      });
    }

    if (inst) {
      inst._nets     = { B: netB, C: netC, E: netE };
      inst._gp_state = {
        If, Ir, qb,
        vBE: vBE_c, vBC: vBC_c,
        vt, T_K, beta_f, IS_f,
        Ic_transport,
      };
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { B, C, E } = inst._nets;
    const vB  = electrical.netVoltage.get(B) ?? 0;
    const vC  = electrical.netVoltage.get(C) ?? 0;
    const vE  = electrical.netVoltage.get(E) ?? 0;
    const vBE = vB - vE;
    const vCE = vC - vE;
    const vBC = vB - vC;

    const gp           = inst._gp_state ?? {};
    const Ic_transport = gp.Ic_transport ?? 0;
    const beta_f       = gp.beta_f ?? BETA_F;
    const vt           = gp.vt ?? VT_NOM;

    const Ic = Math.max(0, Ic_transport);
    const Ib = Math.max(0, Ic / Math.max(beta_f, 1));
    const Ie = Ib + Ic;

    inst._lastIb = Ib;

    const hFE   = Ib > 1e-15 ? Math.min(Ic / Ib, 2000) : 0;
    const Pdiss = Math.max(0, Ic * Math.max(0, vCE) + Ib * Math.max(0, vBE));

    const THETA_JA    = comp.thetaJA ?? 200;
    const TAU_THERMAL = 0.5;
    const alpha       = Math.min(1, (solver.dt ?? 1e-3) / TAU_THERMAL);
    inst._tempRise    = (inst._tempRise ?? 0) + alpha * (Pdiss * THETA_JA - (inst._tempRise ?? 0));
    const T_C         = (T_NOM_K + inst._tempRise) - 273.15;

    const cbeId = `${comp.id}_cbe`;
    const cbcId = `${comp.id}_cbc`;
    for (const capId of [cbeId, cbcId]) {
      const capBranch = electrical.circuits.find(b => b.id === capId);
      if (capBranch) {
        const Va = electrical.netVoltage.get(capBranch.a) ?? 0;
        const Vb = electrical.netVoltage.get(capBranch.b) ?? 0;
        const Ic_cap = capBranch.current ?? 0;
        const Vc = (Va - Vb) - Ic_cap * (capBranch.ohms ?? 0);
        if (!solver._capState) solver._capState = new Map();
        solver._capState.set(capId, { V: Vc, I: Ic_cap });
      }
    }

    let region;
    if (vBE < 0.45)                       region = "cutoff";
    else if (vCE < 0)                     region = "reverse";
    else if (vCE < 0.3 && Ic > 1e-6)     region = "saturation";
    else                                  region = "active";

    const thermalRunaway = T_C > 150 && Pdiss > 0.5;

    inst.setState?.(region);
    inst.setValues?.({
      vbe: +vBE.toFixed(4),
      vce: +vCE.toFixed(4),
      vbc: +vBC.toFixed(4),
      ib:  Ib,
      ic:  Ic,
      ie:  Ie,
      hfe: +hFE.toFixed(1),
      pdiss:        +Pdiss.toFixed(4),
      temp_c:       +T_C.toFixed(1),
      region,
      thermalRunaway,
    });

    if (thermalRunaway && !inst._warned) {
      inst._warned = true;
      console.warn(`[BJT] ${comp.id} thermal runaway! T=${T_C.toFixed(0)}°C P=${(Pdiss * 1000).toFixed(0)}mW`);
    }
  }
}