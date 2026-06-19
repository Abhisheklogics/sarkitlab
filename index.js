"use strict";

import UndoRedoManager        from "./UndoRedoManager.js";
import ArduinoParserEngine    from "./arduinoCompiler.js";
import { AudioEngine }        from "./src/utils/AudioEngine.js";
import WireSystem             from "./src/wireSystem.js";
import ComponentSpawner       from "./ComponentSpawner.js";
import WorkspaceController    from "./WorkspaceController.js";
import ProjectStorage         from "./src/utils/projectsave.js";
import DeleteSystem           from "./physics/delete.js";
import { TinkerCheck }        from "./src/TinkerCheck.js";
import SimulationEngine       from "./src/simEngine.js";
import { registry }           from "./src/ComponentRegistry.js";
import ArduinoEditor          from "./arduino-ide-editor.js";
import "./svg/VirtualSerialMonitor.js";
import Battery9VModel from "./src/models/digital/Battery9VModel.js";
import Battery3VModel from "./src/models/digital/Battery3VModel.js";
import LogicICModel   from "./src/models/digital/logicic.js";

// ── ComponentLoader — universal auto-loader ────────────────────────
import {
  buildSidebar,
  makeLoaderSpawner,
  LOADER_IDS,
} from "./ComponentLoader.js";
// ──────────────────────────────────────────────────────────────────

const workspace     = document.querySelector("#svg1");
const mainBox       = document.querySelector(".mainBox");
const simulationBtn = document.querySelector("#btn2");
const toggleCodeBtn = document.querySelector("#btn");

const pinsArray      = [];
const connections    = [];
const digitalInputs  = {};
let   digitalOutputs = {};
let   pinStates      = {};
let   on             = false;
let   activeResistor = null;
let   engine         = null;
let   projectSaved   = false;

const aceEditor = new ArduinoEditor("codeInput", {
  initialValue: ``,
  onChange: () => { projectSaved = false; _setSaveStatus(false); }
});

const wireSys      = new WireSystem(workspace, connections, () => tCheck?.checkAllConnections());
const deleteSystem = new DeleteSystem(workspace, registry, wireSys, []);

wireSys._onWireFinished = wire => {
  deleteSystem.registerWire(wire);
  projectSaved = false;
  _setSaveStatus(false);
  _updateCompCount();
  const conn = wireSys.connections.find(c => c.wire === wire);
  if (conn && window.undoRedo) window.undoRedo.recordWireDraw(conn);
};

function openResistorEditor(resistor) {
  activeResistor = resistor;
  document.getElementById("resistorEditor").style.display = "block";
}

const spawner = new ComponentSpawner(
  workspace, wireSys, pinsArray, digitalInputs,
  deleteSystem, null, openResistorEditor, null
);

// ── undoRedoRef — loader ko live undoRedo milega ───────────────────
const _undoRedoRef = { current: null };

// ── Loader spawner banao ───────────────────────────────────────────
const _loaderSpawn = makeLoaderSpawner(
  workspace,
  wireSys,
  pinsArray,
  deleteSystem,
  spawner._startDrag,
  _undoRedoRef,      // ref object — baad mein .current set hoga
  digitalInputs,
  digitalOutputs
);

// ── window.spawnComponent — pehle loader, phir purana system ──────
window.spawnComponent = async (type, x, y, forcedId, skipUndo) => {
  // Loader try karo
  const handled = await _loaderSpawn(type, x, y, forcedId, skipUndo);
  if (handled) {
    _updateCompCount();
    _setSaveStatus(false);
    return;
  }
  // Loader ko pata nahi — purana ComponentSpawner
  projectSaved = false;
  _setSaveStatus(false);
  _updateCompCount();
  return spawner.spawnComponent(type, x, y, forcedId, skipUndo);
};

const tCheck  = new TinkerCheck(workspace, wireSys, [], registry);
const storage = new ProjectStorage(registry, wireSys, window.spawnComponent);
const wsCtrl  = new WorkspaceController(workspace, registry, wireSys);
const parser  = new ArduinoParserEngine();

wsCtrl.mount();

