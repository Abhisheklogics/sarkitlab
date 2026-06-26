"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const KB       = 1.380649e-23;
const Q_CHARGE = 1.602176634e-19;
const KB_Q     = KB / Q_CHARGE;

const T_NOM_K  = 300.15;

const IS_F     = 1.8e-14;
const IS_R     = 3.6e-13;
const N_F      = 1.0;
const N_R      = 1.2;
const BETA_F   = 220;
const BETA_R   = 4.0;
const VA       = 120.0;
const VAR      = 8.0;
const IKF      = 0.025;
const IKR      = 0.003;
const ISE      = 4.0e-13;
const ISC      = 2.5e-12;
const NE       = 1.45;
const NC       = 1.9;
const RE       = 0.4;
const RC_OHMIC = 8.0;
const RB_MAX   = 250.0;
const RB_MIN   = 12.0;
const IRB      = 8e-5;
const CJE0     = 28e-12;
const CJC0     = 9e-12;
const VJE      = 0.72;
const VJC      = 0.68;
const MJE      = 0.34;
const MJC      = 0.32;
const TF       = 380e-12;
const TR       = 35e-9;
const XTI      = 3.1;
const XTB      = 0.0;
const EG       = 1.11;

const VCEO_MAX    = 45.0;
const VCBO_MAX    = 50.0;
const VEBO_MAX    = 5.0;
const IC_MAX      = 0.100;
const IB_MAX      = 0.005;
const PD_MAX      = 0.500;
const TJ_MAX      = 150.0;
const THETA_JA    = 180.0;
const C_THERMAL   = 0.002;
const TAU_THERMAL = C_THERMAL * THETA_JA;

const AVLN_N     = 4.0;
const AVLN_SCALE = 0.002;

const GMIN     = 1e-12;
const MAX_EXP  = 40.0;
const MIN_EXP  = -40.0;
const I_LEAK_CE = 5e-9;
const I_LEAK_BE = 1e-10;

const BASE_ALIASES      = ["B","b","base","Base","BASE","1"];
const COLLECTOR_ALIASES = ["C","c","collector","Collector","COLLECTOR","3"];
const EMITTER_ALIASES   = ["E","e","emitter","Emitter","EMITTER","2"];

function findPin(solver, comp, aliases) {
  for (const a of aliases) {
    const n = solver.findNet(comp.id, a);
    if (n) return n;
  }
  return null;
}

function safeExp(x) {
  return Math.exp(Math.max(MIN_EXP, Math.min(MAX_EXP, x)));
}

function thermalVoltage(T_K) {
  return KB_Q * Math.max(200, Math.min(600, T_K));
}

function tempScaleIS(IS, T_K) {
  const ratio = Math.max(0.5, T_K / T_NOM_K);
  return IS
    * Math.pow(ratio, XTI)
    * safeExp((EG / KB_Q) * (1.0 / T_NOM_K - 1.0 / T_K));
}

function tempScaleBeta(beta, T_K) {
  if (XTB === 0.0) return beta;
  return beta * Math.pow(Math.max(0.5, T_K / T_NOM_K), XTB);
}

function dynamicRb(Ib_abs) {
  return RB_MIN + (RB_MAX - RB_MIN) * IRB / (Ib_abs + IRB);
}

function junctionCap(Cj0, Vj, mj, Vbias, vt) {
  const Vmax = 0.95 * Vj;
  if (Vbias >= Vmax) {
    const Cmax = Cj0 * Math.pow(1.0 - Vmax / Vj, -mj);
    const slope = mj * Cmax / Math.max(Vj - Vmax, 1e-6);
    return Math.max(Cj0, Cmax + slope * (Vbias - Vmax));
  }
  if (Vbias < -5.0 * Vj) {
    return Cj0 * Math.pow(1.0 + 5.0, -mj);
  }
  return Cj0 * Math.pow(Math.max(1e-9, 1.0 - Vbias / Vj), -mj);
}

