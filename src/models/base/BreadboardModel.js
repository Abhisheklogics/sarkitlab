"use strict";

const R_HOLE        = 0.001;
const R_RAIL        = 0.001;
const R_COMPONENT   = 0.05;

export default class BreadboardModel {

  static solve(comp, electrical, solver) {
    if (!comp.instance) return;

    BreadboardModel._stampRails(comp, electrical, solver);
    BreadboardModel._stampColumnGroups(comp, electrical, solver);
    BreadboardModel._bridgeMountedComponents(comp, electrical, solver);
  }

  static _push(electrical, id, a, b, ohms) {
    if (!a || !b || a === b) return;
    electrical.circuits.push({ id, type: "WIRE", a, b, ohms });
  }

  static _stampRails(comp, electrical, solver) {
    const bbId = comp.id;
    const cols = comp.instance?.columns ?? 30;

    for (const rail of ["tneg", "tpos", "bpos", "bneg"]) {
      let prevNet = solver.findNet(bbId, `${rail}1`);
      for (let c = 2; c <= cols; c++) {
        const net = solver.findNet(bbId, `${rail}${c}`);
        if (prevNet && net && prevNet !== net)
          BreadboardModel._push(electrical, `${bbId}_${rail}_${c}`, prevNet, net, R_RAIL);
        if (net) prevNet = net;
      }
    }
  }

  static _stampColumnGroups(comp, electrical, solver) {
    const bbId    = comp.id;
    const cols    = comp.instance?.columns ?? 30;
    const topRows = ["a","b","c","d","e"];
    const botRows = ["f","g","h","i","j"];

    for (let c = 1; c <= cols; c++) {
      for (const rows of [topRows, botRows]) {
        let prevNet = solver.findNet(bbId, `${rows[0]}${c}`);
        for (let r = 1; r < rows.length; r++) {
          const net = solver.findNet(bbId, `${rows[r]}${c}`);
          if (prevNet && net && prevNet !== net)
            BreadboardModel._push(electrical, `${bbId}_col_${rows[r]}${c}`, prevNet, net, R_HOLE);
          if (net) prevNet = net;
        }
      }
    }
  }

  static _bridgeMountedComponents(comp, electrical, solver) {
    const bbId    = comp.id;
    const allComps = solver.registry?.getAll?.() ?? [];

    for (const child of allComps) {
      if (child.mountedOn !== bbId || !child.pins?.length) continue;

      for (const pin of child.pins) {
        const hole = pin.connectedToBreadboardHole ?? null;
        if (!hole) continue;

        const pinNet  = solver.findNet(child.id, pin.id);
        const holeNet = solver.findNet(bbId, hole);

        if (!pinNet || !holeNet || pinNet === holeNet) continue;

        BreadboardModel._push(
          electrical,
          `${bbId}_bridge_${child.id}_${pin.id}`,
          pinNet, holeNet,
          R_COMPONENT
        );
      }
    }
  }

  static reset(_comp) {}
}