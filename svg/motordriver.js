export default class MotorDriverIC {
  constructor(id, model, wireSys, pinsArray) {
    this.id        = id;
    this.model     = model;
    this.wireSys   = wireSys;
    this.pinsArray = pinsArray;
    this.pins      = [];
    this.isBurned  = false;

    this.pinNames = {
      "L293D": [
        "1,2EN",
        "1A",
        "1Y",
        "GND",
        "GND",
        "2Y",
        "2A",
        "VCC2",
        "3,4EN",
        "3A",
        "3Y",
        "GND",
        "GND",
        "4Y",
        "4A",
        "VCC1",
      ],
    };

    this.svg = this._createSVG();
  }

  _createSVG() {
    const pinsPerSide = 8;
    const totalPins   = 16;
    const PIN_GAP     = 18;
    const PIN_OFFSET  = 15;
    const IC_BODY_H   = 36;
    const PIN_LEN     = 12;
    const PAD_V       = 16;
    const TOTAL_H     = IC_BODY_H + PIN_LEN * 2 + PAD_V * 2;
    const icWidth     = PIN_OFFSET * 2 + (pinsPerSide - 1) * PIN_GAP;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   icWidth);
    svg.setAttribute("height",  TOTAL_H);
    svg.setAttribute("viewBox", `0 0 ${icWidth} ${TOTAL_H}`);
    svg.style.overflow  = "visible";
    svg.dataset.id      = this.id;
    svg.dataset.type    = "motor-driver-ic";
    svg.dataset.model   = this.model;

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <filter id="burnFilter_${this.id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="3" result="noise"/>
        <feColorMatrix in="noise" type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0" result="darkNoise"/>
        <feComposite operator="in" in="darkNoise" in2="SourceGraphic"/>
        <feBlend mode="multiply" in2="SourceGraphic"/>
      </filter>
      <radialGradient id="heatGrad_${this.id}" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stop-color="#ff0000"/>
        <stop offset="100%" stop-color="#ff8800" stop-opacity="0"/>
      </radialGradient>
    `;
    svg.appendChild(defs);

    const bodyY = PIN_LEN + PAD_V;

    const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    body.setAttribute("x",      "0");
    body.setAttribute("y",      bodyY);
    body.setAttribute("width",  icWidth);
    body.setAttribute("height", IC_BODY_H);
    body.setAttribute("rx",     "3");
    body.setAttribute("fill",   "#222");
    this._icBody = body;
    svg.appendChild(body);

    const notch = document.createElementNS("http://www.w3.org/2000/svg", "path");
    notch.setAttribute("d",
      `M 0 ${bodyY + IC_BODY_H/2 - 6} A 6 6 0 0 1 0 ${bodyY + IC_BODY_H/2 + 6}`);
    notch.setAttribute("fill", "#111");
    svg.appendChild(notch);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x",           icWidth / 2);
    label.setAttribute("y",           bodyY + IC_BODY_H / 2 + 4);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill",        "#9acd32");
    label.setAttribute("font-family", "Arial");
    label.setAttribute("font-size",   "9");
    label.setAttribute("font-weight", "bold");
    label.textContent = this.model;
    svg.appendChild(label);

    const burnOverlay = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    burnOverlay.setAttribute("x",       "0");
    burnOverlay.setAttribute("y",       bodyY);
    burnOverlay.setAttribute("width",   icWidth);
    burnOverlay.setAttribute("height",  IC_BODY_H);
    burnOverlay.setAttribute("rx",      "3");
    burnOverlay.setAttribute("fill",    `url(#heatGrad_${this.id})`);
    burnOverlay.setAttribute("opacity", "0");
    burnOverlay.setAttribute("pointer-events", "none");
    this._burnOverlay = burnOverlay;
    svg.appendChild(burnOverlay);

    this._tooltip = this._createTooltip();
    svg.appendChild(this._tooltip);

    for (let i = 1; i <= pinsPerSide; i++) {
      const x = PIN_OFFSET + (i - 1) * PIN_GAP;
      this._drawPin(svg, x, bodyY + IC_BODY_H, i, "bottom", PIN_LEN);
    }
    for (let i = totalPins; i > pinsPerSide; i--) {
      const x = PIN_OFFSET + (totalPins - i) * PIN_GAP;
      this._drawPin(svg, x, bodyY, i, "top", PIN_LEN);
    }

    return svg;
  }

  _drawPin(svg, x, bodyEdgeY, pinNum, side, pinLen) {
    const pinW    = 7;
    const pinID   = `p${pinNum}`;
    const names   = this.pinNames[this.model];
    const pinName = names ? (names[pinNum - 1] ?? `P${pinNum}`) : `P${pinNum}`;

    const isVCC  = pinName.startsWith("VCC");
    const isGND  = pinName === "GND";
    const isEN   = pinName.includes("EN");
    const isOut  = pinName.endsWith("Y");

    const pinColor = isVCC ? "#e07b39"
                   : isGND ? "#555"
                   : isEN  ? "#7a9ecf"
                   : isOut ? "#9acd32"
                   : "#A0A0A0";

    const pinY = side === "bottom" ? bodyEdgeY : bodyEdgeY - pinLen;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x",      x - pinW / 2);
    rect.setAttribute("y",      pinY);
    rect.setAttribute("width",  pinW);
    rect.setAttribute("height", pinLen);
    rect.setAttribute("rx",     "1");
    rect.setAttribute("fill",   pinColor);
    svg.appendChild(rect);

    const numLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    numLabel.setAttribute("x",           x);
    numLabel.setAttribute("y",           side === "bottom" ? bodyEdgeY - 2 : bodyEdgeY + pinLen + 2);
    numLabel.setAttribute("text-anchor", "middle");
    numLabel.setAttribute("fill",        "#666");
    numLabel.setAttribute("font-family", "Arial");
    numLabel.setAttribute("font-size",   "6");
    numLabel.setAttribute("dominant-baseline", side === "bottom" ? "auto" : "hanging");
    numLabel.textContent = pinNum;
    svg.appendChild(numLabel);

    const hitY = side === "bottom" ? bodyEdgeY + pinLen : bodyEdgeY - pinLen;
    const hit  = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("cx",    x);
    hit.setAttribute("cy",    hitY);
    hit.setAttribute("r",     "6");
    hit.setAttribute("fill",  "transparent");
    hit.setAttribute("class", "connection-point");
    hit.style.cursor   = "crosshair";
    hit.dataset.id     = pinID;
    hit.dataset.pin    = pinID;
    hit.dataset.pinNum = pinNum;
    hit.dataset.pinName = pinName;

    hit.addEventListener("mouseenter", () => {
      hit.setAttribute("fill", "rgba(255,255,0,0.4)");
      this._showTooltip(pinName, x, hitY, side);
    });
    hit.addEventListener("mouseleave", () => {
      hit.setAttribute("fill", "transparent");
      this._tooltip.setAttribute("visibility", "hidden");
    });
    hit.addEventListener("mousedown", e => {
      e.stopPropagation();
      this.wireSys.startWire(e, hit);
    });

    svg.appendChild(hit);
    this.pins.push({ id: pinID, element: hit, pinNum, pinName });
    this.pinsArray.push({
      pinId:             `${this.id}:${pinID}`,
      element:           hit,
      componentInstance: this,
    });

    return hit;
  }

  _showTooltip(text, x, hitY, side) {
    const textEl = this._tooltip.querySelector("text");
    const rectEl = this._tooltip.querySelector("rect");
    textEl.textContent = text;

    let bbox;
    try { bbox = textEl.getBBox(); }
    catch(e) { bbox = { width: text.length * 7, height: 12 }; }

    const padH = 10, padV = 6;
    const tw   = bbox.width + padH;
    const th   = bbox.height + padV;

    rectEl.setAttribute("width",  tw);
    rectEl.setAttribute("height", th);
    rectEl.setAttribute("x",      x - tw / 2);

    if (side === "top") {
      rectEl.setAttribute("y", hitY - th - 4);
      textEl.setAttribute("y", hitY - 4 - th / 2 + bbox.height / 2);
    } else {
      rectEl.setAttribute("y", hitY + 6);
      textEl.setAttribute("y", hitY + 6 + bbox.height);
    }
    textEl.setAttribute("x", x);
    this._tooltip.setAttribute("visibility", "visible");
  }

  _createTooltip() {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("visibility", "hidden");
    g.style.pointerEvents = "none";

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("fill",    "#1a1a2e");
    rect.setAttribute("rx",      "3");
    rect.setAttribute("opacity", "0.95");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("fill",        "#9acd32");
    text.setAttribute("font-size",   "10");
    text.setAttribute("font-family", "Arial");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-weight", "bold");

    g.appendChild(rect);
    g.appendChild(text);
    return g;
  }

  setBurned(status) {
    if (!status) return;
    this._icBody.setAttribute("fill",   "#3a1a1a");
    this._icBody.setAttribute("filter", `url(#burnFilter_${this.id})`);
    this._burnOverlay.setAttribute("opacity", "0.7");
    this.isBurned = true;
  }

  reset() {
    this.isBurned = false;
    this._icBody.setAttribute("fill", "#222");
    this._icBody.removeAttribute("filter");
    this._burnOverlay.setAttribute("opacity", "0");
  }

  updateBridge(key, state) {
    // Visual feedback future ke liye — abhi no-op
  }

  getElement() { return this.svg; }
}