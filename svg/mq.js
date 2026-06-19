import MQ2SVG from "./mq2.svg.js";
import MQ3SVG from "./mq3.svg.js";
import MQ4SVG from "./mq4.svg.js";
import MQ5SVG from "./mq5.svg.js";
import MQ6SVG from "./mq6.svg.js";
import MQ7SVG from "./mq7.svg.js";
import MQ8SVG from "./mq8.svg.js";
import MQ9SVG from "./mq9.svg.js";
import MQ131SVG from "./mq131.svg.js";
import MQ135SVG from "./mq135.svg.js";

const SENSOR_TEMPLATES = {
  "MQ-2": MQ2SVG, "MQ-3": MQ3SVG, "MQ-4": MQ4SVG,
  "MQ-5": MQ5SVG, "MQ-6": MQ6SVG, "MQ-7": MQ7SVG,
  "MQ-8": MQ8SVG, "MQ-9": MQ9SVG,
  "MQ-131": MQ131SVG, "MQ-135": MQ135SVG,
};

const GAS_CONFIG = {
  "MQ-2"  : { color:"#9e9e9e", label:"Smoke/LPG",     ppmMin:200,  ppmMax:10000, baseline:150, threshold:450, warmUpSec:20, smoothing:0.12, rsAir:100000, rl:5000,  slope:3.5 },
  "MQ-3"  : { color:"#ffee58", label:"Alcohol",        ppmMin:10,   ppmMax:500,   baseline:100, threshold:300, warmUpSec:20, smoothing:0.16, rsAir:200000, rl:10000, slope:3.0 },
  "MQ-4"  : { color:"#29b6f6", label:"Methane",        ppmMin:200,  ppmMax:10000, baseline:120, threshold:350, warmUpSec:20, smoothing:0.10, rsAir:150000, rl:20000, slope:3.2 },
  "MQ-5"  : { color:"#ffa726", label:"Nat Gas/LPG",    ppmMin:200,  ppmMax:10000, baseline:120, threshold:350, warmUpSec:20, smoothing:0.08, rsAir:100000, rl:10000, slope:3.0 },
  "MQ-6"  : { color:"#ec407a", label:"LPG/Butane",     ppmMin:200,  ppmMax:10000, baseline:130, threshold:350, warmUpSec:20, smoothing:0.12, rsAir:100000, rl:10000, slope:3.0 },
  "MQ-7"  : { color:"#ce93d8", label:"Carbon CO",      ppmMin:20,   ppmMax:2000,  baseline:80,  threshold:250, warmUpSec:20, smoothing:0.06, rsAir:100000, rl:10000, slope:3.3 },
  "MQ-8"  : { color:"#ef5350", label:"Hydrogen H₂",    ppmMin:100,  ppmMax:10000, baseline:90,  threshold:300, warmUpSec:20, smoothing:0.20, rsAir:100000, rl:10000, slope:2.8 },
  "MQ-9"  : { color:"#aed581", label:"CO/Combustible", ppmMin:10,   ppmMax:10000, baseline:100, threshold:400, warmUpSec:20, smoothing:0.08, rsAir:100000, rl:10000, slope:3.0 },
  "MQ-131": { color:"#ffca28", label:"Ozone O₃",       ppmMin:10,   ppmMax:1000,  baseline:50,  threshold:200, warmUpSec:20, smoothing:0.04, rsAir:200000, rl:20000, slope:2.5 },
  "MQ-135": { color:"#66bb6a", label:"Air Quality",     ppmMin:10,   ppmMax:1000,  baseline:200, threshold:400, warmUpSec:20, smoothing:0.04, rsAir:100000, rl:10000, slope:3.5 },
};

const ADC_MAX       = 1023;
const V_REF         = 5.0;
const NOISE_AMP     = 2;
const MAX_PARTICLES = 40;

export default class MQSensorIC {

