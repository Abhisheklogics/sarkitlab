export default class VirtualHCSR04 {
   static manifest = {
    id:         "ultrasonic",
    label:      "ultrasonic",
    group:      "Sensors & Input",
    imageSrc:   "images/HCSR04.webp",   // sidebar card image
    width:      720,
    height:     300,
    cssClasses: ["ultrsonic"],
    physics:    { conductive: false, requiresClosedLoop: false },

    // Pin positions — ribbon connector ke bottom pe
    pins: [
      { id: "VCC", x: 222,  y: 280 },
      { id: "GND", x: 312,  y: 280 },
      { id: "trig", x: 258,  y: 280 },
       { id: "echo", x: 285,  y: 280 },
      
    ],

    
    factory: (ctx) => new VirtualHCSR04(
     
    ),
  }
    constructor(pins = {}, instanceName = null, registryId = null) {
        // =========================
        // Pin Mapping
        // =========================
        this.pinVCC = pins.vcc ?? null;
        this.pinTRIG = pins.trig ?? null;
        this.pinECHO = pins.echo ?? null;
        this.pinGND = pins.gnd ?? null;

        // =========================
        // Metadata
        // =========================
        this.instanceName = instanceName;
        this._registryId = registryId;

        // =========================
        // Runtime State
        // =========================
        this.powered = false;

        this.distance = 150; // cm
        this.minDistance = 2;
        this.maxDistance = 400;

        this.echoTime = this.distance * 58;

        this.objectDetected = true;
        this.triggered = false;

        this._nets = null;
        this.simEngine = null;

        // =========================
        // SVG
        // =========================
        this.svg = this.createSVG();
        this.svg.__instance = this;

        // =========================
        // Cache UI
        // =========================
        this.distanceSlider =
            this.svg.querySelector("#hcDistanceSlider");

        this.distanceDisp =
            this.svg.querySelector("#hcDistanceDisp");

        this.echoDisp =
            this.svg.querySelector("#hcEchoDisp");

        this.statusDisp =
            this.svg.querySelector("#hcStatusDisp");

        this.radarObject =
            this.svg.querySelector("#radarObject");

        this.radarBeam =
            this.svg.querySelector("#radarBeam");

        this.actLed =
            this.svg.querySelector("#actLedBody");

        // =========================
        // Initial UI Sync
        // =========================
        this.updateDistanceUI();

        // =========================
        // Slider Events
        // =========================
        this.distanceSlider?.addEventListener(
            "input",
            (e) => {
                e.stopPropagation();

                this.setDistance(
                    Number(e.target.value)
                );
            }
        );

        this.distanceSlider?.addEventListener(
            "mousedown",
            (e) => e.stopPropagation()
        );

        // =========================
        // Toggle UI
        // =========================
         this.svg.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleControls();
        });

        // =========================
        // Close On Outside Click
        // =========================
        document.addEventListener("click", (e) => {
            if (!this.svg.contains(e.target)) {
                this.hideControls();
            }
        });
    }

    // ==================================================
    // Distance + Physics
    // ==================================================

    setDistance(value) {
        const clamped = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, value)
        );

        this.distance = clamped;

        // HC-SR04 Formula
        this.echoTime =
            Math.round(clamped * 58);

        this.objectDetected = true;

        this.updateDistanceUI();
        this.updateRadarObject();

        // Notify Simulation Engine
        this.simEngine?.resolveElectrical?.();
    }

    readPulse(netId) {
        if (!this.powered) return 0;

        if (
            this._nets &&
            netId === this._nets.ECHO
        ) {
            return this.objectDetected
                ? this.echoTime
                : 0;
        }

        return 0;
    }

    trigger() {
        if (!this.powered) return;

        this.triggered = true;

        this.animatePulse();

        setTimeout(() => {
            this.triggered = false;
        }, 60);
    }

    // ==================================================
    // Visual Updates
    // ==================================================

    updateDistanceUI() {
        if (this.distanceDisp) {
            this.distanceDisp.textContent =
                `${this.distance} cm`;
        }

        if (this.echoDisp) {
            this.echoDisp.textContent =
                `${this.echoTime} µs`;
        }

        if (this.statusDisp) {
            this.statusDisp.textContent =
                this.objectDetected
                    ? "OBJECT DETECTED"
                    : "NO OBJECT";
        }
    }

    updateRadarObject() {
        if (!this.radarObject) return;

        // Radar travel mapping
        // 2cm -> near
        // 400cm -> far

        const minX = 160;
        const maxX = 340;

        const normalized =
            (this.distance - this.minDistance) /
            (this.maxDistance - this.minDistance);

        const x =
            minX + normalized * (maxX - minX);

        this.radarObject.setAttribute(
            "cx",
            x
        );

        if (this.radarBeam) {
            this.radarBeam.setAttribute(
                "x2",
                x
            );
        }
    }

    updatePowerState() {
        if (!this.actLed) return;

        this.actLed.setAttribute(
            "fill",
            this.powered
                ? "#ff2d2d"
                : "#555555"
        );
    }

    animatePulse() {
        if (!this.radarBeam) return;

        this.radarBeam.style.transition =
            "all 0.08s linear";

        this.radarBeam.setAttribute(
            "stroke",
            "#00ffcc"
        );

        setTimeout(() => {
            this.radarBeam.setAttribute(
                "stroke",
                "#00ffaa55"
            );
        }, 120);
    }

    // ==================================================
    // Controls
    // ==================================================

    toggleControls() {
        if (!this.controlsGroup) return;

        const visible =
            this.controlsGroup.getAttribute(
                "visibility"
            ) === "visible";

        this.controlsGroup.setAttribute(
            "visibility",
            visible ? "hidden" : "visible"
        );
    }

    hideControls() {
        if (!this.controlsGroup) return;

        this.controlsGroup.setAttribute(
            "visibility",
            "hidden"
        );
    }

    // ==================================================
    // Simulation Updates
    // ==================================================

   updatePhysics(state = {}) {
        if (state.powered !== undefined) {
            this.powered = !!state.powered;
            if (!this.powered) this.hideControls();
            this.updatePowerState();
        }
        // distance update hamesha karo — powered check nahi
        if (state.distance !== undefined) {
            this.setDistance(state.distance);
        }
        // echoTime bhi directly set kar sako
        if (state.echoTime !== undefined) {
            this.echoTime = state.echoTime;
            this.updateDistanceUI();
        }
    }

    reset() {
        this.distance = 150;
        this.echoTime = 150 * 58;

        this.updateDistanceUI();
        this.updateRadarObject();
    }

    // ==================================================
    // Serialization
    // ==================================================

    serialize() {
        return {
            type: "HC_SR04",
            powered: this.powered,
            distance: this.distance,
            echoTime: this.echoTime,
        };
    }

    deserialize(data = {}) {
        this.powered =
            !!data.powered;

        this.distance =
            data.distance ?? 150;

        this.echoTime =
            data.echoTime ??
            this.distance * 58;

        this.updatePowerState();
        this.updateDistanceUI();
        this.updateRadarObject();
    }

    // ==================================================
    // SVG Creation
    // ==================================================

    createSVG() {
        const NS =
            "http://www.w3.org/2000/svg";

        const svg =
            document.createElementNS(
                NS,
                "svg"
            );

        svg.setAttribute(
            "width",
            "380"
        );

        svg.setAttribute(
            "height",
            "400"
        );

        svg.setAttribute(
            "viewBox",
            "0 -160 720 470"
        );

        svg.style.cursor = "pointer";
        svg.style.userSelect = "none";
        svg.style.overflow = "visible";

        svg.innerHTML =`
<svg width="720" height="300" viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg">

  <defs>

    <!-- PCB gradient -->
    <linearGradient id="pcbGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f6a77"/>
      <stop offset="200%" stop-color="#084952"/>
    </linearGradient>

    <!-- Metal gradient -->
    <radialGradient id="metalGrad">
      <stop offset="50%" stop-color="#f4f4f4"/>
      <stop offset="500%" stop-color="#b9b9b9"/>
      <stop offset="500%" stop-color="#6e6e6e"/>
    </radialGradient>

    <!-- Inner diaphragm -->
    <radialGradient id="diaphragmGrad">
      <stop offset="0%" stop-color="#bfbfbf"/>
      <stop offset="200%" stop-color="#8e8e8e"/>
    </radialGradient>

    <!-- Olive ring -->
    <linearGradient id="oliveRing">
      <stop offset="40%" stop-color="#9fa532"/>
      <stop offset="200%" stop-color="#7d8122"/>
    </linearGradient>

  </defs>

  <!-- PCB -->
  <rect
    x="10"
    y="20"
    width="500"
    height="220"
    rx="15"
    fill="url(#pcbGrad)"
    filter="url(#softShadow)"
  />

  <!-- Mount holes -->
  <g fill="#e8e8e8">

    <circle cx="480" cy="45" r="16"/>

    <circle cx="45" cy="205" r="16"/>

    <circle cx="45" cy="205" r="12" fill="#d3d3d3"/>

    <circle cx="480" cy="45" r="12" fill="#d3d3d3"/>

  </g>

  <!-- LEFT TRANSDUCER -->
  <g transform="translate(-6,0)">

    <circle
      cx="135"
      cy="135"
      r="78"
      fill="url(#metalGrad)"
    />

    <circle
      cx="135"
      cy="135"
      r="64"
      fill="#4f4f4f"
    />

    <circle
      cx="135"
      cy="135"
      r="50"
      fill="url(#diaphragmGrad)"
    />

    <circle
      cx="135"
      cy="135"
      r="38"
      fill="none"
      stroke="url(#oliveRing)"
      stroke-width="10"
    />

  </g>

  <!-- RIGHT TRANSDUCER -->
  <g transform="translate(10,0)">

    <circle
      cx="400"
      cy="135"
      r="78"
      fill="url(#metalGrad)"
    />

    <circle
      cx="400"
      cy="135"
      r="64"
      fill="#4f4f4f"
    />

    <circle
      cx="400"
      cy="135"
      r="50"
      fill="url(#diaphragmGrad)"
    />

    <circle
      cx="400"
      cy="135"
      r="38"
      fill="none"
      stroke="url(#oliveRing)"
      stroke-width="10"
    />

  </g>

  <!-- Branding -->
  <text
    x="265"
    y="45"
    text-anchor="middle"
    fill="#e9f6f7"
    font-size="16"
    font-weight="600"
  >
  </text>

  <text
    x="275"
    y="150"
    text-anchor="middle"
    fill="#ffffff"
    font-size="25"
    font-weight="700"
  >
    HC-SR04
  </text>

  <!-- RIGHT SIDE diode -->

  <rect
    x="332"
    y="185"
    width="15"
    height="40"
    rx="0"
    fill="#d9d9d9"
  />

  <rect
    x="330"
    y="192"
    width="18"
    height="25"
    rx="2"
    fill="#000000"
  />

  <rect
    x="344"
    y="192"
    width="2"
    height="24"
    fill="#d3d3d3"
    opacity="0.9"
  />

  <!-- LEFT SIDE diode -->

  <rect
    x="195"
    y="185"
    width="15"
    height="40"
    rx="0"
    fill="#d9d9d9"
  />

  <rect
    x="193"
    y="192"
    width="18"
    height="25"
    rx="2"
    fill="#000000"
  />

  <rect
    x="207"
    y="192"
    width="2"
    height="24"
    fill="#d3d3d3"
    opacity="0.9"
  />

  <!-- ACT LED -->

  <rect
    x="240"
    y="65"
    width="55"
    height="42"
    fill="none"
    stroke="#e9f6f7"
    stroke-width="2"
  />

  <text
    x="268"
    y="105"
    text-anchor="middle"
    fill="#e9f6f7"
    font-size="10"
    font-weight="600"
  >
    ACT
  </text>

  <rect
    x="240"
    y="78"
    width="55"
    height="16"
    fill="#d9d9d9"
  />

  <rect
    id="actLedBody"
    x="254"
    y="77"
    width="30"
    height="20"
    rx="2"
    fill="#ffffff"
  />

  <rect
    x="254"
    y="77.5"
    width="30"
    height="4"
    rx="3"
    fill="#d3d3d3"
    opacity="0.9"
  />

  <rect
    x="302"
    y="65"
    width="40"
    height="15"
    fill="#d9d9d9"
  />

  <rect
    x="309"
    y="63.5"
    width="25"
    height="18"
    rx="2"
    fill="#000000"
  />

  <rect
    x="309.5"
    y="65"
    width="24"
    height="2"
    fill="#d3d3d3"
    opacity="0.9"
  />

  <!-- Pin labels -->

  <g
    stroke="#e9f6f7"
    stroke-width="2"
    fill="none"
  >

    <rect
      x="215"
      y="170"
      width="110"
      height="55"
    />

  </g>

  <text
    x="235"
    y="171"
    transform="rotate(-90 255 195)"
    fill="#e9f6f7"
    font-size="16"
  >
    VCC
  </text>

  <text
    x="262"
    y="171"
    transform="rotate(-90 285 195)"
    fill="#e9f6f7"
    font-size="16"
  >
    TRIG
  </text>

  <text
    x="290"
    y="171"
    transform="rotate(-90 315 195)"
    fill="#e9f6f7"
    font-size="16"
  >
    ECHO
  </text>

  <text
    x="320"
    y="170"
    transform="rotate(-90 345 195)"
    fill="#e9f6f7"
    font-size="16"
  >
    GND
  </text>

  <!-- Header -->

  <rect
    x="210"
    y="230"
    width="120"
    height="22"
    fill="#1e1e1e"
  />

  <rect
    x="218"
    y="233"
    width="18"
    height="18"
    fill="#63666A"
    stroke="#555"
    stroke-width="2"
  />

  <rect
    x="221"
    y="235"
    width="12"
    height="12"
    fill="#55555"
  />

  <rect
    x="223"
    y="245"
    width="8"
    height="46"
    rx="4"
    fill="#cfcfcf"
  />

  <rect
    x="248"
    y="233"
    width="18"
    height="18"
    fill="#63666A"
    stroke="#555"
    stroke-width="2"
  />

  <rect
    x="251"
    y="235"
    width="12"
    height="12"
    fill="#55555"
  />

  <rect
    x="253"
    y="245"
    width="8"
    height="46"
    rx="4"
    fill="#cfcfcf"
  />

  <rect
    x="278"
    y="233"
    width="18"
    height="18"
    fill="#63666A"
    stroke="#555"
    stroke-width="2"
  />

  <rect
    x="281"
    y="235"
    width="12"
    height="12"
    fill="#55555"
  />

  <rect
    x="284"
    y="245"
    width="8"
    height="46"
    rx="4"
    fill="#cfcfcf"
  />

  <rect
    x="305"
    y="233"
    width="18"
    height="18"
    fill="#63666A"
    stroke="#555"
    stroke-width="2"
  />

  <rect
    x="308"
    y="235"
    width="12"
    height="12"
    fill="#55555"
  />

  <rect
    x="311"
    y="245"
    width="8"
    height="46"
    rx="4"
    fill="#cfcfcf"
  />

</svg>
`;

        // ==================================================
        // Controls Panel
        // ==================================================

        this.controlsGroup =
            document.createElementNS(
                NS,
                "g"
            );

        this.controlsGroup.setAttribute(
            "visibility",
            "hidden"
        );

        this.controlsGroup.innerHTML = `
      <foreignObject
        x="40"
        y="-150"
        width="430"
        height="135"
      >

        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style="
            background: rgba(15,20,25,0.96);
            border: 2px solid #0f6a77;
            border-radius: 12px;
            padding: 14px;
            color: white;
            font-family: sans-serif;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          "
        >

          <div
            style="
              text-align:center;
              font-size:20px;
              font-weight:bold;
              margin-bottom:10px;
            "
          >
            HC-SR04 Ultrasonic Sensor
          </div>

          <div
            style="
              display:flex;
              justify-content:space-between;
              margin-bottom:8px;
            "
          >
            <span>Distance</span>

            <span
              id="hcDistanceDisp"
              style="
                color:#00ffaa;
                font-weight:bold;
              "
            >
              150 cm
            </span>
          </div>

          <input
            id="hcDistanceSlider"
            type="range"
            min="2"
            max="400"
            value="150"
            style="
              width:100%;
              cursor:pointer;
            "
          />

          <div
            style="
              margin-top:10px;
              display:flex;
              justify-content:space-between;
              font-size:15px;
            "
          >
            <span>
              Echo Pulse
            </span>

            <span
              id="hcEchoDisp"
              style="color:#ffd166;"
            >
              8700 µs
            </span>
          </div>

          <div
            id="hcStatusDisp"
            style="
              margin-top:8px;
              text-align:center;
              color:#00ffaa;
              font-weight:bold;
            "
          >
            OBJECT DETECTED
          </div>

        </div>

      </foreignObject>
    `;

        svg.appendChild(
            this.controlsGroup
        );

        return svg;
    }

    // ==================================================
    // Public API
    // ==================================================

    getElement() {
        return this.svg;
    }
}