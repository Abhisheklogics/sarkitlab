"use strict";

const R_CONTACT = 0.10;

export default class BreadboardModel {

  static solve(comp, electrical, solver) {
    if (!comp.instance) return;
    BreadboardModel._bridgeMountedComponents(comp, electrical, solver);
  }

  static _push(electrical, id, a, b, ohms) {
    if (!a || !b || a === b) return;
    electrical.circuits.push({ id, type: "WIRE", a, b, ohms });
  }

  static _bridgeMountedComponents(comp, electrical, solver) {
    const bbId     = comp.id;
    const allComps = solver.registry?.getAll?.() ?? [];

    for (const child of allComps) {
      if (child.mountedOn !== bbId) continue;

      const pins = child.pins ?? child.instance?.pins ?? [];
      if (!pins.length) continue;

      for (const pin of pins) {
        const hole    = pin.connectedToBreadboardHole ?? pin.bbHole ?? null;
        if (!hole) continue;

        const pinNet  = solver.findNet(child.id, pin.id ?? pin.pinId);
        const holeNet = solver.findNet(bbId, hole);

        if (!pinNet || !holeNet || pinNet === holeNet) continue;

        BreadboardModel._push(
          electrical,
          `${bbId}_bridge_${child.id}_${pin.id ?? pin.pinId}`,
          pinNet,
          holeNet,
          R_CONTACT
        );
      }
    }
  }

  static update(_comp, _electrical, _solver) {}

  static reset(comp) {
    if (comp.instance) {
      comp.instance._cachedShorts = null;
    }
  }
}