

"use strict";

import { registry } from "../../ComponentRegistry.js";

const R_HOLE = 0.05;   // 50 mΩ — real breadboard contact resistance

export default class BreadboardModel {

  static solve(comp, electrical, solver) {
    if (!comp.instance) return;
    BreadboardModel._bridgeMountedComponents(comp, electrical, solver);
  }

  static _push(electrical, id, a, b, ohms) {
    if (!a || !b || a === b) return;
    electrical.circuits.push({ id, a, b, ohms, type: "WIRE" });
  }

  static _bridgeMountedComponents(comp, electrical, solver) {
    const bbId = comp.id;

    let allComps;
    try { allComps = registry.getAll(); }
    catch { return; }

    const mounted = allComps.filter(c => c.mountedOn === bbId);

    for (const child of mounted) {
      if (!child.pins?.length) continue;

      for (const pin of child.pins) {
        const hole = pin.connectedToBreadboardHole ?? null;
        if (!hole) continue;

        const pinNet  = solver.findNet(child.id, pin.id);
        const holeNet = solver.findNet(bbId, hole);

        if (!pinNet || !holeNet || pinNet === holeNet) continue;

        BreadboardModel._push(
          electrical,
          `${bbId}_bridge_${child.id}_${pin.id}`,
          pinNet,
          holeNet,
          R_HOLE,
        );
      }
    }
  }

  static reset(_comp, _solver) {}
}

