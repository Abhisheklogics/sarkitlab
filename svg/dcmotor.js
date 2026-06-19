"use strict";

export default class VirtualDCMotor {
    static manifest = {
    id:         "dcmotor",
    label:      "dcmotor",
    group:      "Power",
    imageSrc:   "images/dcmotor.png",   // sidebar card image
    width:      220,                    // svg.setAttribute width se match
    height:     310,                    // svg.setAttribute height se match
    cssClasses: ["dcmotor"],
  

    instanceNameBase: "dcmotor",

    pins: [
      { id: "GND", x: 65,  y: 28, power: "GND" },
      { id: "VCC", x: 135, y: 25, power: "VCC" },
    ],

    // Constructor koi ctx nahi maangta — Group A jaisa simple hai
    factory: () => new VirtualDCMotor(),
  };
  constructor(pins = {}, instanceName = null) {
    this.pinVCC    = pins.vcc ?? null;
    this.pinGND    = pins.gnd ?? null;
    this.speedNorm = 0;
    this.powered   = false;
    this.rotation  = 0;
    this.current   = 0;
    this.voltage   = 0;
    this.maxRPM    = 5000;
    this.state     = false;
    this._rafId    = null;
    this._lastTs   = null;
    this._currentMotorRPM = 0;

    this._rpmEl     = null;
    this._dirEl     = null;
    this._curEl     = null;
    this._stalledEl = null;
    this._bodyEl    = null;

    this.cx = 110;
    this.cy = 315;
this._smoothRPM     = 0;
this._smoothCurrent = 0;
this._alpha         = 0.15;
    this.svg = this._createSVG();
  }

updatePhysics({
  speedNorm  = 0,
  current    = 0,
  voltage    = 0,
  motorRPM   = null,
  stalled    = false,
  overTemp   = false,
  cannotSpin = false,
} = {}) {
  if (cannotSpin) {
    this._stopAnim();
    this.speedNorm        = 0;
    this.current          = current;
    this.voltage          = voltage;
    this.powered          = false;
    this._currentMotorRPM = 0;
    this._smoothRPM       = 0;
    this._smoothCurrent   = 0;
 
    this._setText(this._rpmEl,     "0 RPM");
    this._setText(this._dirEl,     "NO DRIVE");
    this._setAttr(this._dirEl,     "fill", "#ff5252");
    this._setText(this._curEl,     `${(current * 1000).toFixed(1)}mA`);
    this._setAttr(this._curEl,     "fill", "#ff5252");
    this._setAttr(this._stalledEl, "display", "inline");
    this._setAttr(this._bodyEl,    "fill", "#9e9e9e");
    return;
  }
 
  // Exponential smoothing — kills rapid oscillation in display
  const a = this._alpha;
  const rawRPM = motorRPM !== null ? motorRPM : speedNorm * this.maxRPM;
  this._smoothRPM     = a * rawRPM   + (1 - a) * this._smoothRPM;
  this._smoothCurrent = a * current  + (1 - a) * this._smoothCurrent;
 
  // Snap to zero below threshold
  const dispRPM     = Math.abs(this._smoothRPM)     < 0.5 ? 0 : this._smoothRPM;
  const dispCurrent = this._smoothCurrent;
 
  this.speedNorm        = Math.max(-1, Math.min(1, speedNorm));
  this.current          = current;
  this.voltage          = voltage;
  this.powered          = Math.abs(voltage) > 0.05 && Math.abs(speedNorm) > 0.001;
  this._currentMotorRPM = this._smoothRPM;
 
  // RPM — round to nearest 10 to reduce text churn
  const rpmText = `${Math.round(Math.abs(dispRPM) / 10) * 10} RPM`;
  this._setText(this._rpmEl, rpmText);
 
  // Direction — hysteresis at low speed
  let dirText, dirFill;
  if (Math.abs(dispRPM) < 1.0) {
    dirText = "STOP";    dirFill = "#888";
  } else if (dispRPM > 0) {
    dirText = "CW \u21BB"; dirFill = "#00e676";
  } else {
    dirText = "CCW \u21BA"; dirFill = "#ff9800";
  }
  this._setText(this._dirEl,  dirText);
  this._setAttr(this._dirEl,  "fill", dirFill);
 
  // Current — round to reduce churn
  const mA      = dispCurrent * 1000;
  const curText = mA < 1 ? `${mA.toFixed(2)}mA` : `${Math.round(mA)}mA`;
  const curFill = mA > 300 ? "#ff5252" : mA > 100 ? "#ffab40" : "#90a4ae";
  this._setText(this._curEl,  curText);
  this._setAttr(this._curEl,  "fill", curFill);
 
  this._setAttr(this._stalledEl, "display", stalled ? "inline" : "none");
  this._setAttr(this._bodyEl,    "fill", this.powered ? "#ffcc66" : "#9e9e9e");
 
  const shouldRun = Math.abs(dispRPM) > 1.0;
  if (shouldRun && !this.state) this._startAnim();
  else if (!shouldRun && this.state) this._stopAnim();
}

  _startAnim() {
    if (this.state) return;
    this.state   = true;
    this._lastTs = null;
    this._rafId  = requestAnimationFrame(ts => this._tick(ts));
  }