  constructor(id, data, simEngine) {
    if (!id)   throw new TypeError("[MQSensorIC] id required");
    if (!data) throw new TypeError("[MQSensorIC] data required");

    this.id        = id;
    this.simEngine = simEngine ?? null;
    this.modelName = data.name ?? "MQ-2";
    this.config    = GAS_CONFIG[this.modelName] ?? GAS_CONFIG["MQ-2"];

    this.startTime        = Date.now();
    this.gasIntensity     = 0;
    this.currentAnalog    = this.config.baseline;
    this.outputVoltage    = (this.config.baseline / ADC_MAX) * V_REF;
    this.isTriggered      = false;
    this.userThreshold    = this.config.threshold;
    this._doTriggered     = false;
    this._powered         = false;
    this._warmupDone      = false;
    this._currentPPM      = this.config.ppmMin;
    this._hasAO           = false;
    this._hasDO           = false;
    this._panelPPMChanged = false;

    this._panel      = null;
    this._panelOpen  = false;
    this._animFrame  = null;
    this._particles  = [];
    this._canvas     = null;
    this._ctx        = null;

    this._potAngle    = this._thresholdToAngle(this.config.threshold);
    this._potDragging = false;
    this._potLastY    = 0;

    this._boundPotMove = this._onPotMove.bind(this);
    this._boundPotUp   = this._onPotUp.bind(this);
    this._boundOutside = this._onOutsideClick.bind(this);

    this.svg       = this._createSVG();
    this.statusLed = this.svg.querySelector("[data-led]");
    this._barFill  = this.svg.querySelector("#gasFill");
  }

  getAnalogValue() { return Math.round(this.currentAnalog); }
  getVoltage()     { return this.outputVoltage; }
  getElement()     { return this.svg; }

  getPinDefs() {
    return [
      { id:"VCC", x:20, y:148 },
      { id:"GND", x:40, y:148 },
      { id:"DO",  x:60, y:148 },
      { id:"AO",  x:80, y:148 },
    ];
  }

 setPowered(powered) {
  const wasPowered  = this._powered;
  this._powered     = powered;
  if (powered && !wasPowered) {
    this.startTime   = Date.now();
    this._warmupDone = false;
  }
  if (!powered) {
    this._warmupDone  = false;
    this._poweredPrev = false;
    this.currentAnalog = this.config.baseline;
    this.outputVoltage = (this.config.baseline / ADC_MAX) * V_REF;
    this.isTriggered   = false;
    this._doTriggered  = false;
    this._updateVisuals(false);
  }
  if (this._panelOpen) this._renderPanel();
}

  setDigitalMode(hasAO, hasDO) {
    this._hasAO = hasAO;
    this._hasDO = hasDO;
  }

  _updateFromModel(analog, voltage, triggered) {
    this.currentAnalog = analog;
    this.outputVoltage = voltage;
    this.isTriggered   = triggered;
    this._updateVisuals(triggered);
    if (this._panelOpen) this._refreshPanelLive();
  }

  reset() {
    this._closePanel();
    this.gasIntensity     = 0;
    this._currentPPM      = this.config.ppmMin;
    this.currentAnalog    = this.config.baseline;
    this.outputVoltage    = (this.config.baseline / ADC_MAX) * V_REF;
    this.isTriggered      = false;
    this._doTriggered     = false;
    this._powered         = false;
    this._warmupDone      = false;
    this._panelPPMChanged = false;
    this.startTime        = Date.now();
    this._updateVisuals(false);
    this.simEngine        = null;
  }

  destroy() { this._closePanel(); }

  _ppmToIntensity(ppm) {
    const cfg    = this.config;
    const logMin = Math.log10(cfg.ppmMin);
    const logMax = Math.log10(cfg.ppmMax);
    const logPPM = Math.log10(Math.max(cfg.ppmMin, Math.min(cfg.ppmMax, ppm)));
    return (logPPM - logMin) / (logMax - logMin);
  }

  _intensityToRs() {
    const cfg = this.config;
    return Math.max(50, cfg.rsAir * Math.pow(10, -Math.max(0, Math.min(1, this.gasIntensity)) * cfg.slope));
  }

  _warmupFactor() {
    if (!this._powered) return 0;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const f = Math.min(1, elapsed / this.config.warmUpSec);
    if (f >= 1) this._warmupDone = true;
    return f;
  }

