

const MAX_CURRENT     = 500;
const FLYBACK_THRESH  = 50;
const FLYBACK_HOLD_MS = 80;
const GMIN            = 1e-12;

export default class InductorModel {

  static solve(comp, electrical, solver) {
    const A = solver.findNet(comp.id, "A");
    const B = solver.findNet(comp.id, "B");
    if (!A || !B) return;

    const inst = comp.instance;
    const dt   = Math.max(1e-9, solver._dt ?? 1e-4);

    const L_nom = Math.max(1e-9, inst?.inductance ?? 10e-3);
    const Isat  = inst?.saturationCurrent ?? _defaultIsat(L_nom);
    const DCR   = Math.max(0, inst?.dcr ?? _defaultDCR(L_nom));

    const branchId  = comp.id;
    const prevState = solver._indState?.get(branchId);
    const Iprev     = _clamp(prevState?.I ?? 0, MAX_CURRENT);
    const Vprev     = prevState?.V ?? 0;

    const L_eff = _satL(L_nom, Isat, Iprev);
    const Req   = (2.0 * L_eff) / dt;
    const Veq   = _clamp(Req * Iprev + Vprev, 1e6);

    const branch = {
      id:         branchId,
      type:       "INDUCTOR",
      a:          A,
      b:          B,
      inductance: L_nom,
      _Leff:      L_eff,
      _Iprev:     Iprev,
    };
    electrical.circuits.push(branch);

    if (inst) {
      inst._nets   = { A, B };
      inst._branch = branch;
      inst._ReqEff = Math.max(Req, 1e-6);
      inst._Veq    = Veq;
    }

    if (DCR > 1e-6) {
      electrical.circuits.push({
        id:   `${comp.id}_dcr`,
        type: "RESISTOR",
        a:    A,
        b:    B,
        ohms: DCR,
      });
    }

    const Va_now = electrical.netVoltage.get(A) ?? 0;
    const Vb_now = electrical.netVoltage.get(B) ?? 0;
    const Vab_now = Va_now - Vb_now;

    const omega_est = (Math.abs(Vprev) > 0.1 && Math.abs(Iprev) > 1e-6)
      ? Math.abs(Vprev) / (L_eff * Math.abs(Iprev))
      : 0;

    if (omega_est > 2 * Math.PI * 100) {
      const coreQ  = Math.max(1, inst?.coreQ ?? 40);
      const R_core = Math.min(1e6, coreQ * omega_est * L_eff);
      electrical.circuits.push({
        id:   `${comp.id}_core`,
        type: "RESISTOR",
        a:    A,
        b:    B,
        ohms: Math.max(1e3, R_core),
      });
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;

    const { A, B } = inst._nets;
    const Va  = electrical.netVoltage.get(A) ?? 0;
    const Vb  = electrical.netVoltage.get(B) ?? 0;
    const Vab = Va - Vb;

    const L_nom = Math.max(1e-9, inst.inductance ?? 10e-3);
    const Isat  = inst.saturationCurrent ?? _defaultIsat(L_nom);
    const DCR   = Math.max(0, inst.dcr ?? _defaultDCR(L_nom));

    const branchId = comp.id;
    const branch   = inst._branch;

    const prevState = solver._indState?.get(branchId);
    const Iprev     = _clamp(prevState?.I ?? 0, MAX_CURRENT);
    const L_eff     = branch?._Leff ?? _satL(L_nom, Isat, Iprev);
    const In        = _clamp(branch?.current ?? Iprev, MAX_CURRENT);

    solver._indState?.set(branchId, { I: In, V: Vab });

    inst.Icurrent     = In;
    inst.Vcurrent     = Vab;
    inst.Leffective   = L_eff;
    inst.energyStored = 0.5 * L_eff * In * In;
    inst.power        = Math.abs(Vab * In);
    inst.isSaturated  = Math.abs(In) >= Isat * 0.9;

    inst.updateCurrent?.(In);

    const dt = Math.max(1e-9, solver._dt ?? 1e-4);
    const dI = In - Iprev;
    if (Math.abs(Iprev) > 0.01 && dI < -1e-6) {
      const Vemf = L_nom * Math.abs(dI) / dt;
      if (Vemf > FLYBACK_THRESH) {
        console.warn(`[InductorModel] FLYBACK ${comp.id}: back-EMF ~${Vemf.toFixed(1)}V`);
        inst.flashFlyback?.();
        if (!solver._flybackNets) solver._flybackNets = new Map();
        const until = Date.now() + FLYBACK_HOLD_MS;
        solver._flybackNets.set(A, until);
        solver._flybackNets.set(B, until);
      }
    }

    if (Math.abs(In) >= Isat)
      console.warn(`[InductorModel] SATURATION ${comp.id}: I=${In.toFixed(3)}A Leff=${(L_eff / L_nom * 100).toFixed(0)}%`);

    const P_dcr = In * In * DCR;
    if (P_dcr > 1.0)
      console.warn(`[InductorModel] THERMAL ${comp.id}: DCR loss=${P_dcr.toFixed(3)}W`);
  }

  static reset(comp, solver) {
    if (solver?._indState) solver._indState.delete(comp.id);
    if (comp.instance) {
      Object.assign(comp.instance, {
        Icurrent: 0, Vcurrent: 0,
        energyStored: 0, isSaturated: false,
      });
    }
  }
}

function _satL(L_nom, Isat, I) {
  const absI = Math.abs(I);
  if (absI <= Isat * 0.8) return L_nom;
  if (absI >= Isat * 3.0) return L_nom * 0.01;
  const ratio = (absI - Isat * 0.8) / (Isat * 2.2);
  return Math.max(L_nom * 0.01, L_nom * (1.0 - ratio * Math.exp(2.0 * ratio)));
}

function _clamp(v, limit) {
  return Math.max(-limit, Math.min(limit, v));
}

function _defaultDCR(L) {
  if (L >= 10)     return 100.0;
  if (L >= 1)      return 10.0;
  if (L >= 100e-3) return 2.0;
  if (L >= 10e-3)  return 0.5;
  if (L >= 1e-3)   return 0.1;
  if (L >= 100e-6) return 0.03;
  return 0.01;
}

function _defaultIsat(L) {
  if (L >= 10)     return 0.5;
  if (L >= 1)      return 1.0;
  if (L >= 100e-3) return 2.0;
  if (L >= 10e-3)  return 5.0;
  if (L >= 1e-3)   return 10.0;
  if (L >= 100e-6) return 20.0;
  return 50.0;
}