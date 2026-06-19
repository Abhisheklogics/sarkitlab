"use strict";

import { registry }   from "./src/ComponentRegistry.js";
import createPins      from "./src/createPins.js";
import IRSensor         from './svg/ir.js';
import Resistor          from "./svg/Resistor.js";
import { Diode }          from "./svg/diode.js";
import Breadboard          from "./svg/breadboard.js";
import PotentiometerIC      from "./svg/Potentiometer.js";
import MQSensorIC            from "./svg/mq.js";
import MotorDriverIC          from "./svg/motordriver.js";
import LogicIC                  from "./svg/logicic.js";

// ── NOTE ──────────────────────────────────────────────────────────────────
// Group A (battery9v, rgb-led, bulb, inductor, capacitor, zener, ldr, dcmotor,
// gearmotor, coinBattery, npnTransistor, regulator7805, polorizedcapacitor,
// 7-segment, 4-digit-7-segment, lcd-16x2-i2c, servo, buzzer) aur
// Group B (sound-sensor, flame-sensor, vibrationSensor, pir-sensor,
// pushbutton, toggleSwitch, touchSensor, tiltSensor) ab ComponentLoader.js
// mein migrate ho chuke hain — yahan se unke imports, COMPONENT_CONFIG
// entries, aur _spawnDigitalInput() method hata diye gaye hain.
//
// ir-sensor aur potentiometer abhi bhi yahin hain — ye bhi ctx nahi
// maangte (Group A jaisa hi simple hain) lekin migrate nahi kiye gaye,
// confirm karke move karna.
// ────────────────────────────────────────────────────────────────────────

const LOGIC_ICS = new Set([
  "74HC08","74HC32","74HC00","74HC86","74HC02",
  "74HC83","74HC148","74HC153","74HC04","74HC14","74HC266",
]);

const MOTOR_DRIVERS = new Set(["L293D","L298N"]);

const IC_PIN_GAP    = 18;
const IC_PIN_OFFSET = 15;
const SNAP_RADIUS   = 10;

const COMPONENT_CONFIG = {

  "ir-sensor": {
    typeKey: "ir-sensor",
    ClassRef: IRSensor,
    cssClass: ["ir-sensor", "draggable"],
    idPrefix: "ir",
    getPins: (data) => data.pins.map(p => ({
      id: p.id,
    })),
  },

  "potentiometer": {
    cssClass: "potentiometer",
    idPrefix: "potentiometer",
    instanceNameBase: "pot",
    customInstance: (compId, data) => new PotentiometerIC(compId, data),
    getPins: (d) => d.pins.map(p => ({ id:p.id, number:p.connectedTo?.pinNumber ?? null })),
  },
};

export default class ComponentSpawner {

