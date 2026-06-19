"use strict";
const ARDUINO_DATA = {
  name: "ArduinoUno",
  path: "images/ArduinoUno.svg.png",
  width: 500,
  height: 400,
  pins: [
    { id: "0", x: 447, y: 43 }, { id: "1", x: 433, y: 43 },
    { id: "2", x: 415, y: 43 }, { id: "3", x: 400, y: 43 },
    { id: "4", x: 386, y: 43 }, { id: "5", x: 368, y: 43 },
    { id: "6", x: 352, y: 43 }, { id: "7", x: 337, y: 43 },
    { id: "8", x: 312, y: 43 }, { id: "9", x: 296, y: 43 },
    { id: "10", x: 282, y: 43 }, { id: "11", x: 266, y: 43 },
    { id: "12", x: 250, y: 43 }, { id: "13", x: 234, y: 43 },
    { id: "SDA", x: 185, y: 43 }, { id: "SCL", x: 170, y: 43 },
    { id: "AREF", x: 200, y: 43 }, { id: "GND", x: 218, y: 43 },
    { id: "A0", x: 366, y: 345 }, { id: "A1", x: 382, y: 345 },
    { id: "A2", x: 400, y: 345 }, { id: "A3", x: 415, y: 345 },
    { id: "A4", x: 431, y: 345 }, { id: "A5", x: 447, y: 345 },
    { id: "5V", x: 289, y: 345 }, { id: "3.3V", x: 273, y: 345 },
    { id: "GND", x: 321, y: 345 }, { id: "Vin", x: 337, y: 345 },
  ],
};

const LED_DATA = {
  name: "led",
  visual: {
    path: "images/led.png",
    width: 100,
    height: 100,
    pins: [
      { id: "Anode",   x: 50, y: 76 },
      { id: "Cathode", x: 40, y: 70 },
    ],
  },
  electrical: { forwardVoltage: 2.0 },
  IS: 1e-12,
  n: 1.8,
};
import { registry } from "./src/ComponentRegistry.js";
import createPins   from "./src/createPins.js";

export default class ComponentSpawner {

  constructor(workspace, wireSys, pinsArray, digitalInputs, deleteSystem, startDragFn, openResistorEditor, undoRedo = null) {
    this.workspace          = workspace;
    this.wireSys            = wireSys;
    this.pinsArray          = pinsArray;
    this.digitalInputs      = digitalInputs;
    this.deleteSystem       = deleteSystem;
    this.startDragFn        = startDragFn;
    this.openResistorEditor = openResistorEditor;
    this.components         = [];
    this.undoRedo           = undoRedo;

    this.activeElement = null;
    this.elStartX      = 0;
    this.elStartY      = 0;
    this.dragStartX    = 0;
    this.dragStartY    = 0;
    this.preDragPos    = null;
    this.rafId         = null;
    this.pendingDragX  = 0;
    this.pendingDragY  = 0;
    this.scaleX        = 1;
    this.scaleY        = 1;

    this.startDragHandler = this.buildStartDrag();
    this.dragHandler      = this.buildDrag();
    this.stopDragHandler  = this.buildStopDrag();

    this.onVisibilityChange = () => {
      if (document.hidden && this.activeElement) this.stopDragHandler();
    };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  destroy() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("mousemove", this.dragHandler);
    document.removeEventListener("mouseup",   this.stopDragHandler);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  getDragHandlers() {
    return { startDrag: this.startDragHandler, drag: this.dragHandler, stopDrag: this.stopDragHandler };
  }


async spawnComponent(type, x = 0, y = 0, forcedId = null, skipUndo = false) {
  try {
    if (type === "ArduinoUno" || type === "arduino") {
      this.spawnArduino(ARDUINO_DATA, x, y, forcedId, skipUndo);
      return;
    }
    if (type === "led") {
      this.spawnLed(LED_DATA, x, y, forcedId, skipUndo);
      return;
    }
    console.warn(`[ComponentSpawner] Unknown type "${type}"`);
  } catch (err) {
    console.error(`[ComponentSpawner] Critical error spawning "${type}":`, err);
  }
}

  spawnArduino(data, x, y, forcedId = null, skipUndo = false) {
    const compId = registry.generateId("arduino", forcedId);
    const svg    = this.makeSVG(data.width, data.height, x, y, ["draggable"]);
    svg.dataset.type = "arduino";
    svg.dataset.id   = compId;
    svg.appendChild(this.makeImage(data.path, data.width, data.height));

    const Pins = new createPins(svg, this.wireSys, this.pinsArray);
    data.pins.forEach(pin => Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id));

    const instance = {
      svg, pins: data.pins, pinStates: {},
      powerPins: { "5V": false, "3.3V": false, "GND": true },
      setPin(pin, val) { this.pinStates[pin] = val; },
      getPin(pin)      { return this.pinStates[pin] ?? 0; },
    };
    svg.__instance = instance;

    svg.addEventListener("mousedown", this.startDragHandler);
    this.workspace.appendChild(svg);
    this.register(svg);
    registry.registerComponent({
      id: compId, type: "arduino", instance, instanceName: compId, svg,
      pins: data.pins.map(p => ({ id: p.id, number: p.id })),
    });
    this.deleteSystem.registerComponent(svg);

    if (!forcedId && !skipUndo && this.undoRedo) {
      this.undoRedo.recordSpawn("ArduinoUno", compId, { x, y });
    }
  }