  _thresholdToAngle(thr) { return -135 + (thr / ADC_MAX) * 270; }
  _angleToThreshold(ang) { return Math.round(((ang + 135) / 270) * ADC_MAX); }

  _createSVG() {
    const ns       = "http://www.w3.org/2000/svg";
    const cfg      = this.config;
    const svg      = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 150");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "150");
    svg.style.overflow = "visible";
    svg.style.cursor   = "pointer";
    svg.title          = `${this.modelName} — dblclick to open panel`;
    const template     = SENSOR_TEMPLATES[this.modelName] || MQ2SVG;
    svg.innerHTML      = template(null, cfg, this.modelName);
    svg.addEventListener("dblclick", e => {
      e.stopPropagation();
      this._panelOpen ? this._closePanel() : this._openPanel();
    });
    return svg;
  }

  _updateVisuals(triggered) {
    if (this.statusLed)
      this.statusLed.setAttribute("fill", triggered ? "#ff1744" : "#37474f");

    if (this._barFill) {
      const pct = Math.round((this.currentAnalog / ADC_MAX) * 38);
      this._barFill.setAttribute("height", String(pct));
      this._barFill.setAttribute("y",      String(62 - pct));
      const hue = Math.round((1 - this.currentAnalog / ADC_MAX) * 120);
      this._barFill.setAttribute("fill", `hsl(${hue},80%,45%)`);
    }
  }

  _openPanel() {
    if (this._panel) { this._panelOpen = true; this._renderPanel(); return; }
    const panel   = document.createElement("div");
    this._panel   = panel;
    Object.assign(panel.style, {
      position:     "fixed",
      top:          "60px",
      right:        "12px",
      width:        "260px",
      background:   "#0d1929",
      border:       "1.5px solid #1e3a5f",
      borderRadius: "12px",
      padding:      "12px",
      zIndex:       "99999",
      fontFamily:   "monospace",
      color:        "#e3f2fd",
      boxShadow:    "0 8px 32px rgba(0,0,0,0.7)",
      userSelect:   "none",
    });
    document.body.appendChild(panel);
    this._panelOpen = true;
    setTimeout(() => document.addEventListener("mousedown", this._boundOutside), 100);
    this._renderPanel();
    this._startParticleLoop();
  }

  _closePanel() {
    if (this._panel) { this._panel.remove(); this._panel = null; }
    this._panelOpen = false;
    if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    document.removeEventListener("mousedown", this._boundOutside);
    window.removeEventListener("mousemove", this._boundPotMove);
    window.removeEventListener("mouseup",   this._boundPotUp);
  }

  _onOutsideClick(e) {
    if (this._panel && !this._panel.contains(e.target) && !this.svg.contains(e.target))
      this._closePanel();
  }

