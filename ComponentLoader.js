"use strict";

import createPins   from "./src/createPins.js";
import { registry } from "./src/ComponentRegistry.js";

// ── GROUP A imports — simple components, ctx ki zaroorat nahi ──────────────
 import VirtualBattery9V       from "./svg/Battery9V.js";
// import RGBLed                 from "./svg/rgb.js";
// import VirtualBulb            from "./svg/VirtualBulb.js";
// import VirtualInductor        from "./svg/VirtualInductor.js";
 import Capacitor              from "./svg/VirtualCapacitor.js";
 import PolorizedCapacitor     from "./svg/capacitor.js";
// import ZenerDiode             from "./svg/ZenerDiode.js";
// import VirtualLDR             from "./svg/VirtualLDR.js";
 import VirtualDCMotor         from "./svg/dcmotor.js";
// import VirtualGearMotor       from "./svg/VirtualGearMotor.js";
 import VirtualCoinBattery     from "./svg/VirtualCoinBattery.js";
// import VirtualNPNTransistor   from "./svg/VirtualNPNTransistor.js";
// import VirtualRegulator7805   from "./svg/regulator.js";
// import SevenSegment1          from "./svg/SevenSegment.js";
// import FourDigitSevenSegment  from "./svg/FourDigitSevenSegment.js";
// import I2CLcd16x2             from "./svg/I2CLcd16x2.js";
// import ServoMotor             from "./svg/servo.js";
// import VirtualBuzzer          from "./svg/VirtualBuzzer.js";

// ── GROUP B imports — inko ctx.digitalInputs (ya digitalOutputs) chahiye ───
// import SoundSensor            from "./svg/soundSensor.js";
// import FlameSensor            from "./svg/flameSensor.js";
// import VirtualVibrationSensor from "./svg/VirtualVibrationSensor.js";
// import PIRSensor              from "./svg/Pis.js";
 import PushButtons            from "./svg/PushButton.js";
// import ToggleSwitch           from "./svg/togle.js";
// import TouchSensor            from "./svg/touch.js";
// import VirtualTiltSensor      from "./svg/tiltsensor.js";
const ALL = [
  // ── Group A ──
   VirtualBattery9V,
  // RGBLed,
  // VirtualBulb,
  // VirtualInductor,
  Capacitor,
   PolorizedCapacitor,
  // ZenerDiode,
  // VirtualLDR,
  VirtualDCMotor,
  // VirtualGearMotor,
   VirtualCoinBattery,
  // VirtualNPNTransistor,
  // VirtualRegulator7805,
  // SevenSegment1,
  // FourDigitSevenSegment,
  // I2CLcd16x2,
  // ServoMotor,
  // VirtualBuzzer,

  // ── Group B ──
  // SoundSensor,
  // FlameSensor,
  // VirtualVibrationSensor,
  // PIRSensor,
  PushButtons,
  // ToggleSwitch,
  // TouchSensor,
  // VirtualTiltSensor,
];

for (const C of ALL) {
  if (!C?.manifest?.id)
    console.error("[ComponentLoader] ❌ manifest.id missing:", C?.name ?? C);
  if (!C?.manifest?.factory)
    console.warn("[ComponentLoader] ⚠️  manifest.factory missing:", C?.manifest?.id ?? C?.name);
}

const TYPE_MAP = Object.create(null);
for (const C of ALL) {
  if (C?.manifest?.id) TYPE_MAP[C.manifest.id] = C;
}

export const LOADER_IDS = new Set(Object.keys(TYPE_MAP));

// ── Sidebar build — pehle jaisa hi, koi change nahi ─────────────────────────
export function buildSidebar() {
  const grid = document.querySelector(".components-grid");
  if (!grid) {
    console.warn("[ComponentLoader] .components-grid not found");
    return;
  }

  const groups = Object.create(null);
  for (const C of ALL) {
    const m = C.manifest;
    const g = m.group ?? "Misc";
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  }

  for (const [groupName, items] of Object.entries(groups)) {
    let header = [...grid.querySelectorAll(".comp-group")]
      .find(el => el.textContent.trim() === groupName);

    if (!header) {
      header = document.createElement("div");
      header.className   = "comp-group";
      header.textContent = groupName;
      grid.appendChild(header);
    }

    for (const m of items) {
      if (grid.querySelector(`[id="${m.id}"]`)) continue;

      const card     = document.createElement("div");
      card.className = "component-card";
      card.innerHTML = `
        <img
          id="${m.id}"
          class="comp-img"
          src="${m.imageSrc ?? ''}"
          alt="${m.label}"
          draggable="false"
        />
        <div class="component-label">${m.label}</div>
      `;
      grid.appendChild(card);
    }
  }
}

