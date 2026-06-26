"use strict";

import { MODEL_REGISTRY } from "../src/models/index.js";

const GMIN         = 1e-12;
const G_GND        = 1e6;
const MAX_ITER     = 150;
const CONV_TOL     = 1e-6;
const STALL_RATIO  = 0.9995;
const MAX_VOLTAGE  = 1e4;
const DEFAULT_DT   = 1e-4;
const SOURCE_STEPS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0];

const VT          = 0.02585;
const IS_DEFAULT  = 1e-14;
const N_DEFAULT   = 1.0;
const MAX_EXP_ARG = 40;

const HISTORY_TYPES = new Set(["CAPACITOR", "INDUCTOR", "SENSOR_OUT"]);

const R_FLOOR = {
  WIRE             : 1e-6,
  RESISTOR         : 1e-9,
  CAPACITOR        : 1e-6,
  INDUCTOR         : 1e-6,
  DIODE            : 0.5,
  LED              : 8.0,
  LED_SEGMENT      : 8.0,
  SCHOTTKY         : 0.1,
  ZENER            : 0.5,
  TRANSISTOR_BE    : 0.05,
  TRANSISTOR_CE    : 0.02,
  MOSFET_DS        : 0.005,
  JFET             : 0.01,
  BATTERY          : 1e-3,
  VOLTAGE_SOURCE   : 1e-4,
  CURRENT_SOURCE   : 1e12,
  REGULATOR        : 1e-3,
  IC_OUTPUT        : 10,
  SWITCH           : 1e-4,
  TRANSFORMER      : 1e-3,
  HEATER           : 33,
  PULLUP           : 1000,
  PULLDOWN         : 1000,
  DO_DRIVER        : 50,
  SENSOR_RS        : 50,
  SENSOR_RL        : 50,
  SENSOR_LOAD      : 100,
  DEFAULT          : 1e-9,
  BREADBOARD_SHORT : 1e-4,
  INTERNAL_SHORT   : 1e-3,
  POWER_SOURCE     : 1e-4,
  ARDUINO_PIN_OUT  : 35,
  INPUT_HIGH_Z     : 1e8,
};

const RECTIFYING = new Set([
  "DIODE","LED","LED_SEGMENT","SCHOTTKY","ZENER","TRANSISTOR_BE","TRANSISTOR_BC",
]);

const DIODE_TYPES = new Set(["DIODE","LED_SEGMENT","SCHOTTKY"]); // "LED" hatao

const VOLTAGE_SOURCE_TYPES = new Set([
  "BATTERY","VOLTAGE_SOURCE","REGULATOR","POWER_SOURCE","IC_OUTPUT",
]);

class SparseMatrix {
  constructor(n) { this.n = n; this._tri = []; }

  add(row, col, val) {
    if (row < 0 || col < 0 || row >= this.n || col >= this.n) return;
    if (val === 0) return;
    this._tri.push({ r: row, c: col, v: val });
  }

  factor() {
    const n = this.n; const tri = this._tri;
    const cols = Array.from({ length: n }, () => new Map());
    for (const { r, c, v } of tri) { const m = cols[c]; m.set(r, (m.get(r) ?? 0) + v); }
    const Ap = new Int32Array(n + 1);
    let nnz = 0;
    for (let j = 0; j < n; j++) nnz += cols[j].size;
    const Ai = new Int32Array(nnz); const Ax = new Float64Array(nnz); let ptr = 0;
    for (let j = 0; j < n; j++) {
      Ap[j] = ptr;
      for (const [r, v] of Array.from(cols[j]).sort((a, b) => a[0] - b[0])) { Ai[ptr] = r; Ax[ptr] = v; ptr++; }
    }
    Ap[n] = ptr;
    const perm = new Int32Array(n); const pinv = new Int32Array(n).fill(-1);
    const maxFill = Math.min(Math.max(nnz * 20 + n * 10, n * 4), n * n);
    const Lp = new Int32Array(n+1); const Up = new Int32Array(n+1);
    const Li = new Int32Array(maxFill); const Lx = new Float64Array(maxFill);
    const Ui = new Int32Array(maxFill); const Ux = new Float64Array(maxFill);
    let Lptr = 0, Uptr = 0;
    const x = new Float64Array(n); const xi = new Int32Array(n); const flag = new Uint8Array(n);
    for (let j = 0; j < n; j++) {
      let top = n; flag[j] = 1;
      for (let p = Ap[j]; p < Ap[j+1]; p++) top = _reach(Ai[p], pinv, Lp, Li, flag, xi, top);
      for (let p = Ap[j]; p < Ap[j+1]; p++) x[Ai[p]] = Ax[p];
      for (let idx = top; idx < n; idx++) {
        const i = xi[idx]; flag[i] = 0;
        if (pinv[i] < 0) continue;
        const pc = pinv[i]; const lii = _sparseGet(Lp, Li, Lx, pc, i);
        if (lii === 0) continue;
        const xv = x[i] / lii;
        for (let p = Lp[pc]+1; p < Lp[pc+1]; p++) x[Li[p]] -= Lx[p] * xv;
        x[i] = xv;
      }
      let pivRow = j, pivVal = Math.abs(x[j]);
      for (let idx = top; idx < n; idx++) { const i = xi[idx]; if (pinv[i] >= 0) continue; const v = Math.abs(x[i]); if (v > pivVal) { pivVal = v; pivRow = i; } }
      perm[j] = pivRow; pinv[pivRow] = j;
      Up[j] = Uptr;
      const ujj = x[pivRow] !== 0 ? x[pivRow] : 1e-18;
      Ui[Uptr] = j; Ux[Uptr] = ujj; Uptr++;
      for (let idx = top; idx < n; idx++) { const i = xi[idx]; if (pinv[i] >= 0 && pinv[i] < j && x[i] !== 0) { if (Uptr >= maxFill) break; Ui[Uptr] = pinv[i]; Ux[Uptr] = x[i]; Uptr++; } }
      Lp[j] = Lptr; Li[Lptr] = j; Lx[Lptr] = 1.0; Lptr++;
      for (let idx = top; idx < n; idx++) { const i = xi[idx]; if (pinv[i] < 0 && i !== pivRow && x[i] !== 0) { if (Lptr >= maxFill) break; Li[Lptr] = i; Lx[Lptr] = x[i] / ujj; Lptr++; } }
      for (let idx = top; idx < n; idx++) x[xi[idx]] = 0;
      x[pivRow] = 0; flag[j] = 0;
    }
    Lp[n] = Lptr; Up[n] = Uptr;
    this._lu = { Lp, Li, Lx, Up, Ui, Ux, perm, pinv, n };
    return this;
  }

