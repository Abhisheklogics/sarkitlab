export default class SoundSensor {
  constructor(pins = {}, instanceName = null, registryId = null, digitalInputsRef = {}) {
    // FIX: assign ONCE — original code assigned twice, second overwriting the ref
    this.digitalInputs = digitalInputsRef;

    this.pinVCC  = pins.vcc  ?? null;
    this.pinGND  = pins.gnd  ?? null;
    this.pinDOUT = pins.dout ?? null;
    this.pinAOUT = pins.aout ?? null;

    this.instanceName = instanceName;
    this._registryId  = registryId;

    this.state       = 0;
    this.analogValue = 0;
    // KY-038: threshold is 0-1023 (ADC scale). Default 400 = ~40% level.
    // Real pot sets comparator reference; higher threshold = less sensitive.
    this.threshold   = 400;
    this.isTriggered = false;
    this._simEngine  = null;

    this._micActive  = false;
    this._audioCtx   = null;
    this._analyser   = null;
    this._micStream  = null;
    this._rafId      = null;
    this._simStarted = false;

    // Mic permission state — used to show correct UI message
    this._micDenied  = false;
    this._micPending = false;

    this.svg = this._createSVG();
    this.svg.__instance = this;
  }

  startSim() {
    this._simStarted = true;
    if (this.pinDOUT != null && this.digitalInputs)
      this.digitalInputs[this.pinDOUT] = 0;
    this._updateVisual();
    this._startMic();
  }

  async _startMic() {
    if (!this._simStarted) return;
    this._micPending = true;
    this._updateVisual();
    try {
      const stream    = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._micStream = stream;
      this._audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      const src       = this._audioCtx.createMediaStreamSource(stream);
      this._analyser  = this._audioCtx.createAnalyser();
      // fftSize 512 → smoother frequency data, better low-freq detection
      this._analyser.fftSize        = 512;
      this._analyser.smoothingTimeConstant = 0.6;
      src.connect(this._analyser);
      this._micActive  = true;
      this._micPending = false;
      this._micDenied  = false;
      this._poll();
    } catch (e) {
      this._micPending = false;
      this._micDenied  = true;
      this._updateVisual();
      console.warn("[SoundSensor] Mic denied:", e);
    }
  }

  _poll() {
    if (!this._micActive || !this._simStarted) return;

    const buf = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(buf);

    // Use RMS-weighted average instead of plain average —
    // better reflects perceived loudness, matches real microphone behavior
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);

    // Scale 0-128 RMS → 0-1023 ADC range
    this.analogValue = Math.min(1023, Math.round((rms / 128) * 1023));

    const prevState = this.state;

    // FIX: KY-038 ACTIVE HIGH — DO = HIGH when sound DETECTED (level > threshold)
    // The real LM393 comparator: Vout HIGH when Vin+ > Vin- (mic > pot ref)
    // Sound = HIGH analogValue → triggers when analogValue > threshold
    if (this.analogValue > this.threshold) {
      this.state       = 1;
      this.isTriggered = true;
    } else {
      this.state       = 0;
      this.isTriggered = false;
    }

    // Push digital state — digitalInputs reference was set in constructor
    if (this.pinDOUT != null && this.digitalInputs)
      this.digitalInputs[this.pinDOUT] = this.state;

    // Only wake the solver when state actually changed — saves CPU
    if (this.state !== prevState)
      this._simEngine?.resolveElectrical?.();

    this._updateVisual();
    this._rafId = requestAnimationFrame(() => this._poll());
  }

  stop() {
    this._micActive  = false;
    this._simStarted = false;
    this._micPending = false;
    cancelAnimationFrame(this._rafId);
    this._micStream?.getTracks().forEach(t => t.stop());
    this._audioCtx?.close();
    this._audioCtx  = null;
    this._analyser  = null;
    this._micStream = null;
  }

  reset() {
    this.stop();
    this.state       = 0;
    this.analogValue = 0;
    this.isTriggered = false;
    this._micDenied  = false;
    if (this.pinDOUT != null && this.digitalInputs)
      this.digitalInputs[this.pinDOUT] = 0;
    this._updateVisual();
  }

  _updateVisual() {
    if (!this._ledPower) return;

    // Power LED: red when sim running, dark when off
    if (this._micDenied) {
      // Orange = denied
      this._ledPower.setAttribute("fill", "#ff6600");
    } else {
      this._ledPower.setAttribute("fill", this._simStarted ? "#ff2200" : "#330000");
    }

    // DO LED: green when triggered (sound detected), dark otherwise
    this._ledDO.setAttribute("fill", this.isTriggered ? "#00ff44" : "#003300");

    // Level bar: fill proportional to analogValue
    const pct = this.analogValue / 1023;
    const barW = Math.round(pct * 34);
    this._bar.setAttribute("width", barW);
    this._bar.setAttribute("fill",
      pct > 0.75 ? "#ff3333" :
      pct > 0.40 ? "#ffaa00" : "#00cc44"
    );

    // Threshold marker line on bar (shows where DO trips)
    if (this._threshMark) {
      const markX = 14 + Math.round((this.threshold / 1023) * 34);
      this._threshMark.setAttribute("x1", markX);
      this._threshMark.setAttribute("x2", markX);
    }

    // Status text — show mic state
    if (this._statusText) {
      this._statusText.textContent =
        this._micDenied  ? "NO MIC" :
        this._micPending ? "..."    :
        !this._simStarted ? ""      : "";
    }
  }

  // Allow runtime threshold adjustment (e.g. from a UI slider)
  setThreshold(val) {
    this.threshold = Math.max(0, Math.min(1023, Math.round(val)));
    this._updateVisual();
  }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "90");
    svg.setAttribute("height",  "230");
    svg.setAttribute("viewBox", "0 0 90 230");

    svg.innerHTML = `
      <!-- PCB -->
      <rect x="4" y="4" width="82" height="192" rx="5"
            fill="#1a3a8c" stroke="#0d2060" stroke-width="2"/>

      <!-- Mounting holes -->
      <circle cx="45" cy="16" r="5" fill="#0d2060"/>
      <circle cx="45" cy="16" r="3" fill="#111"/>
      <circle cx="45" cy="184" r="5" fill="#0d2060"/>
      <circle cx="45" cy="184" r="3" fill="#111"/>

      <!-- Mic capsule housing -->
      <rect x="28" y="22" width="34" height="34" rx="3"
            fill="#222" stroke="#888" stroke-width="1.5"/>
      <circle cx="45" cy="39" r="13" fill="#333" stroke="#aaa" stroke-width="1"/>
      <circle cx="45" cy="39" r="9"  fill="#1a1a1a"/>
      <!-- Mic holes -->
      <circle cx="40" cy="35" r="1.4" fill="#555"/>
      <circle cx="45" cy="35" r="1.4" fill="#555"/>
      <circle cx="50" cy="35" r="1.4" fill="#555"/>
      <circle cx="40" cy="39" r="1.4" fill="#555"/>
      <circle cx="45" cy="39" r="1.4" fill="#555"/>
      <circle cx="50" cy="39" r="1.4" fill="#555"/>
      <circle cx="40" cy="43" r="1.4" fill="#555"/>
      <circle cx="45" cy="43" r="1.4" fill="#555"/>
      <circle cx="50" cy="43" r="1.4" fill="#555"/>
      <rect x="28" y="22" width="34" height="8" rx="2"
            fill="#555" stroke="#777" stroke-width="0.5"/>

      <!-- SMD resistors -->
      <rect x="14" y="62" width="14" height="7" rx="1" fill="#c8a000" stroke="#a07800"/>
      <rect x="32" y="62" width="14" height="7" rx="1" fill="#c8a000" stroke="#a07800"/>
      <rect x="50" y="62" width="14" height="7" rx="1" fill="#c8a000" stroke="#a07800"/>
      <rect x="68" y="62" width="8"  height="7" rx="1" fill="#c8a000" stroke="#a07800"/>

      <!-- LM393 IC -->
      <rect x="18" y="78" width="38" height="28" rx="2"
            fill="#0a0a0a" stroke="#555" stroke-width="1"/>
      <rect x="12" y="82" width="6" height="3" fill="#aaa"/>
      <rect x="12" y="88" width="6" height="3" fill="#aaa"/>
      <rect x="12" y="94" width="6" height="3" fill="#aaa"/>
      <rect x="12" y="100" width="6" height="3" fill="#aaa"/>
      <rect x="56" y="82" width="6" height="3" fill="#aaa"/>
      <rect x="56" y="88" width="6" height="3" fill="#aaa"/>
      <rect x="56" y="94" width="6" height="3" fill="#aaa"/>
      <rect x="56" y="100" width="6" height="3" fill="#aaa"/>
      <text x="37" y="95" text-anchor="middle"
            font-size="5.5" fill="#555" font-family="monospace">LM393</text>

      <!-- Potentiometer (threshold adjust) -->
      <rect x="58" y="78" width="22" height="22" rx="2"
            fill="#1155aa" stroke="#0033aa" stroke-width="1"/>
      <circle cx="69" cy="89" r="8" fill="#2266cc" stroke="#1144aa"/>
      <circle cx="69" cy="89" r="4" fill="#1a50b0"/>
      <line x1="69" y1="83" x2="69" y2="87" stroke="#88aaff" stroke-width="1.5"/>

      <!-- SMD caps -->
      <rect x="20" y="112" width="10" height="7" rx="1" fill="#2244aa" stroke="#1133aa"/>
      <rect x="34" y="112" width="10" height="7" rx="1" fill="#2244aa" stroke="#1133aa"/>

      <!-- Power LED -->
      <circle id="led-power" cx="70" cy="116" r="5"
              fill="#330000" stroke="#220000"/>
      <text x="70" y="127" text-anchor="middle"
            font-size="5" fill="#aaa" font-family="monospace">PWR</text>

      <!-- DO LED -->
      <circle id="led-do" cx="70" cy="136" r="5"
              fill="#003300" stroke="#002200"/>
      <text x="70" y="147" text-anchor="middle"
            font-size="5" fill="#aaa" font-family="monospace">DO</text>

      <!-- Level bar background -->
      <rect x="14" y="150" width="34" height="8" rx="2"
            fill="#0a1a0a" stroke="#1a3a1a"/>
      <!-- Level bar fill -->
      <rect id="level-bar" x="14" y="150" width="0" height="8" rx="2"
            fill="#00cc44"/>
      <!-- Threshold marker (vertical line on bar) -->
      <line id="thresh-mark" x1="28" y1="149" x2="28" y2="159"
            stroke="#ffffff" stroke-width="1" opacity="0.6"/>
      <text x="31" y="167" text-anchor="middle"
            font-size="5" fill="#6a9a6a" font-family="monospace">LEVEL</text>

      <!-- Status text (mic denied / pending) -->
      <text id="status-text" x="45" y="176" text-anchor="middle"
            font-size="5" fill="#ff8800" font-family="monospace"></text>

      <!-- Label -->
      <text x="35" y="178" text-anchor="middle"
            font-size="6" fill="#7fb8ff" font-family="monospace"
            font-weight="bold">KY-038</text>

      <!-- Pin headers on PCB -->
      <rect x="16" y="182" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <rect x="29" y="182" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <rect x="42" y="182" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <rect x="55" y="182" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <circle cx="21" cy="187" r="2.5" fill="#222"/>
      <circle cx="34" cy="187" r="2.5" fill="#222"/>
      <circle cx="47" cy="187" r="2.5" fill="#222"/>
      <circle cx="60" cy="187" r="2.5" fill="#222"/>

      <!-- Pin wires -->
      <line x1="21" y1="192" x2="21" y2="222" stroke="#888" stroke-width="2"/>
      <line x1="34" y1="192" x2="34" y2="222" stroke="#888" stroke-width="2"/>
      <line x1="47" y1="192" x2="47" y2="222" stroke="#888" stroke-width="2"/>
      <line x1="60" y1="192" x2="60" y2="222" stroke="#888" stroke-width="2"/>

      <!-- Pin tips -->
      <circle cx="21" cy="222" r="2.5" fill="#c8a060" stroke="#a07840"/>
      <circle cx="34" cy="222" r="2.5" fill="#c8a060" stroke="#a07840"/>
      <circle cx="47" cy="222" r="2.5" fill="#c8a060" stroke="#a07840"/>
      <circle cx="60" cy="222" r="2.5" fill="#c8a060" stroke="#a07840"/>
    `;

    this._ledPower   = svg.querySelector("#led-power");
    this._ledDO      = svg.querySelector("#led-do");
    this._bar        = svg.querySelector("#level-bar");
    this._threshMark = svg.querySelector("#thresh-mark");
    this._statusText = svg.querySelector("#status-text");
    return svg;
  }

  getElement()     { return this.svg; }
  getPinElements() { return []; }
}