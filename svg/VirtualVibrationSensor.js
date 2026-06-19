"use strict";

const SPRING_K       = 8.0;
const SPRING_DAMPING = 0.72;
const SPRING_MASS    = 1.0;
const TRIGGER_THRESH = 2.8;
const SETTLE_THRESH  = 0.08;

export default class VirtualVibrationMotor {

  static manifest = {
    id:         "vibrationSensor",
    label:      "Vibration Sensor",
    group:      "Sensors & Input",
    imageSrc:   "../images/vibration.png",
    width:      100,
    height:     130,
    cssClasses: ["vibrationSensor"],
    physics:    { conductive: false, requiresClosedLoop: false },
    pins: [
      { id: "VCC", x: 18, y: 102 },
      { id: "OUT", x: 47, y: 102 },
      { id: "GND", x: 73, y: 102 },
    ],
    factory: (ctx) => new VirtualVibrationMotor(ctx.digitalInputs)
  }
  constructor(digitalInputsRef = {}) {
    this.digitalInputs = digitalInputsRef;
    this.pinOUT        = null;
    this._simEngine    = null;
    this._powered      = false;

    this.state    = 0;
    this.running  = false;

    this._autoInterval  = null;
    this.instanceName   = null;

    this._springX       = 0;
    this._springV       = 0;
    this._springRaf     = null;
    this._springRunning = false;

    this.svg       = this._createSVG();
    this.body      = this.svg.querySelector("#vibBody");
    this.group     = this.svg.querySelector("#vibGroup");
    this.statusLED = this.svg.querySelector("#statusLED");

    // Click/mousedown — sim running hona zaroori NAHI visual ke liye
    // Lekin digitalInputs sirf sim chal raha ho tab update hoga
    this.svg.addEventListener("click", () => {
      this._applyImpulse(18 + Math.random() * 10);
    });

    this.svg.addEventListener("mousedown", e => {
      e.preventDefault();
      this._applyImpulse(12 + Math.random() * 8);
    });
  }

  // ── Spring physics ──────────────────────────────────────────────

  _applyImpulse(force) {
    this._springV += force * (Math.random() > 0.5 ? 1 : -1);
    if (!this._springRunning) this._runSpring();
  }

  _runSpring() {
    this._springRunning = true;

    const tick = () => {
      const dt = 0.016;

      const restoring = -SPRING_K       * this._springX;
      const damping   = -SPRING_DAMPING * this._springV;
      const accel     = (restoring + damping) / SPRING_MASS;

      this._springV += accel * dt;
      this._springX += this._springV * dt;

      if (this.group) {
        const dx = this._springX * 3;
        const dy = Math.sin(this._springX * 2.5) * 2;
        this.group.setAttribute("transform",
          `translate(${dx.toFixed(2)},${dy.toFixed(2)})`);
      }

      const amplitude = Math.abs(this._springX);

      if (amplitude > TRIGGER_THRESH) {
        if (this.state !== 1) {
          this._setState(1);
          // resolveElectrical sirf tab jab sim chal raha ho
          if (this._isSimRunning()) {
            this._simEngine?.resolveElectrical?.();
          }
        }
      } else if (
        amplitude < SETTLE_THRESH &&
        Math.abs(this._springV) < SETTLE_THRESH
      ) {
        if (this.state !== 0) {
          this._setState(0);
          if (this._isSimRunning()) {
            this._simEngine?.resolveElectrical?.();
          }
        }
        this._springX       = 0;
        this._springV       = 0;
        this._springRunning = false;
        if (this.group) this.group.setAttribute("transform", "translate(0,0)");
        return;
      }

      this._springRaf = requestAnimationFrame(tick);
    };

    this._springRaf = requestAnimationFrame(tick);
  }

  _isSimRunning() {
    return this._simEngine?.loopRunning === true;
  }

  // ── Auto-vibrate (when powered but no Arduino pin) ──────────────

  startAutoVibrate() {
    if (this._autoInterval) return;
    this._autoInterval = setInterval(() => {
      if (!this._powered) { this.stopAutoVibrate(); return; }
      this._applyImpulse(15);
    }, 1500);
  }

  stopAutoVibrate() {
    if (this._autoInterval) {
      clearInterval(this._autoInterval);
      this._autoInterval = null;
    }
  }

  // ── State management ────────────────────────────────────────────

  _setState(val) {
    this.state = val ? 1 : 0;

    if (this.body) {
      this.body.setAttribute("fill", this.state ? "#ef5350" : "#1a1a1a");
    }
    if (this.statusLED) {
      this.statusLED.setAttribute("fill",
        this.state ? "#ff1744" : "#330000");
    }

    const lines = this.svg.querySelectorAll(".vibLine");
    lines.forEach(l =>
      l.setAttribute("opacity", this.state ? "1" : "0.3")
    );

    // digitalInputs sirf tab update karo jab sim chal raha ho
    if (this._isSimRunning() &&
        this.pinOUT !== null &&
        this.pinOUT !== undefined) {
      this.digitalInputs[this.pinOUT] = this.state;
    }

    this._updateModeLabel();
  }