  solve(rhs) {
    const { Lp, Li, Lx, Up, Ui, Ux, perm, n } = this._lu;
    const y = new Float64Array(n); const x = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = rhs[perm[i]];
    for (let j = 0; j < n; j++) { const yj = y[j]; if (yj === 0) continue; for (let p = Lp[j]+1; p < Lp[j+1]; p++) y[Li[p]] -= Lx[p] * yj; }
    for (let j = n-1; j >= 0; j--) {
      let diag = 1e-18;
      for (let p = Up[j]; p < Up[j+1]; p++) { if (Ui[p] === j) { diag = Ux[p]; break; } }
      const xj = y[j] / diag; x[j] = xj;
      for (let p = Up[j]; p < Up[j+1]; p++) { if (Ui[p] !== j) y[Ui[p]] -= Ux[p] * xj; }
    }
    return x;
  }
}

function _reach(i, pinv, Lp, Li, flag, xi, top) {
  const stack = [i];
  while (stack.length) {
    const node = stack[stack.length-1];
    if (!flag[node]) { flag[node] = 1; const pc = pinv[node]; if (pc >= 0) { for (let p = Lp[pc]; p < Lp[pc+1]; p++) if (!flag[Li[p]]) stack.push(Li[p]); } }
    else { stack.pop(); xi[--top] = node; }
  }
  return top;
}

function _sparseGet(Cp, Ci, Cx, col, row) {
  for (let p = Cp[col]; p < Cp[col+1]; p++) if (Ci[p] === row) return Cx[p];
  return 0;
}

export function junctionVcrit(Is, N) {
  const nVt = N * VT;
  return nVt * Math.log(nVt / (Math.SQRT2 * Math.max(Is, 1e-30)));
}

export function limitJunctionVoltage(Vnew, Vold, N, Is) {
  const nVt = N * VT;
  const Vcrit = junctionVcrit(Is, N);
  if (Vnew > Vcrit && Math.abs(Vnew - Vold) > 2 * nVt) {
    if (Vold > 0) { const arg = (Vnew - Vold) / nVt + 1.0; Vnew = arg > 0 ? Vold + nVt * Math.log(arg) : Vcrit; }
    else { Vnew = nVt * Math.log(Math.max(Vnew, 1e-30) / nVt); }
  }
  return Vnew;
}

function _diodeLinearize(Vd, Is, N, Vold) {
  const nVt = N * VT;
  let Vd_lim = Vd;
  if (Vold !== undefined && Number.isFinite(Vold)) Vd_lim = limitJunctionVoltage(Vd, Vold, N, Is);
  const Vd_c = Math.max(-10*nVt, Math.min(MAX_EXP_ARG*nVt, Vd_lim));
  const expVal = Math.exp(Vd_c / nVt);
  const Id = Is * (expVal - 1.0);
  const Gd = (Is * expVal) / nVt + GMIN;
  return { Gd, Ieq: Id - Gd * Vd_c, Vlim: Vd_c };
}

