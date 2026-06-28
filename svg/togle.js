"use strict";

export default class ToggleSwitch {
  constructor(ctx = {}) {
    this._active        = false;
    this.instance       = this;
    this._simEngine     = null;
    this._engine        = null;
    this._digitalInputs = ctx.digitalInputs ?? ctx ?? {};
    this._voltageCOM    = 0;
    this._voltageT1     = 0;
    this._voltageT2     = 0;

    this.meta = {
      category  : "digital-input",
      signalPins: ["T1", "COM"],
      gndPins   : ["T2"],
    };

    this.svg = this._createSVG();
    this._attachEvents();
  }

  get active() { return this._active; }

  set active(val) {
    const b = !!val;
    if (b === this._active) return;
    this._active = b;
    this._updateVisual();
    const eng = this._simEngine ?? this._engine;
    if (eng) eng.resolveElectrical?.();
  }

  _createSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "140");
    svg.setAttribute("viewBox", "0 0 100 140");
    svg.innerHTML = `
      <rect x="20" y="10" width="60" height="80" rx="4"
            fill="#333" stroke="#000" stroke-width="2"/>
      <rect x="45" y="20" width="10" height="60" rx="5" fill="#111"/>
      <circle id="lever" cx="50" cy="70" r="12"
              fill="#eee" style="cursor:pointer;transition:cy 0.15s,fill 0.15s;"/>
      <text id="sw-label" x="50" y="108"
            text-anchor="middle" font-size="9"
            fill="#888" font-family="monospace">OFF</text>
      <line x1="25" y1="90" x2="25" y2="130" stroke="#aaa" stroke-width="2"/>
      <line x1="50" y1="90" x2="50" y2="130" stroke="#aaa" stroke-width="2"/>
      <line x1="75" y1="90" x2="75" y2="130" stroke="#aaa" stroke-width="2"/>
      <circle cx="25" cy="130" r="3" fill="#cfcfcf"/>
      <circle cx="50" cy="130" r="3" fill="#f0a500"/>
      <circle cx="75" cy="130" r="3" fill="#cfcfcf"/>
      <text x="25" y="125" text-anchor="middle" font-size="7"
            fill="#666" font-family="monospace">T1</text>
      <text x="50" y="125" text-anchor="middle" font-size="7"
            fill="#f0a500" font-family="monospace">COM</text>
      <text x="75" y="125" text-anchor="middle" font-size="7"
            fill="#666" font-family="monospace">T2</text>
    `;
    return svg;
  }

  _attachEvents() {
    this.svg.addEventListener("pointerdown", e => {
      e.stopPropagation();
      this.active = !this._active;
    });
  }

  _updateVisual() {
    const lever = this.svg.querySelector("#lever");
    const label = this.svg.querySelector("#sw-label");
    if (lever) {
      lever.setAttribute("cy",   this._active ? "30" : "70");
      lever.setAttribute("fill", this._active ? "#00a8e1" : "#eee");
    }
    if (label) {
      label.textContent = this._active ? "ON" : "OFF";
      label.setAttribute("fill", this._active ? "#00e676" : "#888");
    }
  }

  getActiveShorts() { return []; }
  isActive()        { return this._active ? 1 : 0; }
  getElement()      { return this.svg; }

  updateVisual(state) { this.active = !!state; }
}