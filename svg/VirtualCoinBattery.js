"use strict";

const SMOOTH_TAU = 0.15;

export default class VirtualCoinBattery {
     static manifest = {
    id:         "coinBattery",
    label:      "coinBattery",
    group:      "Power",
    imageSrc:   "images/coin.png",   // sidebar card image
    width:      120,                    // svg.setAttribute width se match
    height:     120,                    // svg.setAttribute height se match
    cssClasses: ["coinBattery"],
  

    instanceNameBase: "coinBattery",

    pins: [
      { id: "-", x: 30,  y: 50, power: "GND" },
      { id: "+", x: 35, y: 25, power: "VCC" },
    ],

    // Constructor koi ctx nahi maangta — Group A jaisa simple hai
    factory: () => new  VirtualCoinBattery(),
  };
  constructor(voltage = 3.0) {
    this.voltage = voltage;
    this._sVt  = null;
    this._sI   = null;
    this._sSoc = null;
    this.svg   = this.createSVG();
  }

  createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "120");
    svg.setAttribute("height",  "120");
    svg.setAttribute("viewBox", "0 0 120 120");

    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = `
      <radialGradient id="coinGrad" cx="40%" cy="35%" r="60%">
        <stop offset="0%"   stop-color="#e0e0e0"/>
        <stop offset="60%"  stop-color="#9e9e9e"/>
        <stop offset="100%" stop-color="#424242"/>
      </radialGradient>
      <radialGradient id="coinDead" cx="40%" cy="35%" r="60%">
        <stop offset="0%"   stop-color="#757575"/>
        <stop offset="100%" stop-color="#212121"/>
      </radialGradient>
      <radialGradient id="coinLow" cx="40%" cy="35%" r="60%">
        <stop offset="0%"   stop-color="#ffcc80"/>
        <stop offset="100%" stop-color="#e65100"/>
      </radialGradient>
    `;
    svg.appendChild(defs);

    const shadow = document.createElementNS(ns, "ellipse");
    shadow.setAttribute("cx", "62"); shadow.setAttribute("cy", "108");
    shadow.setAttribute("rx", "34"); shadow.setAttribute("ry", "6");
    shadow.setAttribute("fill", "rgba(0,0,0,0.25)");
    svg.appendChild(shadow);

    this._coinEdge = document.createElementNS(ns, "ellipse");
    this._coinEdge.setAttribute("cx", "60"); this._coinEdge.setAttribute("cy", "63");
    this._coinEdge.setAttribute("rx", "38"); this._coinEdge.setAttribute("ry", "10");
    this._coinEdge.setAttribute("fill", "#616161");
    svg.appendChild(this._coinEdge);

    this._coinFace = document.createElementNS(ns, "circle");
    this._coinFace.setAttribute("cx", "60"); this._coinFace.setAttribute("cy", "58");
    this._coinFace.setAttribute("r",  "38");
    this._coinFace.setAttribute("fill", "url(#coinGrad)");
    this._coinFace.setAttribute("stroke", "#424242");
    this._coinFace.setAttribute("stroke-width", "1.5");
    svg.appendChild(this._coinFace);

    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", "60"); ring.setAttribute("cy", "58");
    ring.setAttribute("r", "30");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "rgba(0,0,0,0.15)");
    ring.setAttribute("stroke-width", "2");
    svg.appendChild(ring);

    this._socBg = document.createElementNS(ns, "circle");
    this._socBg.setAttribute("cx", "60"); this._socBg.setAttribute("cy", "58");
    this._socBg.setAttribute("r", "24");
    this._socBg.setAttribute("fill", "none");
    this._socBg.setAttribute("stroke", "rgba(0,0,0,0.3)");
    this._socBg.setAttribute("stroke-width", "4");
    this._socBg.setAttribute("stroke-dasharray", "150.8 150.8");
    this._socBg.setAttribute("stroke-linecap", "round");
    this._socBg.setAttribute("transform", "rotate(-90 60 58)");
    svg.appendChild(this._socBg);

    this._socArc = document.createElementNS(ns, "circle");
    this._socArc.setAttribute("cx", "60"); this._socArc.setAttribute("cy", "58");
    this._socArc.setAttribute("r", "24");
    this._socArc.setAttribute("fill", "none");
    this._socArc.setAttribute("stroke", "#69f0ae");
    this._socArc.setAttribute("stroke-width", "4");
    this._socArc.setAttribute("stroke-dasharray", "150.8 150.8");
    this._socArc.setAttribute("stroke-dashoffset", "0");
    this._socArc.setAttribute("stroke-linecap", "round");
    this._socArc.setAttribute("transform", "rotate(-90 60 58)");
    svg.appendChild(this._socArc);

    const modelText = document.createElementNS(ns, "text");
    modelText.setAttribute("x", "60"); modelText.setAttribute("y", "52");
    modelText.setAttribute("text-anchor", "middle");
    modelText.setAttribute("fill", "rgba(0,0,0,0.7)");
    modelText.setAttribute("font-size", "8");
    modelText.setAttribute("font-family", "monospace");
    modelText.setAttribute("font-weight", "bold");
    modelText.textContent = "CR2032";
    svg.appendChild(modelText);

    this._voltText = document.createElementNS(ns, "text");
    this._voltText.setAttribute("x", "60"); this._voltText.setAttribute("y", "63");
    this._voltText.setAttribute("text-anchor", "middle");
    this._voltText.setAttribute("fill", "#1a237e");
    this._voltText.setAttribute("font-size", "11");
    this._voltText.setAttribute("font-family", "monospace");
    this._voltText.setAttribute("font-weight", "bold");
    this._voltText.textContent = "3.00V";
    svg.appendChild(this._voltText);

    this._statusText = document.createElementNS(ns, "text");
    this._statusText.setAttribute("x", "60"); this._statusText.setAttribute("y", "74");
    this._statusText.setAttribute("text-anchor", "middle");
    this._statusText.setAttribute("fill", "#b71c1c");
    this._statusText.setAttribute("font-size", "7");
    this._statusText.setAttribute("font-family", "monospace");
    this._statusText.setAttribute("font-weight", "bold");
    this._statusText.textContent = "";
    svg.appendChild(this._statusText);

    return svg;
  }

  updatePhysics({
    soc       = 1,
    voc       = 3.0,
    rint      = 10,
    current   = 0,
    vterminal = 3.0,
    dead      = false,
    overload  = false,
  } = {}) {
    if (!this.svg) return;

    if (dead) {
      this._sVt  = 0;
      this._sI   = 0;
      this._sSoc = 0;
    } else {
      const dt   = 0.016;
      const alpha = 1 - Math.exp(-dt / SMOOTH_TAU);
      this._sVt  = this._sVt  === null ? vterminal : this._sVt  + alpha * (vterminal - this._sVt);
      this._sI   = this._sI   === null ? current   : this._sI   + alpha * (current   - this._sI);
      this._sSoc = this._sSoc === null ? soc       : this._sSoc + alpha * (soc       - this._sSoc);
    }

    const dVt  = dead ? 0 : this._sVt;
this._lastVoc = dead ? 0 : (arguments[0]?.voc ?? dVt);
    const dI   = dead ? 0    : this._sI;
    const dSoc = dead ? 0    : Math.max(0, Math.min(1, this._sSoc));
    const collapsed = overload && dVt < 1.5;

    if (this._coinFace) {
      if (dead)            this._coinFace.setAttribute("fill", "url(#coinDead)");
      else if (dSoc < 0.2) this._coinFace.setAttribute("fill", "url(#coinLow)");
      else                 this._coinFace.setAttribute("fill", "url(#coinGrad)");
    }

    if (this._socArc) {
      const circ  = 150.8;
      const drawn = dead ? 0 : dSoc * circ;
      this._socArc.setAttribute("stroke-dashoffset", String(circ - drawn));
      this._socArc.setAttribute("stroke",
        dead       ? "#424242"  :
        dSoc > 0.5 ? "#69f0ae" :
        dSoc > 0.2 ? "#ffca28" : "#ef5350"
      );
    }

    if (this._voltText) {
   const vdrop = Math.max(0, (this._lastVoc ?? dVt) - dVt);
this._voltText.textContent = dead ? "DEAD" : `${dVt.toFixed(2)}V`;
      this._voltText.setAttribute("fill",
        dead      ? "#616161" :
        collapsed ? "#ff1744" :
        overload  ? "#ff6d00" : "#1a237e"
      );
    }

    if (this._statusText) {
      if (dead)           this._statusText.textContent = "DEAD";
      else if (collapsed) this._statusText.textContent = `${(dI*1000).toFixed(0)}mA!`;
      else if (overload)  this._statusText.textContent = "OVERLOAD";
      else                this._statusText.textContent = `${(dSoc*100).toFixed(0)}%`;

      this._statusText.setAttribute("fill",
        dead || collapsed ? "#b71c1c" :
        overload          ? "#ff6d00" : "#37474f"
      );
    }
  }

  getVoltage() { return this.voltage; }
  getElement() { return this.svg;     }
}