function _zenerLinearize(Vd, Is, N, Vz, Rz, Vold) {
  if (Vd >= 0) return _diodeLinearize(Vd, Is, N, Vold);
  const Vrev = -Vd; const Rz_eff = Math.max(Rz, 0.1); const Vknee = Vz * 0.8;
  if (Vrev < Vknee) { const Gleak = GMIN + (GMIN*100)*(Vrev/Math.max(Vknee,1e-9)); return { Gd: Gleak, Ieq: 0, Vlim: Vd }; }
  if (Vrev < Vz) { const t = (Vrev-Vknee)/Math.max(Vz-Vknee,1e-9); const ts = t*t*(3-2*t); const Gk = ts/Rz_eff; return { Gd: Gk+GMIN, Ieq: Gk*Vz*ts, Vlim: Vd }; }
  const Gd = 1.0/Rz_eff; return { Gd, Ieq: Gd*Vz, Vlim: Vd };
}

function _bjtEbersMoll(Vbe, Vbc, Is, Bf, Br, Vold_be, Vold_bc) {
  const nVt = VT;
  const Vbe_lim = limitJunctionVoltage(Math.max(-10*nVt, Math.min(MAX_EXP_ARG*nVt, Vbe)), Vold_be??0, 1.0, Is);
  const Vbc_lim = limitJunctionVoltage(Math.max(-10*nVt, Math.min(MAX_EXP_ARG*nVt, Vbc)), Vold_bc??0, 1.0, Is);
  const expBE = Math.exp(Vbe_lim/nVt); const expBC = Math.exp(Vbc_lim/nVt);
  const Is_r = Is/Math.max(Br,1e-3);
  const If_ = Is*(expBE-1.0); const Ir_ = Is_r*(expBC-1.0);
  const Ic = If_ - Ir_*(1.0+1.0/Math.max(Br,1e-3));
  const Ib = If_/Math.max(Bf,1e-3) + Ir_;
  const Gbe = Is*expBE/nVt+GMIN; const Gbc = Is_r*expBC/nVt+GMIN; const Gm = Is*expBE/nVt;
  return { Ic, Ib, Gbe, Gbc, Gm, Ieq_be: If_-Gbe*Vbe_lim, Ieq_bc: Ir_-Gbc*Vbc_lim, Vbe_lim, Vbc_lim };
}

function _mosfetIds(Vgs, Vds, Vth, Kp, Lambda) {
  const Vov = Vgs - Vth; const lam = Lambda??0.01;
  if (Vov <= 0) return { Ids: 0, Gds: GMIN, Gm: 0 };
  if (Vds < 0) { const VovR = -Vgs-Vth; if (VovR<=0) return {Ids:0,Gds:GMIN,Gm:0}; return { Ids: -Kp*(VovR*(-Vds)-0.5*Vds*Vds)*(1+lam*(-Vds)), Gds: Math.max(Kp*(VovR+Vds)*(1+lam*(-Vds)),GMIN), Gm: 0 }; }
  if (Vds >= Vov) { const Ids = 0.5*Kp*Vov*Vov*(1+lam*Vds); return { Ids, Gds: 0.5*Kp*Vov*Vov*lam+GMIN, Gm: Kp*Vov*(1+lam*Vds) }; }
  return { Ids: Kp*(Vov*Vds-0.5*Vds*Vds)*(1+lam*Vds), Gds: Kp*(Vov-Vds)*(1+lam*Vds)+GMIN, Gm: Kp*Vds*(1+lam*Vds) };
}

export default class CircuitSolver {

  constructor(registry, wireSystem, pinStates, simEngine) {
    if (!registry)  throw new TypeError("[CircuitSolver] registry required.");
    if (!pinStates) throw new TypeError("[CircuitSolver] pinStates required.");
    this.registry = registry; this.wireSystem = wireSystem;
    this.pinStates = pinStates; this.simEngine = simEngine;
    this._dt = DEFAULT_DT;
    this._lastCircuits = []; this._prevNetV = new Map(); this._prevBranchI = new Map();
    this.tonePins = new Set(); this._netCache = null; this._cachedNetlist = null;
    this._branchMap = new Map(); this._sourceScale = 1.0;
    this._capState = new Map(); this._indState = new Map();
    this._junctionV = new Map(); this._gminOverride = null;
    this._lastSolveTime = null;
  }

  setTimestep(dt) { this._dt = Math.max(1e-15, dt); }

  solve(electrical) {
    const now = performance.now();
    if (this._lastSolveTime != null) {
      const elapsed = (now - this._lastSolveTime) / 1000;
      this._dt = Math.max(1e-6, Math.min(elapsed, 0.1));
    }
    this._lastSolveTime = now;
    const netList = this.wireSystem?.lastNetlist;
    if (!netList) return;
    if (netList !== this._cachedNetlist) { this._netCache = new Map(); this._cachedNetlist = netList; }
    for (const comp of this.registry.getAll()) {
      if (comp.instance?._burned) { comp.instance._burned = false; comp.instance._overcurrentTicks = 0; }
    }
    const nets = Array.from(netList.nets.keys());
    const netToIdx = new Map(nets.map((id, i) => [id, i]));
    const n = nets.length;
    if (n === 0) return;
    const wireBranches = this.wireSystem?.wireBranches ?? [];
    if (electrical._batteryNEGs?.size > 0) {
      const allPOS = new Set();
      for (const [, info] of electrical._batteryNEGs) allPOS.add(info.POS);
      for (const [negNet] of electrical._batteryNEGs) { if (!allPOS.has(negNet)) electrical.gndNets.add(negNet); }
    }
    const converged = this._solveWithSourceStepping(electrical, nets, netToIdx, n, wireBranches);
    if (!converged) console.warn("[CircuitSolver] NR did not converge after source stepping.");
    for (const [net, v] of electrical.netVoltage) this._prevNetV.set(net, v);
    this._lastCircuits = electrical.circuits;
    this._finalize(electrical);
  }