function betaRolloff(beta_f, If_abs, Ir_abs, IS_f) {
  const ic_norm = If_abs / (beta_f * IS_f + 1e-30);
  const low_current_factor = Math.sqrt(Math.max(ic_norm, 1e-6) / (1.0 + Math.max(ic_norm, 1e-6)));
  const hf_factor = 1.0 / Math.max(1.0, If_abs / IKF);
  return beta_f * low_current_factor * hf_factor;
}

function avalancheMult(vCB, vt) {
  if (vCB <= 0.0) return 1.0;
  const ratio = Math.min(vCB / VCBO_MAX, 0.99);
  return 1.0 + AVLN_SCALE * Math.pow(ratio, AVLN_N);
}

function gpModel(vBE, vBC, IS_f, IS_r, beta_f_0, beta_r, vt, M_avln) {
  const expBE  = safeExp(vBE / (N_F * vt));
  const expBC  = safeExp(vBC / (N_R * vt));
  const expBEe = safeExp(vBE / (NE  * vt));
  const expBCc = safeExp(vBC / (NC  * vt));

  const If_ideal = IS_f * (expBE - 1.0);
  const Ir_ideal = IS_r * (expBC - 1.0);

  const q1  = 1.0 + Math.max(0.0, vBE) / VA + Math.max(0.0, -vBC) / VAR;
  const q2f = Math.abs(If_ideal) / IKF;
  const q2r = Math.abs(Ir_ideal) / IKR;
  const qb  = q1 / 2.0 + Math.sqrt(Math.pow(q1 / 2.0, 2) + q2f + q2r);

  const If_transport = If_ideal / qb;
  const Ir_transport = Ir_ideal / qb;

  const beta_f_eff = betaRolloff(beta_f_0, Math.abs(If_ideal), Math.abs(Ir_ideal), IS_f);

  const Ic_main = (If_transport - Ir_transport) * M_avln;

  const dIf_dvBE  = (IS_f * expBE)  / (N_F * vt);
  const dIr_dvBC  = (IS_r * expBC)  / (N_R * vt);
  const dIbe_dvBE = (ISE  * expBEe) / (NE  * vt);
  const dIbc_dvBC = (ISC  * expBCc) / (NC  * vt);

  const dqb_dvBE = (dIf_dvBE / IKF) / (2.0 * qb) + 1.0 / VA / (2.0);
  const dqb_dvBC = (dIr_dvBC / IKR) / (2.0 * qb) + 1.0 / VAR / (2.0);

  const gm_f = M_avln * (dIf_dvBE * qb - If_ideal * dqb_dvBE) / (qb * qb) + GMIN;
  const gm_r = M_avln * (dIr_dvBC * qb - Ir_ideal * dqb_dvBC) / (qb * qb) + GMIN;

  const Gbe_base  = dIf_dvBE / Math.max(beta_f_eff, 1.0) + dIbe_dvBE + GMIN;
  const Gbc_base  = dIr_dvBC / Math.max(beta_r, 1.0)     + dIbc_dvBC + GMIN;

  const Ibe_dc = If_ideal / Math.max(beta_f_eff, 1.0)
               + ISE * (safeExp(vBE / (NE * vt)) - 1.0)
               + I_LEAK_BE;
  const Ibc_dc = Ir_ideal / Math.max(beta_r, 1.0)
               + ISC * (safeExp(vBC / (NC * vt)) - 1.0);

  return {
    If_ideal, Ir_ideal, Ic_main, qb,
    gm_f, gm_r,
    Gbe_base, Gbc_base,
    Ibe_dc, Ibc_dc,
    beta_f_eff,
    expBE, expBC,
    dIf_dvBE, dIr_dvBC,
  };
}

export default class NPNTransistorModel {