  _renderPanel() {
    const panel = this._panel;
    if (!panel) return;

    const cfg       = this.config;
    const adc       = Math.round(this.currentAnalog);
    const volt      = this.outputVoltage.toFixed(3);
    const rs        = Math.round(this._intensityToRs());
    const rsStr     = rs >= 1000 ? (rs / 1000).toFixed(1) + "kΩ" : rs + "Ω";
    const rlStr     = cfg.rl >= 1000 ? (cfg.rl / 1000).toFixed(1) + "kΩ" : cfg.rl + "Ω";
    const thr       = this.userThreshold;
    const triggered = this.isTriggered;
    const ppm       = Math.round(this._currentPPM);

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <span style="font-size:14px;font-weight:700;color:#42a5f5;">${this.modelName}</span>
          <span style="font-size:10px;color:#78909c;margin-left:6px;">${cfg.label}</span>
        </div>
        <button id="mqPanelClose" style="background:none;border:none;color:#546e7a;font-size:15px;cursor:pointer;padding:2px 5px;">✕</button>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Voltage Divider</div>
        <div style="display:flex;align-items:stretch;gap:0;">
          <div style="display:flex;flex-direction:column;align-items:center;width:36px;">
            <div style="font-size:9px;color:#ffa726;font-weight:700;margin-bottom:2px;">VCC</div>
            <div style="font-size:9px;color:#ffa726;">5V</div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative;">
            <div style="width:2px;height:10px;background:#546e7a;"></div>
            <div style="border:1.5px solid #42a5f5;border-radius:4px;padding:3px 8px;background:#0a1520;width:80px;text-align:center;">
              <div style="font-size:8px;color:#78909c;">Rs (sensor)</div>
              <div id="mqRsVal" style="font-size:11px;font-weight:700;color:#42a5f5;">${rsStr}</div>
            </div>
            <div style="width:2px;height:6px;background:#546e7a;"></div>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="width:8px;height:2px;background:#546e7a;"></div>
              <div style="background:#1b5e20;border:1.5px solid #4caf50;border-radius:10px;padding:2px 8px;">
                <span style="font-size:9px;color:#69f0ae;font-weight:700;">AO</span>
                <span id="mqAOVoltage" style="font-size:10px;color:#ffa726;font-weight:700;margin-left:4px;">${volt}V</span>
                <span id="mqADCVal" style="font-size:8px;color:#546e7a;margin-left:2px;">/ ADC ${adc}</span>
              </div>
              <div style="width:8px;height:2px;background:#546e7a;"></div>
            </div>
            <div style="width:2px;height:6px;background:#546e7a;"></div>
            <div style="border:1.5px solid #546e7a;border-radius:4px;padding:3px 8px;background:#0a1520;width:80px;text-align:center;">
              <div style="font-size:8px;color:#78909c;">Rl (load)</div>
              <div style="font-size:11px;font-weight:700;color:#90a4ae;">${rlStr}</div>
            </div>
            <div style="width:2px;height:10px;background:#546e7a;"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:36px;">
            <div style="font-size:9px;color:#78909c;">GND</div>
            <div style="font-size:9px;color:#78909c;">0V</div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:9px;color:#37474f;text-align:center;">
          V<sub>AO</sub> = 5V × Rl / (Rs+Rl) &nbsp;→&nbsp;
          <span style="color:#4fc38a;">Rs↓ gas↑</span>
        </div>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Gas Concentration</div>
        <canvas id="mqParticleCanvas" width="236" height="60"
          style="border-radius:6px;display:block;width:100%;background:#060e1a;margin-bottom:8px;"></canvas>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#78909c;margin-bottom:3px;">
          <span>${cfg.ppmMin} PPM</span>
          <span id="mqPPMDisplay" style="color:#42a5f5;font-weight:700;">${ppm} PPM</span>
          <span>${cfg.ppmMax} PPM</span>
        </div>
        <input id="mqPPMSlider" type="range"
          min="${cfg.ppmMin}" max="${cfg.ppmMax}" value="${ppm}"
          step="${Math.max(1, Math.round((cfg.ppmMax - cfg.ppmMin) / 200))}"
          style="width:100%;accent-color:#42a5f5;cursor:pointer;"/>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">DO Threshold (Potentiometer)</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <svg id="mqPotSVG" width="60" height="60" viewBox="0 0 64 64" style="cursor:ns-resize;flex-shrink:0;">
            <circle cx="32" cy="32" r="28" fill="#1a2744" stroke="#253560" stroke-width="2"/>
            <circle cx="32" cy="32" r="20" fill="#0d1929" stroke="#1e3a5f" stroke-width="1.5"/>
            <path d="M 10.3 53.7 A 28 28 0 1 1 53.7 53.7" fill="none" stroke="#1e3a5f" stroke-width="4" stroke-linecap="round"/>
            <path id="mqPotArc" d="" fill="none" stroke="#42a5f5" stroke-width="4" stroke-linecap="round"/>
            <line id="mqPotLine" x1="32" y1="32" x2="32" y2="12"
              stroke="#e3f2fd" stroke-width="2.5" stroke-linecap="round"
              transform="rotate(${this._potAngle},32,32)"/>
            <circle cx="32" cy="32" r="4" fill="#42a5f5"/>
          </svg>
          <div style="flex:1;">
            <div style="font-size:10px;color:#90a4ae;">
              Threshold = <span id="mqThrVal" style="color:#ffa726;font-weight:700;">${thr}</span>
            </div>
            <div style="font-size:9px;color:#37474f;margin-top:3px;">Drag ↕ to change</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
              <div style="width:10px;height:10px;border-radius:50%;
                background:${triggered ? '#ff1744' : '#00c853'};
                box-shadow:0 0 ${triggered ? 8 : 4}px ${triggered ? '#ff1744' : '#00c853'};"></div>
              <span style="font-size:9px;color:${triggered ? '#ff5252' : '#69f0ae'};">
                DO ${triggered ? 'LOW' : 'HIGH'}
              </span>
            </div>
            <div style="margin-top:4px;font-size:9px;color:#546e7a;">
              ADC <span id="mqCmpADC" style="color:#ffa726;">${adc}</span>
              <span style="margin:0 4px;">${adc > thr ? '>' : adc < thr ? '<' : '='}</span>
              THR <span style="color:#42a5f5;">${thr}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    panel.querySelector("#mqPanelClose")?.addEventListener("click", () => this._closePanel());

    const slider = panel.querySelector("#mqPPMSlider");
    if (slider) {
      slider.addEventListener("input", () => this._setPPM(parseFloat(slider.value)));
    }

    const potSVG = panel.querySelector("#mqPotSVG");
    if (potSVG) {
      potSVG.addEventListener("mousedown", e => {
        e.preventDefault();
        this._potDragging = true;
        this._potLastY    = e.clientY;
        window.addEventListener("mousemove", this._boundPotMove);
        window.addEventListener("mouseup",   this._boundPotUp);
      });
      potSVG.addEventListener("touchstart", e => {
        e.preventDefault();
        this._potDragging = true;
        this._potLastY    = e.touches[0].clientY;
        window.addEventListener("touchmove", this._boundPotMove, { passive: false });
        window.addEventListener("touchend",  this._boundPotUp);
      }, { passive: false });
      this._updatePotVisual(panel);
    }

    this._canvas = panel.querySelector("#mqParticleCanvas");
    if (this._canvas) this._ctx = this._canvas.getContext("2d");
  }