  _solveWithSourceStepping(electrical, nets, netToIdx, n, wireBranches) {
    if (this._runNR(electrical, nets, netToIdx, n, wireBranches, 1.0)) { this._sourceScale = 1.0; return true; }
    for (const gmin of [1e-3, 1e-5, 1e-8, 1e-10]) {
      this._gminOverride = gmin;
      if (this._runNR(electrical, nets, netToIdx, n, wireBranches, 1.0)) { this._gminOverride = null; this._sourceScale = 1.0; return true; }
    }
    this._gminOverride = null;
    for (const scale of SOURCE_STEPS) {
      this._sourceScale = scale;
      if (this._runNR(electrical, nets, netToIdx, n, wireBranches, scale)) { this._sourceScale = 1.0; return true; }
    }
    this._sourceScale = 1.0;
    return this._runNR(electrical, nets, netToIdx, n, wireBranches, 1.0);
  }

  _runNR(electrical, nets, netToIdx, n, wireBranches, sourceScale) {
    let prevMaxDelta = Infinity;
    this._junctionV.clear();

    for (let iter = 0; iter < MAX_ITER; iter++) {
      electrical.circuits = [];
      for (const w of wireBranches) {
        if (!netToIdx.has(w.from) && !netToIdx.has(w.to)) continue;
        electrical.circuits.push({ id: `_wire_${w.from}_${w.to}`, type: "WIRE", a: netToIdx.has(w.from)?w.from:null, b: netToIdx.has(w.to)?w.to:null, ohms: Math.max(w.ohms??1e-3, R_FLOOR.WIRE) });
      }
      for (const comp of this.registry.getAll()) this._solveComponent(comp, electrical);
      this._stampCapacitors(electrical);
      this._stampInductors(electrical);
      this._stampDiodes(electrical);
      this._stampZeners(electrical);
      this._stampBJTs(electrical);
      this._stampMOSFETs(electrical);

      const gminEff = this._gminOverride ?? GMIN;
      const mat = new SparseMatrix(n);
      const B   = new Float64Array(n);

      for (const branch of electrical.circuits) {
        if (branch._stamps)      { for (const st of branch._stamps)       this._applyStamp(mat, B, netToIdx, st); continue; }
        if (branch._bjtStamps)   { for (const st of branch._bjtStamps)    this._applyStamp(mat, B, netToIdx, st); continue; }
        if (branch._mosfetStamps){ for (const st of branch._mosfetStamps) this._applyStamp(mat, B, netToIdx, st); continue; }

        const ia = netToIdx.get(branch.a);
        const ib = netToIdx.get(branch.b);
        if (ia === undefined && ib === undefined) continue;

        if (branch._companionCap) {
          const { Geq, Ieq } = branch._companionCap;
          if (ia !== undefined) { mat.add(ia,ia,Geq); B[ia] += Ieq; }
          if (ib !== undefined) { mat.add(ib,ib,Geq); B[ib] -= Ieq; }
          if (ia !== undefined && ib !== undefined) { mat.add(ia,ib,-Geq); mat.add(ib,ia,-Geq); }
          continue;
        }
        if (branch._companionInd) {
          const { Req, Veq } = branch._companionInd; const g = 1.0/Req;
          if (ia !== undefined) { mat.add(ia,ia,g); B[ia] += Veq*g; }
          if (ib !== undefined) { mat.add(ib,ib,g); B[ib] -= Veq*g; }
          if (ia !== undefined && ib !== undefined) { mat.add(ia,ib,-g); mat.add(ib,ia,-g); }
          continue;
        }
        if (branch._diodeNR) {
          const { Gd, Ieq } = branch._diodeNR;
          const RsEff  = Math.max(branch.ohms??0, R_FLOOR[branch.type]??R_FLOOR.DEFAULT);
          const Gtotal = 1.0/(1.0/Math.max(Gd,gminEff)+RsEff);
          const IeqEff = Ieq*(Gtotal/Math.max(Gd,gminEff));
          if (ia !== undefined) { mat.add(ia,ia,Gtotal); B[ia] -= IeqEff; }
          if (ib !== undefined) { mat.add(ib,ib,Gtotal); B[ib] += IeqEff; }
          if (ia !== undefined && ib !== undefined) { mat.add(ia,ib,-Gtotal); mat.add(ib,ia,-Gtotal); }
          continue;
        }

        const R = this._clampR(branch); const g = 1.0/R;
        const isHist  = HISTORY_TYPES.has(branch.type);
        const isRect  = RECTIFYING.has(branch.type);
        const isVSrc  = VOLTAGE_SOURCE_TYPES.has(branch.type);
        const sv      = (isHist||isRect||isVSrc) ? 1.0 : sourceScale;
        const Voff    = (branch.vOffset??0)*sv;
        const Ioff    = (branch.iOffset??0)*sv;
        if (ia !== undefined) { mat.add(ia,ia,g); B[ia] += Voff*g+Ioff; }
        if (ib !== undefined) { mat.add(ib,ib,g); B[ib] -= Voff*g+Ioff; }
        if (ia !== undefined && ib !== undefined) { mat.add(ia,ib,-g); mat.add(ib,ia,-g); }
        const gx = branch.gOffset??0;
        if (gx !== 0) {
          if (ia !== undefined) mat.add(ia,ia,gx);
          if (ib !== undefined) mat.add(ib,ib,gx);
          if (ia !== undefined && ib !== undefined) { mat.add(ia,ib,-gx); mat.add(ib,ia,-gx); }
        }
      }

      for (let i = 0; i < n; i++) mat.add(i,i,gminEff);
      for (const gndNet of electrical.gndNets) { const gi = netToIdx.get(gndNet); if (gi !== undefined) mat.add(gi,gi,G_GND); }

      let V;
      try { V = mat.factor().solve(B); }
      catch (err) { console.error("[CircuitSolver] LU failed:", err); return false; }

      let maxDelta = 0;
      for (let i = 0; i < n; i++) {
        const netId = nets[i];
        const isGnd = electrical.gndNets.has(netId);
        const Vold  = electrical.netVoltage.get(netId) ?? 0;
        const Vraw  = Number.isFinite(V[i]) ? Math.max(-MAX_VOLTAGE, Math.min(MAX_VOLTAGE, V[i])) : 0;
        const damp  = isGnd?1.0:iter<3?0.5:iter<10?0.8:1.0;
        const Vnew  = isGnd ? 0 : Vold+(Vraw-Vold)*damp;
        const delta = Math.abs(Vnew-Vold);
        if (delta > maxDelta) maxDelta = delta;
        electrical.netVoltage.set(netId, Vnew);
      }

      if (maxDelta < CONV_TOL) return true;
      if (iter > 15 && maxDelta >= prevMaxDelta * STALL_RATIO) return sourceScale < 1.0 ? false : true;
      prevMaxDelta = maxDelta;
    }
    return false;
  }

