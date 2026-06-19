export default class VirtualSoilMoisture {
  static manifest = {
  id:         "soilMoisture",
  label:      "Soil Moisture",
  group:      "Sensors & Input",
  imageSrc:   "images/soil.jpg",
  width:      200,
  height:     370,
  cssClasses: ["soil-moisture"],
  physics:    { conductive: false, requiresClosedLoop: false },
 
  pins: [
    { id: "VCC", x: 82,  y: 8 },
    { id: "GND", x: 99,  y: 8 },
    { id: "SIG", x: 116, y: 8 },
  ],
 
  factory: (_ctx) => new VirtualSoilMoisture(),
}
  constructor(pins = {}, instanceName = null) {
     this.pinVCC = pins.vcc ?? null;
    this.pinGND = pins.gnd ?? null;
    this.pinSIG = pins.sig ?? null;
    this.powered = false;
    this._moistureLevel = 50.0;
    this._nets = null;
 
    this.svg = this.createSVG();

   this.moistureSlider = this.svg.querySelector("#soilMoistureSlider");
    this.moistureDisp   = this.svg.querySelector("#soilMoistureDisp");
 
    if (this.moistureSlider) {
      this.moistureSlider.addEventListener("input", (e) => {
        e.stopPropagation();
        this._moistureLevel = Number(e.target.value);
        if (this.moistureDisp) this.moistureDisp.textContent = this._moistureLevel + "%";
      });
      this.moistureSlider.addEventListener("mousedown", e => e.stopPropagation());
    }
 
       this.svg.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.controlsGroup) {
        const vis = this.controlsGroup.getAttribute("visibility");
        this.controlsGroup.setAttribute("visibility",
          vis === "visible" ? "hidden" : "visible"
        );
      }
    });
 
    document.addEventListener("click", (e) => {
      if (!this.svg.contains(e.target) && this.controlsGroup) {
        this.controlsGroup.setAttribute("visibility", "hidden");
      }
    });
  
 
  }
  readMoisture() {
    return this._moistureLevel ?? 50.0;
  }
  updatePhysics(state) {
    if (state.powered !== undefined) this.powered = state.powered;
  }
  createSVG() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "500");
    svg.setAttribute("height", "800");
    svg.setAttribute("viewBox", "0 0 350 350"); // slightly wider to fit popup
    svg.style.cursor = "pointer";
    svg.style.userSelect = "none";
    svg.style.overflow = "visible";
    // Embed the provided HTML/SVG string
    const template = document.createElement("template");
    template.innerHTML = `
      <svg width="500" height="800" viewBox="0 0 300 350" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
        <defs>
          <linearGradient id="probeMetal" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#dcdcdc" />
              <stop offset="50%" style="stop-color:#f5f5f5" />
              <stop offset="100%" style="stop-color:#7e7a7a" />
          </linearGradient>
          <linearGradient id="boxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#474747" />
            <stop offset="100%" style="stop-color:#050505" />
          </linearGradient>
          <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#999" />
            <stop offset="50%" style="stop-color:#fff" />
            <stop offset="100%" style="stop-color:#888" />
          </linearGradient>
          <linearGradient id="icBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#3a3a3a" />
            <stop offset="100%" style="stop-color:#1a1a1a" />
          </linearGradient>
          <linearGradient id="legGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#888" />
            <stop offset="50%" style="stop-color:#fff" />
            <stop offset="100%" style="stop-color:#777" />
          </linearGradient>
        </defs>
        <path d="M 40 25 Q 40 10 55 10 L 145 10 Q 160 10 160 25 L 160 115 L 40 115 Z" fill="#e31e24" stroke="#b3001c" stroke-width="5" />
        <g stroke="white" stroke-width="1.2" fill="none">
            <rect x="75" cy="20" width="50" height="40" rx="2" transform="translate(0, 15)" />
        </g>
        
        <g transform="translate(78, 20)">
          <rect x="0"  y="0" width="13" height="13" rx="2" fill="url(#boxGrad)" />
          <rect x="16" y="0" width="13" height="13" rx="2" fill="url(#boxGrad)" />
          <rect x="32" y="0" width="13" height="13" rx="2" fill="url(#boxGrad)" />
          <rect x="0"  y="2" width="13" height="3" rx="1" fill="#1a1a1a" />
          <rect x="16" y="2" width="13" height="4" rx="1" fill="#1a1a1a" />
          <rect x="32" y="2" width="13" height="4" rx="1" fill="#1a1a1a" />
        </g>
        <g transform="translate(45, 10)">
          <rect x="37" y="-20" width="4" height="40" rx="1" fill="url(#pinGrad)" />
          <rect x="54" y="-20" width="4" height="40" rx="1" fill="url(#pinGrad)" />
          <rect x="69" y="-20" width="4" height="40" rx="1" fill="url(#pinGrad)" />
        </g>
        
        <circle cx="54" cy="28" r="6" fill="#fff" stroke="#ffd700" stroke-width="1.5" />
        <circle cx="142" cy="28" r="6" fill="#fff" stroke="#ffd700" stroke-width="1.5" />
        <text x="78" y="50" fill="white" font-size="7" font-family="Arial" font-weight="bold">VCC GND SIG</text>
        <text x="45" y="100" fill="white" font-size="11" font-family="Arial" font-weight="bold">Soil Moisture Sensor</text>
        <g transform="translate(52, 42)" id="legs">
          <rect x="39" y="20" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="44" y="20" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="48.5" y="20" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="53" y="20" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="39" y="39" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="44" y="39" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="48.5" y="39" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="53" y="39" width="2" height="6" rx="1" fill="url(#legGrad)" />
          <rect x="35" y="25" width="25" height="15" rx="2" fill="url(#icBodyGrad)" />
          <circle cx="40" cy="29" r="2" fill="#111" />
        </g>
        
        <rect x="73.5" y="64" width="4" height="22" rx="1" fill="url(#legGrad)" />
        <rect x="120.7" y="64" width="4" height="22" rx="1" fill="url(#legGrad)" />
        <rect x="72" y="68" width="8" height="14" rx="0.5" fill="url(#icBodyGrad)" />
        <rect x="119" y="68" width="8" height="14" rx="0.5" fill="url(#icBodyGrad)" />
        <!-- PROBE SECTION -->
        <g transform="translate(0, 117)">
          <path d="M 40 0 L 85 0 L 85 240 L 62 280 L 40 240 Z" fill="url(#probeMetal)" stroke="#e31e24" stroke-width="1" />
          <path d="M 115 0 L 160 0 L 160 240 L 138 280 L 115 240 Z" fill="url(#probeMetal)" stroke="#e31e24" stroke-width="1" />
          <g fill="#777" opacity="0.5">
            <!-- Sensor Pads -->
            <circle cx="50" cy="10" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="10" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="20" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="30" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="30" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="40" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="50" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="50" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="60" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="70" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="70" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="80" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="90" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="90" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="100" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="110" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="110" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="120" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="130" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="130" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="140" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="150" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="150" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="160" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="170" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="170" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="180" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="190" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="190" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="200" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="210" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="210" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="220" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="50" cy="230" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="75" cy="230" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="240" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="63" cy="260" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="10" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="10" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="20" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="30" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="30" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="40" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="50" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="50" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="60" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="70" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="70" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="80" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="90" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="90" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="100" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="110" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="110" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="120" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="130" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="130" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="140" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="150" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="150" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="160" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="170" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="170" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="180" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="190" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="190" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="200" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="210" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="210" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="220" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="152" cy="230" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="122" cy="230" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="240" r="4" stroke="#e31e24" stroke-width="0.5" />
            <circle cx="138" cy="260" r="4" stroke="#e31e24" stroke-width="0.5" />
          </g>
        </g>
      </svg>
    `;

    // Copy content of inner SVG into the main SVG wrapper
    const innerSvg = template.content.firstElementChild;
    while (innerSvg.firstChild) {
      svg.appendChild(innerSvg.firstChild);
    }
    // ── control box ──────────────────────────────────────────────────────────
    this.controlsGroup = document.createElementNS(ns, "g");
    this.controlsGroup.setAttribute("id", "soilControls");
    this.controlsGroup.setAttribute("visibility", "hidden");

    this.controlsGroup.innerHTML = `
      <foreignObject x="175" y="10" width="160" height="90">
        <div xmlns="http://www.w3.org/1999/xhtml" style="background: rgba(20,25,30,0.95); border: 1px solid #444; border-radius: 8px; padding: 12px; color: #ccc; font-family: sans-serif; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
          <div style="margin-bottom: 4px; font-weight: bold; color: #fff;">Soil Moisture</div>
          
          <div style="display: flex; justify-content: space-between; margin-top: 12px;">
            <span>Moisture:</span> <span id="soilMoistureDisp" style="color:#79c0ff; font-weight:bold;">50%</span>
          </div>
          <input type="range" id="soilMoistureSlider" min="0" max="100" value="50" style="width: 100%; cursor:pointer; margin-top: 4px;" />
        </div>
      </foreignObject>
    `;
    svg.appendChild(this.controlsGroup);
    return svg;
  }
  getElement() {
  return this.svg;
}
}
