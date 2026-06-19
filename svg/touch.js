export default class TouchSensor {
  constructor() {
    this.active   = false;
    this.instance = this;   
 
    this.meta = {
      category  : "digital-input",
      signalPins: ["SIGNAL"],
      powerPins : ["VCC"],
      gndPins   : ["GND"],
    };
 
    this.svg = this._createSVG();
    this._attachEvents();
  }
 
  _createSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   "140");
    svg.setAttribute("height",  "120");
    svg.setAttribute("viewBox", "0 0 140 120");
    svg.innerHTML = `
      <rect x="10" y="10" width="120" height="90" rx="6" fill="#1b4fa1" stroke="#0e2f66" stroke-width="3"/>
      <g id="touchPad" stroke="#ffffff" fill="none" stroke-width="2" style="cursor:pointer">
        <circle cx="70" cy="55" r="25"/>
        <circle cx="70" cy="55" r="20"/>
        <circle cx="70" cy="55" r="15"/>
        <circle cx="70" cy="55" r="10"/>
        <circle cx="70" cy="55" r="5"/>
      </g>
      <text x="70" y="25" text-anchor="middle" fill="#ffffff" font-size="10" font-family="monospace">Touch Sensor</text>
      <g transform="translate(30,95)">
        <rect x="0"  y="0" width="8" height="15" fill="#cfcfcf"/>
        <rect x="36" y="0" width="8" height="15" fill="#cfcfcf"/>
        <rect x="72" y="0" width="8" height="15" fill="#cfcfcf"/>
      </g>
    `;
    return svg;
  }
 
  _attachEvents() {
    this.svg.addEventListener("pointerdown", e => {
      e.stopPropagation();
      this.active = !this.active;   
      this._updateVisual();
    });
  }
 
  _updateVisual() {
    const pad = this.svg.querySelector("#touchPad");
    if (!pad) return;
    pad.setAttribute("fill",   this.active ? "rgba(0,255,100,0.4)" : "none");
    pad.setAttribute("stroke", this.active ? "#00ff64" : "#ffffff");
  }
 
  isActive()   { return this.active ? 1 : 0; }
  getElement() { return this.svg; }
  updateVisual(state) { this.active = !!state; this._updateVisual(); }
}