  _refreshPanelLive() {
    const panel = this._panel;
    if (!panel) return;

    const adc   = Math.round(this.currentAnalog);
    const volt  = this.outputVoltage.toFixed(3);
    const rs    = Math.round(this._intensityToRs());
    const rsStr = rs >= 1000 ? (rs / 1000).toFixed(1) + "kΩ" : rs + "Ω";
    const thr   = this.userThreshold;

    const set = (id, v) => { const e = panel.querySelector(id); if (e) e.textContent = v; };

    set("#mqRsVal",     rsStr);
    set("#mqAOVoltage", volt + "V");
    set("#mqADCVal",    `/ ADC ${adc}`);
    set("#mqPPMDisplay", Math.round(this._currentPPM) + " PPM");
    set("#mqCmpADC",    adc);

    const cmpSpan = panel.querySelector("#mqCmpADC");
    if (cmpSpan?.nextSibling) {
      cmpSpan.nextSibling.textContent = ` ${adc > thr ? '>' : adc < thr ? '<' : '='} `;
    }
  }

_setPPM(ppm) {
  const cfg        = this.config;
  this._currentPPM = Math.max(cfg.ppmMin, Math.min(cfg.ppmMax, ppm));

  const rawIntensity = this._ppmToIntensity(this._currentPPM);
  this.gasIntensity  = rawIntensity;

  this._panelPPMChanged = true;

  const rs        = Math.max(50, cfg.rsAir * Math.pow(10, -rawIntensity * cfg.slope));
  const vSupply   = this._powered ? 5.0 : 0;
  const vAO       = vSupply > 0.1 ? vSupply * cfg.rl / (rs + cfg.rl) : 0;
  const targetADC = Math.round((vAO / 5.0) * ADC_MAX);

  this.currentAnalog = targetADC;
  this.outputVoltage = vAO;

  const threshold = this.userThreshold;
  if (!this._doTriggered && targetADC >= threshold)
    this._doTriggered = true;
  else if (this._doTriggered && targetADC < threshold - 10)
    this._doTriggered = false;

  this.isTriggered = this._doTriggered;
  this._updateVisuals(this.isTriggered);

  if (this._panelOpen) this._refreshPanelLive();

  this.simEngine?.resolveElectrical?.();
}

