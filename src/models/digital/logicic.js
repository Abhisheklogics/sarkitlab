"use strict";

const IC_OUTPUT_R  = 25;
const IC_OC_LOW_R  = 20;
const IC_FLOAT_R   = 1e7;
const IC_PWR_R     = 500;
const VCC_MAX      = 7.0;
const VCC_MIN      = 2.0;
const LOGIC_HI     = 0.7;
const LOGIC_LO     = 0.3;

const PIN_MAP_14 = { vcc: 14, gnd: 7 };
const PIN_MAP_16 = { vcc: 16, gnd: 8 };

const GATE_TABLE = {
  "74HC08":  { type: "AND",     gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC32":  { type: "OR",      gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC00":  { type: "NAND",    gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC02":  { type: "NOR",     gates: [[2,3,1],  [5,6,4],   [8,9,10],  [11,12,13]] },
  "74HC86":  { type: "XOR",     gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC266": { type: "XNOR_OC", gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC7266":{ type: "XNOR_OC", gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74XNOR":  { type: "XNOR",    gates: [[1,2,3],  [4,5,6],   [9,10,8],  [12,13,11]] },
  "74HC04":  { type: "NOT",     gates: [[1,0,2],  [3,0,4],   [5,0,6],   [9,0,8],   [11,0,10], [13,0,12]] },
  "74HC14":  { type: "NOT",     gates: [[1,0,2],  [3,0,4],   [5,0,6],   [9,0,8],   [11,0,10], [13,0,12]] },
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

// ─────────────────────────────────────────────────────────────────────────
// Debug logger — gated by window.__icDebug.
// Logs ONCE PER (component, frame) pair — not per NR iteration — so it
// never floods the console or freezes the browser even with MAX_ITER=100
// solver iterations per timestep. Each IC logs a single grouped line with
// its inputs/outputs for that settled timestep.
// ─────────────────────────────────────────────────────────────────────────
function _icDebugLog(comp, model, label, data) {
  if (typeof window === "undefined" || !window.__icDebug) return;

  const frame = comp._lastFrame ?? -1;
  if (!comp._debugLoggedFrames) comp._debugLoggedFrames = new Set();

  const key = `${frame}:${label}`;
  if (comp._debugLoggedFrames.has(key)) return;
  comp._debugLoggedFrames.add(key);

  // Keep the set small — only remember the last ~4 frames worth of keys
  if (comp._debugLoggedFrames.size > 32) {
    const arr = [...comp._debugLoggedFrames];
    comp._debugLoggedFrames = new Set(arr.slice(-16));
  }

  console.log(`[IC ${comp.id ?? "?"} ${model}] frame=${frame} ${label}`, data);
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

    // Fixed quiescent current draw — not voltage-dependent
    electrical.circuits.push({
      id: `${comp.id}_pwr`, type: "WIRE",
      a: vccNet, b: gndNet,
      ohms: IC_PWR_R,
    });

    const read        = (pin) => LogicICModel._readLogic(pin, nets, electrical, gnd, vdd);
    const push        = (pin, val, oc = false) =>
      LogicICModel._pushOutput(comp, nets, electrical, pin, gndNet, val, vdd, oc);

    if (!comp._lastOutputs) comp._lastOutputs = {};
    const pushTracked = (pin, val, oc = false) => {
      push(pin, val, oc);
      comp._lastOutputs[pin] = val;
    };

    // Edge-detect flags reset once per solve() call, not per NR iteration.
    // We guard with _solveFrame so multiple NR iterations don't re-trigger.
    const frame = electrical._frame ?? 0;
    if (comp._lastFrame !== frame) {
      comp._lastFrame = frame;
      const st = comp._ffState;
      if (st) { st._edge1Done = false; st._edge2Done = false; }
    }

    _icDebugLog(comp, model, "power", { vcc: vcc.toFixed(3), gnd: gnd.toFixed(3), vdd: vdd.toFixed(3) });

    if (GATE_TABLE[model])   { LogicICModel._solveGates(comp, model, read, pushTracked); return; }
    if (model === "74HC83")  { LogicICModel._solve83(comp, read, pushTracked);  return; }
    if (model === "74HC153") { LogicICModel._solve153(comp, read, pushTracked); return; }
    if (model === "74HC148") { LogicICModel._solve148(comp, read, pushTracked); return; }
    if (model === "74HC74")  { LogicICModel._solve74(comp, read, pushTracked); return; }
    if (model === "74HC73")  { LogicICModel._solve73(comp, read, pushTracked); return; }
    if (model === "74HC76")  { LogicICModel._solve76(comp, read, pushTracked); return; }
  }

  static update(comp, electrical, solver) {
    const inst  = comp.instance;
    const model = comp.model ?? inst?.model;
    if (!model) return;

    // Increment frame counter so next solve() knows it's a new timestep
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

      // Latch clock state AFTER solve() has settled — this is the
      // "previous" value for the next timestep's edge detection.
      if (model === "74HC74") {
        const c1 = read(3);  if (c1 !== undefined) st.clk1Last = c1;
        const c2 = read(11); if (c2 !== undefined) st.clk2Last = c2;
      } else if (model === "74HC73") {
        const c1 = read(1);  if (c1 !== undefined) st.clk1Last = c1;
        const c2 = read(5);  if (c2 !== undefined) st.clk2Last = c2;
      } else if (model === "74HC76") {
        const c1 = read(1);  if (c1 !== undefined) st.clk1Last = c1;
        const c2 = read(6);  if (c2 !== undefined) st.clk2Last = c2;
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

  // Returns true / false / null.
  // null = genuinely unconnected pin (no net).
  // undefined is never returned — mid-range voltage snaps to nearest rail
  // so gate logic never sees a metastable input.
  static _readLogic(pin, nets, electrical, gnd, vdd) {
    if (!pin || pin === 0) return null;
    const net = nets[pin];
    if (!net) return null;
    const v = electrical.netVoltage.get(net);
    if (v == null) return null;
    const norm = vdd > 0 ? (v - gnd) / vdd : 0;
    if (typeof window !== "undefined" && window.__icDebug) {
      console.log(`  readLogic pin=${pin} net=${net} v=${v?.toFixed(3)} gnd=${gnd?.toFixed(3)} vdd=${vdd?.toFixed(3)} norm=${norm.toFixed(3)}`);
    }
    // Snap to nearest rail instead of returning undefined for mid-range.
    return norm >= 0.5;
  }

  static _pushOutput(comp, nets, electrical, pin, gndNet, logic, vdd, oc = false) {
    const net = nets[pin];
    if (!net) return;

    if (logic === null) {
      electrical.circuits.push({
        id: `${comp.id}_p${pin}_flt`, type: "IC_OUTPUT",
        a: net, b: gndNet, ohms: IC_FLOAT_R, vOffset: 0,
      });
      return;
    }

    if (oc) {
      // Open-collector: pull low when false, float when true
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

  static _solveGates(model, read, push) {
    const { type, gates } = GATE_TABLE[model];

    for (const [i1, i2, out] of gates) {
      const a = read(i1);

      if (type === "NOT") {
        push(out, a === null ? null : !a);
        continue;
      }

      const b = read(i2);

      if (typeof window !== "undefined" && window.__icDebug) {
        console.log(`[${model}] gate(${i1},${i2}->${out}) a=${a} b=${b} type=${type}`);
      }

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

        case "XNOR":
          if (a === null || b === null) push(out, null);
          else                         push(out, a === b);
          break;

        case "XNOR_OC":
          if (a === null || b === null) push(out, null, true);
          else                         push(out, a === b, true);
          break;
      }
    }
  }

  static _solve83(read, push) {
    // 74HC83 — 4-bit full adder
    // Pin mapping per datasheet:
    //   A1=10, B1=11, A2=7, B2=6, A3=3, B3=4, A4=1, B4=15
    //   Cin=12, Sum1=9, Sum2=2, Sum3=5, Sum4=14, Cout=13
    const a1=read(10), b1=read(11);
    const a2=read(7),  b2=read(6);
    const a3=read(3),  b3=read(4);
    const a4=read(1),  b4=read(15);
    const cin=read(12);

    if ([a1,b1,a2,b2,a3,b3,a4,b4,cin].some(v => v === null)) {
      [9,2,5,14,13].forEach(p => push(p, null));
      return;
    }

    const b = v => v ? 1 : 0;
    const A   = (b(a4)<<3)|(b(a3)<<2)|(b(a2)<<1)|b(a1);
    const B   = (b(b4)<<3)|(b(b3)<<2)|(b(b2)<<1)|b(b1);
    const sum = A + B + b(cin);

    push(9,  !!(sum & 1));
    push(2,  !!(sum & 2));
    push(5,  !!(sum & 4));
    push(14, !!(sum & 8));
    push(13, !!(sum & 16));
  }

  static _solve153(read, push) {
    // 74HC153 — dual 4-to-1 mux
    // S0=14, S1=2 (shared select lines)
    // MuxA: /EA=1, I0A=6, I1A=5, I2A=4, I3A=3, YA=7
    // MuxB: /EB=15, I0B=10, I1B=11, I2B=12, I3B=13, YB=9
    const s0 = read(14), s1 = read(2);
    if (s0 === null || s1 === null) {
      push(7, null); push(9, null); return;
    }
    const sel = ((s1 ? 1 : 0) << 1) | (s0 ? 1 : 0);

    const muxA_inputs = [6, 5, 4, 3];
    const enA = read(1);
    if (enA === true) {
      push(7, false);
    } else {
      const inp = read(muxA_inputs[sel]);
      push(7, inp === null ? null : inp);
    }

    const muxB_inputs = [10, 11, 12, 13];
    const enB = read(15);
    if (enB === true) {
      push(9, false);
    } else {
      const inp = read(muxB_inputs[sel]);
      push(9, inp === null ? null : inp);
    }
  }

  static _solve148(read, push) {
    // 74HC148 — 8-to-3 priority encoder, all pins active-low
    // /EI=5, inputs /I0-/I7 = pins 10,11,12,13,1,2,3,4
    // outputs /A0=9, /A1=7, /A2=6, /EO=14, /GS=15
    const ei = read(5);
    if (ei === null || ei === true) {
      // Disabled — all outputs HIGH (inactive)
      [9, 7, 6, 14, 15].forEach(p => push(p, true));
      return;
    }

    const iPins = [10, 11, 12, 13, 1, 2, 3, 4];
    let priority = -1;
    for (let i = 7; i >= 0; i--) {
      if (read(iPins[i]) === false) { priority = i; break; }
    }

    if (priority !== -1) {
      // Active-low binary outputs — invert the bits
      push(9,  !(priority & 1));
      push(7,  !(priority & 2));
      push(6,  !(priority & 4));
      push(14, true);   // /EO = HIGH when valid input active
      push(15, false);  // /GS = LOW when any input active
    } else {
      // No active input
      push(9,  true);
      push(7,  true);
      push(6,  true);
      push(14, false);  // /EO = LOW (enable output cascades to next)
      push(15, true);   // /GS = HIGH
    }
  }

  static _solve74(comp, read, push) {
    // 74HC74 — dual D positive-edge-triggered FF with async preset/clear
    const st = _getFF(comp);

    const clr1=read(1), pre1=read(4), d1=read(2), clk1=read(3);
    const clr2=read(13),pre2=read(10),d2=read(12), clk2=read(11);

    // Async preset/clear — active low
    if (clr1 === false) st.q1 = false;
    else if (pre1 === false) st.q1 = true;
    else if (!st._edge1Done && clk1 === true && st.clk1Last === false) {
      if (d1 !== null) st.q1 = d1;
      st._edge1Done = true;
    }

    if (clr2 === false) st.q2 = false;
    else if (pre2 === false) st.q2 = true;
    else if (!st._edge2Done && clk2 === true && st.clk2Last === false) {
      if (d2 !== null) st.q2 = d2;
      st._edge2Done = true;
    }

    push(5, st.q1);  push(6,  !st.q1);
    push(9, st.q2);  push(8,  !st.q2);
  }

  static _solve73(comp, read, push) {
    // 74HC73 — dual JK negative-edge-triggered FF with async clear
    const st = _getFF(comp);

    const clr1=read(2), j1=read(14), k1=read(3), clk1=read(1);
    const clr2=read(6), j2=read(7),  k2=read(11),clk2=read(5);

    if (clr1 === false) {
      st.q1 = false;
    } else if (!st._edge1Done && clk1 === false && st.clk1Last === true) {
      if (j1 !== null && k1 !== null) {
        if      (!j1 && !k1) {}
        else if (!j1 &&  k1) st.q1 = false;
        else if ( j1 && !k1) st.q1 = true;
        else                  st.q1 = !st.q1;
      }
      st._edge1Done = true;
    }
    push(12, st.q1); push(13, !st.q1);

    if (clr2 === false) {
      st.q2 = false;
    } else if (!st._edge2Done && clk2 === false && st.clk2Last === true) {
      if (j2 !== null && k2 !== null) {
        if      (!j2 && !k2) {}
        else if (!j2 &&  k2) st.q2 = false;
        else if ( j2 && !k2) st.q2 = true;
        else                  st.q2 = !st.q2;
      }
      st._edge2Done = true;
    }
    push(10, st.q2); push(9, !st.q2);
  }

  static _solve76(comp, read, push) {
    // 74HC76 — dual JK negative-edge-triggered FF with async preset/clear
    const st = _getFF(comp);

    const pre1=read(2), clr1=read(3), j1=read(4), k1=read(14), clk1=read(1);
    const pre2=read(7), clr2=read(8), j2=read(9), k2=read(11), clk2=read(6);

    if      (clr1 === false) st.q1 = false;
    else if (pre1 === false) st.q1 = true;
    else if (!st._edge1Done && clk1 === false && st.clk1Last === true) {
      if (j1 !== null && k1 !== null) {
        if      (!j1 && !k1) {}
        else if (!j1 &&  k1) st.q1 = false;
        else if ( j1 && !k1) st.q1 = true;
        else                  st.q1 = !st.q1;
      }
      st._edge1Done = true;
    }
    push(15, st.q1); push(16, !st.q1);

    if      (clr2 === false) st.q2 = false;
    else if (pre2 === false) st.q2 = true;
    else if (!st._edge2Done && clk2 === false && st.clk2Last === true) {
      if (j2 !== null && k2 !== null) {
        if      (!j2 && !k2) {}
        else if (!j2 &&  k2) st.q2 = false;
        else if ( j2 && !k2) st.q2 = true;
        else                  st.q2 = !st.q2;
      }
      st._edge2Done = true;
    }
    push(12, st.q2); push(13, !st.q2);
  }
}