"use strict";

import { registry } from "../src/ComponentRegistry.js";

export default class ServoMotor {
  constructor(pins = {}, instanceName = null) {
    this.pinVCC       = pins.VCC ?? null;
    this.pinGND       = pins.GND ?? null;
    this.pinSIG       = "SIG";
    this.arduinoPin   = null;
    this.targetAngle  = null;
    this.angle        = 90;
    this.attached     = false;
    this.powered      = false;
    this.speedFactor  = 1;
    this.voltage      = 0;
    this.instanceName = instanceName ?? null;
    this._animFrame   = null;
    this._animating   = false;
    this.connectedPins = { VCC: null, GND: null, SIG: null };

    this.svg = this._createSVG();
    this.svg.__instance = this;
    this._arm       = this.svg.querySelector("#servoArm");
    this._powerLed  = this.svg.querySelector("#powerLed");
    this._sigLed    = this.svg.querySelector("#sigLed");
    this._angleText = this.svg.querySelector("#angleText");
    this._statusText = this.svg.querySelector("#statusText");
    this._rotateDirect(90);
  }

  _getConnectedPinsObject() {
    const out = {};
    if (this.pinSIG != null) { out["SIG"] = this.pinSIG; out["Signal"] = this.pinSIG; }
    if (this.pinVCC != null) out["VCC"] = this.pinVCC;
    if (this.pinGND != null) out["GND"] = this.pinGND;
    return out;
  }

  setArduinoPin(pin) { this.arduinoPin = pin; }