  constructor(workspace, wireSys, pinsArray, digitalInputs, deleteSystem, startDragFn, openResistorEditor, undoRedo = null) {
    this.workspace          = workspace;
    this.wireSys            = wireSys;
    this.pinsArray          = pinsArray;
    this.digitalInputs      = digitalInputs;
    this.deleteSystem       = deleteSystem;
    this.startDragFn        = startDragFn;
    this.openResistorEditor = openResistorEditor;
    this._components        = [];
    this.undoRedo           = undoRedo;

    this._activeElement = null;
    this._elStartX      = 0;
    this._elStartY      = 0;
    this._dragStartX    = 0;
    this._dragStartY    = 0;
    this._preDragPos    = null;
    this._rafId         = null;
    this._pendingDragX  = 0;
    this._pendingDragY  = 0;
    this._scaleX        = 1;
    this._scaleY        = 1;

    this._startDrag = this._buildStartDrag();
    this._drag      = this._buildDrag();
    this._stopDrag  = this._buildStopDrag();

    this._onVisibilityChange = () => {
      if (document.hidden && this._activeElement) this._stopDrag();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  destroy() {
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    document.removeEventListener("mousemove", this._drag);
    document.removeEventListener("mouseup",   this._stopDrag);
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  getDragHandlers() {
    return { startDrag: this._startDrag, drag: this._drag, stopDrag: this._stopDrag };
  }

  async spawnComponent(type, x = 0, y = 0, forcedId = null, skipUndo = false) {
    try {
      if (LOGIC_ICS.has(type)) {
        this._spawnLogicIC(type, x, y, forcedId, skipUndo);
        return;
      }
      if (MOTOR_DRIVERS.has(type)) {
        this._spawnMotorDriver(type, x, y, forcedId, skipUndo);
        return;
      }
      if (type?.startsWith("MQ-")) {
        const data = await this._fetchJSON(type);
        if (!data) return;
        await this._spawnMQSensor(data, x, y, forcedId, skipUndo);
        return;
      }
      const data = await this._fetchJSON(type);
      if (!data) return;
      await this._routeSpawn(data, x, y, forcedId, skipUndo);
    } catch (err) {
      console.error(`[ComponentSpawner] Critical error spawning "${type}":`, err);
    }
  }

  async _routeSpawn(data, x, y, forcedId = null, skipUndo = false) {
    const name = data.name;
    if (name === "ArduinoUno")          return this._spawnArduino(data, x, y, forcedId, skipUndo);
    if (name === "led")                 return this._spawnLed(data, x, y, forcedId, skipUndo);
    if (name === "resistor")            return this._spawnResistor(data, x, y, forcedId, skipUndo);
    if (name === "diode")               return this._spawnDiode(data, x, y, forcedId, skipUndo);
    if (name === "breadboard30")        return this._spawnBreadboard(data, x, y, forcedId, skipUndo);
    if (LOGIC_ICS.has(name))            return this._spawnLogicIC(name, x, y, forcedId, skipUndo);
    if (data.type === "motor-driver")   return this._spawnMotorDriver(data.name, x, y, forcedId, skipUndo);
    if (name.startsWith("MQ-"))         return this._spawnMQSensor(data, x, y, forcedId, skipUndo);

    if (COMPONENT_CONFIG[name]) return this._spawnFromConfig(name, data, x, y, forcedId, skipUndo);

    console.warn(`[ComponentSpawner] No handler for "${name}"`);
  }

  _spawnFromConfig(name, data, x, y, forcedId = null, skipUndo = false) {
    const cfg    = COMPONENT_CONFIG[name];
    const compId = registry.generateId(cfg.idPrefix, forcedId);
    const ctx    = { digitalInputs: this.digitalInputs };

    let instance;
    if (cfg.wrapInstance) {
      const raw = new cfg.ClassRef(...(cfg.classArgs ?? []));
      instance  = cfg.wrapInstance(raw);
    } else if (cfg.customInstance) {
      instance = cfg.customInstance(compId, data, ctx);
    } else if (typeof cfg.ClassRef === "function" && !cfg.ClassRef.prototype) {
      instance = cfg.ClassRef();
    } else {
      instance = new cfg.ClassRef(...(cfg.classArgs ?? []));
    }

    cfg.extraSetup?.(instance);

    const svg     = instance.getElement ? instance.getElement() : instance.svg;
    const classes = Array.isArray(cfg.cssClass) ? cfg.cssClass : [cfg.cssClass];
    svg.classList.add(...classes);
    svg.dataset.type = cfg.datasetType ?? name;
    svg.dataset.id   = compId;
    svg.__instance   = instance;

    svg.setAttribute("x", x);
    svg.setAttribute("y", y);

    const pinSize   = cfg.pinSize ?? 10;
    const Pins      = new createPins(svg, this.wireSys, this.pinsArray);
    const pinSource = data.pins ?? data.visual?.pins ?? [];
    pinSource.forEach(pin => Pins.createPin(svg, pin.x, pin.y, pinSize, pinSize, pin.id));

    let instanceName;
    if (cfg.instanceNameBase && !cfg.datasetType) {
      const existing = registry.getAll().filter(c => c.type === name);
      const base     = cfg.instanceNameBase;
      instanceName   = existing.length === 0 ? base : `${base}-${existing.length + 1}`;
      if (Object.prototype.hasOwnProperty.call(instance, "instanceName")) {
        instance.instanceName = instanceName;
      }
    }

    svg.addEventListener("mousedown", this._startDrag);
    if (cfg.prependToWS) this.workspace.prepend(svg);
    else                  this.workspace.appendChild(svg);
    this._register(svg);

    const payload = { id:compId, type:name, instance, svg, pins:cfg.getPins(data, compId) };
    if (instanceName !== undefined) payload.instanceName = instanceName;
    if (cfg.physics)                payload.physics      = cfg.physics;
    registry.registerComponent(payload);
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn(name, compId, { x, y });
    }
  }

  _spawnArduino(data, x, y, forcedId = null, skipUndo = false) {
    const compId = registry.generateId("arduino", forcedId);
    const svg    = this._makeSVG(data.width, data.height, x, y, ["draggable"]);
    svg.dataset.type = "arduino";
    svg.dataset.id   = compId;
    svg.appendChild(this._makeImage(data.path, data.width, data.height));

    const Pins = new createPins(svg, this.wireSys, this.pinsArray);
    data.pins.forEach(pin => Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id));

    const instance = {
      svg, pins: data.pins, pinStates: {},
      powerPins: { "5V":false, "3.3V":false, "GND":true },
      setPin(pin, val) { this.pinStates[pin] = val; },
      getPin(pin)      { return this.pinStates[pin] ?? 0; },
    };
    svg.__instance = instance;

    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.appendChild(svg);
    this._register(svg);
    registry.registerComponent({
      id:compId, type:"arduino", instance, instanceName:compId, svg,
      pins: data.pins.map(p => ({ id:p.id, number:p.id })),
    });
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("ArduinoUno", compId, { x, y });
    }
  }

