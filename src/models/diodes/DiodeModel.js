"use strict";

import { limitJunctionVoltage } from "../../../engine/circuitsolver.js";

const VT          = 0.02585;   // thermal voltage at 300.15 K
const MAX_EXP_ARG = 40;
const GMIN        = 1e-12;
const T_NOM       = 300.15;    // 27 °C in Kelvin
const I_CONDUCT   = 1e-4;      // threshold to call diode "conducting"

// ─── Temperature-scaled saturation current (SPICE Level-1) ────────────────
// Is(T) = Is_nom * (T/Tnom)^3 * exp( Eg/(n*Vt) * (1 - Tnom/T) )
// Uses Si bandgap 1.1 eV
function _tempScaleIs(Is, N, T) {
  const ratio = T / T_NOM;
  return Is * Math.pow(ratio, 3) * Math.exp((1.1 / (N * VT)) * (1 - 1 / ratio));
}

// ─── NR linearization of diode exponential ────────────────────────────────
// Returns conductance Gd and current source Ieq for the companion model:
//   I = Gd * Vd + Ieq
// with voltage limiting to prevent exp() overflow.
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

    const Is = _tempScaleIs(Is_nom, N, T);
    const Va = electrical.netVoltage.get(A) ?? 0;
    const Vk = electrical.netVoltage.get(K) ?? 0;
    const Vd = Va - Vk;

    const Vold = solver._junctionV?.get(comp.id) ?? 0;

    let Gd, Ieq, Vd_c;

    if (Number.isFinite(Vbr) && Vd < -Vbr) {
      // ── Breakdown region ───────────────────────────────────────────────
      // SPICE stamp: I = Ibr + (|Vd| - Vbr) / Rz  (reverse current, negative)
      // Companion:   Gd = 1/Rs,  Ieq = -(Ibr + Gd*Vbr)
      // This gives correct NR stamp: I_branch = Gd*Vd + Ieq → negative at breakdown
      const Rz_eff = Math.max(Rs, 0.1);
      Gd  = 1.0 / Rz_eff + GMIN;
      // FIX: correct SPICE breakdown Ieq
      // At Vd = -Vbr: I should be -Ibr
      // At Vd = -(Vbr + dV): I = -(Ibr + dV/Rz)
      // → Ieq = -(Ibr + Gd_pure * Vbr)  where Gd_pure = 1/Rz
      Ieq = -(Ibr + (1.0 / Rz_eff) * Vbr);
      Vd_c = Vd;
    } else {
      const r = _diodeLinearize(Vd, Is, N, Vold);
      Gd = r.Gd; Ieq = r.Ieq; Vd_c = r.Vlim;
    }

    solver._junctionV?.set(comp.id, Vd_c);

    // Store branch ref on comp for O(1) access in update() — avoids O(n) find()
    const branch = {
      id: comp.id, type: "DIODE",
      a: A, b: K, Is, N, ohms: Rs,
      _Vbr: Vbr, _Ibr: Ibr,
      _diodeNR: { Gd, Ieq },
    };
    electrical.circuits.push(branch);
    comp._branch = branch;   // FIX: direct ref, no find() needed in update()

    // ── Junction capacitance (depletion cap, SPICE CJ model) ──────────────
    if ((inst?.junctionCapacitance ?? 0) > 0 && solver._dt) {
      const Cj0    = inst.junctionCapacitance;
      const Vj_pot = inst?.junctionPotential ?? 0.75;
      const Mj     = inst?.gradingCoeff ?? 0.5;
      // Clamp Vcj to keep depletion formula finite (avoid Vcj → Vj_pot)
      const Vcj    = Math.min(Vd, Vj_pot * 0.95);
      const Cj     = Cj0 / Math.pow(Math.max(1 - Vcj / Vj_pot, 0.05), Mj);
      const capId  = `${comp.id}_cj`;
      const hist   = solver._capState?.get(capId);
      // FIX: Vprev init to 0, not Vd — avoids circular dependency on first tick
      const Vprev  = hist?.V ?? 0;
      const Iprev  = hist?.I ?? 0;
      const Geq    = (2.0 * Cj) / Math.max(solver._dt, 1e-15);
      const capBranch = {
        id: capId, type: "CAPACITOR",
        a: A, b: K, capacitance: Cj, ohms: 1e-6,
        _companionCap: { Geq, Ieq: Geq * Vprev + Iprev },
      };
      electrical.circuits.push(capBranch);
      comp._capBranch = capBranch;  // FIX: direct ref
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

    // FIX: use direct branch ref instead of O(n) find()
    const branch = comp._branch;
    if (!branch) return;

    const Is  = branch.Is  ?? 1e-14;
    const N   = branch.N   ?? 1.0;
    const Vbr = branch._Vbr ?? Infinity;
    const Ibr = branch._Ibr ?? 1e-3;
    const Rs  = Math.max(0.1, branch.ohms ?? 0.5);

    // FIX: read current from solver result (branch.current) instead of
    // re-computing — solver's converged value is the ground truth.
    // Re-computing causes mismatch that makes battery see wrong load current.
    let I = branch.current ?? 0;

    // Sanity clamp: if branch.current not yet set (first tick), fallback compute
    if (!Number.isFinite(I)) {
      if (Number.isFinite(Vbr) && Vd < -Vbr) {
        I = -(Ibr + (Math.abs(Vd) - Vbr) / Math.max(Rs, 0.1));
      } else {
        const nVt  = N * VT;
        const Vd_c = Math.max(-10 * nVt, Math.min(MAX_EXP_ARG * nVt, Vd));
        I = Math.max(0, Is * (Math.exp(Vd_c / nVt) - 1.0));
      }
    }

    // ── Junction capacitor state update ────────────────────────────────────
    const capBranch = comp._capBranch;
    if (capBranch) {
      const Ic = capBranch.current ?? 0;
      if (!solver._capState) solver._capState = new Map();
      solver._capState.set(capBranch.id, {
        V: Vd - Ic * (capBranch.ohms ?? 1e-6),
        I: Ic,
      });
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