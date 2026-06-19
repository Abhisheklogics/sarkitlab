export default class LogicIC {
  constructor(id, model, wireSys, pinsArray) {
    this.id        = id;
    this.model     = model;
    this.wireSys   = wireSys;
    this.pinsArray = pinsArray;
    this.pins      = [];
    this.isBurned  = false;

    this.pinNames = {
      "74HC08":  ["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
      "74HC32":  ["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
      "74HC00":  ["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
      "74HC02":  ["1Y","1A","1B","2Y","2A","2B","GND","3A","3B","3Y","4A","4B","4Y","VCC"],
      "74HC86":  ["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
      "74HC266": ["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
      "74HC7266":["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
      "74HC04":  ["1A","1Y","2A","2Y","3A","3Y","GND","4Y","4A","5Y","5A","6Y","6A","VCC"],
      "74HC14":  ["1A","1Y","2A","2Y","3A","3Y","GND","4Y","4A","5Y","5A","6Y","6A","VCC"],
      "74HC153": ["~1G","S1","1I3","1I2","1I1","1I0","1Y","GND","2Y","2I0","2I1","2I2","2I3","S0","~2G","VCC"],
      "74HC148": ["I4","I5","I6","I7","EI","A2","A1","GND","A0","I0","I1","I2","I3","GS","EO","VCC"],
      "74HC83":  ["A4","S3","A3","B3","S2","B2","A2","GND","S1","A1","B1","C0","C4","S4","B4","VCC"],
      "74HC74":  ["~1CLR","1D","1CLK","~1PRE","1Q","~1Q","GND","~2Q","2Q","~2PRE","2CLK","2D","~2CLR","VCC"],
      "74HC73":  ["1CLK","~1CLR","1K","VCC","2CLK","~2CLR","2J","GND","~2Q","2Q","2K","1Q","~1Q","1J"],
      "74HC76":  ["1CLK","~1PRE","~1CLR","1J","VCC","~2CLK","~2PRE","~2CLR","2J","GND","2K","2Q","~2Q","1K","1Q","~1Q"],
      "74XNOR":  ["1A","1B","1Y","2A","2B","2Y","GND","3Y","3B","3A","4Y","4B","4A","VCC"],
    };

    this.svg = this._createSVG();
  }

  _createSVG() {
    const is16Pin     = ["74HC153","74HC148","74HC83","74HC73","74HC76"].includes(this.model);
    const pinsPerSide = is16Pin ? 8 : 7;
    const totalPins   = is16Pin ? 16 : 14;

    const PIN_GAP    = 18;
    const PIN_OFFSET = 15;
    const IC_BODY_H  = 36;
    const PIN_LEN    = 12;
    const PAD_V      = 16;
    const TOTAL_H    = IC_BODY_H + PIN_LEN * 2 + PAD_V * 2;
    const icWidth    = PIN_OFFSET * 2 + (pinsPerSide - 1) * PIN_GAP;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width",   icWidth);
    svg.setAttribute("height",  TOTAL_H);
    svg.setAttribute("viewBox", `0 0 ${icWidth} ${TOTAL_H}`);
    svg.style.overflow   = "visible";
    svg.dataset.id       = this.id;
    svg.dataset.type     = "logic-ic";
    svg.dataset.model    = this.model;

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
    this.icBody = body;
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
    label.setAttribute("font-size",   "8");
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
    this.burnOverlay = burnOverlay;
    svg.appendChild(burnOverlay);

    this.tooltip = this._createTooltip();
    svg.appendChild(this.tooltip);

    for (let i = 1; i <= pinsPerSide; i++) {
      const x = PIN_OFFSET + (i - 1) * PIN_GAP;
      this._drawPin(svg, x, bodyY + IC_BODY_H, i, "bottom", PIN_LEN, icWidth);
    }
    for (let i = totalPins; i > pinsPerSide; i--) {
      const x = PIN_OFFSET + (totalPins - i) * PIN_GAP;
      this._drawPin(svg, x, bodyY, i, "top", PIN_LEN, icWidth);
    }

    return svg;
  }

  setBurned(status) {
    if (!status) return;
    this.icBody.setAttribute("fill",   "#3a1a1a");
    this.icBody.setAttribute("filter", `url(#burnFilter_${this.id})`);
    this.burnOverlay.setAttribute("opacity", "0.7");
    this.isBurned = true;
  }

  reset() {
    this.isBurned = false;
    this.icBody.setAttribute("fill", "#222");
    this.icBody.removeAttribute("filter");
    this.burnOverlay.setAttribute("opacity", "0");
  }

  _drawPin(svg, x, bodyEdgeY, pinNum, side, pinLen, icWidth) {
    const pinW    = 7;
    const pinID   = `p${pinNum}`;
    const names   = this.pinNames[this.model];
    const pinName = names ? (names[pinNum - 1] ?? `P${pinNum}`) : `P${pinNum}`;
    const isVCC   = pinName === "VCC";
    const isGND   = pinName === "GND";
    const isActiveL = pinName.startsWith("~") || pinName.startsWith("/");

    const pinY = side === "bottom" ? bodyEdgeY : bodyEdgeY - pinLen;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x",      x - pinW / 2);
    rect.setAttribute("y",      pinY);
    rect.setAttribute("width",  pinW);
    rect.setAttribute("height", pinLen);
    rect.setAttribute("rx",     "1");
    rect.setAttribute("fill",   isVCC ? "#e07b39" : isGND ? "#555" : isActiveL ? "#7a9ecf" : "#A0A0A0");
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
    hit.setAttribute("cx",   x);
    hit.setAttribute("cy",   hitY);
    hit.setAttribute("r",    "6");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("class", "connection-point");
    hit.style.cursor    = "crosshair";
    hit.dataset.id      = pinID;
    hit.dataset.pin     = pinID;
    hit.dataset.pinNum  = pinNum;
    hit.dataset.pinName = pinName;

    hit.addEventListener("mouseenter", () => {
      hit.setAttribute("fill", "rgba(255,255,0,0.4)");
      this._showTooltip(pinName, x, hitY, side);
    });
    hit.addEventListener("mouseleave", () => {
      hit.setAttribute("fill", "transparent");
      this.tooltip.setAttribute("visibility", "hidden");
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
    const textEl = this.tooltip.querySelector("text");
    const rectEl = this.tooltip.querySelector("rect");
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
    this.tooltip.setAttribute("visibility", "visible");
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

  getElement() { return this.svg; }
}