// ── Sidebar auto-build ────────────────────────────────────────────
buildSidebar();

// ── UndoRedo setup ────────────────────────────────────────────────
const undoRedo = new UndoRedoManager(registry, wireSys, spawner, workspace);
undoRedo.mount();
window.undoRedo = undoRedo;

spawner.undoRedo       = undoRedo;
_undoRedoRef.current   = undoRedo;   // ← loader ko live reference milega
deleteSystem.undoRedo  = undoRedo;

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
undoRedo.setButtons(undoBtn, redoBtn);
undoBtn?.addEventListener("click", () => undoRedo.undo());
redoBtn?.addEventListener("click", () => undoRedo.redo());

// ── ALLOWED_IDS — loader ke IDs auto merge ────────────────────────
const ALLOWED_IDS = new Set([
  "led","arduino","buzzer","rgb","7-segment","pir",
  "resistor","push","oled","keypad","servo","esp","battery",
  "dcmotor","gear","lcd","digital","vibration","npn","coin",
  "multimeter","toggle","tilt","touch","diode","breadboard",
  "gate1","gate2","gate3","gate4","gate5","gate6","gate7","gate8","gate9",
  "voltage","driver",
  "MQ-2","MQ-3","MQ-4","MQ-135","MQ-5","MQ-6","MQ-7","MQ-8","MQ-9","MQ-131",
  "potentiometer","polorizedcapacitor","inductor","ldr","zener","bulb","capacitor",
  "sound-sensor","flame-sensor","ir-sensor",
]);
LOADER_IDS.forEach(id => ALLOWED_IDS.add(id)); // ← loader IDs auto merge

// ─────────────────────────────────────────────────────────────────

function _updateCompCount() {
  const badge = document.getElementById("compCount");
  if (badge) badge.textContent = registry.getAll().length;
}

document.getElementById("resSelect").onchange = e => {
  document.getElementById("customRes").style.display =
    e.target.value === "custom" ? "block" : "none";
};

document.getElementById("applyRes").onclick = () => {
  let val = document.getElementById("resSelect").value;
  if (val === "custom") val = document.getElementById("customRes").value;
  const newOhms = Number(val);

  if (activeResistor) {
    const oldOhms    = activeResistor.ohms ?? activeResistor.instance?.ohms ?? 1000;
    const resistorRef = activeResistor;
    undoRedo.recordPropChange(
      activeResistor.id ?? activeResistor.svg?.dataset?.id ?? "resistor",
      "ohms", oldOhms, newOhms,
      v => resistorRef.setOhms?.(Number(v))
    );
    activeResistor.setOhms(newOhms);
  }

  document.getElementById("resistorEditor").style.display = "none";
  projectSaved = false;
  _setSaveStatus(false);
};

window.openCapacitorEditor = function(_instance) {};
window.openInductorEditor  = function(_instance) {};

document.addEventListener("DOMContentLoaded", () => {
  const iframeWrapper   = document.getElementById("iframeWrapper");
  const toggleIframeBtn = document.getElementById("toggleIframeBtn");
  const toggleCompBtn   = document.getElementById("toggleCompBtn");
  const resizer         = document.querySelector(".resizer-diagonal");

  toggleCompBtn?.addEventListener("click", () => {
    mainBox.classList.toggle("hidden");
  });

  toggleIframeBtn?.addEventListener("click", () => {
    const show = iframeWrapper.style.display === "none" || !iframeWrapper.style.display;
    iframeWrapper.style.display = show ? "block" : "none";
  });

  if (resizer && iframeWrapper) {
    let resizing = false;
    resizer.addEventListener("mousedown", () => {
      resizing = true;
      document.body.style.userSelect = "none";
      document.getElementById("externalSite").style.pointerEvents = "none";
    });
    window.addEventListener("mousemove", e => {
      if (!resizing) return;
      const w = e.clientX;
      const h = e.clientY - 70;
      if (w > 100 && w <= window.innerWidth)          iframeWrapper.style.width  = w + "px";
      if (h > 100 && e.clientY <= window.innerHeight) iframeWrapper.style.height = h + "px";
    });
    window.addEventListener("mouseup", () => {
      resizing = false;
      document.body.style.userSelect = "auto";
      document.getElementById("externalSite").style.pointerEvents = "auto";
    });
  }
});

