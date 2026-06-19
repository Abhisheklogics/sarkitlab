"use strict";

export default class VirtualGearMotor {
  constructor(pins = {}, instanceName = null) {
    this.pinVCC     = pins.vcc ?? null;
    this.pinGND     = pins.gnd ?? null;
    this.speedNorm  = 0;
    this.powered    = false;
    this.rotation   = 0;
    this.current    = 0;
    this.voltage    = 0;
    this.maxRPM     = 5000;
    this.gearRatio  = 30;
    this.efficiency = 0.75;
    this.state      = false;
    this._rafId     = null;
    this._lastTs    = null;
    this._currentOutputRPM = 0;

    this._motorRpmEl = null;
    this._outRpmEl   = null;
    this._dirEl      = null;
    this._curEl      = null;
    this._stalledEl  = null;
    this._bodyEl     = null;

    // Anti-flicker: last rendered values cache
    this._lastMotorRpmText = null;
    this._lastOutRpmText   = null;
    this._lastDirText      = null;
    this._lastDirFill      = null;
    this._lastCurText      = null;
    this._lastCurFill      = null;
    this._lastStalled      = null;
    this._lastBodyFill     = null;
    this._lastAnimState    = null; // "running" | "stopped"

    // Smoothing — exponential moving average
    this._smoothMotorRPM  = 0;
    this._smoothOutputRPM = 0;
    this._smoothCurrent   = 0;
    const ALPHA = 0.15; // lower = smoother, higher = faster response
    this._alpha = ALPHA;

    this.cx = 100;
    this.cy = 225;

    this.svg = this._createSVG();
  }

  // ─── Safe DOM setters — only update if value actually changed ───────────────

  _setText(el, val) {
    if (!el || el.textContent === val) return;
    el.textContent = val;
  }

  _setAttr(el, attr, val) {
    if (!el || el.getAttribute(attr) === val) return;
    el.setAttribute(attr, val);
  }

  // ─── updatePhysics ──────────────────────────────────────────────────────────

  updatePhysics({
    speedNorm  = 0,
    current    = 0,
    voltage    = 0,
    motorRPM   = null,
    outputRPM  = null,
    stalled    = false,
    overTemp   = false,
    cannotSpin = false,
  } = {}) {

    if (cannotSpin) {
      this._stopAnim();
      this.speedNorm         = 0;
      this.current           = 0;
      this.voltage           = 0;
      this.powered           = false;
      this._currentOutputRPM = 0;
      this._smoothMotorRPM   = 0;
      this._smoothOutputRPM  = 0;
      this._smoothCurrent    = 0;

      this._setText(this._motorRpmEl, "M: 0 RPM");
      this._setText(this._outRpmEl,   "OUT: 0 RPM");
      this._setText(this._dirEl,      "NO DRIVE");
      this._setAttr(this._dirEl,      "fill", "#ff5252");
      const mAText = `${(current * 1000).toFixed(1)}mA`;
      this._setText(this._curEl,  mAText);
      this._setAttr(this._curEl,  "fill", "#ff5252");
      this._setAttr(this._stalledEl, "display", "inline");
      this._setAttr(this._bodyEl,    "fill", "#9e9e9e");
      return;
    }

    // Exponential smoothing — kills rapid oscillation in display
    const a = this._alpha;
    const rawMotorRPM  = motorRPM  !== null ? motorRPM  : speedNorm * this.maxRPM;
    const rawOutputRPM = outputRPM !== null ? outputRPM : rawMotorRPM / this.gearRatio * this.efficiency;

    this._smoothMotorRPM  = a * rawMotorRPM  + (1 - a) * this._smoothMotorRPM;
    this._smoothOutputRPM = a * rawOutputRPM + (1 - a) * this._smoothOutputRPM;
    this._smoothCurrent   = a * current      + (1 - a) * this._smoothCurrent;

    // Snap to zero if very small — prevents "0 RPM" flickering near threshold
    const dispMotorRPM  = Math.abs(this._smoothMotorRPM)  < 0.5 ? 0 : this._smoothMotorRPM;
    const dispOutputRPM = Math.abs(this._smoothOutputRPM) < 0.5 ? 0 : this._smoothOutputRPM;
    const dispCurrent   = this._smoothCurrent;

    this.speedNorm         = Math.max(-1, Math.min(1, speedNorm));
    this.current           = current;
    this.voltage           = voltage;
    this.powered           = Math.abs(voltage) > 0.05 && Math.abs(speedNorm) > 0.001;
    this._currentOutputRPM = this._smoothOutputRPM;

    // Motor RPM text — round to nearest 10 to reduce churn
    const motorRpmText = `M: ${Math.round(Math.abs(dispMotorRPM) / 10) * 10} RPM`;
    this._setText(this._motorRpmEl, motorRpmText);

    // Output RPM — round to nearest 1
    const outRpmText = `OUT: ${Math.round(Math.abs(dispOutputRPM))} RPM`;
    this._setText(this._outRpmEl, outRpmText);

    // Direction — hysteresis: only change label if clearly past threshold
    let dirText, dirFill;
    if (Math.abs(dispOutputRPM) < 1.0) {
      dirText = "STOP";
      dirFill = "#888";
    } else if (dispOutputRPM > 0) {
      dirText = "CW \u21BB";
      dirFill = "#00e676";
    } else {
      dirText = "CCW \u21BA";
      dirFill = "#ff9800";
    }
    this._setText(this._dirEl,  dirText);
    this._setAttr(this._dirEl,  "fill", dirFill);

    // Current — round to reduce churn
    const mA = dispCurrent * 1000;
    const curText = mA < 1
      ? `${mA.toFixed(2)}mA`
      : `${Math.round(mA)}mA`;
    const curFill = mA > 300 ? "#ff5252" : mA > 100 ? "#ffab40" : "#90a4ae";
    this._setText(this._curEl,  curText);
    this._setAttr(this._curEl,  "fill", curFill);

    // Stall indicator
    this._setAttr(this._stalledEl, "display", stalled ? "inline" : "none");

    // Body color
    this._setAttr(this._bodyEl, "fill", this.powered ? "#f4d40a" : "#9e9e9e");

    // Animation — only toggle if state actually changes
    const shouldRun = Math.abs(dispOutputRPM) > 1.0;
    if (shouldRun && !this.state) this._startAnim();
    else if (!shouldRun && this.state) this._stopAnim();
  }

