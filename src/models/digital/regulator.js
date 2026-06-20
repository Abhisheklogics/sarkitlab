"use strict";

const VREG         = 5.0;
const VDROPOUT     = 2.0;
const VDROPOUT_MIN = 1.0;
const ROUT_REG     = 0.5;
const ROUT_DROPOUT = 10.0;
const ROUT_OFF     = 1e6;
const RIQ          = 1800;
const IOUT_MAX     = 1.0;

export default class Regulator7805Model {

  static solve(comp, electrical, solver) {
    const { IN, GND, OUT } = solver.getNets(comp, ["IN", "GND", "OUT"]);
    if (!OUT || !GND) return;

    const vGnd = electrical.netVoltage.get(GND) ?? 0;
    const vIn  = IN ? (electrical.netVoltage.get(IN) ?? 0) : 0;
    const diff = vIn - vGnd;

    let vOutTarget, Rout;

    if (diff >= VDROPOUT) {
      vOutTarget = vGnd + VREG;
      Rout       = Math.max(ROUT_REG, VREG / Math.max(IOUT_MAX, 1e-6));
    } else if (diff >= VDROPOUT_MIN) {
      const ratio = (diff - VDROPOUT_MIN) / (VDROPOUT - VDROPOUT_MIN);
      vOutTarget  = vGnd + diff * ratio;
      Rout        = ROUT_DROPOUT;
    } else {
      vOutTarget = vGnd;
      Rout       = ROUT_OFF;
    }

    electrical.circuits.push({
      id:      `${comp.id}_out`,
      type:    "REGULATOR",
      a:       OUT,
      b:       GND,
      ohms:    Rout,
      vOffset: vOutTarget - vGnd,
    });

    if (IN) {
      electrical.circuits.push({
        id: `${comp.id}_iq`, type: "WIRE",
        a: IN, b: GND, ohms: RIQ,
      });
    }

    const inst = comp.instance;
    if (inst) {
      inst._regState = { vIn, vGnd, diff, vOut: vOutTarget, regulating: diff >= VDROPOUT };
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._regState) return;

    const { OUT, GND } = solver.getNets(comp, ["OUT", "GND"]);
    const vOut = OUT ? (electrical.netVoltage.get(OUT) ?? 0) : 0;
    const vGnd = GND ? (electrical.netVoltage.get(GND) ?? 0) : 0;

    inst.updatePhysics?.({
      vOut:       vOut - vGnd,
      regulating: inst._regState.regulating,
      vIn:        inst._regState.diff,
    });
  }
}