toggleCodeBtn?.addEventListener("click", () => {
  const editorEl = document.getElementById("codeInput");
  if (!editorEl) return;
  const isHidden = editorEl.classList.toggle("hidden-panel");
  const icon = toggleCodeBtn.querySelector("i");
  if (icon) icon.className = isHidden ? "fas fa-code-slash" : "fas fa-code";
  toggleCodeBtn.title = isHidden ? "Show Code Editor" : "Hide Code Editor";
});

document.getElementById("toggle-serial")?.addEventListener("click", () => {
  const sm = window.Serial?.container;
  if (sm) sm.style.display = sm.style.display === "none" ? "block" : "none";
});
document.getElementById("clear-serial")?.addEventListener("click", () => {
  window.Serial?.clear();
});

async function doSave() {
  if (!localStorage.getItem("currentUser")) { alert("Pehle login karein!"); return false; }
  const id = await storage.saveProject();
  if (id) {
    projectSaved = true;
    _setSaveStatus(true);
  }
  return !!id;
}

function _setSaveStatus(saved) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.className = "save-status-pill " + (saved ? "saved" : "unsaved");
  el.innerHTML = saved
    ? '<span class="dot saved-dot"></span> Saved'
    : '<span class="dot unsaved-dot"></span> Unsaved';
}

window.addEventListener("load", () => {
  const projectId = new URLSearchParams(window.location.search).get("project");
  if (projectId) {
    storage.loadProject(projectId).then(() => {
      projectSaved = true;
      _setSaveStatus(true);
      _updateCompCount();
    });
  }
});

const user = localStorage.getItem("currentUser");
if (user) {
  let users = JSON.parse(localStorage.getItem("sarkitshala_users") || "[]");
  if (!users.includes(user)) {
    users.push(user);
    localStorage.setItem("sarkitshala_users", JSON.stringify(users));
  }
}

document.getElementById("saveBtn")?.addEventListener("click", doSave);

document.getElementById("compSearch")?.addEventListener("input", function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll(".component-card").forEach(card => {
    const name = card.querySelector(".component-label")?.textContent?.toLowerCase() || "";
    card.style.display = name.includes(q) ? "" : "none";
  });
  document.querySelectorAll(".comp-group").forEach(group => {
    let next = group.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains("comp-group")) {
      if (next.style.display !== "none") hasVisible = true;
      next = next.nextElementSibling;
    }
    group.style.display = hasVisible ? "" : "none";
  });
});

// ── Ghost drag from sidebar ───────────────────────────────────────
let ghost        = null;
let draggingType = null;

function moveGhost(e) {
  if (!ghost) return;
  ghost.style.left = `${e.clientX + 8}px`;
  ghost.style.top  = `${e.clientY + 8}px`;
}

function dropComponent(e) {
  document.removeEventListener("mousemove", moveGhost);
  document.removeEventListener("mouseup",   dropComponent);
  ghost?.remove();
  ghost = null;
  if (!draggingType) return;

  const rect   = workspace.getBoundingClientRect();
  const inside = e.clientX > rect.left && e.clientX < rect.right
              && e.clientY > rect.top  && e.clientY < rect.bottom;

  if (inside) {
    const vbStr = workspace.getAttribute("viewBox");
    let sx = 1, sy = 1, ox = 0, oy = 0;
    if (vbStr) {
      const [vx, vy, vw, vh] = vbStr.split(/\s+/).map(Number);
      sx = vw / rect.width; sy = vh / rect.height;
      ox = vx; oy = vy;
    }
    const x = (e.clientX - rect.left) * sx + ox;
    const y = (e.clientY - rect.top)  * sy + oy;

    // ✅ window.spawnComponent use karo — loader + purana system dono handle
    window.spawnComponent(draggingType, x, y);
  }
  draggingType = null;
}

