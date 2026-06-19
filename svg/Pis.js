

export default class PIRSensor {
  constructor(pins = {}, digitalInputsRef = {}) {
    this.digitalInputs = digitalInputsRef;
    this.pinOUT        = pins.out ?? null;
    this._simEngine    = null;

    this.state      = 0;
    this.warmUp     = true;
    this.lastMotion = 0;
    this.HOLD_TIME  = 2000;

   
    this.CX       = 50;
    this.CY       = 44;
    this.RANGE_R  = 36;   

    this.svg = this._createSVG();
    this.led = this.svg.querySelector("#pirLED");

    this._startWarmup();
    this._enableDrag();
    this._startHoldTimer();
  }

  _isSimRunning() {
    if (this._simEngine?.loopRunning === true) return true;
    if (typeof on !== "undefined" && on === true) return true;
    return false;
  }

  _startWarmup() {
    clearTimeout(this._warmupTimeout);
    this.warmUp = true;
    const ring = this.svg.querySelector("#warmupRing");
    if (ring) ring.setAttribute("opacity", "0.9");

    this._warmupTimeout = setTimeout(() => {
      this.warmUp = false;
      const r = this.svg.querySelector("#warmupRing");
      if (r) r.setAttribute("opacity", "0");
      console.log("[PIR] Ready.");
    }, 3000);
  }

  _startHoldTimer() {
    clearInterval(this._holdInterval);
    this._holdInterval = setInterval(() => {
      if (!this.warmUp && this.state === 1) {
        if (Date.now() - this.lastMotion > this.HOLD_TIME) {
          this.setState(0);
          this._simEngine?.resolveElectrical?.();
        }
      }
    }, 100);
  }

  _enableDrag() {
    const knob = this.svg.querySelector("#innerLens");
    if (!knob) return;

    let dragging = false;
    let lastX = 0, lastY = 0;

    knob.addEventListener("mousedown", e => {
      if (!this._isSimRunning() || this.warmUp) return;
      e.stopPropagation();
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    this._onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
    
      this._setKnobPos(this.CX, this.CY);
    };

    this._onMouseMove = e => {
      if (!dragging) return;
      if (!this._isSimRunning()) { dragging = false; return; }


      const rect   = this.svg.getBoundingClientRect();
      const scaleX = 100 / rect.width;
      const scaleY = 130 / rect.height;
      const svgX   = (e.clientX - rect.left) * scaleX;
      const svgY   = (e.clientY - rect.top)  * scaleY;

      const dx   = svgX - this.CX;
      const dy   = svgY - this.CY;
      const dist = Math.hypot(dx, dy);

      const cx = dist > this.RANGE_R
        ? this.CX + (dx / dist) * this.RANGE_R
        : svgX;
      const cy = dist > this.RANGE_R
        ? this.CY + (dy / dist) * this.RANGE_R
        : svgY;
      this._setKnobPos(cx, cy);

      const moved = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;

      if (dist < this.RANGE_R) {
      
        if (moved > 3) {
          this.lastMotion = Date.now();
          this.setState(1);
          this._simEngine?.resolveElectrical?.();
        }
      } else {
        if (this.state === 1) {
          this.setState(0);
          this._simEngine?.resolveElectrical?.();
        }
      }
    };

    window.addEventListener("mouseup",   this._onMouseUp);
    window.addEventListener("mousemove", this._onMouseMove);
  }

  _setKnobPos(x, y) {
    const k = this.svg.querySelector("#innerLens");
    if (k) {
      k.setAttribute("cx", x.toFixed(1));
      k.setAttribute("cy", y.toFixed(1));
    }
  }

  setState(val) {
    this.state = val ? 1 : 0;
    if (this.led) {
      this.led.setAttribute("fill", this.state ? "#f44336" : "#330000");
    }
 
    const range = this.svg.querySelector("#rangeCircle");
    if (range) {
      range.setAttribute("stroke", this.state ? "#ef5350" : "#5c6bc0");
      range.setAttribute("stroke-width", this.state ? "2" : "1.5");
    }
    if (this.pinOUT !== null && this.pinOUT !== undefined) {
      this.digitalInputs[this.pinOUT] = this.state;
    }
  }

  read() { return this.state; }

  setOutputPin(pin) {
    this.pinOUT = Number(pin);
    this.digitalInputs[this.pinOUT] = this.state;
    console.log(`[PIR] Output pin → D${this.pinOUT}`);
  }

  reset() {
    clearTimeout(this._warmupTimeout);
    this.warmUp     = true;
    this.lastMotion = 0;
    this.setState(0);
    this._setKnobPos(this.CX, this.CY);
    this._startWarmup();
  }

  destroy() {
    clearTimeout(this._warmupTimeout);
    clearInterval(this._holdInterval);
    window.removeEventListener("mouseup",   this._onMouseUp);
    window.removeEventListener("mousemove", this._onMouseMove);
    this.setState(0);
  }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "130");
    svg.setAttribute("viewBox", "0 0 100 130");

    svg.innerHTML = `
      <!-- PCB -->
      <rect x="0" y="0" width="100" height="100" rx="6" fill="#1a237e"/>
      <rect x="3" y="3" width="94"  height="94"  rx="4" fill="#283593"/>

      <!-- Lens background -->
      <circle cx="50" cy="44" r="40" fill="#1a1a2e"/>

      <!-- RANGE CIRCLE — dashed, motion zone -->
      <circle id="rangeCircle" cx="50" cy="44" r="36"
              fill="rgba(63,81,181,0.08)"
              stroke="#5c6bc0" stroke-width="1.5"
              stroke-dasharray="5 3"/>

      <!-- Fresnel rings -->
      <circle cx="50" cy="44" r="30" fill="none" stroke="#3f51b5" stroke-width="0.7" opacity="0.5"/>
      <circle cx="50" cy="44" r="22" fill="none" stroke="#3f51b5" stroke-width="0.7" opacity="0.4"/>
      <circle cx="50" cy="44" r="14" fill="none" stroke="#3f51b5" stroke-width="0.7" opacity="0.3"/>

      <!-- Warmup ring -->
      <circle id="warmupRing" cx="50" cy="44" r="38"
              fill="none" stroke="#ffa000" stroke-width="2"
              stroke-dasharray="6 3" opacity="0"/>

      <!-- Knob (draggable) -->
      <circle id="innerLens" cx="50" cy="44" r="9"
              fill="#7986cb" stroke="#3f51b5" stroke-width="2"
              style="cursor:grab"/>

      <!-- LED -->
      <circle id="pirLED" cx="88" cy="12" r="5" fill="#330000"/>

      <!-- Hint text -->
      <text x="50" y="88" font-size="5.5" fill="#7986cb"
            font-family="monospace" text-anchor="middle">drag dot inside circle</text>
      <text x="50" y="96" font-size="7" fill="#9fa8da"
            font-family="monospace" text-anchor="middle">PIR SENSOR</text>

      <!-- Pin labels -->
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