// ── Spawner factory ──────────────────────────────────────────────────────────
export function makeLoaderSpawner(
  workspace,
  wireSys,
  pinsArray,
  deleteSystem,
  startDragFn,
  undoRedoRef,
  digitalInputs,
  digitalOutputs
) {
  const ctx = { digitalInputs, digitalOutputs };

  return async function spawnLoaded(
    type,
    x        = 0,
    y        = 0,
    forcedId = null,
    skipUndo = false
  ) {
    const C = TYPE_MAP[type];
    if (!C) return false;

    const m      = C.manifest;
    const compId = registry.generateId(m.id, forcedId);

    let instance;
    try {
      instance = m.factory ? m.factory(ctx) : new C();
    } catch (err) {
      console.error(`[ComponentLoader] factory() failed for "${type}":`, err);
      return false;
    }

    const svg = instance.getElement?.();
    if (!svg) {
      console.error(`[ComponentLoader] getElement() returned nothing for "${type}"`);
      return false;
    }

    if (svg.hasAttribute("transform")) {
      svg.setAttribute("transform", `translate(${x}, ${y})`);
    } else {
      svg.setAttribute("x", x);
      svg.setAttribute("y", y);
    }

    svg.classList.add("draggable", ...(m.cssClasses ?? []));
    svg.dataset.type = m.id;
    svg.dataset.id   = compId;
    svg.__instance   = instance;

    if (m.pins?.length) {
      const Pins = new createPins(svg, wireSys, pinsArray);
      for (const p of m.pins) {
        Pins.createPin(svg, p.x, p.y, p.size ?? 10, p.size ?? 10, p.id);
      }
    }

    svg.addEventListener("mousedown", startDragFn);
    workspace.appendChild(svg);

    // ── FIX 1: instanceNameBase handling ──
    // instanceNameBase wale components ke liye auto-generated naam banao
    // (battery, ind, cap, npn, etc.) — taaki code se getOrBindComponent()
    // se isko bind kiya ja sake, jaise purane ComponentSpawner mein hota tha.
    let instanceName;
    if (m.instanceNameBase) {
      const existing = registry.getAll().filter(c => c.type === m.id);
      instanceName   = existing.length === 0
        ? m.instanceNameBase
        : `${m.instanceNameBase}-${existing.length + 1}`;
      if (Object.prototype.hasOwnProperty.call(instance, "instanceName")) {
        instance.instanceName = instanceName;
      }
    }

    // ── FIX 2: power/signal pin metadata preserve karo ──
    // Pehle sirf `conductive` jaata tha, `power`/`signal` silently drop ho
    // rahe the — isse polarity/physics checks (jaise requiresPolarity) sahi
    // se kaam nahi karte the. Default conductive ab power/signal pin ke
    // liye false hoga (jaise purane COMPONENT_CONFIG mein servo VCC/GND/SIG).
    const pins = (m.pins ?? []).map(p => ({
      id:         p.id,
      conductive: p.conductive ?? !(p.power || p.signal),
      power:      p.power  ?? null,
      signal:     p.signal ?? null,
      pinKey:     `${compId}:${p.id}`,
    }));

    const payload = {
      id:      compId,
      type:    m.id,
      instance,
      svg,
      pins,
      physics: m.physics ?? {},
    };

    // ── FIX 3: model field registry tak pahunchao ──
    // DIGITAL_INPUT jaise model registry.MODEL_MAP se resolve hote hain —
    // pehle ye field payload mein jaata hi nahi tha.
    if (m.model)      payload.model       = m.model;
    if (instanceName) payload.instanceName = instanceName;

    registry.registerComponent(payload);
    deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && undoRedoRef.current) {
      undoRedoRef.current.recordSpawn(m.id, compId, { x, y });
    }

    return true;
  };
}