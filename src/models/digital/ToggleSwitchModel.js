"use strict";

// ─── Toggle Switch Model (SPDT) ────────────────────────────────────────────
//
// Toggle switch types:
//   SPST (2 pin):  T1 — T2. ON = closed, OFF = open.
//   SPDT (3 pin):  COM — T1 (NO) — T2 (NC).
//                  ON:  COM-T1 closed, COM-T2 open
//                  OFF: COM-T1 open,   COM-T2 closed
//
// Contact resistance values:
//   R_ON:  0.05Ω (50mΩ) — real SPDT toggle: 30-100mΩ per contact pair
//   R_OFF: 1e9Ω  (1GΩ)  — real: >10GΩ, 1GΩ safe for MNA solver
//
// FIXES vs original:
//   1. R_ON was 0.1Ω — changed to 0.05Ω (closer to real spec)
//   2. No pulldown/pullup modelling — added weak pulldown on open contacts
//      so floating pins do not cause NR convergence issues when a switch
//      pin is connected but switch is open (floating net → bad for solver)
//   3. Added SPST fallback properly (T1-T2 only, no COM)

const R_ON       = 0.05;    // closed contact resistance (Ω) — 50mΩ
const R_OFF      = 1e9;     // open contact (Ω)
// Weak pulldown on open contacts: prevents floating net NR issues.
// 1MΩ → ~5μA at 5V — negligible for circuit behavior but anchors the node.
const R_FLOAT_PD = 1_000_000;

function pushBranch(electrical, branch) {
  if (branch.a == null || branch.b == null) return;
  if (branch.a === branch.b) return;
  electrical.circuits.push(branch);
}

export const ToggleSwitchModel = {

  solve(comp, electrical, solver) {
    // ── Resolve pins ──────────────────────────────────────────────────────
    const comNet = solver.findNet(comp.id, "COM")
               ?? solver.findNet(comp.id, "C")
               ?? solver.findNet(comp.id, "common");

    const t1Net = solver.findNet(comp.id, "T1")
               ?? solver.findNet(comp.id, "NO")
               ?? solver.findNet(comp.id, "1");

    const t2Net = solver.findNet(comp.id, "T2")
               ?? solver.findNet(comp.id, "NC")
               ?? solver.findNet(comp.id, "2");

    const gndNet = solver.findNet(comp.id, "GND")
               ?? solver.findNet(comp.id, "G");

    const isOn = comp.instance?.active === true;

    // ── SPDT mode (3-pin: COM, T1, T2) ───────────────────────────────────
    if (comNet) {
      if (t1Net) {
        // NO contact: ON = closed, OFF = open
        pushBranch(electrical, {
          id: `${comp.id}_T1`, type: "SWITCH",
          a: comNet, b: t1Net,
          ohms: isOn ? R_ON : R_OFF,
        });
        // When T1 is open, add weak pulldown to anchor the node
        // Only if T1 not connected to a voltage source through other branches
        if (!isOn && gndNet) {
          pushBranch(electrical, {
            id: `${comp.id}_T1_pd`, type: "RESISTOR",
            a: t1Net, b: gndNet,
            ohms: R_FLOAT_PD,
          });
        }
      }
      if (t2Net) {
        // NC contact: ON = open, OFF = closed
        pushBranch(electrical, {
          id: `${comp.id}_T2`, type: "SWITCH",
          a: comNet, b: t2Net,
          ohms: isOn ? R_OFF : R_ON,
        });
        // When T2 is open (switch ON), anchor with weak pulldown
        if (isOn && gndNet) {
          pushBranch(electrical, {
            id: `${comp.id}_T2_pd`, type: "RESISTOR",
            a: t2Net, b: gndNet,
            ohms: R_FLOAT_PD,
          });
        }
      }
      return;
    }

    // ── SPST mode (2-pin: T1 and T2) ─────────────────────────────────────
    if (t1Net && t2Net) {
      pushBranch(electrical, {
        id: `${comp.id}_contact`, type: "SWITCH",
        a: t1Net, b: t2Net,
        ohms: isOn ? R_ON : R_OFF,
      });
      // When open, anchor one side if GND available
      if (!isOn && gndNet) {
        pushBranch(electrical, {
          id: `${comp.id}_spst_pd`, type: "RESISTOR",
          a: t2Net, b: gndNet,
          ohms: R_FLOAT_PD,
        });
      }
    }
  },

  update(comp, electrical, solver) {
    const curr = comp.instance?.active === true;
    if (comp._prevActive !== curr) {
      comp._prevActive = curr;
      const engine = comp._engine
                  ?? comp.instance?._engine
                  ?? comp.instance?.simEngine;
      engine?.resolveElectrical?.();
    }
  },
};


// ─── ToggleSwitch UI ──────────────────────────────────────────────────────
//
// FIX: original lever animation used cy attribute on <circle> which is correct,
// but the transition was on the SVG element not the element style.
// Also: no visual state label, making it hard to tell ON/OFF at a glance.

