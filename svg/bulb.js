export class Bulb {
  constructor(pins = {}, instanceName = null, registryId = null) {
    this.pinA = pins.a ?? null;
    this.pinB = pins.b ?? null;
    this.instanceName = instanceName ?? null;

    this.svg = this.createSVG();
    this.svg.__instance = this;

    if (registryId) this._registryId = registryId;

    this.register();
  }

  register() {
    if (!this._registryId)
      this._registryId = "bulb-" + Math.random().toString(36).substr(2, 9);

    this.svg.dataset.id = this._registryId;

    const pinsArr = [
      { id: "A", pinKey: `${this._registryId}:A` },
      { id: "B", pinKey: `${this._registryId}:B` }
    ];

    return registry.registerComponent({
      id: this._registryId,
      type: "bulb",
      instance: this,
      svg: this.svg,
      pins: pinsArr,
      physics: { conductive: true, requiresClosedLoop: true, requiresPolarity: false, allowsSeries: true }
    });
  }

  createSVG() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "60");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 60 100");

    svg.innerHTML = `
      <rect x="27" y="0" width="6" height="20" fill="#bbb"/>
      <rect x="27" y="80" width="6" height="20" fill="#bbb"/>
      <circle cx="30" cy="50" r="25" fill="#000" stroke="#555" stroke-width="2"/>
    `;
    return svg;
  }

  getElement() {
    return this.svg;
  }
}