  _stopAnim() {
    this.state = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this.rotorGroup) {
      this.rotorGroup.setAttribute("transform",
        `rotate(${this.rotation} ${this.cx} ${this.cy})`);
    }
  }

  _tick(ts) {
    if (!this.state) return;
    const dt = this._lastTs ? Math.min((ts - this._lastTs) / 1000, 0.05) : 0;
    this._lastTs = ts;
    const signedRPM = this._currentMotorRPM ?? 0;
    const degPerSec = signedRPM * 6;
    this.rotation   = (this.rotation + degPerSec * dt) % 360;
    this.rotorGroup?.setAttribute("transform",
      `rotate(${this.rotation} ${this.cx} ${this.cy})`);
    this._rafId = requestAnimationFrame(ts2 => this._tick(ts2));
  }

  setOff() {
    this.speedNorm        = 0;
    this.current          = 0;
    this.voltage          = 0;
    this.powered          = false;
    this._currentMotorRPM = 0;
    this._stopAnim();
    if (this._rpmEl)     this._rpmEl.textContent = "0 RPM";
    if (this._dirEl)   { this._dirEl.textContent = "STOP"; this._dirEl.setAttribute("fill", "#888"); }
    if (this._curEl)     this._curEl.textContent = "0mA";
    if (this._stalledEl) this._stalledEl.setAttribute("display", "none");
    if (this._bodyEl)    this._bodyEl.setAttribute("fill", "#9e9e9e");
  }
_setText(el, val) {
  if (!el || el.textContent === val) return;
  el.textContent = val;
}
 
_setAttr(el, attr, val) {
  if (!el || el.getAttribute(attr) === val) return;
  el.setAttribute(attr, val);
}
  reset() { this.setOff(); }

  getElement() { return this.svg; }

  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "220");
    svg.setAttribute("height",  "310");
    svg.setAttribute("viewBox", "0 0 220 310");
    svg.style.overflow = "visible";

    const mk = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
      if (text !== undefined) el.textContent = text;
      return el;
    };

    this._bodyEl = mk("rect", { x:40, y:80, width:140, height:200, rx:20, fill:"#ffcc66" });
    svg.appendChild(this._bodyEl);

    [
      mk("rect", { x:40,  y:80,  width:140, height:50, rx:20, fill:"#563500" }),
      mk("rect", { x:40,  y:110, width:140, height:20,         fill:"#563500" }),
      mk("rect", { x:70,  y:95,  width:80,  height:35, rx:3,  fill:"#563500" }),
      mk("rect", { x:70,  y:130, width:80,  height:120,rx:3,  fill:"#ffcd62" }),
      mk("rect", { x:80,  y:65,  width:60,  height:25, rx:3,  fill:"#563500" }),
      mk("rect", { x:62,  y:51,  width:8,   height:30, rx:3,  fill:"#555" }),
      mk("rect", { x:150, y:51,  width:8,   height:30, rx:3,  fill:"#555" }),
    ].forEach(e => svg.appendChild(e));

    svg.appendChild(mk("text", { x:66,  y:49, "font-size":"7", fill:"#e53935",
      "font-family":"monospace", "text-anchor":"middle" }, "+"));
    svg.appendChild(mk("text", { x:154, y:49, "font-size":"7", fill:"#1565c0",
      "font-family":"monospace", "text-anchor":"middle" }, "-"));

    [
      mk("rect", { x:90,    y:268, width:40, height:25, rx:8, fill:"#ffcc66" }),
      mk("rect", { x:102.5, y:292, width:15, height:45,       fill:"#555" }),
      mk("rect", { x:100.5, y:337, width:19, height:5,  rx:2, fill:"#555" }),
    ].forEach(e => svg.appendChild(e));
    svg.appendChild(mk("rect", { x:117, y:302, width:7, height:27, fill:"#5A5A5A" }));
    svg.appendChild(mk("rect", { x:96,  y:302, width:7, height:27, fill:"#5A5A5A" }));

    this.rotorGroup = document.createElementNS(ns, "g");
    [0, 90, 180, 270].forEach(angle => {
      this.rotorGroup.appendChild(mk("rect", {
        x: this.cx - 15, y: this.cy - 2, width:30, height:4, rx:2, fill:"#ffcc00",
        transform: `rotate(${angle} ${this.cx} ${this.cy})`
      }));
    });
    this.rotorGroup.appendChild(mk("circle", {
      cx: this.cx, cy: this.cy, r:5, fill:"#bdbdbd", stroke:"#888", "stroke-width":"1"
    }));
    svg.appendChild(this.rotorGroup);

    svg.appendChild(mk("rect", { x:10, y:148, width:200, height:80, rx:6,
      fill:"#1a1a1a", stroke:"#333", "stroke-width":"1" }));

    svg.appendChild(mk("text", { x:110, y:164, fill:"#666", "font-size":"7",
      "font-family":"monospace", "text-anchor":"middle" }, "SPEED"));

    this._rpmEl = mk("text", { x:110, y:185, fill:"#00e676", "font-size":"16",
      "font-weight":"bold", "font-family":"monospace", "text-anchor":"middle" }, "0 RPM");
    svg.appendChild(this._rpmEl);

    this._dirEl = mk("text", { x:110, y:201, fill:"#888", "font-size":"10",
      "font-family":"monospace", "text-anchor":"middle" }, "STOP");
    svg.appendChild(this._dirEl);

    svg.appendChild(mk("line", { x1:15, y1:207, x2:205, y2:207,
      stroke:"#333", "stroke-width":"0.5" }));

    this._curEl = mk("text", { x:110, y:221, fill:"#90a4ae", "font-size":"8",
      "font-family":"monospace", "text-anchor":"middle" }, "0mA");
    svg.appendChild(this._curEl);

    this._stalledEl = mk("text", { x:110, y:221, fill:"#ff5252", "font-size":"8",
      "font-weight":"bold", "font-family":"monospace", "text-anchor":"middle",
      display:"none" }, "! STALLED");
    svg.appendChild(this._stalledEl);

    return svg;
  }
}