  spawnLed(data, x, y, forcedId = null, skipUndo = false) {
    const compId = registry.generateId("led", forcedId);
    const svg    = this.makeSVG(data.visual.width, data.visual.height, x, y, ["draggable"]);
    svg.dataset.type = "led";
    svg.dataset.id   = compId;
    const image = this.makeImage(data.visual.path, data.visual.width, data.visual.height);
    image.style.filter = "brightness(0)";
    svg.appendChild(image);

    const Pins = new createPins(svg, this.wireSys, this.pinsArray);
    data.visual.pins.forEach(pin => Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id));

    const ledInstance = {
      svg,
      pins: data.visual.pins,
      powered: false,
      isValid: false,
      nets: null,
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

    svg.addEventListener("mousedown", this.startDragHandler);
    this.workspace.appendChild(svg);
    this.register(svg);

    registry.registerComponent({
      id:       compId,
      type:     "led",
      instance: ledInstance,
      svg,
      pins: data.visual.pins.map(p => ({
        id:         p.id,
        pinKey:     `${compId}:${p.id}`,
        power:      p.id === "Cathode" || p.id === "K" ? "GND" : null,
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

  buildStartDrag() {
    const self = this;
    return function startDrag(e) {
      e.stopPropagation();
      self.activeElement = e.currentTarget;
      const el = self.activeElement;

      const transform = el.getAttribute("transform") || "";
      const m         = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
      self.elStartX   = m ? parseFloat(m[1]) : parseFloat(el.getAttribute("x")) || 0;
      self.elStartY   = m ? parseFloat(m[2]) : parseFloat(el.getAttribute("y")) || 0;
      self.dragStartX = e.clientX;
      self.dragStartY = e.clientY;
      self.preDragPos = { x: self.elStartX, y: self.elStartY };

      const wsRect = self.workspace.getBoundingClientRect();
      const vbStr  = self.workspace.getAttribute("viewBox");
      if (vbStr) {
        const [,, vw, vh] = vbStr.split(/\s+/).map(Number);
        self.scaleX = vw / wsRect.width;
        self.scaleY = vh / wsRect.height;
      } else {
        self.scaleX = 1;
        self.scaleY = 1;
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

      document.addEventListener("mousemove", self.dragHandler);
      document.addEventListener("mouseup",   self.stopDragHandler);
    };
  }

  buildDrag() {
    const self = this;
    return function drag(e) {
      if (!self.activeElement) return;

      self.pendingDragX = e.clientX;
      self.pendingDragY = e.clientY;

      if (self.rafId) return;
      self.rafId = requestAnimationFrame(() => {
        self.rafId = null;
        if (!self.activeElement) return;

        const el   = self.activeElement;
        const dx   = (self.pendingDragX - self.dragStartX) * self.scaleX;
        const dy   = (self.pendingDragY - self.dragStartY) * self.scaleY;
        const newX = self.elStartX + dx;
        const newY = self.elStartY + dy;

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
          ? self.detectICBreadboardSnap(el, comp)
          : self.detectBreadboardHoles(el);

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

  buildStopDrag() {
    const self = this;
    return function stopDrag() {
      const el = self.activeElement;
      if (!el) return;

      if (self.rafId) {
        cancelAnimationFrame(self.rafId);
        self.rafId = null;
      }

      el.style.outline = "";

      const comp = registry.getComponentById(el.dataset.id);

      if (!el.tempSnapData || el.tempSnapData.length === 0) {
        const isIC = el.dataset.type === "logic-ic" || el.dataset.type === "motor-driver";
        const found = isIC
          ? self.detectICBreadboardSnap(el, comp)
          : self.detectBreadboardHoles(el);
        if (found.length > 0) el.tempSnapData = found;
      }

      if (el.tempSnapData?.length > 0) {
        const snapList = el.tempSnapData;

        for (const snap of snapList) {
          self.connectPinToBreadboard(comp, snap.cPinId, snap.bPinId, snap.holeEl);
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

      if (self.undoRedo && self.preDragPos) {
        const transform = el.getAttribute("transform") || "";
        const m         = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
        const newX      = m ? parseFloat(m[1]) : parseFloat(el.getAttribute("x")) || 0;
        const newY      = m ? parseFloat(m[2]) : parseFloat(el.getAttribute("y")) || 0;
        const { x: oldX, y: oldY } = self.preDragPos;
        if (Math.abs(newX - oldX) > 2 || Math.abs(newY - oldY) > 2) {
          self.undoRedo.recordMove(el.dataset.id, { x: oldX, y: oldY }, { x: newX, y: newY });
        }
      }

      el.tempSnapData    = null;
      self.preDragPos    = null;
      self.activeElement = null;

      document.removeEventListener("mousemove", self.dragHandler);
      document.removeEventListener("mouseup",   self.stopDragHandler);
    };
  }

  detectICBreadboardSnap(el, comp) {
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

  detectBreadboardHoles(el) {
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
      for (const hole of bbEl.querySelectorAll(".connection-point")) {
        const r  = hole.getBoundingClientRect();
        const pt = DOMPoint.fromPoint({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
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

  connectPinToBreadboard(comp, cPinId, bPinId, holeEl = null) {
    if (!comp) return;

    const bbEl = holeEl?.closest("[data-type='breadboard']")
              ?? document.querySelector(`[data-type='breadboard'] [data-pin="${bPinId}"]`)
                         ?.closest("[data-type='breadboard']");

    if (bbEl?.dataset.id) comp.mountedOn = bbEl.dataset.id;

    const targetPin = comp.pins?.find(p => p?.id === cPinId);
    if (targetPin) targetPin.connectedToBreadboardHole = bPinId;

    this.wireSys?.invalidateShorts?.(bbEl?.dataset.id ?? null);
  }

  register(svg) { this.components.push(svg); }

  makeSVG(width, height, x, y, classes = []) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",  width);
    svg.setAttribute("height", height);
    svg.setAttribute("x",      x);
    svg.setAttribute("y",      y);
    classes.forEach(c => svg.classList.add(c));
    return svg;
  }

  makeImage(href, width, height) {
    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttribute("href",   href);
    img.setAttribute("width",  width);
    img.setAttribute("height", height);
    return img;
  }

 

  notifyError(message) {
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