document.querySelector(".mainBox")?.addEventListener("mousedown", e => {
  const card = e.target.closest(".component-card");
  if (!card) return;
  const img = card.querySelector("image, img");
  const id  = img?.id ?? e.target.id;
  if (!ALLOWED_IDS.has(id)) return;

  draggingType = id;
  ghost = card.cloneNode(true);
  ghost.classList.add("drag-ghost");
  const cardRect = card.getBoundingClientRect();
  ghost.style.width  = cardRect.width  + "px";
  ghost.style.height = cardRect.height + "px";
  document.body.appendChild(ghost);
  moveGhost(e);
  document.addEventListener("mousemove", moveGhost);
  document.addEventListener("mouseup",   dropComponent);
});

// ─────────────────────────────────────────────────────────────────

function _stripComments(code) {
  code = code.replace(/\/\*[\s\S]*?\*\//g, "");
  return code.split("\n").map(line => {
    let inStr = false, out = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' || ch === "'") inStr = !inStr;
      if (!inStr && ch === "/" && line[i + 1] === "/") break;
      out += ch;
    }
    return out;
  }).join("\n");
}

function _lockEditor(lock) {
  const el = aceEditor._textareaEl
          ?? aceEditor.editor?.container
          ?? document.getElementById("codeInput");
  if (!el) return;
  if ('disabled' in el) {
    el.disabled      = lock;
    el.style.opacity = lock ? "0.6" : "1";
  } else {
    el.style.pointerEvents = lock ? "none" : "auto";
    el.style.opacity       = lock ? "0.6" : "1";
  }
}



function _stopSimulation() {
  engine?.stop();

  // Solver state clear karo — REF null karne se PEHLE
  const _solver = window._simEngineRef?._circuitSolver
               ?? window._simEngineRef?.circuitSolver;

  if (_solver) {
    _solver._prevNetV.clear();
    _solver._prevBranchI.clear();
    _solver._lastCircuits  = [];
    _solver._branchMap     = new Map();
    _solver._netCache      = null;
    _solver._cachedNetlist = null;
    _solver._sourceScale   = 1.0;
    _solver._capState      = new Map();
    _solver._indState      = new Map();
  }

  window._simEngineRef = null;
  on = false;
  _lockEditor(false);
  workspace.classList.remove("workspace-locked");
  aceEditor.onSimulationStop();
  _resetAllComponents();
  _setRunState(false);
}

function _setRunState(running) {
  const runIcon  = document.getElementById("runIcon");
  const runLabel = document.getElementById("runLabel");
  if (running) {
    if (runIcon)  runIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    if (runLabel) runLabel.textContent = "Stop";
    simulationBtn?.classList.add("btn-running");
  } else {
    if (runIcon)  runIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    if (runLabel) runLabel.textContent = "Run";
    simulationBtn?.classList.remove("btn-running");
  }
}