  _applyStamp(mat, B, netToIdx, st) {
    const ia = st.a != null ? netToIdx.get(st.a) : undefined;
    const ib = st.b != null ? netToIdx.get(st.b) : undefined;
    if (st.g !== undefined) {
      if (ia !== undefined) mat.add(ia,ia,st.g);
      if (ib !== undefined) mat.add(ib,ib,st.g);
      if (ia !== undefined && ib !== undefined) { mat.add(ia,ib,-st.g); mat.add(ib,ia,-st.g); }
    }
    if (st.gm !== undefined) {
      const ic = st.ctrlA != null ? netToIdx.get(st.ctrlA) : undefined;
      const id = st.ctrlB != null ? netToIdx.get(st.ctrlB) : undefined;
      if (ia !== undefined) { if (ic !== undefined) mat.add(ia,ic,st.gm); if (id !== undefined) mat.add(ia,id,-st.gm); }
      if (ib !== undefined) { if (ic !== undefined) mat.add(ib,ic,-st.gm); if (id !== undefined) mat.add(ib,id,st.gm); }
    }
    if (st.i !== undefined) { if (ia !== undefined) B[ia] += st.i; if (ib !== undefined) B[ib] -= st.i; }
  }

  _stampCapacitors(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "CAPACITOR" || branch._companionCap) continue;
      const C = branch.capacitance ?? 1e-6;
      if (!Number.isFinite(C) || C <= 0) continue;
      const hist  = this._capState.get(branch.id);
      const Vprev = hist?.V ?? ((electrical.netVoltage.get(branch.a)??0)-(electrical.netVoltage.get(branch.b)??0));
      const Iprev = hist?.I ?? 0;
      const Geq = 2*C/this._dt; const Ieq = Geq*Vprev+Iprev;
      branch._companionCap = { Geq, Ieq };
    }
  }

  _stampInductors(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "INDUCTOR" || branch._companionInd) continue;
      const L = branch.inductance ?? 1e-3;
      if (!Number.isFinite(L) || L <= 0) continue;
      const comp = this.registry.getAll().find(c => c.id === branch.id);
      const inst = comp?.instance;
      let Req, Veq;
      if (inst?._ReqEff != null && inst?._Veq != null) { Req = inst._ReqEff; Veq = inst._Veq; }
      else {
        const hist = this._indState.get(branch.id);
        const Iprev = _clamp(hist?.I??0, 500); const Vprev = hist?.V??0;
        Req = 2*L/this._dt; Veq = Req*Iprev+Vprev;
      }
      branch._companionInd = { Req, Veq };
    }
  }

  _stampDiodes(electrical) {
    for (const branch of electrical.circuits) {
      if (!DIODE_TYPES.has(branch.type) || branch._companionCap || branch._companionInd || branch._diodeNR) continue;
      const Va = electrical.netVoltage.get(branch.a)??0;
      const Vb = electrical.netVoltage.get(branch.b)??0;
      const Is = branch.Is??(branch.type==="SCHOTTKY"?1e-8:IS_DEFAULT);
      const N  = branch.N ??(branch.type==="SCHOTTKY"?1.05:N_DEFAULT);
      const Vold = this._junctionV.get(branch.id)??0;
      const { Gd, Ieq, Vlim } = _diodeLinearize(Va-Vb, Is, N, Vold);
      this._junctionV.set(branch.id, Vlim);
      branch._diodeNR = { Gd, Ieq };
    }
  }

  _stampZeners(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "ZENER" || branch._diodeNR) continue;
      const Va = electrical.netVoltage.get(branch.a)??0;
      const Vb = electrical.netVoltage.get(branch.b)??0;
      const Vold = this._junctionV.get(branch.id)??0;
      const { Gd, Ieq, Vlim } = _zenerLinearize(Va-Vb, branch.Is??IS_DEFAULT, branch.N??N_DEFAULT, branch.Vz??5.1, branch.Rz??5.0, Vold);
      this._junctionV.set(branch.id, Vlim);
      branch._diodeNR = { Gd, Ieq };
    }
  }

  _stampBJTs(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "BJT") continue;
      const { base: netB, collector: netC, emitter: netE } = branch;
      if (!netB || !netC || !netE) continue;
      const sign = (branch.pnp??false) ? -1 : 1;
      const Vb = electrical.netVoltage.get(netB)??0;
      const Vc = electrical.netVoltage.get(netC)??0;
      const Ve = electrical.netVoltage.get(netE)??0;
      const keyBE = branch.id+"_be"; const keyBC = branch.id+"_bc";
      const em = _bjtEbersMoll(sign*(Vb-Ve), sign*(Vb-Vc), branch.Is??IS_DEFAULT, branch.Bf??100, branch.Br??5, this._junctionV.get(keyBE)??0, this._junctionV.get(keyBC)??0);
      this._junctionV.set(keyBE, em.Vbe_lim); this._junctionV.set(keyBC, em.Vbc_lim);
      branch._bjtStamps = [
        { a: netC, b: netE, g: em.Gm },
        { a: netC, b: null, ctrlA: netB, ctrlB: netE, gm: em.Gm },
        { a: netB, b: netE, g: em.Gbe },
        { a: netC, b: netB, g: em.Gbc },
        { a: netC, b: netE, i: sign*(em.Ic - em.Gm*em.Vbe_lim - em.Gbc*em.Vbc_lim) },
        { a: netB, b: netE, i: sign*(em.Ib - em.Gbe*em.Vbe_lim) },
      ];
      branch.current = sign*em.Ic; branch.Ib = sign*em.Ib;
    }
  }

  _stampMOSFETs(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "MOSFET_DS" && branch.type !== "MOSFET") continue;
      const netG = branch.gate; const netD = branch.drain??branch.a; const netS = branch.source??branch.b;
      const sign = (branch.pmos??false) ? -1 : 1;
      const Vgs = sign*((electrical.netVoltage.get(netG)??0)-(electrical.netVoltage.get(netS)??0));
      const Vds = sign*((electrical.netVoltage.get(netD)??0)-(electrical.netVoltage.get(netS)??0));
      const { Ids, Gds, Gm } = _mosfetIds(Vgs, Vds, branch.Vth??2.0, branch.Kp??0.01, branch.Lambda??0.01);
      const Ieq_ds = sign*(Ids - Gds*Vds - Gm*Vgs);
      const stamps = [{ a: netD, b: netS, g: Gds }];
      if (netG && Gm > GMIN*10) stamps.push({ a: netD, b: netS, ctrlA: netG, ctrlB: netS, gm: sign*Gm });
      if (Ieq_ds !== 0) stamps.push({ a: netD, b: netS, i: sign*Ieq_ds });
      branch._mosfetStamps = stamps; branch._diodeNR = null; branch.current = sign*Ids;
    }
  }

  _finalize(electrical) {
    this._branchMap = new Map();
    for (const b of electrical.circuits) this._branchMap.set(b.id, b);
    this._calcBranchCurrents(electrical);
    this._updateCapacitorState(electrical);
    this._updateInductorState(electrical);
    this._checkOvercurrent(electrical);
    this._updateNetStates(electrical);
    this._runUpdates(electrical);
  }

  _updateCapacitorState(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "CAPACITOR") continue;
      const Va = electrical.netVoltage.get(branch.a)??0;
      const Vb = electrical.netVoltage.get(branch.b)??0;
      const Ic = branch.current??0;
      this._capState.set(branch.id, { V: (Va-Vb) - Ic*(branch.ohms??0), I: Ic });
    }
  }

  _updateInductorState(electrical) {
    for (const branch of electrical.circuits) {
      if (branch.type !== "INDUCTOR") continue;
      const Va = electrical.netVoltage.get(branch.a)??0;
      const Vb = electrical.netVoltage.get(branch.b)??0;
      if (branch.current != null) this._indState.set(branch.id, { I: branch.current, V: Va-Vb });
    }
  }

  _checkOvercurrent(electrical) {
    const compMap = new Map();
    for (const c of this.registry.getAll()) compMap.set(c.id, c);
    for (const branch of electrical.circuits) {
      if (branch.type !== "LED" && branch.type !== "LED_SEGMENT") continue;
      const I = Math.abs(branch.current??0);
      const baseId = branch.id.includes("_") ? branch.id.split("_")[0] : branch.id;
      const comp = compMap.get(branch.id) ?? compMap.get(baseId);
      if (!comp?.instance) continue;
      if (I > 0.035) {
        comp.instance._overcurrentTicks = (comp.instance._overcurrentTicks??0)+1;
        if (comp.instance._overcurrentTicks >= 3 && !comp.instance._burned) {
          comp.instance._burned = true;
          console.warn(`[CircuitSolver] LED burned: ${branch.id} @ ${(I*1000).toFixed(1)}mA`);
        }
      } else { comp.instance._overcurrentTicks = 0; }
    }
  }

  _calcBranchCurrents(electrical) {
    const flow = new Map();
    for (const branch of electrical.circuits) {
      let I = 0;
      if (branch._stamps || branch._bjtStamps || branch._mosfetStamps) {
        if (branch.current != null) this._prevBranchI.set(branch.id, branch.current);
        continue;
      }
      if (branch._companionCap) {
        const Va = electrical.netVoltage.get(branch.a)??0; const Vb = electrical.netVoltage.get(branch.b)??0;
        I = branch._companionCap.Geq*(Va-Vb) - branch._companionCap.Ieq;
      } else if (branch._companionInd) {
        const Va = electrical.netVoltage.get(branch.a)??0; const Vb = electrical.netVoltage.get(branch.b)??0;
        I = (Va-Vb-branch._companionInd.Veq)/branch._companionInd.Req;
      } else if (branch._diodeNR) {
        const Va = electrical.netVoltage.get(branch.a)??0; const Vb = electrical.netVoltage.get(branch.b)??0;
        const Vd = Va-Vb; const Is = branch.Is??IS_DEFAULT; const N = branch.N??N_DEFAULT;
        const nVt = N*VT; const Vd_c = Math.max(-10*nVt, Math.min(MAX_EXP_ARG*nVt, Vd));
        if (branch.type === "ZENER") {
          const Vz = branch.Vz??5.1; const Rz = branch.Rz??5.0;
          if      (Vd >= 0)   I = Is*(Math.exp(Vd_c/nVt)-1.0);
          else if (-Vd >= Vz) I = (-Vd-Vz)/Math.max(Rz,0.1);
          else                I = 0;
        } else { I = Is*(Math.exp(Vd_c/nVt)-1.0); if (I<0) I=0; }
      } else {
        const Va = electrical.netVoltage.get(branch.a)??0; const Vb = electrical.netVoltage.get(branch.b)??0;
        const Veff = Va-Vb-(branch.vOffset??0);
        I = Veff/this._clampR(branch);
        if (RECTIFYING.has(branch.type) && Veff < 0) I = 0;
      }
      branch.current = I; this._prevBranchI.set(branch.id, I);
      const absI = Math.abs(I);
      if (branch.a) flow.set(branch.a, (flow.get(branch.a)??0)+absI);
      if (branch.b) flow.set(branch.b, (flow.get(branch.b)??0)+absI);
    }
    electrical.netCurrent = flow;
  }

  _updateNetStates(electrical) {
    for (const [netId, V] of electrical.netVoltage) {
      electrical.netState.set(netId,
        electrical.gndNets.has(netId) ? "GND" : V > 0.5 ? "ACTIVE" : V < -0.5 ? "ACTIVE_NEG" : "FLOATING"
      );
    }
  }

  _runUpdates(electrical) {
    for (const comp of this.registry.getAll()) {
      const model = MODEL_REGISTRY[comp.type];
      if (typeof model?.update !== "function") continue;
      try { model.update(comp, electrical, this); } catch (err) { console.error(`[CircuitSolver] update() — ${comp.id}:`, err); }
    }
  }

  _solveComponent(comp, electrical) {
    const model = MODEL_REGISTRY[comp.type];
    if (typeof model?.solve !== "function") return;
    try { model.solve(comp, electrical, this); } catch (err) { console.error(`[CircuitSolver] solve() — ${comp.id}:`, err); }
  }

  _clampR(branch) {
    const R = branch.ohms;
    if (R == null || !Number.isFinite(R) || R <= 0) return R_FLOOR[branch.type] ?? R_FLOOR.DEFAULT;
    return Math.max(R, R_FLOOR[branch.type] ?? R_FLOOR.DEFAULT);
  }

  findNet(componentId, pinId) {
    const netlist = this.wireSystem?.lastNetlist;
    if (!netlist) return null;
    const cacheKey = `${componentId}:${pinId}`;
    if (!this._netCache) this._netCache = new Map();
    const cached = this._netCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const aliases = this._buildAliases(String(pinId));
    for (const [netId, pins] of netlist.nets) {
      for (const alias of aliases) {
        if (pins.has(`${componentId}:${alias}`)) { this._netCache.set(cacheKey, netId); return netId; }
      }
    }
    this._netCache.set(cacheKey, null);
    return null;
  }

  getNets(comp, pins) { const r = {}; for (const p of pins) r[p] = this.findNet(comp.id, p); return r; }

  getNetVoltage(netId, electrical)          { return electrical.netVoltage.get(netId) ?? 0; }
  isNetActive(netId, electrical, thr = 0.5) { return (electrical.netVoltage.get(netId)??0) > thr; }
  getVoltageDiff(nA, nB, electrical)        { return this.getNetVoltage(nA,electrical)-this.getNetVoltage(nB,electrical); }
  getBranchCurrent(id)                      { return this._branchMap.get(id)?.current ?? this._prevBranchI.get(id) ?? 0; }
  getPrevVoltage(netId)                     { return this._prevNetV.get(netId) ?? 0; }
  getPrevCurrent(branchId)                  { return this._prevBranchI.get(branchId) ?? 0; }
  getCapacitorVoltage(id)                   { return this._capState.get(id)?.V ?? 0; }
  getInductorCurrent(id)                    { return this._indState.get(id)?.I ?? 0; }
  getCapacitorEnergy(id, C)                 { const V = this._capState.get(id)?.V??0; return 0.5*C*V*V; }
  getInductorEnergy(id, L)                  { const I = this._indState.get(id)?.I??0; return 0.5*L*I*I; }
  get dt()                                  { return this._dt; }

  getNetResistance(netId) {
    let totalG = GMIN;
    for (const branch of this._lastCircuits) { if (branch.a===netId||branch.b===netId) totalG += 1.0/this._clampR(branch); }
    return 1.0/totalG;
  }

 _buildAliases(raw) {
    const s = raw.trim();

    // Exact match hamesha include hota hai
    const aliases = new Set([s, s.toLowerCase(), s.toUpperCase()]);

    // Pure numeric pin numbers ke liye D/A/P prefix variants
    const num = Number(s);
    if (Number.isFinite(num) && Number.isInteger(num) && num >= 0) {
      aliases.add(`D${num}`);
      aliases.add(`d${num}`);
      aliases.add(`P${num}`);
      aliases.add(`p${num}`);
      // Arduino analog mapping: pins 14-19 = A0-A5
      if (num >= 14 && num <= 19) {
        aliases.add(`A${num - 14}`);
        aliases.add(`a${num - 14}`);
      }
      // Pins 0-5 can also be A0-A5 on analog-only lookup
      if (num >= 0 && num <= 5) {
        aliases.add(`A${num}`);
        aliases.add(`a${num}`);
      }
    }

    // "D14" → "14" style (strip D/d prefix only if rest is a number)
    if (/^[Dd]\d+$/.test(s)) {
      aliases.add(s.slice(1));
    }

    // "A0" → "14", "A1" → "15", etc.
    const aMatch = s.match(/^[Aa](\d+)$/);
    if (aMatch) {
      const n = parseInt(aMatch[1], 10);
      if (n <= 5) {
        aliases.add(String(14 + n));
        aliases.add(`D${14 + n}`);
        aliases.add(`d${14 + n}`);
      }
    }

    // Power/signal rail aliases — sirf exact known names ke liye
    // IMPORTANT: "C", "COM", "T1", "T2", "A1", "A2", "B1", "B2" jaisi
    // generic pin names ko KABHI bhi yahan group mein mat daalo.
    // Sirf woh names jinka ek hi meaning hai globally.
    const POWER_ALIASES = {
      VCC:  ["VCC", "Vcc", "vcc", "VDD", "Vdd", "vdd", "5V", "3V3", "3.3V", "VBAT"],
      GND:  ["GND", "gnd", "Gnd", "VSS", "vss", "GROUND", "0V"],
      VIN:  ["VIN", "Vin", "vin"],
      OUT:  ["OUT", "out", "Out", "OUTPUT", "output"],
      NEG:  ["NEG", "neg", "Neg", "NEGATIVE"],
      POS:  ["POS", "pos", "Pos", "POSITIVE"],
    };

    for (const [, group] of Object.entries(POWER_ALIASES)) {
      if (group.includes(s)) {
        group.forEach(a => aliases.add(a));
        break; // ek group match hone ke baad ruko — cross-group contamination rokne ke liye
      }
    }

    return aliases;
  }
}

function _clamp(v, lim) { return Math.max(-lim, Math.min(lim, v)); }