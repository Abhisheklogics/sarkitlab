"use strict";

import { NetlistBuilder } from "../engine/NetlistBuilder.js";
import { registry } from "./ComponentRegistry.js";

export const WIRE_MATERIALS = {
  copper:   { label: "Copper",   color: "#e07b39", resistivity: 1.68e-8, tempCoeff: 3.9e-3 },
  aluminum: { label: "Aluminum", color: "#a8b8c8", resistivity: 2.65e-8, tempCoeff: 4.0e-3 },
  silver:   { label: "Silver",   color: "#c0c0c0", resistivity: 1.59e-8, tempCoeff: 3.8e-3 },
  iron:     { label: "Iron",     color: "#8a8a8a", resistivity: 1.00e-7, tempCoeff: 5.0e-3 },
};

const SVG_UNIT_TO_M    = 0.005;
const SVG_PX_PER_MM    = 1.0;
const MIN_STROKE       = 3.5;
const MAX_STROKE       = 16;
const SHORT_THRESHOLD  = 1.0;
const PARTICLE_SPACING = 18;
const AMBIENT_TEMP_C   = 25;
const SPARK_COUNT      = 8;
const SNAP_RADIUS      = 18;
const CURVE_THRESHOLD  = 30;

const _shortCache  = new Map();
const _wireCache   = new Map();
const _staleShorts = new Set();

export function invalidateShortsCache(compId) {
  if (compId) _staleShorts.add(compId);
  else        _shortCache.clear();
}

function areaToStroke(areaMm2) {
  const diameter = 2 * Math.sqrt(Math.max(areaMm2, 0.01) / Math.PI);
  return Math.min(Math.max(diameter * SVG_PX_PER_MM * 2.2, MIN_STROKE), MAX_STROKE);
}