  _updateModeLabel() {
    const label = this.svg.querySelector("#modeLabel");
    if (!label) return;

    if (!this._simEngine || this.pinOUT === null || this.pinOUT === undefined) {
      label.textContent = "";
      return;
    }

    const key  = `D${this.pinOUT}`;
    const mode = this._simEngine?.pinStates?.[key] ?? "INPUT";

    if (mode === "INPUT_PULLUP") {
      label.textContent = "PULLUP: LOW=VIB";
      label.setAttribute("fill", "#ff8f00");
    } else {
      label.textContent = "INPUT: HIGH=VIB";
      label.setAttribute("fill", "#42a5f5");
    }
  }

  setOutputPin(pin) {
    this.pinOUT = Number(pin);
    if (this._isSimRunning()) {
      this.digitalInputs[this.pinOUT] = this.state;
    }
  }

  read() { return this.state; }

  // ── Lifecycle ───────────────────────────────────────────────────

  stop() {
    this.stopAutoVibrate();
    if (this._springRaf) {
      cancelAnimationFrame(this._springRaf);
      this._springRaf = null;
    }
    this._springRunning = false;
    this._springX       = 0;
    this._springV       = 0;
    this._setState(0);
    this._powered = false;
    if (this.group) this.group.setAttribute("transform", "translate(0,0)");
  }

  reset() {
    this.stop();
    // pinOUT reset — next sim mein fresh auto-detect hoga
    this.pinOUT    = null;
    this._powered  = false;
    this._simEngine = null;
    const label = this.svg.querySelector("#modeLabel");
    if (label) label.textContent = "";
  }

  // ── SVG ─────────────────────────────────────────────────────────

  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "130");
    svg.setAttribute("viewBox", "0 0 100 130");
    svg.style.cursor = "pointer";

    svg.innerHTML = `
      <rect x="0" y="0" width="100" height="100" rx="6" fill="#1b5e20"/>
      <rect x="3" y="3" width="94"  height="94"  rx="5" fill="#2e7d32"/>

      <g id="vibGroup">
        <circle cx="50" cy="44" r="36"
                fill="none" stroke="#388e3c" stroke-width="1"
                stroke-dasharray="4 3"/>
        <circle id="vibBody" cx="50" cy="44" r="26"
                fill="#1a1a1a" stroke="#757575" stroke-width="2"/>
        <circle cx="50" cy="44" r="20"
                fill="none" stroke="#2a2a2a" stroke-width="2"
                stroke-dasharray="3 3"/>
        <line x1="50" y1="24" x2="50" y2="64"
              stroke="#333" stroke-width="1.5" opacity="0.6"/>
        <line x1="30" y1="44" x2="70" y2="44"
              stroke="#333" stroke-width="1.5" opacity="0.6"/>
        <circle id="springMass" cx="50" cy="44" r="9"
                fill="#555" stroke="#666" stroke-width="1.5"/>
        <circle cx="50" cy="44" r="4"   fill="#999"/>
        <circle cx="50" cy="44" r="1.5" fill="#ccc"/>
        <line class="vibLine" x1="21" y1="38" x2="10" y2="36"
              stroke="#66bb6a" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
        <line class="vibLine" x1="19" y1="44" x2="6"  y2="44"
              stroke="#66bb6a" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
        <line class="vibLine" x1="21" y1="50" x2="10" y2="52"
              stroke="#66bb6a" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
        <line class="vibLine" x1="79" y1="38" x2="90" y2="36"
              stroke="#66bb6a" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
        <line class="vibLine" x1="81" y1="44" x2="94" y2="44"
              stroke="#66bb6a" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
        <line class="vibLine" x1="79" y1="50" x2="90" y2="52"
              stroke="#66bb6a" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
      </g>

      <circle id="statusLED" cx="87" cy="12" r="5" fill="#330000"/>

      <text id="modeLabel" x="50" y="81"
            font-size="5.5" fill="#42a5f5"
            font-family="monospace" text-anchor="middle"></text>

      <text x="50" y="89" font-size="5.5" fill="#a5d6a7"
            font-family="monospace" text-anchor="middle">tap to shake</text>
      <text x="50" y="96" font-size="7" fill="#81c784"
            font-family="monospace" text-anchor="middle">VIBRATION</text>

      <text x="16" y="118" font-size="7" fill="#a5d6a7" font-family="monospace">VCC</text>
      <text x="46" y="118" font-size="7" fill="#a5d6a7" font-family="monospace">OUT</text>
      <text x="72" y="118" font-size="7" fill="#a5d6a7" font-family="monospace">GND</text>
      <rect x="18" y="102" width="5" height="14" rx="1" fill="#bdbdbd"/>
      <rect x="47" y="102" width="5" height="14" rx="1" fill="#bdbdbd"/>
      <rect x="73" y="102" width="5" height="14" rx="1" fill="#bdbdbd"/>
    `;
    return svg;
  }

  getElement() { return this.svg; }
}