  // ─── Animation ──────────────────────────────────────────────────────────────

  _startAnim() {
    if (this.state) return;
    this.state   = true;
    this._lastTs = null;
    this._rafId  = requestAnimationFrame(ts => this._tick(ts));
  }

  _stopAnim() {
    if (!this.state && this._rafId === null) return; // already stopped
    this.state = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this.rotorGroup) {
      this.rotorGroup.setAttribute("transform",
        `rotate(${this.rotation} ${this.cx} ${this.cy})`);
    }
  }

  _tick(ts) {
    if (!this.state) return;
    const dt        = this._lastTs ? Math.min((ts - this._lastTs) / 1000, 0.05) : 0;
    this._lastTs    = ts;
    const signedRPM = this._currentOutputRPM ?? 0;
    const degPerSec = signedRPM * 6;
    this.rotation   = (this.rotation + degPerSec * dt) % 360;
    this.rotorGroup?.setAttribute("transform",
      `rotate(${this.rotation} ${this.cx} ${this.cy})`);
    this._rafId = requestAnimationFrame(ts2 => this._tick(ts2));
  }

  // ─── setOff / reset ─────────────────────────────────────────────────────────

  setOff() {
    this.speedNorm         = 0;
    this.current           = 0;
    this.voltage           = 0;
    this.powered           = false;
    this._currentOutputRPM = 0;
    this._smoothMotorRPM   = 0;
    this._smoothOutputRPM  = 0;
    this._smoothCurrent    = 0;
    this._stopAnim();
    this._setText(this._motorRpmEl, "M: 0 RPM");
    this._setText(this._outRpmEl,   "OUT: 0 RPM");
    this._setText(this._dirEl,      "STOP");
    this._setAttr(this._dirEl,      "fill", "#888");
    this._setText(this._curEl,      "0mA");
    this._setAttr(this._stalledEl,  "display", "none");
    this._setAttr(this._bodyEl,     "fill", "#9e9e9e");
  }

  reset() { this.setOff(); }

  getElement() { return this.svg; }

  // ─── SVG (unchanged) ────────────────────────────────────────────────────────

  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "200");
    svg.setAttribute("height",  "340");
    svg.setAttribute("viewBox", "0 0 200 340");
    svg.style.overflow = "visible";

    const mk = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
      if (text !== undefined) el.textContent = text;
      return el;
    };

    this._bodyEl = mk("rect", { x:40, y:20, width:120, height:150,
      fill:"#9e9e9e", stroke:"#d3b400", "stroke-width":"4", rx:12 });
    svg.appendChild(this._bodyEl);

    svg.appendChild(mk("rect", { x:90, y:0, width:20, height:30, fill:"#f4d40a" }));

    [
      mk("rect", { x:20,  y:50, width:20, height:90, fill:"#fff", stroke:"#ccc", "stroke-width":"3" }),
      mk("rect", { x:160, y:50, width:20, height:90, fill:"#fff", stroke:"#ccc", "stroke-width":"3" }),
    ].forEach(e => svg.appendChild(e));

    svg.appendChild(mk("text", { x:30,  y:48, "font-size":"8", fill:"#e53935",
      "font-family":"monospace", "text-anchor":"middle" }, "+"));
    svg.appendChild(mk("text", { x:170, y:48, "font-size":"8", fill:"#1565c0",
      "font-family":"monospace", "text-anchor":"middle" }, "-"));

    svg.appendChild(mk("rect", { x:60, y:170, width:80, height:60,
      fill:"#f5f5f5", stroke:"#888", "stroke-width":"3", rx:10 }));
    svg.appendChild(mk("text", { x:100, y:200, "font-size":"9", fill:"#555",
      "font-family":"monospace", "text-anchor":"middle" }, `1:${this.gearRatio}`));
    svg.appendChild(mk("rect", { x:60, y:210, width:80, height:40,
      fill:"#1a1a1a", stroke:"#000", "stroke-width":"3" }));

    svg.appendChild(mk("rect", { x:97, y:250, width:6, height:30, fill:"#999" }));
    svg.appendChild(mk("circle", { cx:100, cy:250, r:8,
      fill:"#eee", stroke:"#222", "stroke-width":"2" }));

    this.rotorGroup = document.createElementNS(ns, "g");
    [0, 90].forEach(angle => {
      this.rotorGroup.appendChild(mk("rect", {
        x: this.cx - 3, y: this.cy - 15, width:6, height:30, fill:"#ffcc00",
        transform: `rotate(${angle} ${this.cx} ${this.cy})`
      }));
    });
    this.rotorGroup.appendChild(mk("circle", {
      cx: this.cx, cy: this.cy, r:4, fill:"#bdbdbd", stroke:"#888", "stroke-width":"1"
    }));
    svg.appendChild(this.rotorGroup);

    svg.appendChild(mk("rect", { x:5, y:255, width:190, height:78, rx:6,
      fill:"#1a1a1a", stroke:"#333", "stroke-width":"1" }));

    svg.appendChild(mk("text", { x:100, y:269, fill:"#888", "font-size":"7",
      "font-family":"monospace", "text-anchor":"middle" }, "MOTOR \u2192 OUTPUT"));

    this._motorRpmEl = mk("text", { x:100, y:283, fill:"#ffd600", "font-size":"10",
      "font-weight":"bold", "font-family":"monospace", "text-anchor":"middle" }, "M: 0 RPM");
    svg.appendChild(this._motorRpmEl);

    this._outRpmEl = mk("text", { x:100, y:298, fill:"#00e676", "font-size":"13",
      "font-weight":"bold", "font-family":"monospace", "text-anchor":"middle" }, "OUT: 0 RPM");
    svg.appendChild(this._outRpmEl);

    this._dirEl = mk("text", { x:100, y:312, fill:"#888", "font-size":"10",
      "font-family":"monospace", "text-anchor":"middle" }, "STOP");
    svg.appendChild(this._dirEl);

    svg.appendChild(mk("line", { x1:10, y1:317, x2:190, y2:317,
      stroke:"#333", "stroke-width":"0.5" }));

    this._curEl = mk("text", { x:100, y:329, fill:"#90a4ae", "font-size":"8",
      "font-family":"monospace", "text-anchor":"middle" }, "0mA");
    svg.appendChild(this._curEl);

    this._stalledEl = mk("text", { x:100, y:329, fill:"#ff5252", "font-size":"8",
      "font-weight":"bold", "font-family":"monospace", "text-anchor":"middle",
      display:"none" }, "! STALLED");
    svg.appendChild(this._stalledEl);

    return svg;
  }
}