export default class VirtualRegulator7805 {
  constructor(pins = {}, instanceName = null) {
    this.pins         = pins;
    this.instanceName = instanceName;
    this._regState    = null;
    this._ledEl       = null;
    this._vOutText    = null;

    this.svg = this._createSVG();
  }

  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "80");
    svg.setAttribute("height",  "130");
    svg.setAttribute("viewBox", "0 0 80 130");
    svg.style.overflow = "visible";

    const tab = document.createElementNS(ns, "rect");
    tab.setAttribute("x",      "10");
    tab.setAttribute("y",      "2");
    tab.setAttribute("width",  "60");
    tab.setAttribute("height", "38");
    tab.setAttribute("rx",     "3");
    tab.setAttribute("fill",   "#b8b8b8");
    svg.appendChild(tab);

    const hole = document.createElementNS(ns, "circle");
    hole.setAttribute("cx",   "40");
    hole.setAttribute("cy",   "18");
    hole.setAttribute("r",    "6");
    hole.setAttribute("fill", "#e0e0e0");
    svg.appendChild(hole);

    const holeInner = document.createElementNS(ns, "circle");
    holeInner.setAttribute("cx",   "40");
    holeInner.setAttribute("cy",   "18");
    holeInner.setAttribute("r",    "3");
    holeInner.setAttribute("fill", "#999");
    svg.appendChild(holeInner);

    const body = document.createElementNS(ns, "rect");
    body.setAttribute("x",      "10");
    body.setAttribute("y",      "32");
    body.setAttribute("width",  "60");
    body.setAttribute("height", "58");
    body.setAttribute("rx",     "2");
    body.setAttribute("fill",   "#1e1e1e");
    svg.appendChild(body);

    const modelLabel = document.createElementNS(ns, "text");
    modelLabel.setAttribute("x",           "40");
    modelLabel.setAttribute("y",           "57");
    modelLabel.setAttribute("text-anchor", "middle");
    modelLabel.setAttribute("fill",        "#e0e0e0");
    modelLabel.setAttribute("font-size",   "9");
    modelLabel.setAttribute("font-family", "monospace");
    modelLabel.textContent = "LM7805";
    svg.appendChild(modelLabel);

    const vLabel = document.createElementNS(ns, "text");
    vLabel.setAttribute("x",           "40");
    vLabel.setAttribute("y",           "70");
    vLabel.setAttribute("text-anchor", "middle");
    vLabel.setAttribute("fill",        "#aaaaaa");
    vLabel.setAttribute("font-size",   "7");
    vLabel.setAttribute("font-family", "monospace");
    vLabel.textContent = "+5V REG";
    svg.appendChild(vLabel);

    const led = document.createElementNS(ns, "circle");
    led.setAttribute("cx",   "40");
    led.setAttribute("cy",   "82");
    led.setAttribute("r",    "4");
    led.setAttribute("fill", "#330000");
    this._ledEl = led;
    svg.appendChild(led);

    const vOutText = document.createElementNS(ns, "text");
    vOutText.setAttribute("x",           "40");
    vOutText.setAttribute("y",           "100");
    vOutText.setAttribute("text-anchor", "middle");
    vOutText.setAttribute("fill",        "#555555");
    vOutText.setAttribute("font-size",   "7");
    vOutText.setAttribute("font-family", "monospace");
    vOutText.textContent = "0.00V";
    this._vOutText = vOutText;
    svg.appendChild(vOutText);

    const pinXs     = [22, 40, 58];
    const pinLabels = ["IN", "GND", "OUT"];
    const pinIds    = ["IN", "GND", "OUT"];

    pinXs.forEach((x, i) => {
      const pinRect = document.createElementNS(ns, "rect");
      pinRect.setAttribute("x",      x - 3);
      pinRect.setAttribute("y",      "90");
      pinRect.setAttribute("width",  "6");
      pinRect.setAttribute("height", "30");
      pinRect.setAttribute("rx",     "1");
      pinRect.setAttribute("fill",   "#a0a0a0");
      svg.appendChild(pinRect);

      const lbl = document.createElementNS(ns, "text");
      lbl.setAttribute("x",           x);
      lbl.setAttribute("y",           "107");
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("fill",        "#888888");
      lbl.setAttribute("font-size",   "6");
      lbl.setAttribute("font-family", "monospace");
      lbl.textContent = pinLabels[i];
      svg.appendChild(lbl);
    });

    return svg;
  }

  updatePhysics({ vOut, regulating, dropout, vIn, iOut, overCurrent } = {}) {
    if (!this._ledEl || !this._vOutText) return;

    if (overCurrent) {
      this._ledEl.setAttribute("fill", "#ff6600");
    } else if (regulating) {
      this._ledEl.setAttribute("fill", "#00cc44");
    } else if (dropout) {
      this._ledEl.setAttribute("fill", "#ccaa00");
    } else {
      this._ledEl.setAttribute("fill", "#330000");
    }

    const v = typeof vOut === "number" ? vOut : 0;
    this._vOutText.setAttribute("fill", v > 0.1 ? "#88ff88" : "#555555");
    this._vOutText.textContent = v.toFixed(2) + "V";
  }

  getElement() { return this.svg; }
}