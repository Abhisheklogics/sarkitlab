"use strict";

export default class VirtualTiltSensor {
  constructor() {
    this.tilted   = false;
    this.active   = false;
    this.instance = this;

    this.meta = {
      category  : "digital-input",
      signalPins: ["OUT"],
      gndPins   : ["GND"],
    };
this._voltageOUT = 0;
this._voltageGND = 0;
    this.svg = this._createSVG();
    this._attachEvents();
  }

  _createSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   "160");
    svg.setAttribute("height",  "90");
    svg.setAttribute("viewBox", "0 0 160 90");
    svg.innerHTML = `
      <g id="sensor" style="transition:transform 0.15s ease;">
        <rect x="10" y="20" width="140" height="30" rx="15"
              fill="#2f2f2f" stroke="#1a1a1a" stroke-width="3"/>
        <rect x="20" y="30" width="120" height="10" rx="5" fill="#111"/>
        <circle id="ball" cx="35" cy="35" r="6" fill="#cfcfcf"/>
        <rect x="40"  y="55" width="10" height="20" fill="#cfcfcf"/>
        <rect x="110" y="55" width="10" height="20" fill="#cfcfcf"/>
      </g>
      <text id="state-label" x="80" y="82"
            text-anchor="middle" font-size="8" fill="#69f0ae"
            font-family="monospace">CLOSED (upright)</text>
    `;
    svg.style.cursor = "pointer";
    return svg;
  }

_attachEvents() {
  this.svg.addEventListener("pointerdown", e => {
    e.stopPropagation();
    this.tilted = !this.tilted;
    this.active = this.tilted;
    this._updateVisual();
    this._simEngine?.resolveElectrical?.();
  });
}

  _updateVisual() {
    const sensor = this.svg.querySelector("#sensor");
    if (sensor) {
      sensor.setAttribute("transform", this.tilted ? "rotate(20 80 35)" : "rotate(0 80 35)");
    }
    const ball = this.svg.querySelector("#ball");
    if (ball) {
      ball.setAttribute("fill", this.tilted ? "#f97316" : "#cfcfcf");
      ball.setAttribute("cx",   this.tilted ? "110"     : "35");
    }
    const label = this.svg.querySelector("#state-label");
    if (label) {
      label.textContent = this.tilted ? "OPEN (tilted)" : "CLOSED (upright)";
      label.setAttribute("fill", this.tilted ? "#f97316" : "#69f0ae");
    }
  }

getActiveShorts() {
  return [];
}

  isActive()   { return this.tilted ? 1 : 0; }
  getElement() { return this.svg; }

  updateVisual(state) {
    this.tilted = !!state;
    this.active = !!state;
    this._updateVisual();
  }
}