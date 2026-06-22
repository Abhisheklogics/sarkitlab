"use strict";

/**
 * BreadboardModel — CircuitSolver ke liye solve() aur update() model
 *
 * IMPORTANT ARCHITECTURE NOTE:
 * Breadboard ke internal connections (rail continuity + column groups) pehle se
 * buildNetlist() → getActiveShorts() ke through wire branches ban jaate hain.
 * NetlistBuilder unhe ek hi net mein merge kar deta hai.
 * Isliye yahan hum SIRF mounted components ka bridge karte hain —
 * rails aur columns dobara stamp karna duplicate conductance deta hai.
 *
 * Real breadboard physics:
 *   Rail  : ~0.05Ω per hole (copper strip)  → ek net mein merge ho jaate hain
 *   Column: ~0.05Ω per row-row jump          → ek net mein merge ho jaate hain
 *   Component leg → hole: ~0.1Ω contact resistance
 */

const R_CONTACT = 0.10;   // component leg to hole contact resistance (Ω)

export default class BreadboardModel {

  /**
   * solve() — har NR iteration mein call hota hai.
   * Sirf mounted component pins ko unke breadboard hole nets se bridge karta hai.
   */
  static solve(comp, electrical, solver) {
    if (!comp.instance) return;
    BreadboardModel._bridgeMountedComponents(comp, electrical, solver);
  }

  /**
   * Internal helper — small resistance stamp between two nets.
   * a === b ya dono null hoon toh skip karo.
   */
  static _push(electrical, id, a, b, ohms) {
    if (!a || !b || a === b) return;
    electrical.circuits.push({ id, type: "WIRE", a, b, ohms });
  }

  /**
   * Mounted components ke pins ko breadboard holes se connect karo.
   *
   * ComponentSpawner.connectPinToBreadboard() ne:
   *   comp.mountedOn = bbId
   *   pin.connectedToBreadboardHole = "a1" / "f5" / etc.
   * set kar diya hota hai drag-drop pe.
   *
   * Hum solver.findNet() se dono sides ke nets dhundhte hain aur ek
   * low-resistance branch stamp karte hain.
   */
  static _bridgeMountedComponents(comp, electrical, solver) {
    const bbId     = comp.id;
    const allComps = solver.registry?.getAll?.() ?? [];

    for (const child of allComps) {
      if (child.mountedOn !== bbId) continue;
      if (!child.pins?.length)       continue;

      for (const pin of child.pins) {
        const hole = pin.connectedToBreadboardHole ?? null;
        if (!hole) continue;

        // Component pin ka net (jaise "led-1:Anode")
        const pinNet = solver.findNet(child.id, pin.id);

        // Breadboard hole ka net (jaise "breadboard-1:a3" — already merged by NetlistBuilder)
        const holeNet = solver.findNet(bbId, hole);

        if (!pinNet || !holeNet) continue;
        if (pinNet === holeNet)  continue;  // already same net, kuch karna nahi

        BreadboardModel._push(
          electrical,
          `${bbId}_bridge_${child.id}_${pin.id}`,
          pinNet,
          holeNet,
          R_CONTACT
        );
      }
    }
  }

  static update(_comp, _electrical, _solver) {
    // Breadboard ka koi dynamic state update nahi hota
  }

  static reset(_comp) {
    // Nothing to reset
  }
}