  static solve(comp, electrical, solver) {
    const netB = findPin(solver, comp, BASE_ALIASES);
    const netC = findPin(solver, comp, COLLECTOR_ALIASES);
    const netE = findPin(solver, comp, EMITTER_ALIASES);
    if (!netB || !netC || !netE) return;

    const vB = electrical.netVoltage.get(netB) ?? 0.0;
    const vC = electrical.netVoltage.get(netC) ?? 0.0;
    const vE = electrical.netVoltage.get(netE) ?? 0.0;

    const inst   = comp.instance;
    const T_K    = Math.max(250.0, Math.min(500.0, T_NOM_K + (inst?._tempRise ?? 0.0)));
    const vt     = thermalVoltage(T_K);
    const IS_f   = tempScaleIS(IS_F, T_K);
    const IS_r   = tempScaleIS(IS_R, T_K);
    const beta_f = Math.max(1.0, tempScaleBeta(comp.beta ?? inst?.beta ?? BETA_F, T_K));
    const beta_r = Math.max(1.0, tempScaleBeta(BETA_R, T_K));

    const Ib_prev_abs = Math.max(0.0, Math.abs(inst?._lastIb ?? 0.0));
    const Rb = dynamicRb(Ib_prev_abs);

    const vBE_raw = vB - vE;
    const vBC_raw = vB - vC;
    const vCB_raw = vC - vB;

    const vBE_prev = solver._junctionV?.get(`${comp.id}_be`) ?? Math.max(0.0, vBE_raw);
    const vBC_prev = solver._junctionV?.get(`${comp.id}_bc`) ?? Math.min(0.0, vBC_raw);

    let vBE_lim = limitJunctionVoltage(vBE_raw, vBE_prev, N_F, IS_f);
    let vBC_lim = limitJunctionVoltage(vBC_raw, vBC_prev, N_R, IS_r);

    vBE_lim = Math.max(-(VEBO_MAX * 0.9), Math.min(MAX_EXP * N_F * vt, vBE_lim));
    vBC_lim = Math.max(MIN_EXP * N_R * vt, Math.min(MAX_EXP * N_R * vt, vBC_lim));

    if (vBE_lim < -(VEBO_MAX * 0.85)) {
      if (inst) inst._ebeBreakdown = true;
    }

    solver._junctionV?.set(`${comp.id}_be`, vBE_lim);
    solver._junctionV?.set(`${comp.id}_bc`, vBC_lim);

    const vCB_fwd = Math.max(0.0, vC - vE);
    const M_avln  = avalancheMult(vCB_fwd, vt);

    const gp = gpModel(vBE_lim, vBC_lim, IS_f, IS_r, beta_f, beta_r, vt, M_avln);

    const Ic_op    = gp.Ic_main + I_LEAK_CE;
    const vCE_now  = vC - vE;
    const Gce_early = Math.abs(Ic_op) / Math.max(VA, 1.0) + GMIN;

    const Ibe_eq_val = gp.Ibe_dc - gp.Gbe_base * vBE_lim;
    const Ibc_eq_val = gp.Ibc_dc - gp.Gbc_base * vBC_lim;
    const Ice_eq_val = Ic_op     - Gce_early    * vCE_now
                     - gp.gm_f   * vBE_lim
                     + gp.gm_r   * vBC_lim;

    const Gb_rb = 1.0 / Math.max(Rb, RB_MIN);

    const Gbe_with_re = RE > 1e-6
      ? 1.0 / (1.0 / Math.max(gp.Gbe_base, GMIN) + RE)
      : gp.Gbe_base;
    const Gce_with_rc = RC_OHMIC > 1e-6
      ? 1.0 / (1.0 / Math.max(Gce_early, GMIN) + RC_OHMIC)
      : Gce_early;

    const Ibe_eq_re = RE > 1e-6
      ? Ibe_eq_val * (Gbe_with_re / Math.max(gp.Gbe_base, GMIN))
      : Ibe_eq_val;
    const Ice_eq_rc = RC_OHMIC > 1e-6
      ? Ice_eq_val * (Gce_with_rc / Math.max(Gce_early, GMIN))
      : Ice_eq_val;

    electrical.circuits.push({
      id:      `${comp.id}_bjt`,
      type:    "TRANSISTOR_CE",
      a:       null,
      b:       null,
      _stamps: [
        { a: netB, b: netE, g: Gbe_with_re },
        { a: netB, b: netC, g: gp.Gbc_base },
        { a: netC, b: netE, g: Gce_with_rc },
        { a: netB, b: netE, g: Gb_rb        },

        { a: netC, b: netE, ctrlA: netB, ctrlB: netE, gm:  gp.gm_f },
        { a: netC, b: netE, ctrlA: netB, ctrlB: netC, gm: -gp.gm_r },

        { a: netB, b: netE, i: -Ibe_eq_re },
        { a: netB, b: netC, i: -Ibc_eq_val },
        { a: netC, b: netE, i: -Ice_eq_rc  },
      ],
    });

    const Cbe_diff = TF * gp.gm_f;
    const Cbe_junc = junctionCap(CJE0, VJE, MJE, Math.min(vBE_lim, 0.95 * VJE), vt);
    const Cbe_total = Math.max(0.0, Cbe_diff + Cbe_junc);

    const Ir_abs    = Math.abs(gp.Ir_ideal);
    const Cbc_diff  = TR * Ir_abs / Math.max(vt, 1e-6);
    const Cbc_junc  = junctionCap(CJC0, VJC, MJC, Math.min(vBC_lim, 0.95 * VJC), vt);
    const Cbc_total = Math.max(0.0, Cbc_diff + Cbc_junc);

    const sat_depth = Math.max(0.0, Math.min(1.0, (gp.If_ideal - gp.Ir_ideal) / (Math.abs(gp.If_ideal) + 1e-15)));
    const Cbc_sat_boost = sat_depth > 0.0 ? Cbc_total * (1.0 + 5.0 * sat_depth) : Cbc_total;

    if (Cbe_total > 1e-18 && solver.dt > 0) {
      const capId = `${comp.id}_cbe`;
      const hist  = solver._capState?.get(capId);
      const Vprev = hist?.V ?? vBE_lim;
      const Iprev = hist?.I ?? 0.0;
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

    if (Cbc_sat_boost > 1e-18 && solver.dt > 0) {
      const capId = `${comp.id}_cbc`;
      const hist  = solver._capState?.get(capId);
      const Vprev = hist?.V ?? vBC_lim;
      const Iprev = hist?.I ?? 0.0;
      const Geq   = (2.0 * Cbc_sat_boost) / solver.dt;
      electrical.circuits.push({
        id:            capId,
        type:          "CAPACITOR",
        a:             netB,
        b:             netC,
        capacitance:   Cbc_sat_boost,
        _companionCap: { Geq, Ieq: Geq * Vprev + Iprev },
      });
    }

    if (inst) {
      inst._nets     = { B: netB, C: netC, E: netE };
      inst._gp_state = {
        If_ideal: gp.If_ideal,
        Ir_ideal: gp.Ir_ideal,
        Ic_main:  gp.Ic_main,
        qb:       gp.qb,
        vBE:      vBE_lim,
        vBC:      vBC_lim,
        vt,
        T_K,
        beta_f_eff: gp.beta_f_eff,
        IS_f,
        M_avln,
        sat_depth,
      };
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { B, C, E } = inst._nets;
    const vB  = electrical.netVoltage.get(B) ?? 0.0;
    const vC  = electrical.netVoltage.get(C) ?? 0.0;
    const vE  = electrical.netVoltage.get(E) ?? 0.0;
    const vBE = vB - vE;
    const vCE = vC - vE;
    const vBC = vB - vC;
    const vCB = vC - vB;

    const gp           = inst._gp_state ?? {};
    const Ic_main      = gp.Ic_main ?? 0.0;
    const beta_f_eff   = gp.beta_f_eff ?? BETA_F;
    const vt           = gp.vt ?? thermalVoltage(T_NOM_K);
    const sat_depth    = gp.sat_depth ?? 0.0;

    const Ic = Math.max(0.0, Ic_main + I_LEAK_CE);
    const Ib = Math.max(0.0, Ic / Math.max(beta_f_eff, 1.0));
    const Ie = Ic + Ib;

    inst._lastIb = Ib;

    const hFE   = Ib > 1e-15 ? Math.min(Ic / Ib, 5000.0) : 0.0;
    const Pdiss = Math.max(0.0,
      Ic * Math.max(0.0, vCE) +
      Ib * Math.max(0.0, vBE)
    );

    const dt    = solver.dt ?? 1e-3;
    const alpha = 1.0 - Math.exp(-dt / Math.max(TAU_THERMAL, 1e-6));
    inst._tempRise = (inst._tempRise ?? 0.0) * (1.0 - alpha) + Pdiss * THETA_JA * alpha;
    const T_K  = T_NOM_K + (inst._tempRise ?? 0.0);
    const T_C  = T_K - 273.15;

    const cbeId = `${comp.id}_cbe`;
    const cbcId = `${comp.id}_cbc`;
    for (const capId of [cbeId, cbcId]) {
      const capBranch = electrical.circuits.find(b => b.id === capId);
      if (capBranch?._companionCap) {
        const Va   = electrical.netVoltage.get(capBranch.a) ?? 0.0;
        const Vb   = electrical.netVoltage.get(capBranch.b) ?? 0.0;
        const Icap = capBranch.current ?? 0.0;
        const Vc   = (Va - Vb) - Icap * (capBranch.ohms ?? 0.0);
        if (!solver._capState) solver._capState = new Map();
        solver._capState.set(capId, { V: Vc, I: Icap });
      }
    }

    let region;
    if (vBE < 0.45 && vBC < 0.45)          region = "cutoff";
    else if (vBE >= 0.45 && vBC >= 0.3)    region = "saturation";
    else if (vBE >= 0.45)                   region = "active";
    else                                    region = "reverse";

    const vce_sat_est = (region === "saturation") ? (0.1 + 0.2 * sat_depth) : null;

    const soaViolation  = vCE > VCEO_MAX || vCB > VCBO_MAX || Math.abs(vBE) > VEBO_MAX * 1.1;
    const icViolation   = Ic > IC_MAX * 1.1;
    const ibViolation   = Ib > IB_MAX * 1.1;
    const pdViolation   = Pdiss > PD_MAX;
    const tjViolation   = T_C > TJ_MAX;
    const thermalRunaway = T_C > (TJ_MAX - 20.0) && Pdiss > PD_MAX * 0.7;
    const avalancheActive = (gp.M_avln ?? 1.0) > 1.05;

    if ((soaViolation || icViolation || pdViolation || tjViolation) && !inst._warned) {
      inst._warned = true;
      console.warn(
        `[NPN] ${comp.id} SOA violation: ` +
        `Ic=${(Ic*1000).toFixed(1)}mA VCE=${vCE.toFixed(2)}V ` +
        `Pd=${(Pdiss*1000).toFixed(0)}mW T=${T_C.toFixed(0)}°C`
      );
    }
    if (thermalRunaway && !inst._thermalWarnSent) {
      inst._thermalWarnSent = true;
      console.warn(`[NPN] ${comp.id} THERMAL RUNAWAY T=${T_C.toFixed(0)}°C Pd=${(Pdiss*1000).toFixed(0)}mW`);
    }
    if (inst._ebeBreakdown && !inst._ebeWarnSent) {
      inst._ebeWarnSent = true;
      console.warn(`[NPN] ${comp.id} VBE reverse breakdown! VBE=${vBE.toFixed(2)}V`);
    }

    inst.setState?.(region);
    inst.setValues?.({
      vbe:            +vBE.toFixed(4),
      vce:            +vCE.toFixed(4),
      vbc:            +vBC.toFixed(4),
      ib:             +Ib.toFixed(9),
      ic:             +Ic.toFixed(9),
      ie:             +Ie.toFixed(9),
      hfe:            +hFE.toFixed(1),
      beta_f_eff:     +beta_f_eff.toFixed(1),
      pdiss:          +Pdiss.toFixed(4),
      temp_c:         +T_C.toFixed(1),
      region,
      sat_depth:      +sat_depth.toFixed(3),
      vce_sat:        vce_sat_est != null ? +vce_sat_est.toFixed(3) : null,
      avalanche:      avalancheActive,
      thermalRunaway,
      soaViolation,
    });
  }
}