function pathLength(nodes) {
  let len = 0;
  for (let i = 1; i < nodes.length; i++) {
    const dx = nodes[i].x - nodes[i - 1].x;
    const dy = nodes[i].y - nodes[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

function wireResistance(materialKey, nodes, areaMm2 = 0.326, tempC = AMBIENT_TEMP_C) {
  const mat    = WIRE_MATERIALS[materialKey] ?? WIRE_MATERIALS.copper;
  const areaM2 = Math.max(areaMm2, 0.01) * 1e-6;
  const Leff   = Math.max(pathLength(nodes) * SVG_UNIT_TO_M, 0.1);
  const rho    = mat.resistivity * (1 + mat.tempCoeff * (tempC - AMBIENT_TEMP_C));
  return (rho * Leff) / areaM2;
}

function applyWireThickness(wire, areaMm2) {
  const stroke = areaToStroke(areaMm2);
  wire.setAttribute("stroke-width", stroke);
  wire._baseStroke = stroke;
}

function ensureWireFilter(svg) {
  if (svg.querySelector("#wireShadow")) return;
  const defs = svg.querySelector("defs") ||
    svg.insertBefore(
      document.createElementNS("http://www.w3.org/2000/svg", "defs"),
      svg.firstChild
    );
  defs.innerHTML += `
    <filter id="wireShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(255,200,80,0.7)"/>
    </filter>
    <filter id="wireShortGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feFlood flood-color="rgba(255,30,30,1)" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="wireCurrentGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feFlood flood-color="rgba(100,220,255,0.6)" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
}

function injectShortCircuitCSS() {
  if (document.querySelector("#shortCircuitStyle")) return;
  const style = document.createElement("style");
  style.id = "shortCircuitStyle";
  style.textContent = `
    @keyframes shortFlash {
      0%   { opacity:1;   stroke:#ff2222; }
      20%  { opacity:0.1; stroke:#ffaa00; }
      40%  { opacity:1;   stroke:#ff2222; }
      60%  { opacity:0.1; stroke:#ffffff; }
      80%  { opacity:1;   stroke:#ff2222; }
      100% { opacity:1;   stroke:#ff2222; }
    }
    .wire-short-flash {
      animation: shortFlash 0.25s ease-in-out 5 !important;
    }
    .pin-snap-highlight {
      animation: pinSnapPulse 0.4s ease-out forwards;
    }
    @keyframes pinSnapPulse {
      0%   { filter: drop-shadow(0 0 6px #88ffaa); }
      100% { filter: none; }
    }
  `;
  document.head.appendChild(style);
}

function buildSmoothPath(nodes) {
  if (!nodes?.length) return "";
  if (nodes.length === 1) return `M ${nodes[0].x} ${nodes[0].y}`;

  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    d += ` L ${nodes[i].x} ${nodes[i].y}`;
  }
  return d;
}

export default class WireSystem {
  constructor(workspace, connections = [], checkAllConnections = () => {}) {
    this.workspace           = workspace;
    this.connections         = connections;
    this.checkAllConnections = checkAllConnections;

    this.isDrawing    = false;
    this.currentWire  = null;
    this.selectedWire = null;
    this.wireBranches = [];
    this.lastNetlist  = null;
    this._onWireFinished = null;

    this._shortCircuitWires  = new Set();
    this._animationFrameId   = null;
    this._particles          = new Map();
    this._sparks             = [];
    this._lastAnimTime       = 0;
    this._snapIndicator      = null;

    ensureWireFilter(workspace);
    injectShortCircuitCSS();
    this._createSnapIndicator();

    this.workspace.addEventListener("mousedown", e => {
      if (e.target === this.workspace) this._deselectAll();
    });

    window.addEventListener("keydown", e => this._handleKeyDown(e));
    this._materialPopup = this._createMaterialPopup();
    this._startAnimationLoop();
  }

  _createSnapIndicator() {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", "10");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "#88ffaa");
    circle.setAttribute("stroke-width", "2");
    circle.setAttribute("stroke-dasharray", "3 2");
    circle.style.pointerEvents = "none";
    circle.style.opacity = "0";
    circle.style.transition = "opacity 0.1s ease";
    this.workspace.appendChild(circle);
    this._snapIndicator = circle;
  }

  _showSnapAt(x, y) {
    if (!this._snapIndicator) return;
    this._snapIndicator.setAttribute("cx", x);
    this._snapIndicator.setAttribute("cy", y);
    this._snapIndicator.style.opacity = "1";
  }

  _hideSnap() {
    if (!this._snapIndicator) return;
    this._snapIndicator.style.opacity = "0";
  }

startWire(event, pin) {
    event.stopPropagation();
    if (!pin) return;

    this._deselectAll();
    this.isDrawing = true;

    const { x, y } = this.getPinCenter(pin);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke",          this._autoColor(pin));
    path.setAttribute("fill",            "none");
    path.setAttribute("stroke-linecap",  "round");
    path.setAttribute("stroke-linejoin", "round");

    path.startPin    = pin;
    path.endPin      = null;
    path.nodes       = [{ x, y }, { x, y }];
    path.circles     = [];
    path.material    = "copper";
    path.areaMm2     = 0.326;
    path._baseStroke = areaToStroke(0.326);
    path._currentI   = 0;

    applyWireThickness(path, 0.326);
    this.workspace.appendChild(path);
    this.currentWire = path;

    this.workspace.addEventListener("mousemove", this._dragWire);
    this.workspace.addEventListener("mousedown",  this._addNode);

    if (this._tryConnect) {
      document.removeEventListener("mousedown", this._tryConnect, { capture: true });
    }

    this._tryConnect = e => {
      const t = e.target;
      if (
        this.isDrawing &&
        this.currentWire &&
        t?.classList.contains("connection-point") &&
        t !== this.currentWire.startPin
      ) {
        e.stopPropagation();
        this.finishWire(t);
      }
    };
    document.addEventListener("mousedown", this._tryConnect, { capture: true });
  }

finishWire(targetPin) {
    if (!this.isDrawing || !this.currentWire) return;
 
    this._hideSnap();
 
    const center = this.getPinCenter(targetPin);
    this.currentWire.endPin = targetPin;
    const last = this.currentWire.nodes.length - 1;
    this.currentWire.nodes[last] = center;
 
    this.currentWire.nodes.forEach((pos, i) =>
      this._addCircle(pos, this.currentWire, i)
    );
    this._updatePath(this.currentWire);
 
    const wireRef = this.currentWire;
    const area    = wireRef.areaMm2 ?? 0.326;
    const R       = wireResistance(wireRef.material, wireRef.nodes, area);
 
    const conn = {
      wire:       wireRef,
      startPin:   wireRef.startPin,
      endPin:     targetPin,
      material:   wireRef.material,
      areaMm2:    area,
      resistance: R,
    };
    this.connections.push(conn);
    _wireCache.delete(conn);
    this._syncWireBranch(conn);
    this._initParticles(wireRef);
 
    wireRef.addEventListener("mousedown", e => this._selectWire(e, wireRef));
    wireRef.addEventListener("dblclick",  e => this._openMaterialPicker(e, wireRef, conn));
 
    wireRef.addEventListener("mouseenter", () => {
      if (wireRef !== this.selectedWire) {
        wireRef.setAttribute("filter",       "url(#wireShadow)");
        wireRef.setAttribute("stroke-width", (wireRef._baseStroke ?? MIN_STROKE) + 2);
      }
    });
    wireRef.addEventListener("mouseleave", () => {
      if (wireRef !== this.selectedWire) {
        wireRef.removeAttribute("filter");
        wireRef.setAttribute("stroke-width", wireRef._baseStroke ?? MIN_STROKE);
      }
    });
 
    this._forceHideCircles(wireRef);
    this.selectedWire = null;
    this.currentWire  = null;
    this.isDrawing    = false;
 
    this.workspace.removeEventListener("mousemove", this._dragWire);
    this.workspace.removeEventListener("mousedown",  this._addNode);
    document.removeEventListener("mousedown", this._tryConnect, { capture: true });
 
    const allPinGroups = this.workspace.querySelectorAll(".pin-group");
    allPinGroups.forEach(pg => {
      if (pg.parentNode === this.workspace) {
        this.workspace.appendChild(pg);
      }
    });
 
    // ── REMOVED ──
    // "Wire finish hone ke baad saare pins hide karo" block yahan se
    // hata diya gaya hai. Naye CreatePins.js mein pins hamesha visible
    // (dark squares) rehti hain — unhe forcibly opacity:0 karna galat tha.
 
    this._onWireFinished?.(wireRef);
    this.checkAllConnections();
  }
  updateWiresForComponent(componentEl) {
    this.connections.forEach(conn => {
      const { wire, startPin, endPin } = conn;
      let changed = false;

      if (startPin && componentEl.contains(startPin)) {
        const p = this.getPinCenter(startPin);
        wire.nodes[0] = p;
        wire.circles[0]?.setAttribute("cx", p.x);
        wire.circles[0]?.setAttribute("cy", p.y);
        changed = true;
      }
      if (endPin && componentEl.contains(endPin)) {
        const idx = wire.nodes.length - 1;
        const p   = this.getPinCenter(endPin);
        wire.nodes[idx] = p;
        wire.circles[idx]?.setAttribute("cx", p.x);
        wire.circles[idx]?.setAttribute("cy", p.y);
        changed = true;
      }
      if (changed) {
        this._updatePath(wire);
        conn.resistance = wireResistance(wire.material ?? "copper", wire.nodes, conn.areaMm2 ?? 0.326);
        _wireCache.delete(conn);
        this._syncWireBranch(conn);
        this._initParticles(wire);
      }
    });
  }

  removeWire(wire) {
    wire?.remove();
    wire?.circles?.forEach(c => c?.remove());
    this._particles.delete(wire);
    this._shortCircuitWires.delete(wire);
    const conn = this.connections.find(c => c.wire === wire);
    if (conn) _wireCache.delete(conn);
    this.connections  = this.connections.filter(c => c.wire !== wire);
    this.wireBranches = this.wireBranches.filter(b => b._connRef?.wire !== wire);
    if (this.selectedWire === wire) this.selectedWire = null;
    this.buildNetlist();
    this.checkAllConnections();
  }

  buildNetlist() {
    const wires = [];

    if (this.connections.length === 0) {
      _wireCache.clear();
      _shortCache.clear();
    }

    this.connections.forEach(c => {
      let cached = _wireCache.get(c);
      if (!cached) {
        const from = this.getPinKey(c.startPin);
        const to   = this.getPinKey(c.endPin);
        if (!from || !to) return;

        const R = c.resistance ??
          wireResistance(c.material ?? "copper", c.wire?.nodes ?? [], c.areaMm2 ?? 0.326);

        cached = {
          from, to, type: "WIRE", ohms: R,
          material: c.material ?? "copper",
          areaMm2:  c.areaMm2  ?? 0.326,
          _connRef: c,
        };
        _wireCache.set(c, cached);
      }
      wires.push(cached);
    });

    const allComps = registry?.getAll?.() ?? [];

    for (const comp of allComps) {
      const instance = comp.instance;
      if (!instance || typeof instance.getActiveShorts !== "function") continue;

      const isBoard = comp.type === "breadboard";
      const type    = isBoard ? "BREADBOARD_SHORT" : "INTERNAL_SHORT";
      const ohms    = isBoard ? 1e-4 : 1e-3;
      const id      = comp.id;

      let entry = _shortCache.get(id);
      const stale = _staleShorts.has(id) || !entry;

      if (stale) {
        _staleShorts.delete(id);
        const shorts     = instance.getActiveShorts();
        const shortWires = new Array(shorts.length);
        for (let i = 0; i < shorts.length; i++) {
          const [a, b] = shorts[i];
          shortWires[i] = {
            from: `${id}:${a}`,
            to:   `${id}:${b}`,
            type,
            ohms,
            _internal: true,
          };
        }
        entry = { shortWires };
        _shortCache.set(id, entry);
      }

      const sw = entry.shortWires;
      for (let i = 0; i < sw.length; i++) wires.push(sw[i]);
    }

    this.lastNetlist  = new NetlistBuilder(wires).build();
    this.wireBranches = wires;
    return this.lastNetlist;
  }
invalidateShorts(bbId = null) {
  if (bbId) { _staleShorts.add(bbId); }
  else { for (const id of _shortCache.keys()) _staleShorts.add(id); }
}
  updateCurrentVisualization(electricalState) {
    if (!electricalState) return;

    const prevShorts = new Set(this._shortCircuitWires);
    this._shortCircuitWires.clear();

    this.connections.forEach(conn => {
      const wire = conn.wire;
      if (!wire) return;

      const from = this.getPinKey(conn.startPin);
      const to   = this.getPinKey(conn.endPin);
      if (!from || !to) return;

      const Va = electricalState.netVoltage?.get(this._netForPin(from, electricalState)) ?? 0;
      const Vb = electricalState.netVoltage?.get(this._netForPin(to,   electricalState)) ?? 0;
      const R  = Math.max(conn.resistance ?? 1e-3, 1e-6);
      const I  = Math.abs((Va - Vb) / R);

      wire._currentI = I;

    const isShort = R < SHORT_THRESHOLD && (Va > 0.5 || Vb > 0.5) && (
  Math.abs(Va - Vb) < 0.5 || 
  (conn.resistance < 0.1)
);

      if (isShort) {
        this._shortCircuitWires.add(wire);
        wire.setAttribute("filter", "url(#wireShortGlow)");
        wire.setAttribute("stroke", "#ff2222");
      } else if (I > 0.001) {
        if (wire !== this.selectedWire) wire.setAttribute("filter", "url(#wireCurrentGlow)");
        wire.setAttribute("stroke", this._currentTintColor(
          WIRE_MATERIALS[conn.material ?? "copper"]?.color ?? "#e07b39", I
        ));
      } else {
        if (wire !== this.selectedWire) wire.removeAttribute("filter");
        wire.setAttribute("stroke", WIRE_MATERIALS[conn.material ?? "copper"]?.color ?? "#e07b39");
      }

      const particles = this._particles.get(wire);
      if (particles) {
        particles.speed     = Math.min(I * 120, 80);
        particles.active    = I > 0.0005;
        particles.direction = Va >= Vb ? 1 : -1;
      }
    });

    const newShorts = [...this._shortCircuitWires].filter(w => !prevShorts.has(w));
    if (newShorts.length > 0) this._triggerShortCircuitAlert(newShorts);

    for (const w of prevShorts) {
      if (!this._shortCircuitWires.has(w)) {
        w.classList.remove("wire-short-flash");
        w.removeAttribute("filter");
        const conn = this.connections.find(c => c.wire === w);
        w.setAttribute("stroke", WIRE_MATERIALS[conn?.material ?? "copper"]?.color ?? "#e07b39");
      }
    }
  }

  _netForPin(pinKey, electricalState) {
    if (!electricalState?.netVoltage || !this.lastNetlist) return null;
    for (const [netId, pins] of this.lastNetlist.nets) {
      if (pins.has(pinKey)) return netId;
    }
    return null;
  }

  _currentTintColor(baseColor, currentA) {
    const intensity = Math.min(currentA / 0.5, 1);
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    const tr = Math.round(r + (100 - r) * intensity * 0.4);
    const tg = Math.round(g + (220 - g) * intensity * 0.3);
    const tb = Math.round(b + (255 - b) * intensity * 0.5);
    return `rgb(${tr},${tg},${tb})`;
  }

  _triggerShortCircuitAlert(wires) {
    wires.forEach(wire => {
      wire.classList.remove("wire-short-flash");
      void wire.offsetWidth;
      wire.classList.add("wire-short-flash");

      const midIdx = Math.floor(wire.nodes.length / 2);
      const midPt  = wire.nodes[midIdx] ?? wire.nodes[0];
      if (midPt) this._spawnSparks(midPt.x, midPt.y);
    });

    if (wires.length > 0) this._playShortCircuitSound();
    this._emitEvent("shortCircuit", { wires });
  }

  _spawnSparks(cx, cy) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const angle  = (Math.PI * 2 * i) / SPARK_COUNT + (Math.random() - 0.5) * 0.4;
      const speed  = 60 + Math.random() * 80;
      const length = 8 + Math.random() * 14;
      const life   = 0.3 + Math.random() * 0.25;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", cx);
      line.setAttribute("y1", cy);
      line.setAttribute("x2", cx);
      line.setAttribute("y2", cy);
      line.setAttribute("stroke",       i % 2 === 0 ? "#ffee44" : "#ff6622");
      line.setAttribute("stroke-width", 1.5 + Math.random());
      line.setAttribute("stroke-linecap", "round");
      line.style.pointerEvents = "none";
      this.workspace.appendChild(line);

      this._sparks.push({
        el: line,
        cx, cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length,
        life,
        age: 0,
      });
    }
  }

  _tickSparks(dt) {
    const alive = [];
    for (const spark of this._sparks) {
      spark.age += dt;
      if (spark.age >= spark.life) {
        spark.el.remove();
        continue;
      }
      const progress = spark.age / spark.life;
      const x1 = spark.cx + spark.vx * spark.age;
      const y1 = spark.cy + spark.vy * spark.age;
      const ang = Math.atan2(spark.vy, spark.vx);
      const x2  = x1 + Math.cos(ang) * spark.length * (1 - progress);
      const y2  = y1 + Math.sin(ang) * spark.length * (1 - progress);
      spark.el.setAttribute("x1", x1);
      spark.el.setAttribute("y1", y1);
      spark.el.setAttribute("x2", x2);
      spark.el.setAttribute("y2", y2);
      spark.el.style.opacity = 1 - progress;
      alive.push(spark);
    }
    this._sparks = alive;
  }

 _playShortCircuitSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      // AudioContext resume karo agar suspended ho
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;

      // --- Crackle oscillator ---
      const crackle = ctx.createOscillator();
      const gainC   = ctx.createGain();
      crackle.type = "sawtooth";
      crackle.frequency.setValueAtTime(300, now);
      crackle.frequency.exponentialRampToValueAtTime(30, now + 0.4);
      gainC.gain.setValueAtTime(0.0, now);
      gainC.gain.linearRampToValueAtTime(1.0, now + 0.01);
      gainC.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      crackle.connect(gainC);
      gainC.connect(ctx.destination);
      crackle.start(now);
      crackle.stop(now + 0.5);

      // --- Buzz oscillator ---
      const buzz  = ctx.createOscillator();
      const gainB = ctx.createGain();
      buzz.type = "square";
      buzz.frequency.setValueAtTime(120, now);
      buzz.frequency.exponentialRampToValueAtTime(40, now + 0.3);
      gainB.gain.setValueAtTime(0.0, now);
      gainB.gain.linearRampToValueAtTime(0.8, now + 0.005);
      gainB.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      buzz.connect(gainB);
      gainB.connect(ctx.destination);
      buzz.start(now);
      buzz.stop(now + 0.35);

      // --- High freq spark ---
      const spark  = ctx.createOscillator();
      const gainS  = ctx.createGain();
      spark.type = "square";
      spark.frequency.setValueAtTime(2200, now);
      spark.frequency.exponentialRampToValueAtTime(200, now + 0.15);
      gainS.gain.setValueAtTime(0.0, now);
      gainS.gain.linearRampToValueAtTime(0.6, now + 0.002);
      gainS.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      spark.connect(gainS);
      gainS.connect(ctx.destination);
      spark.start(now);
      spark.stop(now + 0.15);

      // --- White noise buffer ---
      const bufferSize  = ctx.sampleRate * 0.4;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data        = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise     = ctx.createBufferSource();
      const gainN     = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noise.buffer    = noiseBuffer;
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 0.5;
      gainN.gain.setValueAtTime(0.0, now);
      gainN.gain.linearRampToValueAtTime(1.2, now + 0.005);
      gainN.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      noise.connect(noiseFilter);
      noiseFilter.connect(gainN);
      gainN.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.4);

      // --- Click/pop at start ---
      const click  = ctx.createOscillator();
      const gainCl = ctx.createGain();
      click.type = "sine";
      click.frequency.setValueAtTime(80, now);
      gainCl.gain.setValueAtTime(0.0, now);
      gainCl.gain.linearRampToValueAtTime(1.5, now + 0.001);
      gainCl.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      click.connect(gainCl);
      gainCl.connect(ctx.destination);
      click.start(now);
      click.stop(now + 0.05);

    } catch (err) {
      console.warn("[WireSystem] Sound error:", err);
    }
  }

  _emitEvent(name, detail) {
    this.workspace.dispatchEvent(new CustomEvent(`wiresystem:${name}`, { detail, bubbles: true }));
  }

  _initParticles(wire) {
    const len   = pathLength(wire.nodes);
    const count = Math.max(2, Math.floor(len / PARTICLE_SPACING));
    const dots  = [];

    for (let i = 0; i < count; i++) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r",    "2.5");
      circle.setAttribute("fill", "rgba(160,230,255,0.85)");
      circle.style.pointerEvents = "none";
      circle.style.opacity       = "0";
      this.workspace.appendChild(circle);
      dots.push({ el: circle, t: i / count });
    }

    this._particles.get(wire)?.dots?.forEach(d => d.el.remove());
    this._particles.set(wire, { dots, speed: 0, active: false, direction: 1 });
  }

  _startAnimationLoop() {
    const animate = (timestamp) => {
      const dt = Math.min((timestamp - this._lastAnimTime) / 1000, 0.05);
      this._lastAnimTime = timestamp;

      const hasParticles = this._hasActiveParticles();
      const hasSparks    = this._sparks.length > 0;

      if (hasParticles) this._tickParticles(dt);
      if (hasSparks)    this._tickSparks(dt);

      if (!hasParticles && !hasSparks) {
        this._animationFrameId = setTimeout(
          () => { this._animationFrameId = requestAnimationFrame(animate); },
          100
        );
      } else {
        this._animationFrameId = requestAnimationFrame(animate);
      }
    };
    this._animationFrameId = requestAnimationFrame(animate);
  }

  _hasActiveParticles() {
    for (const [wire, state] of this._particles) {
      if (!wire.isConnected) continue;
      if (state.active && state.speed >= 0.1) return true;
    }
    return false;
  }

  stopAnimationLoop() {
    clearTimeout(this._animationFrameId);
    cancelAnimationFrame(this._animationFrameId);
  }

  _tickParticles(dt) {
    for (const [wire, state] of this._particles) {
      if (!wire.isConnected) {
        state.dots.forEach(d => d.el.remove());
        this._particles.delete(wire);
        continue;
      }

      if (!state.active || state.speed < 0.1) {
        if (!state._hidden) {
          state.dots.forEach(d => { d.el.style.opacity = "0"; });
          state._hidden = true;
        }
        continue;
      }

      state._hidden = false;
      const len = pathLength(wire.nodes);
      if (len < 1) continue;

      const delta = (state.speed * dt * state.direction) / len;

      for (const d of state.dots) {
        d.t += delta;
        if (d.t > 1) d.t -= 1;
        if (d.t < 0) d.t += 1;
        const pos = this._positionAlongPath(wire.nodes, d.t);
        d.el.setAttribute("cx", pos.x);
        d.el.setAttribute("cy", pos.y);
        d.el.style.opacity = "1";
      }
    }
  }

  _positionAlongPath(nodes, t) {
    if (nodes.length < 2) return nodes[0] ?? { x: 0, y: 0 };

    const segments = [];
    let total = 0;
    for (let i = 1; i < nodes.length; i++) {
      const dx  = nodes[i].x - nodes[i - 1].x;
      const dy  = nodes[i].y - nodes[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segments.push(len);
      total += len;
    }

    let target = t * total;
    for (let i = 0; i < segments.length; i++) {
      if (target <= segments[i]) {
        const frac = target / segments[i];
        return {
          x: nodes[i].x + frac * (nodes[i + 1].x - nodes[i].x),
          y: nodes[i].y + frac * (nodes[i + 1].y - nodes[i].y),
        };
      }
      target -= segments[i];
    }
    return nodes[nodes.length - 1];
  }

  _syncWireBranch(conn) {
    const from = this.getPinKey(conn.startPin);
    const to   = this.getPinKey(conn.endPin);
    if (!from || !to) return;

    this.wireBranches = this.wireBranches.filter(b => b._connRef !== conn);
    this.wireBranches.push({
      from,
      to,
      type:     "WIRE",
      ohms:     conn.resistance,
      material: conn.material ?? "copper",
      areaMm2:  conn.areaMm2  ?? 0.326,
      _connRef: conn,
    });
  }

  getPinCenter(pin) {
    const w = this.workspace.getBoundingClientRect();
    const p = pin.getBoundingClientRect();
    return {
      x: p.left + p.width  / 2 - w.left,
      y: p.top  + p.height / 2 - w.top,
    };
  }

  getMousePos(e) {
    const w = this.workspace.getBoundingClientRect();
    return { x: e.clientX - w.left, y: e.clientY - w.top };
  }

  getPinKey(pin) {
    const comp = pin?.closest("svg");
    return comp ? `${comp.dataset.id}:${pin.dataset.pin}` : null;
  }

  _findNearestPin(pos, excludePin = null) {
    let nearest = null;
    let minDist = SNAP_RADIUS;

    document.querySelectorAll(".connection-point").forEach(pin => {
      if (pin === excludePin) return;
      const c = this.getPinCenter(pin);
      const dist = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = { pin, center: c };
      }
    });

    return nearest;
  }

_addCircle(pos, wire, index) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx",     pos.x);
    c.setAttribute("cy",     pos.y);
    c.setAttribute("r",      "6");
    c.setAttribute("stroke", "#555");
    c.setAttribute("stroke-width", "1");
    c.setAttribute("fill",   "#1e1e2e");
    c.style.cursor = "grab";

    c.addEventListener("mousedown", e => this._startDragNode(e, wire, index));
    c.setAttribute("tabindex", "-1");
    c.addEventListener("keydown", e => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.stopPropagation();
        this._deleteNode(wire, index);
      }
    });

    wire.circles[index] = c;
    this.workspace.appendChild(c);
    return c;
  }

  _deleteNode(wire, index) {
    const isEndpoint = index === 0 || index === wire.nodes.length - 1;
    if (isEndpoint) { this.removeWire(wire); return; }

    wire.circles[index]?.remove();
    wire.nodes.splice(index,   1);
    wire.circles.splice(index, 1);

    for (let i = index; i < wire.circles.length; i++) {
      const c = wire.circles[i];
      if (c) {
        c.removeEventListener("mousedown", c._dragHandler);
        c._dragHandler = e => this._startDragNode(e, wire, i);
        c.addEventListener("mousedown", c._dragHandler);
      }
    }
    this._updatePath(wire);
    this._initParticles(wire);
  }

  _startDragNode(e, wire, index) {
    e.stopPropagation();
    this.workspace.removeEventListener("mousedown", this._addNode);

    const isStart = index === 0;
    const isEnd   = index === wire.nodes.length - 1;
    const oldPin  = isStart ? wire.startPin : isEnd ? wire.endPin : null;
    const oldPos  = oldPin ? this.getPinCenter(oldPin) : null;
    const conn    = this.connections.find(c => c.wire === wire);

    const move = ev => {
      const p = this.getMousePos(ev);
      const snapped = this._findNearestPin(p, wire.startPin);

      if (snapped) {
        wire.nodes[index] = snapped.center;
        this._showSnapAt(snapped.center.x, snapped.center.y);
      } else {
        wire.nodes[index] = p;
        this._hideSnap();
      }

    if (wire.circles[index]) {
        wire.circles[index].setAttribute("cx", wire.nodes[index].x);
        wire.circles[index].setAttribute("cy", wire.nodes[index].y);
      }
      this._updatePath(wire);
    };

    const up = ev => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup",   up);
      this._hideSnap();

      const p = this.getMousePos(ev);
      const snapped = this._findNearestPin(p, wire.startPin);

      if (snapped) {
        wire.nodes[index] = snapped.center;
        if (isStart) { wire.startPin = snapped.pin; if (conn) conn.startPin = snapped.pin; }
        if (isEnd)   { wire.endPin   = snapped.pin; if (conn) conn.endPin   = snapped.pin; }
      } else if (oldPin && oldPos) {
        wire.nodes[index] = oldPos;
        if (isStart) { wire.startPin = oldPin; if (conn) conn.startPin = oldPin; }
        if (isEnd)   { wire.endPin   = oldPin; if (conn) conn.endPin   = oldPin; }
      }

      if (conn) {
        conn.resistance = wireResistance(wire.material ?? "copper", wire.nodes, conn.areaMm2 ?? 0.326);
        _wireCache.delete(conn);
        this._syncWireBranch(conn);
      }

  if (wire.circles[index]) {
        wire.circles[index].setAttribute("cx", wire.nodes[index].x);
        wire.circles[index].setAttribute("cy", wire.nodes[index].y);
      }
      this._updatePath(wire);
      this._initParticles(wire);
      this.workspace.addEventListener("mousedown", this._addNode);
    };

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup",   up);
  }

  _dragWire = e => {
    if (!this.isDrawing || !this.currentWire) return;
    let p = this.getMousePos(e);

    const snapped = this._findNearestPin(p, this.currentWire.startPin);
    if (snapped) {
      p = snapped.center;
      this._showSnapAt(p.x, p.y);
    } else {
      this._hideSnap();
    }

    this.currentWire.nodes[this.currentWire.nodes.length - 1] = p;
    this._updatePath(this.currentWire);
  };

  _addNode = e => {
    if (!this.isDrawing || !this.currentWire) return;
    if (e.target.classList.contains("connection-point")) return;
    const pos = this.getMousePos(e);
    this.currentWire.nodes.splice(this.currentWire.nodes.length - 1, 0, { ...pos });
    this._updatePath(this.currentWire);
  };

  _updatePath(wire) {
    const d = buildSmoothPath(wire.nodes);
    if (!d) return;
    wire.setAttribute("d", d);
    wire.setAttribute("stroke-width", wire._baseStroke ?? areaToStroke(wire.areaMm2 ?? 0.326));
  }

  _selectWire(e, wire) {
    e.stopPropagation();
    if (!wire?.circles) return;

    if (this.selectedWire && this.selectedWire !== wire) {
      this._forceHideCircles(this.selectedWire);
      this.selectedWire.removeAttribute("filter");
      this.selectedWire.setAttribute("stroke-width", this.selectedWire._baseStroke ?? MIN_STROKE);
    }

    this.selectedWire = wire;
    this._showCircles(wire);
    wire.setAttribute("filter",       "url(#wireShadow)");
    wire.setAttribute("stroke-width", (wire._baseStroke ?? MIN_STROKE) + 2);
  }

_


_deselectAll() {
    if (this.selectedWire) {
      this._forceHideCircles(this.selectedWire);
      this.selectedWire.removeAttribute("filter");
      this.selectedWire.setAttribute("stroke-width", this.selectedWire._baseStroke ?? MIN_STROKE);
    }
    this.selectedWire = null;

    this.connections.forEach(conn => {
      if (conn.wire) this._forceHideCircles(conn.wire);
    });
  }

 _showCircles(wire) {
    wire.circles?.forEach(c => {
      if (!c) return;
      c.style.opacity       = "1";
      c.style.pointerEvents = "all";
      c.style.display       = "block";
    });
  }

  _hideCircles(wire) {
    wire.circles?.forEach(c => {
      if (!c) return;
      c.style.opacity       = "0";
      c.style.pointerEvents = "none";
    });
  }

  _forceHideCircles(wire) {
    wire.circles?.forEach(c => {
      if (!c) return;
      c.style.opacity       = "0";
      c.style.pointerEvents = "none";
      c.style.display       = "none";
    });
  }

  _handleKeyDown(e) {
    const t = e.target;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;

    if (this.isDrawing && this.currentWire) {
      if (e.key === "Escape") {
        this._hideSnap();
        this.currentWire.remove();
        this.currentWire.circles?.forEach(c => c?.remove());
        this.currentWire  = null;
        this.isDrawing    = false;
        this.workspace.removeEventListener("mousemove", this._dragWire);
        this.workspace.removeEventListener("mousedown",  this._addNode);
        document.removeEventListener("mousedown", this._tryConnect, { capture: true });
      }
      return;
    }

    if (this.selectedWire) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.removeWire(this.selectedWire);
      }
      return;
    }

    const focusedCircle = document.activeElement;
    if (focusedCircle?.nodeName === "circle") {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        for (const conn of this.connections) {
          const wire = conn.wire;
          const idx  = wire.circles?.indexOf(focusedCircle);
          if (idx !== undefined && idx !== -1) {
            this._deleteNode(wire, idx);
            break;
          }
        }
      }
    }
  }

  _openMaterialPicker(e, wire, conn) {
    e.stopPropagation();
    this._selectWire({ stopPropagation: () => {} }, wire);

    const popup = this._materialPopup;
    popup.style.display = "block";
    popup.style.left    = `${e.clientX + 8}px`;
    popup.style.top     = `${e.clientY + 8}px`;
    popup._targetWire   = wire;
    popup._targetConn   = conn;

    const rInfo = popup.querySelector("#wireResInfo");
    if (rInfo && conn) {
      const maxI = conn.areaMm2 ? (conn.areaMm2 * 6) : 1.95;
      rInfo.textContent = `R ≈ ${conn.resistance.toExponential(3)} Ω  |  I_max ≈ ${maxI.toFixed(2)} A`;
    }

    const areaInputEl = popup.querySelector("input[type=number]");
    if (areaInputEl && conn) areaInputEl.value = (conn.areaMm2 ?? 0.326).toString();

    popup.querySelectorAll(".wm-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mat === (wire.material || "copper"));
    });

    const close = ev => {
      if (!popup.contains(ev.target)) {
        popup.style.display = "none";
        document.removeEventListener("mousedown", close);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  }

  _createMaterialPopup() {
    const popup = document.createElement("div");
    popup.id = "wireMaterialPopup";
    popup.style.cssText = `
      position:fixed; display:none; z-index:9999;
      background:#1e1e2e; border:1px solid #444; border-radius:10px;
      padding:12px 14px; box-shadow:0 8px 32px rgba(0,0,0,0.5);
      font-family:'Segoe UI',sans-serif; min-width:260px;
    `;

    const title = document.createElement("div");
    title.textContent = "Wire Properties";
    title.style.cssText = "color:#aaa; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;";
    popup.appendChild(title);

    const rInfo = document.createElement("div");
    rInfo.id = "wireResInfo";
    rInfo.style.cssText = "color:#7ecbff; font-size:11px; font-family:monospace; margin-bottom:10px;";
    popup.appendChild(rInfo);

    const areaRow = document.createElement("div");
    areaRow.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:10px;";

    const areaLabel = document.createElement("span");
    areaLabel.textContent = "Area (mm²)";
    areaLabel.style.cssText = "color:#bbb; font-size:11px; flex-shrink:0;";

    const areaInput = document.createElement("input");
    areaInput.type  = "number";
    areaInput.min   = "0.01";
    areaInput.max   = "100";
    areaInput.step  = "0.01";
    areaInput.value = "0.326";
    areaInput.style.cssText = `
      background:#2a2a3e; border:1px solid #555; border-radius:5px;
      color:#eee; font-size:11px; padding:4px 6px; width:70px; font-family:monospace;
    `;

    const areaHint = document.createElement("span");
    areaHint.style.cssText  = "color:#666; font-size:10px; flex:1;";
    areaHint.textContent = "↑ thick = more current";

    areaInput.addEventListener("input", () => {
      const wire = popup._targetWire;
      const conn = popup._targetConn;
      if (!wire || !conn) return;
      const area = parseFloat(areaInput.value);
      if (!Number.isFinite(area) || area <= 0) return;

      conn.areaMm2    = area;
      wire.areaMm2    = area;
      conn.resistance = wireResistance(wire.material ?? "copper", wire.nodes, area);
      _wireCache.delete(conn);

      applyWireThickness(wire, area);
      this._initParticles(wire);

      const rInfoEl = popup.querySelector("#wireResInfo");
      if (rInfoEl) {
        const maxI = area * 6;
        rInfoEl.textContent = `R ≈ ${conn.resistance.toExponential(3)} Ω  |  I_max ≈ ${maxI.toFixed(2)} A`;
      }

      this._syncWireBranch(conn);
      this.checkAllConnections();
    });

    areaRow.append(areaLabel, areaInput, areaHint);
    popup.appendChild(areaRow);

    const matLabel = document.createElement("div");
    matLabel.textContent = "Material";
    matLabel.style.cssText = "color:#aaa; font-size:10px; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;";
    popup.appendChild(matLabel);

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid; grid-template-columns:1fr 1fr; gap:6px;";

    Object.entries(WIRE_MATERIALS).forEach(([key, mat]) => {
      const btn = document.createElement("button");
      btn.className   = "wm-btn";
      btn.dataset.mat = key;
      btn.title       = `ρ = ${mat.resistivity.toExponential(2)} Ω·m`;
      btn.style.cssText = `
        display:flex; align-items:center; gap:8px;
        background:#2a2a3e; border:1.5px solid #444; border-radius:6px;
        color:#ddd; font-size:12px; padding:6px 10px; cursor:pointer; transition:all .15s;
      `;
      btn.innerHTML = `
        <span style="width:14px;height:14px;border-radius:50%;background:${mat.color};
                     display:inline-block;flex-shrink:0;box-shadow:0 0 4px ${mat.color}55;"></span>
        ${mat.label}
      `;
      btn.addEventListener("mouseenter", () => { btn.style.borderColor = mat.color; btn.style.background = "#33334a"; });
      btn.addEventListener("mouseleave", () => {
        if (!btn.classList.contains("active")) { btn.style.borderColor = "#444"; btn.style.background = "#2a2a3e"; }
      });
      btn.addEventListener("click", () => {
        const wire = popup._targetWire;
        const conn = popup._targetConn;
        if (!wire) return;

        wire.material = key;
        wire.setAttribute("stroke", mat.color);

        if (conn) {
          conn.material   = key;
          const area      = conn.areaMm2 ?? 0.326;
          conn.resistance = wireResistance(key, wire.nodes, area);
          _wireCache.delete(conn);
          const rInfoEl   = popup.querySelector("#wireResInfo");
          if (rInfoEl) {
            const maxI = area * 6;
            rInfoEl.textContent = `R ≈ ${conn.resistance.toExponential(3)} Ω  |  I_max ≈ ${maxI.toFixed(2)} A`;
          }
          this._syncWireBranch(conn);
          this.checkAllConnections();
        }

        popup.querySelectorAll(".wm-btn").forEach(b => {
          b.classList.remove("active");
          b.style.borderColor = "#444";
          b.style.background  = "#2a2a3e";
        });
        btn.classList.add("active");
        btn.style.borderColor = mat.color;
        btn.style.background  = "#33334a";
      });

      grid.appendChild(btn);
    });

    const customRow = document.createElement("div");
    customRow.style.cssText = "grid-column:1/-1; display:flex; align-items:center; gap:8px; margin-top:6px;";

    const colorInput = document.createElement("input");
    colorInput.type  = "color";
    colorInput.value = "#ff6b6b";
    colorInput.style.cssText = "width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;background:none;";

    const customLabel = document.createElement("span");
    customLabel.textContent  = "Custom color";
    customLabel.style.cssText = "color:#bbb; font-size:12px;";

    const applyCustom = document.createElement("button");
    applyCustom.textContent  = "Apply";
    applyCustom.style.cssText = `
      margin-left:auto; background:#ff6b6b22; border:1px solid #ff6b6b;
      color:#ff6b6b; border-radius:5px; padding:3px 10px; cursor:pointer; font-size:11px;
    `;
    applyCustom.addEventListener("click", () => {
      const wire = popup._targetWire;
      const conn = popup._targetConn;
      if (!wire) return;
      wire.material = "custom";
      wire.setAttribute("stroke", colorInput.value);
      if (conn) {
        conn.material   = "custom";
        conn.resistance = wireResistance("copper", wire.nodes, conn.areaMm2 ?? 0.326);
        _wireCache.delete(conn);
        const rInfoEl   = popup.querySelector("#wireResInfo");
        if (rInfoEl) rInfoEl.textContent = `R ≈ ${conn.resistance.toExponential(3)} Ω`;
        this._syncWireBranch(conn);
        this.checkAllConnections();
      }
      popup.style.display = "none";
    });

    customRow.append(colorInput, customLabel, applyCustom);
    popup.appendChild(grid);
    popup.appendChild(customRow);
    document.body.appendChild(popup);
    return popup;
  }

  _autoColor(pin) {
    const id = (pin?.dataset?.pin ?? "").toLowerCase();
    if (["vcc", "5v", "vin", "3.3v", "3v3", "vdd"].some(k => id.includes(k))) return "#e07b39";
    if (["gnd", "ground", "gnd1", "gnd2"].some(k => id.includes(k)))           return "#4a4a4a";
    if (["sda", "scl", "i2c"].some(k => id.includes(k)))                        return "#44aaff";
    if (["mosi", "miso", "sck", "spi", "ss", "cs"].some(k => id.includes(k)))  return "#aa66ff";
    if (["tx", "rx", "uart", "serial"].some(k => id.includes(k)))               return "#44dd88";
    if (["clk", "clock"].some(k => id.includes(k)))                             return "#ffcc44";
    if (["rst", "reset", "en", "enable"].some(k => id.includes(k)))             return "#ff6688";
    if (id.startsWith("a") && !isNaN(id.slice(1)))                              return "#ff9944";
    if (id.startsWith("d") && !isNaN(id.slice(1)))                              return "#88ddff";
    return "#e07b39";
  }
}