  _spawnLed(data, x, y, forcedId = null, skipUndo = false) {
    const compId = registry.generateId("led", forcedId);
    const svg    = this._makeSVG(data.visual.width, data.visual.height, x, y, ["draggable"]);
    svg.dataset.type = "led";
    svg.dataset.id   = compId;
    const image = this._makeImage(data.visual.path, data.visual.width, data.visual.height);
    image.style.filter = "brightness(0)";
    svg.appendChild(image);

    const Pins = new createPins(svg, this.wireSys, this.pinsArray);
    data.visual.pins.forEach(pin => Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id));

    const ledInstance = {
      svg,
      pins: data.visual.pins,
      powered: false,
      isValid: false,
      _nets: null,
      forwardVoltage: data.electrical?.forwardVoltage ?? data.visual?.forwardVoltage ?? 2.0,
      IS: data.IS ?? 1e-12,
      n:  data.n  ?? 1.8,

      setOn(intensity = 1) {
        this.powered = true;
        image.style.filter = `brightness(${Math.max(0.1, intensity)})`;
      },
      setOff() {
        this.powered = false;
        image.style.filter = "brightness(0)";
      },
      applyElectrical(current = 0, intensity = 0) {
        current <= 0 || intensity <= 0 ? this.setOff() : this.setOn(intensity);
      },
    };

    svg.__instance = ledInstance;

    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.appendChild(svg);
    this._register(svg);

