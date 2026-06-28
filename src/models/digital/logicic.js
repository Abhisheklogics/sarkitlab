"use strict";

const IC_OUTPUT_R  = 10;
const IC_OC_LOW_R  = 8;
const IC_FLOAT_R   = 1e8;
const VCC_MAX      = 7.0;
const VCC_MIN      = 2.0;
const LOGIC_HI     = 0.65;
const LOGIC_LO     = 0.35;

const PIN_MAP_14 = { vcc: 14, gnd: 7  };
const PIN_MAP_16 = { vcc: 16, gnd: 8  };
const PIN_MAP_83 = { vcc: 16, gnd: 8  };

const GATE_TABLE = {
  "74HC08":  { type: "AND",     gates: [[1,2,3],   [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC32":  { type: "OR",      gates: [[1,2,3],   [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC00":  { type: "NAND",    gates: [[1,2,3],   [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC02":  { type: "NOR",     gates: [[2,3,1],   [5,6,4],   [8,9,10],  [11,12,13]] },
  "74HC86":  { type: "XOR",     gates: [[1,2,3],   [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC266": { type: "XNOR_OC", gates: [[1,2,3],   [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC7266":{ type: "XNOR_OC", gates: [[1,2,3],   [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC04":  { type: "NOT",     gates: [[1,0,2],   [3,0,4],   [5,0,6],   [9,0,8],  [11,0,10], [13,0,12]] },
  "74HC14":  { type: "NOT",     gates: [[1,0,2],   [3,0,4],   [5,0,6],   [9,0,8],  [11,0,10], [13,0,12]] },
};

export default class LogicICModel {

  static solve(comp, electrical, solver) {
    const model = comp.model ?? comp.instance?.model;
    if (!model) return;

    const is83    = model === "74HC83";
    const is16Pin = ["74HC153","74HC148","74HC83","74HC74","74HC73","74HC76"].includes(model);
    const pinMap  = is83 ? PIN_MAP_83 : is16Pin ? PIN_MAP_16 : PIN_MAP_14;
    const pinCount = is16Pin ? 16 : 14;

    const nets    = LogicICModel._resolveNets(comp, solver, pinCount);
    const vccNet  = nets[pinMap.vcc];
    const gndNet  = nets[pinMap.gnd];
    if (!vccNet || !gndNet) return;

    const vcc = electrical.netVoltage.get(vccNet) ?? 0;
    const gnd = electrical.netVoltage.get(gndNet) ?? 0;
    const vdd = vcc - gnd;

    if (LogicICModel._checkBurn(comp, vdd)) return;
    if (vdd < VCC_MIN) return;

    const vccPinNums = new Set([pinMap.vcc, pinMap.gnd]);

    const read = (pin) => LogicICModel._readLogic(pin, nets, electrical, gnd, vdd, vccPinNums);
    const push = (pin, val, oc = false) =>
      LogicICModel._pushOutput(comp, nets, electrical, pin, gndNet, val, vdd, oc, vccPinNums);

    if (GATE_TABLE[model])   { LogicICModel._solveGates(model, read, push); return; }
    if (model === "74HC83")  { LogicICModel._solve83(read, push);            return; }
    if (model === "74HC153") { LogicICModel._solve153(read, push);           return; }
    if (model === "74HC148") { LogicICModel._solve148(read, push);           return; }
    if (model === "74HC74")  { LogicICModel._solve74(read, push, comp);      return; }
    if (model === "74HC73")  { LogicICModel._solve73(read, push, comp);      return; }
    if (model === "74HC76")  { LogicICModel._solve76(read, push, comp);      return; }
  }

  static _resolveNets(comp, solver, pinCount) {
    const nets = {};
    for (let i = 1; i <= pinCount; i++) {
      let net = solver.findNet(comp.id, `p${i}`);
      if (!net) net = solver.findNet(comp.id, String(i));
      if (!net) net = solver.findNet(comp.id, `P${i}`);
      nets[i] = net ?? null;
    }
    return nets;
  }

  static _readLogic(pin, nets, electrical, gnd, vdd, vccPinNums) {
    if (!pin || pin === 0) return null;
    if (vccPinNums?.has(pin)) return null;
    const net = nets[pin];
    if (!net) return undefined;
    const v = electrical.netVoltage.get(net);
    if (v === undefined || v === null) return undefined;
    const norm = vdd > 0 ? (v - gnd) / vdd : 0;
    if (norm >= LOGIC_HI) return true;
    if (norm <= LOGIC_LO) return false;
    return undefined;
  }

  static _pushOutput(comp, nets, electrical, pin, gndNet, logic, vdd, oc = false, vccPinNums) {
    if (vccPinNums?.has(pin)) return;
    const net = nets[pin];
    if (!net) return;

    if (logic === undefined || logic === null) {
      electrical.circuits.push({
        id: `${comp.id}_p${pin}_flt`, type: "IC_OUTPUT",
        a: net, b: gndNet, ohms: IC_FLOAT_R, vOffset: 0,
      });
      return;
    }

    if (oc) {
      electrical.circuits.push(logic
        ? { id: `${comp.id}_p${pin}_oc_hi`, type: "IC_OUTPUT", a: net, b: gndNet, ohms: IC_FLOAT_R,  vOffset: 0   }
        : { id: `${comp.id}_p${pin}_oc_lo`, type: "IC_OUTPUT", a: net, b: gndNet, ohms: IC_OC_LOW_R, vOffset: 0   }
      );
      return;
    }

    electrical.circuits.push({
      id:      `${comp.id}_p${pin}`,
      type:    "IC_OUTPUT",
      a:       net,
      b:       gndNet,
      ohms:    IC_OUTPUT_R,
      vOffset: logic ? vdd : 0,
    });
  }

  static _checkBurn(comp, vdd) {
    if (comp.isBurned) return true;
    if (vdd > VCC_MAX || vdd < -0.5) {
      comp.isBurned = true;
      comp.instance?.setBurned?.(true);
      return true;
    }
    return false;
  }

  static _solveGates(model, read, push) {
    const { type, gates } = GATE_TABLE[model];
    const oc = type === "XNOR_OC";

    for (const [i1, i2, out] of gates) {
      const a = read(i1);

      if (type === "NOT") {
        push(out, a === undefined ? undefined : !a);
        continue;
      }

      const b = read(i2);

      if (a === undefined || b === undefined) {
        push(out, undefined, oc);
        continue;
      }

      let result;
      switch (type) {
        case "AND":      result =  (a && b);   break;
        case "OR":       result =  (a || b);   break;
        case "NAND":     result = !(a && b);   break;
        case "NOR":      result = !(a || b);   break;
        case "XOR":      result =  (a !== b);  break;
        case "XNOR_OC":  result =  (a === b);  break;
        default:         result = undefined;
      }
      push(out, result, oc);
    }
  }

  static _solve83(read, push) {
    const a1  = read(10);
    const b1  = read(11);
    const a2  = read(7);
    const b2  = read(6);
    const a3  = read(3);
    const b3  = read(4);
    const a4  = read(1);
    const b4  = read(15);
    const cin = read(12);

    const anyUndef = [a1,b1,a2,b2,a3,b3,a4,b4].some(v => v === undefined);

    if (anyUndef) {
      [9, 2, 5, 14, 13].forEach(p => push(p, undefined));
      return;
    }

    const toB = (v) => v === true ? 1 : 0;
    const A   = (toB(a4)<<3)|(toB(a3)<<2)|(toB(a2)<<1)|toB(a1);
    const B   = (toB(b4)<<3)|(toB(b3)<<2)|(toB(b2)<<1)|toB(b1);
    const C   = toB(cin === undefined ? false : cin);
    const sum = A + B + C;

    push(9,  !!(sum & 1));
    push(2,  !!(sum & 2));
    push(5,  !!(sum & 4));
    push(14, !!(sum & 8));
    push(13, !!(sum & 16));
  }

  static _solve153(read, push) {
    const s0 = read(14);
    const s1 = read(2);

    if (s0 === undefined || s1 === undefined) {
      push(7, undefined);
      push(9, undefined);
      return;
    }

    const sel = (((s1 === true) ? 1 : 0) << 1) | ((s0 === true) ? 1 : 0);

    const enA = read(1);
    if (enA === false) {
      const inA = read([6,5,4,3][sel]);
      push(7, inA === undefined ? undefined : !!inA);
    } else if (enA === undefined) {
      push(7, undefined);
    } else {
      push(7, false);
    }

    const enB = read(15);
    if (enB === false) {
      const inB = read([10,11,12,13][sel]);
      push(9, inB === undefined ? undefined : !!inB);
    } else if (enB === undefined) {
      push(9, undefined);
    } else {
      push(9, false);
    }
  }

  static _solve148(read, push) {
    const ei = read(5);

    if (ei === undefined || ei === true) {
      [9, 7, 6, 14, 15].forEach(p => push(p, true));
      return;
    }

    const iPins = [10, 11, 12, 13, 1, 2, 3, 4];
    let priority = -1;
    for (let i = 7; i >= 0; i--) {
      if (read(iPins[i]) === false) { priority = i; break; }
    }

    if (priority !== -1) {
      push(9,  !(priority & 1));
      push(7,  !(priority & 2));
      push(6,  !(priority & 4));
      push(14, false);
      push(15, true);
    } else {
      push(9,  true);
      push(7,  true);
      push(6,  true);
      push(14, true);
      push(15, false);
    }
  }

  static _solve74(read, push, comp) {
    if (!comp._ff74) comp._ff74 = [
      { q: false, qn: true },
      { q: false, qn: true },
    ];

    const FF = [
      { clk: 3, d: 2, pre: 4, clr: 1, q: 5, qn: 6   },
      { clk: 11, d: 12, pre: 10, clr: 13, q: 9, qn: 8 },
    ];

    for (let i = 0; i < 2; i++) {
      const p   = FF[i];
      const ff  = comp._ff74[i];
      const pre = read(p.pre);
      const clr = read(p.clr);

      if (pre === false && clr !== false) {
        ff.q = true; ff.qn = false;
        push(p.q, true); push(p.qn, false);
        continue;
      }
      if (clr === false && pre !== false) {
        ff.q = false; ff.qn = true;
        push(p.q, false); push(p.qn, true);
        continue;
      }
      if (clr === false && pre === false) {
        push(p.q, true); push(p.qn, true);
        continue;
      }

      const clkNow = read(p.clk);
      const clkOld = ff._clkPrev ?? false;
      const d      = read(p.d);

      if (clkOld === false && clkNow === true && d !== undefined) {
        ff.q = d; ff.qn = !d;
      }
      ff._clkPrev = clkNow ?? false;

      push(p.q,  ff.q);
      push(p.qn, ff.qn);
    }
  }

  static _solve73(read, push, comp) {
    if (!comp._ff73) comp._ff73 = [
      { q: false, qn: true, _clkPrev: false },
      { q: false, qn: true, _clkPrev: false },
    ];

    const FF = [
      { clk: 1, clr: 2, j: 14, k: 3,  q: 12, qn: 13 },
      { clk: 5, clr: 6, j: 7,  k: 11, q: 10, qn: 9  },
    ];

    for (let i = 0; i < 2; i++) {
      const p  = FF[i];
      const ff = comp._ff73[i];
      const clr = read(p.clr);

      if (clr === false) {
        ff.q = false; ff.qn = true;
        push(p.q, false); push(p.qn, true);
        ff._clkPrev = read(p.clk) ?? false;
        continue;
      }

      const clkNow = read(p.clk);
      const clkOld = ff._clkPrev ?? false;
      const j      = read(p.j);
      const k      = read(p.k);

      if (clkOld === true && clkNow === false) {
        if (j === true  && k === false) { ff.q = true;  ff.qn = false; }
        else if (j === false && k === true)  { ff.q = false; ff.qn = true;  }
        else if (j === true  && k === true)  { ff.q = !ff.q; ff.qn = !ff.qn; }
      }
      ff._clkPrev = clkNow ?? false;

      push(p.q,  ff.q);
      push(p.qn, ff.qn);
    }
  }

  static _solve76(read, push, comp) {
    if (!comp._ff76) comp._ff76 = [
      { q: false, qn: true, _clkPrev: false },
      { q: false, qn: true, _clkPrev: false },
    ];

    const FF = [
      { clk: 1, pre: 2, clr: 3, j: 4,  k: 14, q: 15, qn: 16 },
      { clk: 6, pre: 7, clr: 8, j: 9,  k: 11, q: 12, qn: 13 },
    ];

    for (let i = 0; i < 2; i++) {
      const p  = FF[i];
      const ff = comp._ff76[i];
      const pre = read(p.pre);
      const clr = read(p.clr);

      if (pre === false && clr !== false) {
        ff.q = true; ff.qn = false;
        push(p.q, true); push(p.qn, false);
        ff._clkPrev = read(p.clk) ?? false;
        continue;
      }
      if (clr === false && pre !== false) {
        ff.q = false; ff.qn = true;
        push(p.q, false); push(p.qn, true);
        ff._clkPrev = read(p.clk) ?? false;
        continue;
      }

      const clkNow = read(p.clk);
      const clkOld = ff._clkPrev ?? false;
      const j      = read(p.j);
      const k      = read(p.k);

      if (clkOld === true && clkNow === false) {
        if (j === true  && k === false) { ff.q = true;  ff.qn = false; }
        else if (j === false && k === true)  { ff.q = false; ff.qn = true;  }
        else if (j === true  && k === true)  { ff.q = !ff.q; ff.qn = !ff.qn; }
      }
      ff._clkPrev = clkNow ?? false;

      push(p.q,  ff.q);
      push(p.qn, ff.qn);
    }
  }

  static reset(comp) {
    comp.isBurned  = false;
    comp._ff74     = null;
    comp._ff73     = null;
    comp._ff76     = null;
    comp.instance?.reset?.();
  }
}