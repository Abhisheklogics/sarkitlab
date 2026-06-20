"use strict";

const IC_OUTPUT_R = 25;
const IC_OC_LOW_R = 20;
const IC_FLOAT_R  = 1e7;
const IC_PWR_R    = 500;
const VCC_MAX     = 7.0;
const VCC_MIN     = 2.0;

const PIN_MAP_14 = { vcc: 14, gnd: 7 };
const PIN_MAP_16 = { vcc: 16, gnd: 8 };

const GATE_TABLE = {
  "74HC08":  { type: "AND",     gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC32":  { type: "OR",      gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC00":  { type: "NAND",    gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC02":  { type: "NOR",     gates: [[2,3,1],  [5,6,4],   [8,9,10],  [11,12,13]] },
  "74HC86":  { type: "XOR",     gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC266": { type: "XNOR_OC", gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC04":  { type: "NOT",     gates: [[1,0,2],  [3,0,4],   [5,0,6],   [9,0,8],   [11,0,10], [13,0,12]] },
  "74HC14":  { type: "NOT_ST",  gates: [[1,0,2],  [3,0,4],   [5,0,6],   [9,0,8],   [11,0,10], [13,0,12]] },
};

function _getFF(comp) {
  if (!comp._ffState) {
    comp._ffState = {
      q1: false, q2: false,
      clk1Last: false, clk2Last: false,
      _edge1Done: false, _edge2Done: false,
    };
  }
  return comp._ffState;
}

export default class LogicICModel {

  static solve(comp, electrical, solver) {
    const model = comp.model ?? comp.instance?.model;
    if (!model) return;

    const is16Pin  = ["74HC153","74HC148","74HC83","74HC73","74HC76"].includes(model);
    const pinMap   = is16Pin ? PIN_MAP_16 : PIN_MAP_14;
    const pinCount = is16Pin ? 16 : 14;

    const nets   = LogicICModel._resolveNets(comp, solver, pinCount);
    const vccNet = nets[pinMap.vcc];
    const gndNet = nets[pinMap.gnd];
    if (!vccNet || !gndNet) return;

    const vcc = electrical.netVoltage.get(vccNet) ?? 0;
    const gnd = electrical.netVoltage.get(gndNet) ?? 0;
    const vdd = vcc - gnd;

    if (LogicICModel._checkBurn(comp, vdd)) return;
    if (vdd < VCC_MIN) return;

    electrical.circuits.push({
      id: `${comp.id}_pwr`, type: "WIRE",
      a: vccNet, b: gndNet, ohms: IC_PWR_R,
    });

    const read        = (pin) => LogicICModel._readLogic(pin, nets, electrical, gnd, vdd);
    const push        = (pin, val, oc = false) =>
      LogicICModel._pushOutput(comp, nets, electrical, pin, gndNet, val, vdd, oc);

    if (!comp._lastOutputs) comp._lastOutputs = {};
    const pushTracked = (pin, val, oc = false) => {
      push(pin, val, oc);
      comp._lastOutputs[pin] = val;
    };

    const frame = electrical._frame ?? 0;
    if (comp._lastFrame !== frame) {
      comp._lastFrame = frame;
      const st = comp._ffState;
      if (st) { st._edge1Done = false; st._edge2Done = false; }
    }

    if (GATE_TABLE[model])   { LogicICModel._solveGates(comp, model, read, pushTracked); return; }
    if (model === "74HC83")  { LogicICModel._solve83(comp, read, pushTracked);  return; }
    if (model === "74HC153") { LogicICModel._solve153(comp, read, pushTracked); return; }
    if (model === "74HC148") { LogicICModel._solve148(comp, read, pushTracked); return; }
    if (model === "74HC74")  { LogicICModel._solve74(comp, read, pushTracked);  return; }
    if (model === "74HC73")  { LogicICModel._solve73(comp, read, pushTracked);  return; }
    if (model === "74HC76")  { LogicICModel._solve76(comp, read, pushTracked);  return; }
  }

  static update(comp, electrical, solver) {
    const inst  = comp.instance;
    const model = comp.model ?? inst?.model;
    if (!model) return;

    if (!electrical._frame) electrical._frame = 0;
    electrical._frame++;

    const st = comp._ffState;
    if (st && ["74HC74","74HC73","74HC76"].includes(model)) {
      const is16Pin  = ["74HC76"].includes(model);
      const pinCount = is16Pin ? 16 : 14;
      const nets     = LogicICModel._resolveNets(comp, solver, pinCount);
      const vccNet   = nets[is16Pin ? 16 : 14];
      const gndNet   = nets[is16Pin ?  8 :  7];
      const vcc      = electrical.netVoltage.get(vccNet) ?? 0;
      const gnd      = electrical.netVoltage.get(gndNet) ?? 0;
      const vdd      = vcc - gnd;
      const read     = (pin) => LogicICModel._readLogic(pin, nets, electrical, gnd, vdd);

      if (model === "74HC74") {
        const c1 = read(3);  if (c1 !== undefined && c1 !== null) st.clk1Last = c1;
        const c2 = read(11); if (c2 !== undefined && c2 !== null) st.clk2Last = c2;
      } else if (model === "74HC73") {
        const c1 = read(1);  if (c1 !== undefined && c1 !== null) st.clk1Last = c1;
        const c2 = read(5);  if (c2 !== undefined && c2 !== null) st.clk2Last = c2;
      } else if (model === "74HC76") {
        const c1 = read(1);  if (c1 !== undefined && c1 !== null) st.clk1Last = c1;
        const c2 = read(6);  if (c2 !== undefined && c2 !== null) st.clk2Last = c2;
      }
    }

    inst?.setOutputs?.(comp._lastOutputs ?? {});
    inst?.setPowered?.(true);
  }

  static reset(comp) {
    comp._lastOutputs = {};
    comp._lastVdd     = undefined;
    comp._ffState     = null;
    comp._lastFrame   = -1;
    comp.isBurned     = false;
  }

  static _resolveNets(comp, solver, pinCount) {
    const nets = {};
    for (let i = 1; i <= pinCount; i++) {
      nets[i] = solver.findNet(comp.id, `p${i}`)
             ?? solver.findNet(comp.id, String(i))
             ?? solver.findNet(comp.id, `P${i}`)
             ?? null;
    }
    return nets;
  }

  static _readLogic(pin, nets, electrical, gnd, vdd) {
    if (!pin || pin === 0) return null;
    const net = nets[pin];
    if (!net) return null;
    const v = electrical.netVoltage.get(net);
    if (v == null) return null;
    if (vdd <= 0) return null;
    const norm = (v - gnd) / vdd;
    return norm >= 0.5;
  }

  static _pushOutput(comp, nets, electrical, pin, gndNet, logic, vdd, oc = false) {
    const net = nets[pin];
    if (!net) return;

    if (logic === null || logic === undefined) {
      electrical.circuits.push({
        id: `${comp.id}_p${pin}_flt`, type: "IC_OUTPUT",
        a: net, b: gndNet, ohms: IC_FLOAT_R, vOffset: 0,
      });
      return;
    }

    if (oc) {
      electrical.circuits.push({
        id: `${comp.id}_p${pin}_oc`, type: "IC_OUTPUT",
        a: net, b: gndNet,
        ohms:    logic ? IC_FLOAT_R : IC_OC_LOW_R,
        vOffset: 0,
      });
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

  static _solveGates(comp, model, read, push) {
    const { type, gates } = GATE_TABLE[model];

    for (const [i1, i2, out] of gates) {
      const a = read(i1);

      if (type === "NOT" || type === "NOT_ST") {
        push(out, a === null ? null : !a);
        continue;
      }

      const b = read(i2);

      switch (type) {
        case "AND":
          if      (a === false || b === false) push(out, false);
          else if (a === null  || b === null)  push(out, null);
          else                                 push(out, true);
          break;
        case "NAND":
          if      (a === false || b === false) push(out, true);
          else if (a === null  || b === null)  push(out, null);
          else                                 push(out, false);
          break;
        case "OR":
          if      (a === true || b === true)  push(out, true);
          else if (a === null || b === null)  push(out, null);
          else                               push(out, false);
          break;
        case "NOR":
          if      (a === true || b === true)  push(out, false);
          else if (a === null || b === null)  push(out, null);
          else                               push(out, true);
          break;
        case "XOR":
          if (a === null || b === null) push(out, null);
          else                         push(out, a !== b);
          break;
        case "XNOR_OC":
          if (a === null || b === null) push(out, null, true);
          else                         push(out, a === b, true);
          break;
      }
    }
  }

  static _solve83(comp, read, push) {
    const a1=read(10),b1=read(11),a2=read(7),b2=read(6);
    const a3=read(3), b3=read(4), a4=read(1),b4=read(15);
    const cin=read(12);
    if ([a1,b1,a2,b2,a3,b3,a4,b4,cin].some(v => v === null)) {
      [9,2,5,14,13].forEach(p => push(p, null)); return;
    }
    const bv = v => v ? 1 : 0;
    const A   = (bv(a4)<<3)|(bv(a3)<<2)|(bv(a2)<<1)|bv(a1);
    const B   = (bv(b4)<<3)|(bv(b3)<<2)|(bv(b2)<<1)|bv(b1);
    const sum = A + B + bv(cin);
    push(9, !!(sum&1)); push(2, !!(sum&2)); push(5, !!(sum&4));
    push(14,!!(sum&8)); push(13,!!(sum&16));
  }

  static _solve153(comp, read, push) {
    const s0=read(14), s1=read(2);
    if (s0===null||s1===null) { push(7,null); push(9,null); return; }
    const sel = ((s1?1:0)<<1)|(s0?1:0);
    const enA=read(1);
    if (enA===true) { push(7,false); }
    else { push(7, read([6,5,4,3][sel])); }
    const enB=read(15);
    if (enB===true) { push(9,false); }
    else { push(9, read([10,11,12,13][sel])); }
  }

  static _solve148(comp, read, push) {
    const ei=read(5);
    if (ei===null||ei===true) { [9,7,6,14,15].forEach(p=>push(p,true)); return; }
    const iPins=[10,11,12,13,1,2,3,4];
    let priority=-1;
    for (let i=7;i>=0;i--) { if (read(iPins[i])===false){priority=i;break;} }
    if (priority!==-1) {
      push(9, !(priority&1)); push(7, !(priority&2)); push(6, !(priority&4));
      push(14,true); push(15,false);
    } else {
      push(9,true); push(7,true); push(6,true); push(14,false); push(15,true);
    }
  }

  static _solve74(comp, read, push) {
    const st=_getFF(comp);
    const clr1=read(1),pre1=read(4),d1=read(2),clk1=read(3);
    const clr2=read(13),pre2=read(10),d2=read(12),clk2=read(11);
    if (clr1===false) st.q1=false;
    else if (pre1===false) st.q1=true;
    else if (!st._edge1Done&&clk1===true&&st.clk1Last===false) {
      if (d1!==null) st.q1=d1; st._edge1Done=true;
    }
    if (clr2===false) st.q2=false;
    else if (pre2===false) st.q2=true;
    else if (!st._edge2Done&&clk2===true&&st.clk2Last===false) {
      if (d2!==null) st.q2=d2; st._edge2Done=true;
    }
    push(5,st.q1); push(6,!st.q1); push(9,st.q2); push(8,!st.q2);
  }

  static _solve73(comp, read, push) {
    const st=_getFF(comp);
    const clr1=read(2),j1=read(14),k1=read(3),clk1=read(1);
    const clr2=read(6),j2=read(7), k2=read(11),clk2=read(5);
    if (clr1===false) { st.q1=false; }
    else if (!st._edge1Done&&clk1===false&&st.clk1Last===true) {
      if (j1!==null&&k1!==null) {
        if (!j1&&!k1){} else if (!j1&&k1) st.q1=false;
        else if (j1&&!k1) st.q1=true; else st.q1=!st.q1;
      }
      st._edge1Done=true;
    }
    push(12,st.q1); push(13,!st.q1);
    if (clr2===false) { st.q2=false; }
    else if (!st._edge2Done&&clk2===false&&st.clk2Last===true) {
      if (j2!==null&&k2!==null) {
        if (!j2&&!k2){} else if (!j2&&k2) st.q2=false;
        else if (j2&&!k2) st.q2=true; else st.q2=!st.q2;
      }
      st._edge2Done=true;
    }
    push(10,st.q2); push(9,!st.q2);
  }

  static _solve76(comp, read, push) {
    const st=_getFF(comp);
    const pre1=read(2),clr1=read(3),j1=read(4),k1=read(14),clk1=read(1);
    const pre2=read(7),clr2=read(8),j2=read(9),k2=read(11),clk2=read(6);
    if (clr1===false) st.q1=false;
    else if (pre1===false) st.q1=true;
    else if (!st._edge1Done&&clk1===false&&st.clk1Last===true) {
      if (j1!==null&&k1!==null) {
        if (!j1&&!k1){} else if (!j1&&k1) st.q1=false;
        else if (j1&&!k1) st.q1=true; else st.q1=!st.q1;
      }
      st._edge1Done=true;
    }
    push(15,st.q1); push(16,!st.q1);
    if (clr2===false) st.q2=false;
    else if (pre2===false) st.q2=true;
    else if (!st._edge2Done&&clk2===false&&st.clk2Last===true) {
      if (j2!==null&&k2!==null) {
        if (!j2&&!k2){} else if (!j2&&k2) st.q2=false;
        else if (j2&&!k2) st.q2=true; else st.q2=!st.q2;
      }
      st._edge2Done=true;
    }
    push(12,st.q2); push(13,!st.q2);
  }
}