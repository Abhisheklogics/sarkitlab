"use strict";

export class Diode {
  constructor(pins = {}, instanceName = null, registryId = null) {
    this.pinA         = pins.a ?? pins.A ?? null;
    this.pinK         = pins.k ?? pins.K ?? null;
    this.instanceName = instanceName;
    this._registryId  = registryId;

    this.forwardVoltage = 0.7;
    this.iSat           = 1e-14;
    this.n              = 1.0;

    this.conducting = false;
    this.current    = 0;
    this.voltage    = 0;

    this.svg = this._createSVG();
    this.svg.__instance = this;
  }

  getElement() { return this.svg; }

  updateVisual(conducting) {
    this.conducting = conducting;
    if (!this._body) return;
    this._body.setAttribute("fill",   conducting ? "#c62828" : "#424242");
    this._band.setAttribute("fill",   conducting ? "#ef9a9a" : "#9e9e9e");
    this._glow.setAttribute("opacity", conducting ? "0.35"   : "0");
  }

  reset() {
    this.conducting = false;
    this.current    = 0;
    this.voltage    = 0;
    this.updateVisual(false);
  }

 _createSVG() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", 150);
    svg.setAttribute("height", 150);

    svg.innerHTML = `
  <defs>
    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#333;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#111;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#333;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="stripeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#f0f0f0;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#d3d3d3;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f0f0f0;stop-opacity:1" />
    </linearGradient>
  </defs>

  <line x1="10" y1="70" x2="40" y2="70" stroke="#a0a0a0" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="100" y1="70" x2="130" y2="70" stroke="#a0a0a0" stroke-width="2.5" stroke-linecap="round"/>

  <rect x="40" y="58" width="60" height="24" rx="3" ry="3" fill="url(#bodyGrad)" />
  
  <rect x="85" y="58" width="8" height="24" fill="url(#stripeGrad)" />
  
  <rect x="42" y="60" width="56" height="4" rx="2" fill="white" fill-opacity="0.15" />
    `;

    this.body = svg.querySelector("#body");
    return svg;
  }
}