export default class ToggleSwitch {
  constructor() {
    this.active   = false;
    this.instance = this;
    this.meta = {
      category  : "digital-input",
      signalPins: ["T1", "T2"],
      gndPins   : ["GND"],
    };

    this.svg = this._createSVG();
    this._attachEvents();
  }

  _createSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "130");
    svg.setAttribute("viewBox", "0 0 100 130");
    svg.innerHTML = `
      <!-- Switch body -->
      <rect x="20" y="10" width="60" height="80" rx="4"
            fill="#333" stroke="#000" stroke-width="2"/>
      <!-- Track -->
      <rect x="45" y="20" width="10" height="60" rx="5" fill="#111"/>
      <!-- Lever (animated via JS) -->
      <circle id="lever" cx="50" cy="70" r="12"
              fill="#eee" style="cursor:pointer"/>
      <!-- State label -->
      <text id="sw-label" x="50" y="105"
            text-anchor="middle" font-size="9"
            fill="#888" font-family="monospace">OFF</text>
      <!-- Pins -->
      <g transform="translate(25,90)">
        <rect x="0"  y="0" width="6" height="30" fill="#aaa"/>
        <rect x="22" y="0" width="6" height="30" fill="#aaa"/>
        <rect x="44" y="0" width="6" height="30" fill="#aaa"/>
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
    const lever = this.svg.querySelector("#lever");
    const label = this.svg.querySelector("#sw-label");
    if (lever) {
      lever.setAttribute("cy",   this.active ? "30" : "70");
      lever.setAttribute("fill", this.active ? "#00a8e1" : "#eee");
    }
    if (label) {
      label.textContent = this.active ? "ON" : "OFF";
      label.setAttribute("fill", this.active ? "#00e676" : "#888");
    }
  }

  isActive()   { return this.active ? 1 : 0; }
  getElement() { return this.svg; }
  updateVisual(state) {
    this.active = !!state;
    this._updateVisual();
  }
}