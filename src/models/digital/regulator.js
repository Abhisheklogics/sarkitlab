"use strict";

const VREG         = 5.0;
const VDROPOUT     = 1.5;
const VDROPOUT_MIN = 1.0;
const ROUT_REG     = 0.1;
const ROUT_DROPOUT = 8.0;
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

    if (diff >= VREG + VDROPOUT) {
      // Fully regulating — stiff voltage source
      vOutTarget = VREG;
      Rout       = ROUT_REG;
    } else if (diff >= VREG + VDROPOUT_MIN) {
      // Dropout region — partial regulation
      const ratio = (diff - (VREG + VDROPOUT_MIN)) / (VDROPOUT - VDROPOUT_MIN);
      vOutTarget  = VREG * ratio;
      Rout        = ROUT_DROPOUT;
    } else {
      // Off — input too low
      vOutTarget = 0;
      Rout       = ROUT_OFF;
    }

    // Voltage source stamp: stiff R + correct vOffset
    // Solver: V_out = vGnd + vOutTarget (independent of load)
    electrical.circuits.push({
      id:      `${comp.id}_out`,
      type:    "REGULATOR",
      a:       OUT,
      b:       GND,
      ohms:    Rout,
      vOffset: vOutTarget,   // solver adds this as Vgnd + vOffset already
    });

    // Quiescent current draw from IN pin
    if (IN) {
      electrical.circuits.push({
        id:   `${comp.id}_iq`,
        type: "WIRE",
        a:    IN,
        b:    GND,
        ohms: RIQ,
      });
    }

    const inst = comp.instance;
    if (inst) {
      inst._regState = {
        vIn,
        vGnd,
        diff,
        vOut:       vGnd + vOutTarget,
        regulating: diff >= VREG + VDROPOUT,
      };
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