export default class FlameSensor {
constructor(pins = {}, instanceName = null, registryId = null, digitalInputsRef = {}) {
  this.digitalInputs = digitalInputsRef;  
    this.pinVCC  = pins.vcc  ?? null;
    this.pinGND  = pins.gnd  ?? null;
    this.pinDOUT = pins.dout ?? null;
    this.pinAOUT = pins.aout ?? null;

    this.instanceName  = instanceName;
    this._registryId   = registryId;

    
    this.analogValue    = 0;
    this.state          = 0;   
    this.isTriggered    = false;
    this._simEngine     = null;
    this.digitalInputs  = {};
    this._simStarted    = false;

    this._flameEl       = null;
    this._flameDragging = false;
    this._flameVisible  = false;

    this.svg = this._createSVG();
    this.svg.__instance = this;
  }

  startSim() {
    this._simStarted = true;
    
    if (this.pinDOUT != null && this.digitalInputs)
      this.digitalInputs[this.pinDOUT] = 0;
    this._createDraggableFlame();
    this._updateVisual();
  }

  _createDraggableFlame() {
    if (this._flameEl) return;

    const el = document.createElement("div");
    
    el.id = "draggable-flame-" + (this._registryId ?? Math.random());
    el.innerHTML = `
      <svg width="50" height="75" viewBox="0 0 50 75"
           style="overflow:visible;filter:drop-shadow(0 0 8px #ff6600) ">
        <style>
          @keyframes flicker_${el.id} {
            0%,100%{ transform:scaleY(1)    scaleX(1) }
            20%    { transform:scaleY(1.08) scaleX(0.94) }
            50%    { transform:scaleY(0.96) scaleX(1.04) }
            80%    { transform:scaleY(1.05) scaleX(0.97) }
          }
          #${el.id} .fl {
            animation: flicker_${el.id} 0.2s ease-in-out infinite;
            transform-origin: 25px 70px;
          }
        </style>
        <ellipse class="fl" cx="25" cy="44" rx="18" ry="30" fill="#ff4400" opacity="0.9"/>
        <ellipse class="fl" cx="25" cy="47" rx="13" ry="24" fill="#ff8800" opacity="0.85"
                 style="animation-delay:0.06s"/>
        <ellipse class="fl" cx="25" cy="52" rx="8"  ry="16" fill="#ffcc00" opacity="0.9"
                 style="animation-delay:0.12s"/>
        <ellipse cx="25" cy="60" rx="5" ry="7" fill="#ffffff" opacity="0.7"/>
       
      </svg>
    `;

    Object.assign(el.style, {
      position:        "fixed",
      left:            "400px",
      top:             "250px",
      cursor:          "grab",
      zIndex:          "99999",
      display:         "none",
      userSelect:      "none",
      backgroundColor: "#000",          
      borderRadius:    "8px",
      padding:         "6px",
    });

    document.body.appendChild(el);
    this._flameEl = el;

    document.addEventListener("click", (e) => {
      if (!this._flameVisible) return;
      if (el.contains(e.target)) return;
      if (this.svg.contains(e.target)) return;
      this._hideFlame();
    }, true);

   
    this.svg.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (!this._simStarted) return;
      this._showFlame();
    });

    let ox = 0, oy = 0;
    el.addEventListener("mousedown", (e) => {
      this._flameDragging = true;
      el.style.cursor = "grabbing";
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.stopPropagation();
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!this._flameDragging) return;
      el.style.left = (e.clientX - ox) + "px";
      el.style.top  = (e.clientY - oy) + "px";
      this._checkProximity(e.clientX, e.clientY);
    });

    window.addEventListener("mouseup", () => {
      if (!this._flameDragging) return;
      this._flameDragging = false;
      el.style.cursor = "grab";
    });
  }

  _showFlame() {
    if (!this._flameEl) return;
    this._flameEl.style.display = "block";
    this._flameVisible = true;
  }

  _hideFlame() {
    if (!this._flameEl) return;
    this._flameEl.style.display = "none";
    this._flameVisible = false;
    this._setFlameLevel(0);   
  }

  _checkProximity(mx, my) {
    const rect    = this.svg.getBoundingClientRect();
    const cx      = rect.left + rect.width  / 2;
    const cy      = rect.top  + rect.height / 2;
    const dist    = Math.hypot(mx - cx, my - cy);
    const maxDist = 180;

  
    const intensity = dist > maxDist
      ? 0
      : Math.round((1 - dist / maxDist) * 1023);
    this._setFlameLevel(intensity);
  }

