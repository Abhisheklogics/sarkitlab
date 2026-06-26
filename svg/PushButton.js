"use strict";

export default class PushButtons {

  constructor() {
    this.active   = false;
    this.instance = this;

    this.meta = {
      category  : "digital-input",
      signalPins: ["A1", "A2", "B1", "B2"],
    };

    this.pins = [
      { id: "A1", x: 28,  y: 110 },
      { id: "A2", x: 28,  y: 20  },
      { id: "B1", x: 92,  y: 110 },
      { id: "B2", x: 92,  y: 20  },
    ];

  
this._pointerUpHandler = () => {
  this.active = false;
  this._updateVisual();
  this._simEngine?.resolveElectrical?.();
};

    this.svg = this._createSVG();
    this._attachEvents();
  }

  _createSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   "120");
    svg.setAttribute("height",  "130");
    svg.setAttribute("viewBox", "0 0 120 130");
    svg.style.overflow   = "visible";
    svg.style.cursor     = "pointer";
    svg.style.userSelect = "none";

    svg.innerHTML = `
      <rect x="30" y="20" width="60" height="60" rx="8"
            fill="#2f2f2f" stroke="#1a1a1a" stroke-width="3"/>
      <rect x="38" y="28" width="44" height="44" rx="6" fill="#3d3d3d"/>
      <circle id="btncap" cx="60" cy="50" r="14"
              fill="#d6d6d6" stroke="#9e9e9e" stroke-width="3"/>
      <circle cx="56" cy="46" r="6" fill="rgba(255,255,255,0.4)"/>
      <rect x="28" y="20" width="8"  height="54" fill="#cfcfcf"/>
      <rect x="84" y="20" width="8"  height="54" fill="#cfcfcf"/>
      <text x="18"  y="118" font-size="7" font-family="monospace" fill="#888" text-anchor="middle">A1</text>
      <text x="18"  y="17"  font-size="7" font-family="monospace" fill="#888" text-anchor="middle">A2</text>
      <text x="102" y="118" font-size="7" font-family="monospace" fill="#888" text-anchor="middle">B1</text>
      <text x="102" y="17"  font-size="7" font-family="monospace" fill="#888" text-anchor="middle">B2</text>
    `;
    return svg;
  }

 // PushButton.js
_attachEvents() {
  this.svg.addEventListener("pointerdown", e => {
    e.stopPropagation();
    this.active = true;
    this._updateVisual();
    this._simEngine?.resolveElectrical?.();
  });
  window.addEventListener("pointerup",     this._pointerUpHandler);
  window.addEventListener("pointercancel", this._pointerUpHandler);
}



  _updateVisual() {
    const cap = this.svg.querySelector("#btncap");
    if (!cap) return;
    cap.setAttribute("r",    this.active ? "12" : "14");
    cap.setAttribute("fill", this.active ? "#9c9c9c" : "#d6d6d6");
  }

 getActiveShorts() {
  return [["A1","A2"], ["B1","B2"]];
}

  isActive()   { return this.active ? 1 : 0; }
  getElement() { return this.svg; }

  updateVisual(state) {
    this.active = !!state;
    this._updateVisual();
  }

  destroy() {
    window.removeEventListener("pointerup",     this._pointerUpHandler);
    window.removeEventListener("pointercancel", this._pointerUpHandler);
  }
}