function _resetAllComponents() {
  registry.getAll().forEach(comp => {
    const inst = comp.instance ?? comp.__instance;
    if (!inst) return;

    if (comp.type === "led")               inst.setOff?.();
    if (comp.type === "rgb-led")           inst.turnOff?.();
    if (comp.type === "buzzer")            inst.stopTone?.();
    if (comp.type === "dcmotor")           inst.setOff?.();
    if (comp.type === "gearmotor")         inst.setOff?.();
    if (comp.type === "servo")             inst.stop?.(0);
    if (comp.type === "lcd-16x2-i2c")      inst.reset?.();
    if (comp.type === "7-segment")         inst.clear?.();
    if (comp.type === "4-digit-7-segment") { inst.clear?.(); inst.setColon?.(false); }
    if (comp.type === "potentiometer")     inst.onChange = null;
    if (comp.type === "bulb")              inst.setOff?.();

    if (comp.type === "polorizedcapacitor") {
      inst._Vprev       = 0;
      inst.Vprev        = 0;
      inst.Icurrent     = 0;
      inst.Vcurrent     = 0;
      inst.energyStored = 0;
      inst.chargeStored = 0;
      inst.power        = 0;
      inst._isReversed  = false;
      inst._nets        = null;
      inst.updateVoltage?.(0);
    }

    if (comp.type === "capacitor") {
      inst._Vprev       = 0;
      inst.Vprev        = 0;
      inst.Icurrent     = 0;
      inst.Vcurrent     = 0;
      inst.voltage      = 0;
      inst.current      = 0;
      inst.energyStored = 0;
      inst.chargeStored = 0;
      inst.power        = 0;
      inst._nets        = null;
      inst.updateVoltage?.(0);
    }

    if (comp.type === "inductor") {
      inst.Iprev        = 0;
      inst.Icurrent     = 0;
      inst.Vcurrent     = 0;
      inst.energyStored = 0;
      inst.power        = 0;
      inst.isSaturated  = false;
      inst.updateCurrent?.(0);
    }

    if (comp.type === "oled") {
      comp._powered  = false;
      comp._wasOn    = false;
      comp._vcc      = 0;
      comp._sleeping = false;
      inst.initialized    = false;
      inst.displayOn      = true;
      inst.commandMode    = false;
      inst.dataMode       = false;
      inst._renderPending = false;
      inst.clear?.();
    }

    if (comp.type === "keypad") {
  inst.pressedKey = null;
  inst.codeParsed = false;   // SimEngine getKey() call par true karega
  if (inst.colPins && inst.digitalInputs) {
    for (const pin of inst.colPins) {
      if (pin != null) inst.digitalInputs[pin] = 1;
    }
  }
}

    if (comp.type === "dht11") {
      inst.powered     = false;
      inst._heatActive = false;
      inst._wasOn      = false;
      inst.stopHeatWaves?.();
      inst.controlsGroup?.setAttribute("visibility", "hidden");
    }

  
if (comp.type === "ultrasonic") {
  inst.simEngine = engine;
  inst.powered   = false;
  inst.triggered = false;
}

    if (comp.type === "soilMoisture") {
      comp._powered    = false;
      comp._vcc        = 0;
      comp._sigNet     = null;
      comp._sigVoltage = 0;
      inst.powered     = false;
      inst.controlsGroup?.setAttribute("visibility", "hidden");
    }

    if (comp.type === "sound-sensor") {
      inst.reset?.();
      inst._simEngine    = null;
      inst.digitalInputs = {};
    }

    if (comp.type === "flame-sensor") {
      inst.reset?.();
      inst._simEngine    = null;
      inst.digitalInputs = {};
    }

    if (comp.type === "vibrationSensor") {
      inst.reset?.();
      inst._simEngine = null;
    }

    if (comp.type === "pir-sensor") {
      inst.reset?.();
      inst._simEngine = null;
      inst.pinOUT     = null;
      inst._powered   = false;
      inst._nets      = null;
    }

if (comp.type === "battery9v" || comp.type === "battery-9v") {
  Battery9VModel.reset(comp);
  comp.instance?.updatePhysics?.({
    soc: 1.0, voc: 9.4, rint: 1.5, current: 0,
    vterminal: 9.4, dead: false, overload: false,
  });
}

if (
  comp.type === "battery3v"  ||
  comp.type === "battery-3v" ||
  comp.type === "coinbattery" ||
  comp.type === "coinBattery"
) {
  Battery3VModel.reset(comp);
  comp.instance?.updatePhysics?.({
    soc: 1.0, voc: 3.0, rint: 15, current: 0,
    vterminal: 3.0, dead: false, overload: false,
  });
}

const LOGIC_MODELS = new Set([
  "74HC08","74HC32","74HC00","74HC86","74HC02",
  "74HC83","74HC148","74HC153","74HC04","74HC14",
  "74HC74","74HC73","74HC76","74HC266","74HC7266",
]);
if (LOGIC_MODELS.has(comp.model) || comp.type === "logic-ic") {
  LogicICModel.reset(comp);
  inst.reset?.();
}


 if (comp.type?.startsWith("MQ-") || comp.type === "gas-sensor") {
  if (typeof inst.reset === "function") {
    inst.reset();
  } else {
    inst.gasIntensity  = 0;
    inst.currentAnalog = inst.config?.baseline ?? 0;
    inst.outputVoltage = 0;
    inst._doTriggered  = false;
    inst.isTriggered   = false;
    inst._powered      = false;
    inst._updateVisuals?.(false);
    inst.simEngine     = null;
  }
  
  
 
}
 

    
    const SWITCH_TYPES = new Set([
      "pushbutton","toggleSwitch","tiltSensor","touchSensor","vibrationSensor",
    ]);
    if (SWITCH_TYPES.has(comp.type)) {
      if (comp.instance._engineLinked) {
        const curActive = comp.instance.active;
        const curTilted = comp.instance.tilted;
        Object.defineProperty(comp.instance, "active", {
          value: curActive, writable: true, configurable: true,
        });
        if ("tilted" in comp.instance) {
          Object.defineProperty(comp.instance, "tilted", {
            value: curTilted, writable: true, configurable: true,
          });
        }
        comp.instance._engineLinked = false;
      }
      comp.instance._simEngine = null;
      comp._simEngine          = null;
    }
  });

  digitalOutputs = {};
  pinStates      = {};
}