    registry.registerComponent({
      id:       compId,
      type:     "led",
      instance: ledInstance,
      svg,
      pins: data.visual.pins.map(p => ({
        id:      p.id,
        pinKey:  `${compId}:${p.id}`,
        power:   p.id === "Cathode" || p.id === "K" ? "GND" : null,
        conductive: true,
      })),
      physics: {
        conductive:         false,
        requiresClosedLoop: true,
        requiresPolarity:   true,
        allowsSeries:       true,
      },
    });

    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("led", compId, { x, y });
    }
  }

  _spawnResistor(data, x, y, forcedId = null, skipUndo = false) {
    const id       = registry.generateId("resistor", forcedId);
    const resistor = new Resistor("1kΩ", {}, id, null, this.openResistorEditor);
    const svg      = resistor.getElement();

    svg.id           = id;
    svg.dataset.id   = id;
    svg.dataset.type = "resistor";
    svg.classList.add("draggable");
    svg.setAttribute("x", x);
    svg.setAttribute("y", y);
    svg.__instance   = resistor;

    resistor.pinA = "T1";
    resistor.pinB = "T2";

    const Pins = new createPins(svg, this.wireSys, this.pinsArray);
    Pins.createPin(svg, data.visual.pins[0].x, data.visual.pins[0].y, 15, 15, "T1");
    Pins.createPin(svg, data.visual.pins[1].x, data.visual.pins[1].y, 15, 15, "T2");

    registry.registerComponent({
      id,
      type:     "resistor",
      instance: resistor,
      svg,
      pins:    [{ id:"T1", conductive:true }, { id:"T2", conductive:true }],
      physics: { conductive:true, requiresClosedLoop:false, requiresPolarity:false, allowsSeries:true },
    });

    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.appendChild(svg);
    this._register(svg);
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("resistor", id, { x, y });
    }
  }

  _spawnDiode(data, x, y, forcedId = null, skipUndo = false) {
    const id    = registry.generateId("diode", forcedId);
    const diode = new Diode({}, null, id);
    const svg   = diode.getElement();

    svg.id = svg.dataset.id = id;
    svg.dataset.type = "diode";
    svg.classList.add("draggable");
    svg.setAttribute("x", x);
    svg.setAttribute("y", y);
    svg.__instance = diode;

    const Pins = new createPins(svg, this.wireSys, this.pinsArray);
    Pins.createPin(svg, data.visual.pins[0].x, data.visual.pins[0].y, 15, 15, "A");
    Pins.createPin(svg, data.visual.pins[1].x, data.visual.pins[1].y, 15, 15, "K");

    registry.registerComponent({
      id, type:"diode", instance:diode, svg,
      pins:[{ id:"A", conductive:true },{ id:"K", conductive:true }],
      physics:{ conductive:true, requiresClosedLoop:true, requiresPolarity:true, allowsSeries:true, blocksReverse:true },
    });
    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.appendChild(svg);
    this._register(svg);
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("diode", id, { x, y });
    }
  }

  _spawnBreadboard(_data, x, y, forcedId = null, skipUndo = false) {
    const compId     = registry.generateId("breadboard", forcedId);
    const breadboard = new Breadboard(compId, this.wireSys, this.pinsArray);
    const svg        = breadboard.getElement();

    svg.classList.add("breadboard","draggable");
    svg.dataset.type = "breadboard";
    svg.dataset.id   = compId;
    svg.__instance   = breadboard;
    svg.style.willChange = "transform";
    svg.setAttribute("transform", `translate(${x}, ${y})`);

    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.prepend(svg);
    this._register(svg);
    registry.registerComponent({ id:compId, type:"breadboard", instance:breadboard, svg, pins:[] });
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("breadboard30", compId, { x, y });
    }
  }

  _spawnLogicIC(modelName, x, y, forcedId = null, skipUndo = false) {
    const compId     = registry.generateId(`ic-${modelName}`, forcedId);
    const icInstance = new LogicIC(compId, modelName, this.wireSys, this.pinsArray);
    const svg        = icInstance.getElement();

    svg.classList.add("logic-ic","draggable");
    svg.dataset.type  = "logic-ic";
    svg.dataset.id    = compId;
    svg.dataset.model = modelName;
    svg.__instance    = icInstance;
    svg.style.willChange = "transform";
    svg.setAttribute("transform", `translate(${x}, ${y})`);

    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.appendChild(svg);
    this._register(svg);
    registry.registerComponent({
      id:compId, type:"logic-ic", model:modelName, instance:icInstance, svg,
      pins: icInstance.pins.map(p => ({ id:p.id, element:p.element })),
    });
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("logic-ic", compId, { x, y }, modelName);
    }
  }

  _spawnMotorDriver(modelName, x, y, forcedId = null, skipUndo = false) {
    const compId     = registry.generateId(`ic-${modelName}`, forcedId);
    const icInstance = new MotorDriverIC(compId, modelName, this.wireSys, this.pinsArray);
    const svg        = icInstance.getElement();

    svg.classList.add("motor-driver-ic","draggable");
    svg.dataset.id    = compId;
    svg.dataset.type  = "motor-driver";
    svg.dataset.model = modelName;
    svg.__instance    = icInstance;
    svg.style.willChange = "transform";
    svg.setAttribute("transform", `translate(${x}, ${y})`);

    svg.addEventListener("mousedown", this._startDrag);
    this.workspace.appendChild(svg);
    this._register(svg);
    registry.registerComponent({
      id:compId, type:"motor-driver", model:modelName, instance:icInstance, svg,
      pins: icInstance.pins.map(p => ({ id:p.id, element:p.element })),
    });
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("motor-driver", compId, { x, y }, modelName);
    }
  }

  async _spawnMQSensor(data, x, y, forcedId = null, skipUndo = false) {
    const compId   = registry.generateId(data.name.toLowerCase(), forcedId);
    const mqSensor = new MQSensorIC(compId, data, this.simEngine);
    const svg      = mqSensor.getElement();

    svg.__instance   = mqSensor;
    svg.classList.add("mq-sensor", "draggable");
    svg.dataset.type  = data.name;
    svg.dataset.id    = compId;
    svg.dataset.model = data.name;

    svg.addEventListener("mousedown", e => {
      if (e.target.closest("#mq-pot-knob")) return;
      this._startDrag(e);
      const onMove = () => mqSensor._positionSmokeBox?.();
      const onUp   = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup",   onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup",   onUp);
    });

    const Pins    = new createPins(svg, this.wireSys, this.pinsArray);
    const pinDefs = mqSensor.getPinDefs();
    for (const pin of pinDefs) {
      Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id);
    }

    svg.setAttribute("x", x);
    svg.setAttribute("y", y);
    this.workspace.appendChild(svg);
    this._register(svg);

    registry.registerComponent({
      id      : compId,
      type    : data.name,
      model   : data.name,
      instance: mqSensor,
      svg,
      pins    : pinDefs.map(p => ({ id: p.id, pinKey: `${compId}:${p.id}` })),
    });

    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn(data.name, compId, { x, y }, data.name);
    }
  }

  _buildStartDrag() {
    const self = this;
    return function startDrag(e) {
      e.stopPropagation();
      self._activeElement = e.currentTarget;
      const el = self._activeElement;

      const transform = el.getAttribute("transform") || "";
      const m         = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
      self._elStartX   = m ? parseFloat(m[1]) : parseFloat(el.getAttribute("x")) || 0;
      self._elStartY   = m ? parseFloat(m[2]) : parseFloat(el.getAttribute("y")) || 0;
      self._dragStartX = e.clientX;
      self._dragStartY = e.clientY;
      self._preDragPos = { x: self._elStartX, y: self._elStartY };

      const wsRect = self.workspace.getBoundingClientRect();
      const vbStr  = self.workspace.getAttribute("viewBox");
      if (vbStr) {
        const [,, vw, vh] = vbStr.split(/\s+/).map(Number);
        self._scaleX = vw / wsRect.width;
        self._scaleY = vh / wsRect.height;
      } else {
        self._scaleX = 1;
        self._scaleY = 1;
      }

      if (el.dataset.type === "breadboard") {
        const bbId = el.dataset.id;
        registry.getAll()
          .filter(c => c.mountedOn === bbId)
          .forEach(child => {
            const t  = child.svg.getAttribute("transform") || "";
            const cm = t.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
            child.dragStartX = cm ? parseFloat(cm[1]) : parseFloat(child.svg.getAttribute("x")) || 0;
            child.dragStartY = cm ? parseFloat(cm[2]) : parseFloat(child.svg.getAttribute("y")) || 0;
          });
      }

      document.addEventListener("mousemove", self._drag);
      document.addEventListener("mouseup",   self._stopDrag);
    };
  }

  _buildDrag() {
    const self = this;
    return function drag(e) {
      if (!self._activeElement) return;

      self._pendingDragX = e.clientX;
      self._pendingDragY = e.clientY;

      if (self._rafId) return;
      self._rafId = requestAnimationFrame(() => {
        self._rafId = null;
        if (!self._activeElement) return;

        const el  = self._activeElement;
        const dx  = (self._pendingDragX - self._dragStartX) * self._scaleX;
        const dy  = (self._pendingDragY - self._dragStartY) * self._scaleY;
        const newX = self._elStartX + dx;
        const newY = self._elStartY + dy;

        if (el.getAttribute("transform")) {
          el.setAttribute("transform", `translate(${newX}, ${newY})`);
        } else {
          el.setAttribute("x", newX);
          el.setAttribute("y", newY);
        }

        if (el.dataset.type === "breadboard") {
          const bbId = el.dataset.id;
          registry.getAll()
            .filter(c => c.mountedOn === bbId)
            .forEach(child => {
              const cx = child.dragStartX + dx;
              const cy = child.dragStartY + dy;
              if (child.svg.getAttribute("transform")?.includes("translate")) {
                child.svg.setAttribute("transform", `translate(${cx}, ${cy})`);
              } else {
                child.svg.setAttribute("x", cx);
                child.svg.setAttribute("y", cy);
              }
              self.wireSys.updateWiresForComponent(child.svg);
            });
        }

        self.wireSys.updateWiresForComponent(el);

        if (el.dataset.type === "breadboard") return;

        const isIC = el.dataset.type === "logic-ic" || el.dataset.type === "motor-driver";
        const comp = registry.getComponentById(el.dataset.id);

        const foundHoles = isIC
          ? self._detectICBreadboardSnap(el, comp)
          : self._detectBreadboardHoles(el);

        if (foundHoles.length === 0) {
          el.tempSnapData  = null;
          el.style.outline = "";

          if (comp) {
            comp.mountedOn = null;
            comp.pins?.forEach(p => { if (p) p.connectedToBreadboardHole = null; });
          }
          return;
        }

        el.tempSnapData  = foundHoles;
        el.style.outline = "2px solid #4caf50";

        if (comp) {
          for (const snap of foundHoles) {
            const targetPin = comp.pins?.find(p => p?.id === snap.cPinId);
            if (targetPin) targetPin.connectedToBreadboardHole = snap.bPinId;
          }
        }
      });
    };
  }

  _detectICBreadboardSnap(el, comp) {
    const allPins = Array.from(el.querySelectorAll(".connection-point"));
    const found   = [];
    if (!allPins.length) return found;

    const ctm = this.workspace.getScreenCTM();
    if (!ctm) return found;
    const inv = ctm.inverse();

    const bbEls = document.querySelectorAll("[data-type='breadboard']");
    if (!bbEls.length) return found;

    const holeData = [];
    for (const bbEl of bbEls) {
      for (const hole of bbEl.querySelectorAll(".connection-point")) {
        const r  = hole.getBoundingClientRect();
        const pt = DOMPoint.fromPoint({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
                           .matrixTransform(inv);
        holeData.push({ hole, x: pt.x, y: pt.y });
      }
    }

    for (const pin of allPins) {
      const pr  = pin.getBoundingClientRect();
      const pt  = DOMPoint.fromPoint({ x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 })
                          .matrixTransform(inv);

      let best = null, bestDist = 12;
      for (const h of holeData) {
        const dist = Math.hypot(pt.x - h.x, pt.y - h.y);
        if (dist < bestDist) { bestDist = dist; best = h; }
      }

      if (best) {
        found.push({
          cPin:   pin,
          cPinId: pin.dataset.pin,
          bPinId: best.hole.dataset.pin,
          holeEl: best.hole,
        });
      }
    }

    const TOP_ROWS = new Set(["a","b","c","d","e"]);
    const BOT_ROWS = new Set(["f","g","h","i","j"]);
    const hasTop   = found.some(h => TOP_ROWS.has(h.bPinId.match(/^([a-j])/)?.[1] ?? ""));
    const hasBot   = found.some(h => BOT_ROWS.has(h.bPinId.match(/^([a-j])/)?.[1] ?? ""));

    if (!hasTop || !hasBot) return [];
    return found;
  }

  _detectBreadboardHoles(el) {
    const found = [];
    const pins  = el.querySelectorAll(".connection-point");
    if (!pins.length) return found;

    const ctm = this.workspace.getScreenCTM();
    if (!ctm) return found;
    const inv = ctm.inverse();

    const bbEls = document.querySelectorAll("[data-type='breadboard']");
    if (!bbEls.length) return found;

    const holeData = [];
    for (const bbEl of bbEls) {
      const holes = bbEl.querySelectorAll(".connection-point");
      for (const hole of holes) {
        const r   = hole.getBoundingClientRect();
        const pt  = DOMPoint.fromPoint({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
                            .matrixTransform(inv);
        holeData.push({ hole, x: pt.x, y: pt.y });
      }
    }

    for (const pin of pins) {
      const pr  = pin.getBoundingClientRect();
      const pt  = DOMPoint.fromPoint({ x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 })
                          .matrixTransform(inv);

      let best = null, bestDist = 12;

      for (const h of holeData) {
        const dist = Math.hypot(pt.x - h.x, pt.y - h.y);
        if (dist < bestDist) { bestDist = dist; best = h; }
      }

      if (best) {
        found.push({
          cPin:   pin,
          cPinId: pin.dataset.pin,
          bPinId: best.hole.dataset.pin,
          holeEl: best.hole,
        });
      }
    }

    return found;
  }

  _buildStopDrag() {
    const self = this;
    return function stopDrag() {
      const el = self._activeElement;
      if (!el) return;

      if (self._rafId) {
        cancelAnimationFrame(self._rafId);
        self._rafId = null;
      }

      el.style.outline = "";

      const comp = registry.getComponentById(el.dataset.id);

      if (!el.tempSnapData || el.tempSnapData.length === 0) {
        const isIC = el.dataset.type === "logic-ic" || el.dataset.type === "motor-driver";
        const found = isIC
          ? self._detectICBreadboardSnap(el, comp)
          : self._detectBreadboardHoles(el);
        if (found.length > 0) el.tempSnapData = found;
      }

      if (el.tempSnapData?.length > 0) {
        const snapList = el.tempSnapData;

        for (const snap of snapList) {
          self._connectPinToBreadboard(comp, snap.cPinId, snap.bPinId, snap.holeEl);
        }

        const snap   = snapList[0];
        const pinEl  = snap.cPin;
        const holeEl = snap.holeEl;

        const ctm = self.workspace.getScreenCTM();
        if (ctm) {
          const pRect = pinEl.getBoundingClientRect();
          const hRect = holeEl.getBoundingClientRect();
          const inv   = ctm.inverse();
          const pSVG  = DOMPoint.fromPoint({
            x: pRect.left + pRect.width  / 2,
            y: pRect.top  + pRect.height / 2,
          }).matrixTransform(inv);
          const hSVG  = DOMPoint.fromPoint({
            x: hRect.left + hRect.width  / 2,
            y: hRect.top  + hRect.height / 2,
          }).matrixTransform(inv);

          const transform = el.getAttribute("transform") || "";
          const m         = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
          if (m) {
            el.setAttribute("transform",
              `translate(${parseFloat(m[1]) + (hSVG.x - pSVG.x)}, ${parseFloat(m[2]) + (hSVG.y - pSVG.y)})`);
          } else {
            el.setAttribute("x", (parseFloat(el.getAttribute("x")) || 0) + (hSVG.x - pSVG.x));
            el.setAttribute("y", (parseFloat(el.getAttribute("y")) || 0) + (hSVG.y - pSVG.y));
          }
        }

        if (comp) {
          const bbEl     = snap.holeEl.closest("[data-type='breadboard']");
          comp.mountedOn = bbEl?.dataset.id ?? null;
        }

      } else {
        if (comp) {
          comp.mountedOn = null;
          comp.pins?.forEach(p => { if (p) p.connectedToBreadboardHole = null; });
        }
        self.wireSys?.invalidateShorts?.(null);
      }

      self.wireSys.updateWiresForComponent(el);

      if (self.undoRedo && self._preDragPos) {
        const transform = el.getAttribute("transform") || "";
        const m         = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
        const newX      = m ? parseFloat(m[1]) : parseFloat(el.getAttribute("x")) || 0;
        const newY      = m ? parseFloat(m[2]) : parseFloat(el.getAttribute("y")) || 0;
        const { x: oldX, y: oldY } = self._preDragPos;
        if (Math.abs(newX - oldX) > 2 || Math.abs(newY - oldY) > 2) {
          self.undoRedo.recordMove(el.dataset.id, { x: oldX, y: oldY }, { x: newX, y: newY });
        }
      }

      el.tempSnapData     = null;
      self._preDragPos    = null;
      self._activeElement = null;

      document.removeEventListener("mousemove", self._drag);
      document.removeEventListener("mouseup",   self._stopDrag);
    };
  }

  _connectPinToBreadboard(comp, cPinId, bPinId, holeEl = null) {
    if (!comp) return;

    const bbEl = holeEl?.closest("[data-type='breadboard']")
              ?? document.querySelector(`[data-type='breadboard'] [data-pin="${bPinId}"]`)
                         ?.closest("[data-type='breadboard']");

    if (bbEl?.dataset.id) comp.mountedOn = bbEl.dataset.id;

    const targetPin = comp.pins?.find(p => p?.id === cPinId);
    if (targetPin) {
      targetPin.connectedToBreadboardHole = bPinId;
    }

    this.wireSys?.invalidateShorts?.(bbEl?.dataset.id ?? null);
  }

  _register(svg) { this._components.push(svg); }

  _makeSVG(width, height, x, y, classes = []) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",  width);
    svg.setAttribute("height", height);
    svg.setAttribute("x",      x);
    svg.setAttribute("y",      y);
    classes.forEach(c => svg.classList.add(c));
    return svg;
  }

  _makeImage(href, width, height) {
    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttribute("href",   href);
    img.setAttribute("width",  width);
    img.setAttribute("height", height);
    return img;
  }

  async _fetchJSON(type) {
    try {
      const res = await fetch(`/components/${type}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json"))
        throw new Error(`Expected JSON, got "${ct}"`);
      return await res.json();
    } catch (err) {
      console.error(`[ComponentSpawner] Failed to load "${type}": ${err.message}`);
      this._notifyError(`Component "${type}" could not be loaded. Check /components/${type}.json exists.`);
      return null;
    }
  }

  _notifyError(message) {
    const existing = document.getElementById("spawner-error-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "spawner-error-toast";
    toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;max-width:80vw;text-align:center;";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}