_setFlameLevel(intensity) {
  this.analogValue = intensity;
  const prev = this.isTriggered;
 
  this.isTriggered = intensity > 500;
  this.state = this.isTriggered ? 0 : 1;
 
  if (this.pinDOUT != null && this.digitalInputs)
    this.digitalInputs[this.pinDOUT] = this.state;
 
  this._updateVisual();
 
  if (prev !== this.isTriggered)
    this._simEngine?.resolveElectrical?.();
}

  reset() {
    this._simStarted   = false;
    this.analogValue   = 0;
    this.state         = 0;
    this.isTriggered   = false;
    this._flameVisible = false;
    this._flameEl?.remove();
    this._flameEl      = null;
    if (this.pinDOUT != null && this.digitalInputs)
      this.digitalInputs[this.pinDOUT] = 0;
    this._updateVisual();
  }

  _updateVisual() {
    if (!this._ledDO) return;

    this._ledDO.setAttribute("fill",
      this.isTriggered ? "#ff4400" : "#330000");
    
    this._ledPower?.setAttribute("fill",
      this._simStarted ? "#ff2200" : "#330000");
    
    if (this._irBeam) {
      const op = 0.08 + (this.analogValue / 1023) * 0.88;
      this._irBeam.setAttribute("opacity", op.toFixed(2));
    }
  }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",  "90");
    svg.setAttribute("height", "230");
    svg.setAttribute("viewBox", "0 0 90 230");
    svg.style.cursor = "pointer";

    svg.innerHTML = `
      <!-- PCB -->
      <rect x="4" y="4" width="82" height="192" rx="5"
            fill="#000000" stroke="#222222" stroke-width="2"/>

      <!-- Mounting holes -->
      <circle cx="45" cy="14" r="5" fill="#0d2060"/>
      <circle cx="45" cy="14" r="3" fill="#111"/>
      <circle cx="45" cy="184" r="5" fill="#0d2060"/>
      <circle cx="45" cy="184" r="3" fill="#111"/>

      <!-- IR receiver housing -->
      <rect x="30" y="20" width="30" height="38" rx="3"
            fill="#111" stroke="#444" stroke-width="1.5"/>
      <ellipse cx="45" cy="32" rx="11" ry="14"
               fill="#1a1a2e" stroke="#555" stroke-width="1"/>
      <ellipse cx="45" cy="30" rx="7"  ry="9"
               fill="#222255" stroke="#3333aa" stroke-width="0.5"/>
      <line id="ir-beam" x1="45" y1="58" x2="45" y2="75"
            stroke="#ff4400" stroke-width="2"
            stroke-dasharray="3,2" opacity="0.08"/>
      <circle cx="34" cy="54" r="3" fill="#1a1a1a" stroke="#555"/>
      <circle cx="56" cy="54" r="3" fill="#1a1a1a" stroke="#555"/>

      <!-- SMD resistors -->
      <rect x="10" y="65" width="13" height="7" rx="1" fill="#c89600" stroke="#a07400"/>
      <rect x="27" y="65" width="13" height="7" rx="1" fill="#c89600" stroke="#a07400"/>
      <rect x="44" y="65" width="13" height="7" rx="1" fill="#c89600" stroke="#a07400"/>
      <rect x="62" y="65" width="13" height="7" rx="1" fill="#c89600" stroke="#a07400"/>

      <!-- LM393 IC -->
      <rect x="14" y="80" width="36" height="28" rx="2"
            fill="#0a0a0a" stroke="#555" stroke-width="1"/>
      <rect x="8"  y="84" width="6" height="3" fill="#aaa"/>
      <rect x="8"  y="90" width="6" height="3" fill="#aaa"/>
      <rect x="8"  y="96" width="6" height="3" fill="#aaa"/>
      <rect x="8"  y="102" width="6" height="3" fill="#aaa"/>
      <rect x="50" y="84" width="6" height="3" fill="#aaa"/>
      <rect x="50" y="90" width="6" height="3" fill="#aaa"/>
      <rect x="50" y="96" width="6" height="3" fill="#aaa"/>
      <rect x="50" y="102" width="6" height="3" fill="#aaa"/>
      <text x="32" y="97" text-anchor="middle"
            font-size="5.5" fill="#555" font-family="monospace">LM393</text>

      <!-- Potentiometer -->
      <rect x="56" y="80" width="24" height="24" rx="2"
            fill="#1155aa" stroke="#0033aa" stroke-width="1"/>
      <circle cx="68" cy="92" r="9" fill="#2266cc" stroke="#1144aa"/>
      <circle cx="68" cy="92" r="4.5" fill="#1a50b0"/>
      <line x1="68" y1="85" x2="68" y2="89" stroke="#88aaff" stroke-width="1.5"/>

      <!-- LEDs -->
      <circle id="led-power" cx="72" cy="118" r="5"
              fill="#330000" stroke="#220000"/>
      <text x="72" y="129" text-anchor="middle"
            font-size="5" fill="#aaa" font-family="monospace">PWR</text>
      <circle id="led-do" cx="72" cy="138" r="5"
              fill="#330000" stroke="#220000"/>
      <text x="72" y="149" text-anchor="middle"
            font-size="5" fill="#aaa" font-family="monospace">DO</text>

      <!-- SMD caps -->
      <rect x="12" y="118" width="12" height="7" rx="1" fill="#2244aa" stroke="#1133aa"/>
      <rect x="28" y="118" width="12" height="7" rx="1" fill="#2244aa" stroke="#1133aa"/>
      <rect x="44" y="118" width="12" height="7" rx="1" fill="#2244aa" stroke="#1133aa"/>

      <!-- Label -->
      <text x="30" y="155" text-anchor="middle"
            font-size="5.5" fill="#99bbff" font-family="monospace">FLAME</text>
      <text x="30" y="163" text-anchor="middle"
            font-size="4.5" fill="#5577bb" font-family="monospace">dbl-click=flame</text>

      <!-- Pin headers on PCB -->
      <rect x="14" y="170" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <rect x="27" y="170" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <rect x="40" y="170" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <rect x="53" y="170" width="10" height="10" rx="1" fill="#111" stroke="#555"/>
      <circle cx="19" cy="175" r="2.5" fill="#222"/>
      <circle cx="32" cy="175" r="2.5" fill="#222"/>
      <circle cx="45" cy="175" r="2.5" fill="#222"/>
      <circle cx="58" cy="175" r="2.5" fill="#222"/>

      <!-- Pin wires extending OUT -->
      <line x1="19" y1="180" x2="19" y2="218" stroke="#0d130d" stroke-width="2"/>
      <line x1="32" y1="180" x2="32" y2="218" stroke="#4444ff" stroke-width="2"/>
      <line x1="45" y1="180" x2="45" y2="218" stroke="#ff2222" stroke-width="2"/>
      <line x1="58" y1="180" x2="58" y2="218" stroke="#ffff00" stroke-width="2"/>

      <!-- Pin tips -->
      <circle cx="19" cy="218" r="2.5" fill="#c8a060" stroke="#a07840"/>
      <circle cx="32" cy="218" r="2.5" fill="#c8a060" stroke="#a07840"/>
      <circle cx="45" cy="218" r="2.5" fill="#c8a060" stroke="#a07840"/>
      <circle cx="58" cy="218" r="2.5" fill="#c8a060" stroke="#a07840"/>
    `;

    this._ledPower = svg.querySelector("#led-power");
    this._ledDO    = svg.querySelector("#led-do");
    this._irBeam   = svg.querySelector("#ir-beam");
    return svg;
  }

  getElement()    { return this.svg; }
  getPinElements(){ return []; }
}