// ─── simulationBtn click handler ─────────────────────────────────────────────

simulationBtn?.addEventListener("click", async () => {
  if (!on) {
    if (!projectSaved) {
      const saved = await doSave();
      if (!saved) return;
    }

    const rawCode   = aceEditor.getValue().trim();
    const emptyCode = !rawCode || rawCode.length === 0;

    let parsed = {
      setup: [], loop: [], functions: {}, variables: {},
      instances: {}, errors: [], warnings: [], canRun: true,
      board: "arduino",
    };

    if (!emptyCode) {
      try {
        const cleanCode = _stripComments(rawCode);
        parsed = parser.arduinoToJSON(cleanCode);
        aceEditor.setDiagnostics(parsed.errors, parsed.warnings);
      } catch (parseErr) {
        console.error("[Parse Error]", parseErr);
        aceEditor.setDiagnostics(
          [{ message: parseErr.message || "Unknown parse error", line: null }],
          []
        );
        return;
      }

      if (!parsed.canRun) return;
    }

    try {
      on = true;
      _lockEditor(true);
      tCheck.checkAllConnections();

      engine = new SimulationEngine(parsed, {
        pinStates,
        digitalInputs,
        digitalOutputs,
        pirDevices: [],
        wireSystem: wireSys,
        onSerialOutput: (text) => { window.Serial?.write(text); },
      });
      window._simEngineRef = engine;

      engine.onError = (err) => {
        console.error("[Simulation Error]", err);
        _stopSimulation();

        const errorParts = [
          err.message || "Simulation error",
          err.hint  ? `Hint: ${err.hint}` : null,
          err.line  ? `Line: ${err.line}` : null,
        ].filter(Boolean);

        window.Serial?.writeError?.(errorParts.join(" | "));

        if (err.line) {
          aceEditor.setDiagnostics(
            [{ message: err.message, line: err.line, col: err.col, fix: err.hint }],
            aceEditor._warnings || []
          );
        }
      };

      const SWITCH_TYPES = new Set([
        "pushbutton","toggleSwitch","tiltSensor","touchSensor","vibrationSensor",
      ]);

      registry.getAll().forEach(comp => {
        if (!comp.instance) return;
        const inst = comp.instance;

       if (comp.type?.startsWith("MQ-") || comp.type === "gas-sensor") {
  inst.simEngine     = engine;
  inst.startTime     = Date.now();
  inst.gasIntensity  = 0;        // ← ye 0 set ho raha hai — sahi
  inst._currentPPM   = inst.config?.ppmMin ?? 200;
  inst._powered      = false;
  inst._warmupDone   = false;
  inst.userThreshold ??= inst.config?.threshold ?? 400;
  
  
}
        if (comp.type === "pir-sensor") {
          inst.digitalInputs = digitalInputs;
          inst._simEngine    = engine;
          inst._powered      = false;
          inst.pinOUT        = null;
          inst._nets         = null;
        }

        if (comp.type === "dht11") {
          inst.powered     = false;
          inst._heatActive = false;
          inst._wasOn      = false;
        }

        if (comp.type === "sound-sensor" || comp.type === "flame-sensor") {
          inst.digitalInputs = digitalInputs;
          inst._simEngine    = engine;
          if (inst.pinDOUT != null)
            digitalInputs[inst.pinDOUT] = comp.type === "flame-sensor" ? 1 : 0;
          inst.startSim?.();
        }

        if (comp.type === "vibrationSensor") {
          inst.digitalInputs = digitalInputs;
          inst._simEngine    = engine;
          inst._powered      = false;
        }

        if (comp.type === "lcd-16x2-i2c") {
          inst.initialized = false;
          inst.validated   = false;
        }

        if (comp.type === "potentiometer") {
          inst.onChange = () => engine.resolveElectrical?.();
        }

        if (comp.type === "keypad") {
          inst.codeParsed = false;
          inst.pressedKey = null;

          const rp = engine.globalVars["rowPins"]
                  ?? engine.globalVars["rowpins"]
                  ?? Object.values(engine.globalVars).find(v =>
                       Array.isArray(v) && v.length === 4 &&
                       v.every(x => typeof x === "number" && x >= 0 && x <= 53)
                     );

          const cp = engine.globalVars["colPins"]
                  ?? engine.globalVars["colpins"]
                  ?? Object.values(engine.globalVars).find(v =>
                       Array.isArray(v) && v.length === 4 &&
                       v.every(x => typeof x === "number" && x >= 0 && x <= 53) &&
                       v !== rp
                     );

          if (Array.isArray(rp) && Array.isArray(cp)) {
            inst.bindPins(rp, cp);
            rp.forEach(p => { if (p != null) pinStates[`D${p}`] = "OUTPUT"; });
            cp.forEach(p => { if (p != null) pinStates[`D${p}`] = "INPUT_PULLUP"; });
          }
        }

        if (SWITCH_TYPES.has(comp.type)) {
          inst._simEngine = engine;
          comp._simEngine = engine;
          if (comp.svg) comp.svg._simEngine = engine;

          if (!inst._engineLinked) {
            inst._engineLinked = true;
            let _active = inst.active ?? false;
            const ad = Object.getOwnPropertyDescriptor(inst, "active");
            if (!ad?.set) {
              Object.defineProperty(inst, "active", {
                get: () => _active,
                set: val => {
                  const changed = val !== _active;
                  _active = val;
                  if (changed) queueMicrotask(() => engine.resolveElectrical?.());
                },
                configurable: true,
              });
            }
            if ("tilted" in inst) {
              let _tilted = inst.tilted ?? false;
              const td = Object.getOwnPropertyDescriptor(inst, "tilted");
              if (!td?.set) {
                Object.defineProperty(inst, "tilted", {
                  get: () => _tilted,
                  set: val => {
                    const changed = val !== _tilted;
                    _tilted = val;
                    if (changed) queueMicrotask(() => engine.resolveElectrical?.());
                  },
                  configurable: true,
                });
              }
            }
          }
        }
      });

      // Empty code mein sirf electrical solve karo — loop nahi chalao
      if (emptyCode) {
        engine.netlist = wireSys?.buildNetlist() ?? null;
        engine.startTime = performance.now();
        engine.loopRunning = true;
        engine._loadParserInstancesToRegistry(parsed);

        // Continuous electrical tick — ruk jaayega jab stop hoga
        const _elecTick = () => {
          if (!engine.loopRunning) return;
          engine.resolveElectrical();
          requestAnimationFrame(_elecTick);
        };
        requestAnimationFrame(_elecTick);

        engine.onStop = () => {};
      } else {
        engine.run(parsed);
      }

      aceEditor.onSimulationStart();
      _setRunState(true);

      window.addEventListener("click", () => AudioEngine.ensure(), { once: true });

    } catch (err) {
      console.error("[Simulation] Start error:", err);
      on = false;
      _lockEditor(false);
      _resetAllComponents();
      _setRunState(false);
    }

  } else {
    _stopSimulation();
  }
});