  _onPotMove(e) {
    if (!this._potDragging) return;
    const clientY      = e.touches ? e.touches[0].clientY : e.clientY;
    const delta        = this._potLastY - clientY;
    this._potLastY     = clientY;
    this._potAngle     = Math.max(-135, Math.min(135, this._potAngle + delta * 1.2));
    this.userThreshold = this._angleToThreshold(this._potAngle);

    if (this._panel) {
      const tv = this._panel.querySelector("#mqThrVal");
      if (tv) tv.textContent = this.userThreshold;
      this._updatePotVisual(this._panel);
    }
    e.preventDefault?.();
  }

  _onPotUp() {
    this._potDragging = false;
    window.removeEventListener("mousemove", this._boundPotMove);
    window.removeEventListener("mouseup",   this._boundPotUp);
    window.removeEventListener("touchmove", this._boundPotMove);
    window.removeEventListener("touchend",  this._boundPotUp);
    if (this._panel) this._renderPanel();
  }

  _updatePotVisual(panel) {
    const line = panel?.querySelector("#mqPotLine");
    const arc  = panel?.querySelector("#mqPotArc");
    if (line) line.setAttribute("transform", `rotate(${this._potAngle.toFixed(1)},32,32)`);
    if (arc)  arc.setAttribute("d", this._buildArcPath(this._potAngle));
  }

  _buildArcPath(angle) {
    const r     = 28, cx = 32, cy = 32;
    const toRad = d => (d - 90) * Math.PI / 180;
    const start = -135;
    const x1    = cx + r * Math.cos(toRad(start));
    const y1    = cy + r * Math.sin(toRad(start));
    const x2    = cx + r * Math.cos(toRad(angle));
    const y2    = cy + r * Math.sin(toRad(angle));
    const large = (angle - start) > 180 ? 1 : 0;
    if (Math.abs(angle - start) < 2) return "";
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  _startParticleLoop() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    const loop = () => {
      if (!this._panelOpen) return;
      this._tickParticles();
      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  _tickParticles() {
    const canvas = this._canvas;
    const ctx    = this._ctx;
    if (!canvas || !ctx) return;

    const W         = canvas.width;
    const H         = canvas.height;
    const intensity = this.gasIntensity;
    const target    = Math.floor(intensity * MAX_PARTICLES);
    const color     = this.config.color;

    while (this._particles.length < target) {
      this._particles.push({
        x:    Math.random() * W,
        y:    H * 0.9 + Math.random() * H * 0.1,
        vx:   (Math.random() - 0.5) * 0.6,
        vy:   -(Math.random() * 0.8 + 0.2),
        r:    Math.random() * 2.5 + 1,
        op:   Math.random() * 0.6 + 0.2,
        life: Math.random() * 100 + 60,
        age:  0,
      });
    }
    while (this._particles.length > target) this._particles.shift();

    ctx.clearRect(0, 0, W, H);

    if (intensity > 0.05) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${r},${g},${b},${intensity * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }

    const r2 = parseInt(color.slice(1, 3), 16);
    const g2 = parseInt(color.slice(3, 5), 16);
    const b2 = parseInt(color.slice(5, 7), 16);

    this._particles = this._particles.filter(p => p.age < p.life);
    for (const p of this._particles) {
      p.x += p.vx + (Math.random() - 0.5) * 0.3;
      p.y += p.vy;
      p.age++;
      const lr      = p.age / p.life;
      const fade    = lr < 0.2 ? lr / 0.2 : lr > 0.7 ? 1 - (lr - 0.7) / 0.3 : 1.0;
      const opacity = p.op * fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r2},${g2},${b2},${opacity})`;
      ctx.fill();
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
    }

    ctx.font      = "bold 9px monospace";
    ctx.fillStyle = intensity > 0.15 ? color : "#37474f";
    ctx.textAlign = "center";
    ctx.fillText(
      intensity > 0.01
        ? `${this.config.label} — ${Math.round(this._currentPPM)} PPM`
        : "Clean air",
      W / 2, 12
    );
  }

  _positionSmokeBox() {}
  _isSimRunning() { return this.simEngine?.loopRunning === true; }
}