  updatePinsFromWiring({ gnd = null, vcc = null, signal = null } = {}) {
    if (gnd    !== null) this.pinGND = gnd;
    if (vcc    !== null) this.pinVCC = vcc;
    if (signal !== null) this.pinSIG = signal;
    if (this._registeredOnce && this._registryId) {
      registry.updatePins(this._registryId, this._getConnectedPinsObject());
    }
  }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "500");
    svg.setAttribute("height",  "420");
    svg.setAttribute("viewBox", "0 0 500 620");

    svg.innerHTML = `
      <!-- Motor body -->
      <rect x="150" y="150" width="200" height="300" rx="20"
            fill="#1e73be" stroke="#13527f" stroke-width="8"/>

      <!-- Gear circle -->
      <circle cx="250" cy="300" r="90" fill="#fff2" stroke="#5687c1" stroke-width="4"/>

      <!-- Servo arm -->
      <g id="servoArm" transform="rotate(90, 250, 300)">
        <rect x="240" y="140" width="20" height="180" rx="10" fill="#eee" stroke="#ccc"/>
        <rect x="250" y="300" width="180" height="20" rx="10"
              transform="rotate(90)" fill="#eee" stroke="#ccc"/>
        <circle cx="250" cy="300" r="18" fill="#ddd" stroke="#aaa"/>
      </g>

      <!-- Wire connector block -->
      <rect x="220" y="40" width="60" height="50" fill="#333" stroke="#000"/>
      <!-- GND wire (brown) -->
      <line x1="230" y1="90" x2="230" y2="150" stroke="#4b2b2b" stroke-width="6"/>
      <!-- VCC wire (red) -->
      <line x1="250" y1="90" x2="250" y2="150" stroke="#d12c2c" stroke-width="6"/>
      <!-- SIG wire (orange) -->
      <line x1="270" y1="90" x2="270" y2="150" stroke="#c87c00" stroke-width="6"/>

      <!-- Status panel background -->
      <rect x="60" y="460" width="380" height="145" rx="10"
            fill="#111" stroke="#333" stroke-width="1"/>

      <!-- Power LED indicator -->
      <circle id="powerLed" cx="95" cy="490" r="9" fill="#333"/>
      <text x="112" y="495" fill="#888" font-size="18"
            font-family="monospace">PWR</text>

      <!-- Signal LED indicator -->
      <circle id="sigLed" cx="95" cy="520" r="9" fill="#333"/>
      <text x="112" y="525" fill="#888" font-size="18"
            font-family="monospace">SIG</text>

      <!-- Angle display -->
      <text x="112" y="557" fill="#555" font-size="16"
            font-family="monospace">ANGLE</text>
      <text id="angleText" x="340" y="557" fill="#00e676" font-size="18"
            font-weight="bold" font-family="monospace" text-anchor="end">90°</text>

      <!-- Voltage display -->
      <text x="112" y="585" fill="#555" font-size="16"
            font-family="monospace">VCC</text>
      <text id="voltText" x="340" y="585" fill="#ffd600" font-size="18"
            font-weight="bold" font-family="monospace" text-anchor="end">0.0V</text>

      <!-- Status line -->
      <text id="statusText" x="250" y="595" fill="#555" font-size="15"
            font-family="monospace" text-anchor="middle">no power</text>
    `;

    // voltText ko alag se reference rakhna
    this._voltText = svg.querySelector("#voltText");

    return svg;
  }

  setPinSIG(pin) { this.pinSIG = pin; this.arduinoPin = pin; }

  attach(sigPin, VCCPin, GNDPin) {
    this.connectedPins.SIG = sigPin;
    this.connectedPins.VCC = VCCPin;
    this.connectedPins.GND = GNDPin;
    this.pinSIG     = sigPin;
    this.pinVCC     = VCCPin;
    this.pinGND     = GNDPin;
    this.attached   = true;
    this.powered    = true;
    this.arduinoPin = sigPin;
  }

  _rotateDirect(angle) {
    this.angle = Math.max(0, Math.min(180, angle));
    this._arm?.setAttribute("transform", `rotate(${this.angle}, 250, 300)`);
    if (this._angleText) this._angleText.textContent = `${Math.round(this.angle)}°`;
  }

  rotateTo(angle) { this._rotateDirect(angle); }

  // UI update — ServoModel.update() ke baad call hota hai
  updateUI() {
    // Power LED
    if (this._powerLed) {
      this._powerLed.setAttribute("fill", this.powered ? "#00e676" : "#333");
    }

    // Signal LED — speedFactor > 0 means signal is good
    if (this._sigLed) {
      const sigGood = this.speedFactor >= 0.9;
      const sigWeak = this.speedFactor > 0 && this.speedFactor < 0.9;
      this._sigLed.setAttribute(
        "fill",
        sigGood ? "#ffd600" : sigWeak ? "#ff9800" : "#333"
      );
    }

    // Voltage
    if (this._voltText) {
      this._voltText.textContent = `${this.voltage.toFixed(1)}V`;
    }

    // Status text
    if (this._statusText) {
      let status;
      if (!this.powered) {
        status = this.voltage > 0 ? `low vcc (${this.voltage.toFixed(1)}V)` : "no power";
      } else if (this.speedFactor <= 0) {
        status = "signal too weak";
      } else if (this.speedFactor < 0.9) {
        status = `signal weak (${Math.round(this.speedFactor * 100)}%)`;
      } else {
        status = `running  ${Math.round(this.speedFactor * 100)}%`;
      }
      this._statusText.textContent = status;
      this._statusText.setAttribute("fill",
        !this.powered ? "#555" :
        this.speedFactor <= 0 ? "#e53935" :
        this.speedFactor < 0.9 ? "#ff9800" : "#00e676"
      );
    }
  }

  setAngle(targetAngle, duration = 300) {
    targetAngle = Math.max(0, Math.min(180, Number(targetAngle)));
    duration    = Math.max(50, Number(duration) || 300);

    if (Math.abs(targetAngle - this.angle) < 0.5) {
      this._rotateDirect(targetAngle);
      return Promise.resolve();
    }

    return this.smoothRotate(targetAngle, duration);
  }

  smoothRotate(targetAngle, duration = 300) {
    targetAngle = Math.max(0, Math.min(180, Number(targetAngle)));

    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }

    const startAngle = this.angle;
    const delta      = targetAngle - startAngle;
    if (Math.abs(delta) < 0.5) { this._rotateDirect(targetAngle); return Promise.resolve(); }

    const startTime  = performance.now();
    this._animating  = true;

    return new Promise((resolve) => {
      const step = (now) => {
        const t     = Math.min((now - startTime) / duration, 1);
        const eased = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
        this._rotateDirect(startAngle + delta * eased);

        if (t < 1 && this._animating) {
          this._animFrame = requestAnimationFrame(step);
        } else {
          this._animating  = false;
          this._animFrame  = null;
          this._rotateDirect(targetAngle);
          resolve();
        }
      };
      this._animFrame = requestAnimationFrame(step);
    });
  }

  update(angle, duration = 300) { return this.smoothRotate(angle, duration); }

  stop(returnAngle = 0, duration = 300) {
    this._animating = false;
    if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    this._rotateDirect(returnAngle);
  }

  getElement() { return this.svg; }
}