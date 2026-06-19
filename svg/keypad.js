"use strict";

// ─────────────────────────────────────────────────────────────
//  KeypadVirtual  —  4×4 matrix keypad simulation
// ─────────────────────────────────────────────────────────────
export default class KeypadVirtual {

  // ── Manifest (ComponentLoader padh ke auto-register karta hai) ──
  static manifest = {
    id:         "keypad",
    label:      "Keypad 4×4",
    group:      "Sensors & Input",
    imageSrc:   "images/keypad.jpg",   // sidebar card image
    width:      220,
    height:     310,
    cssClasses: ["keypad"],
    physics:    { conductive: false, requiresClosedLoop: false },

    // Pin positions — ribbon connector ke bottom pe
    pins: [
      { id: "R1", x: 28,  y: 298 },
      { id: "R2", x: 52,  y: 298 },
      { id: "R3", x: 76,  y: 298 },
      { id: "R4", x: 100, y: 298 },
      { id: "C1", x: 124, y: 298 },
      { id: "C2", x: 148, y: 298 },
      { id: "C3", x: 172, y: 298 },
      { id: "C4", x: 196, y: 298 },
    ],

    // Instance factory
    factory: (ctx) => new KeypadVirtual(
      4, 4, null, [], [],
      ctx.digitalInputs  ?? {},
      ctx.digitalOutputs ?? {}
    ),
  };

  // ── Constructor ──────────────────────────────────────────────
  constructor(
    rows = 4, cols = 4, layout = null,
    rowPins = [], colPins = [],
    digitalInputs = {}, digitalOutputs = {}
  ) {
    this.rows           = rows;
    this.cols           = cols;
    this.digitalInputs  = digitalInputs;
    this.digitalOutputs = digitalOutputs;
    this.codeParsed     = false;

  this.layout = (Array.isArray(layout) && layout.length > 0) ? layout : [
      ['1','2','3','A'],
      ['4','5','6','B'],
      ['7','8','9','C'],
      ['*','0','#','D'],
    ];

    this.rowPins    = rowPins;
    this.colPins    = colPins;
    this.pressedKey = null;
    this._registryId = null;

    this._svg = this._createSVG();
    this._svg.__instance = this;
  }

  // ── Public API ────────────────────────────────────────────────

  bindPins(rowPins, colPins) {
    this.rowPins = rowPins;
    this.colPins = colPins;
  }

  digitalRead(pin) {
    return this.digitalInputs[pin] ?? 1;
  }

getKey() {
  if (!this.codeParsed) return null;
  const key = this.pressedKey;
  if (key !== null && key === this._lastReturnedKey) return null;
  this._lastReturnedKey = key;
  return key;
}

  reset() {
     this.pressedKey       = null;
    this._lastReturnedKey = null;
    this.codeParsed       = false;
    // Release all button visuals
    this._svg.querySelectorAll(".kp-key").forEach(r => {
      r.setAttribute("opacity", "1");
    });
  }

  getElement() { return this._svg; }

  // ── Private ───────────────────────────────────────────────────

  pressKey(row, col, rectEl) {
    this.pressedKey = this.layout[row][col];
    rectEl.setAttribute("opacity", "0.55");
    rectEl.setAttribute("filter", "url(#kpPressGlow)");

    if (this.rowPins.length && this.colPins.length) {
      const rPin = this.rowPins[row];
      const cPin = this.colPins[col];
      if (rPin != null) this.digitalOutputs[rPin] = 0;
      if (cPin != null) this.digitalInputs[cPin]  = 0;
    }
  }

  releaseKey(row, col, rectEl) {
     rectEl.setAttribute("opacity", "1");
    rectEl.removeAttribute("filter");
    this.pressedKey       = null;
    this._lastReturnedKey = null;

    if (this.rowPins.length && this.colPins.length) {
      const rPin = this.rowPins[row];
      const cPin = this.colPins[col];
      if (rPin != null) this.digitalOutputs[rPin] = 1;
      if (cPin != null) this.digitalInputs[cPin]  = 1;
    }
  }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "220");
    svg.setAttribute("height",  "310");
    svg.setAttribute("viewBox", "0 0 220 310");

    // ── defs ──────────────────────────────────────────────────
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = `
      <linearGradient id="kpBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#2a2a2a"/>
        <stop offset="100%" stop-color="#111111"/>
      </linearGradient>
      <linearGradient id="kpBtnBlue" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#3a7bd5"/>
        <stop offset="100%" stop-color="#1a4a9a"/>
      </linearGradient>
      <linearGradient id="kpBtnRed" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#e74c3c"/>
        <stop offset="100%" stop-color="#922b21"/>
      </linearGradient>
      <filter id="kpPressGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
      <filter id="kpBodyShadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="4"
                      flood-color="#000" flood-opacity="0.6"/>
      </filter>
    `;
    svg.appendChild(defs);

    // ── PCB body ──────────────────────────────────────────────
    const body = document.createElementNS(NS, "rect");
    body.setAttribute("x",      "4");
    body.setAttribute("y",      "4");
    body.setAttribute("width",  "212");
    body.setAttribute("height", "240");
    body.setAttribute("rx",     "10");
    body.setAttribute("fill",   "url(#kpBodyGrad)");
    body.setAttribute("stroke", "#444");
    body.setAttribute("stroke-width", "2");
    body.setAttribute("filter", "url(#kpBodyShadow)");
    svg.appendChild(body);

    // ── Model label ───────────────────────────────────────────
    const lbl = document.createElementNS(NS, "text");
    lbl.setAttribute("x",           "110");
    lbl.setAttribute("y",           "20");
    lbl.setAttribute("text-anchor", "middle");
    lbl.setAttribute("font-size",   "9");
    lbl.setAttribute("fill",        "#666");
    lbl.setAttribute("font-family", "monospace");
    lbl.setAttribute("letter-spacing", "1");
    lbl.textContent = "4×4 MATRIX KEYPAD";
    svg.appendChild(lbl);

    // ── Keys ──────────────────────────────────────────────────
    const BTN_SIZE = 42;
    const GAP      = 6;
    const START_X  = 10;
    const START_Y  = 28;

  
    const blueKeys = new Set(['1','2','3','4','5','6','7','8','9','0']);
 
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const key = this.layout[r][c];
        const bx  = START_X + c * (BTN_SIZE + GAP);
        const by  = START_Y + r * (BTN_SIZE + GAP);
 
        // Button shadow
        const shadow = document.createElementNS(NS, "rect");
        shadow.setAttribute("x",      bx + 2);
        shadow.setAttribute("y",      by + 4);
        shadow.setAttribute("width",  BTN_SIZE);
        shadow.setAttribute("height", BTN_SIZE);
        shadow.setAttribute("rx",     "7");
        shadow.setAttribute("fill",   "rgba(0,0,0,0.4)");
        svg.appendChild(shadow);
 
        // Button face
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x",      bx);
        rect.setAttribute("y",      by);
        rect.setAttribute("width",  BTN_SIZE);
        rect.setAttribute("height", BTN_SIZE);
        rect.setAttribute("rx",     "7");
        rect.setAttribute("fill",   blueKeys.has(key) ? "url(#kpBtnBlue)" : "url(#kpBtnRed)");
        rect.setAttribute("stroke", "rgba(255,255,255,0.15)");
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("class",  "kp-key");
        rect.style.cursor = "pointer";
 
        // FIX: sirf ek set of listeners — pehle wale duplicate listeners hata diye
        rect._pressed = false;
 
        rect.addEventListener("mousedown", e => {
          e.stopPropagation();
          if (rect._pressed) return;
          rect._pressed = true;
          this.pressKey(r, c, rect);
        });
 
        rect.addEventListener("mouseup", () => {
          if (!rect._pressed) return;
          rect._pressed = false;
          this.releaseKey(r, c, rect);
        });
 
        rect.addEventListener("mouseleave", () => {
          if (!rect._pressed) return;
          rect._pressed = false;
          this.releaseKey(r, c, rect);
        });
 
        svg.appendChild(rect);
 
        // Key label
        const txt = document.createElementNS(NS, "text");
        txt.setAttribute("x",              bx + BTN_SIZE / 2);
        txt.setAttribute("y",              by + BTN_SIZE / 2 + 6);
        txt.setAttribute("text-anchor",    "middle");
        txt.setAttribute("fill",           "white");
        txt.setAttribute("font-size",      "18");
        txt.setAttribute("font-weight",    "bold");
        txt.setAttribute("font-family",    "'Segoe UI', Arial, sans-serif");
        txt.setAttribute("pointer-events", "none");
        txt.textContent = key;
        svg.appendChild(txt);
      }
    }
 

    // ── Ribbon cable ─────────────────────────────────────────
    const RIBBON_Y  = 248;
    const W_WIDTH   = 18;
    const W_GAP     = 2;
    const W_HEIGHT  = 44;
    const COLORS    = ["#c8b89a","#b8a88a","#d8c8aa","#a89878","#c8b89a","#b8a88a","#d8c8aa","#a89878"];

    for (let i = 0; i < 8; i++) {
      const wx = 22 + i * (W_WIDTH + W_GAP);
      const wire = document.createElementNS(NS, "rect");
      wire.setAttribute("x",      wx);
      wire.setAttribute("y",      RIBBON_Y);
      wire.setAttribute("width",  W_WIDTH);
      wire.setAttribute("height", W_HEIGHT);
      wire.setAttribute("fill",   COLORS[i]);
      wire.setAttribute("stroke", "#6a5a4a");
      wire.setAttribute("stroke-width", "0.5");
      svg.appendChild(wire);
    }

    // Connector block
    const conn = document.createElementNS(NS, "rect");
    conn.setAttribute("x",      "20");
    conn.setAttribute("y",      RIBBON_Y + W_HEIGHT);
    conn.setAttribute("width",  8 * (W_WIDTH + W_GAP) + 2);
    conn.setAttribute("height", "18");
    conn.setAttribute("rx",     "3");
    conn.setAttribute("fill",   "#1a1a1a");
    conn.setAttribute("stroke", "#555");
    conn.setAttribute("stroke-width", "1");
    svg.appendChild(conn);

    // Pin labels
    const PIN_LABELS = ["R1","R2","R3","R4","C1","C2","C3","C4"];
    for (let i = 0; i < 8; i++) {
      const lx = 22 + i * (W_WIDTH + W_GAP) + W_WIDTH / 2;
      const pl = document.createElementNS(NS, "text");
      pl.setAttribute("x",           lx);
      pl.setAttribute("y",           RIBBON_Y + W_HEIGHT + 13);
      pl.setAttribute("font-size",   "7");
      pl.setAttribute("fill",        "#aaa");
      pl.setAttribute("text-anchor", "middle");
      pl.setAttribute("font-family", "monospace");
      pl.textContent = PIN_LABELS[i];
      svg.appendChild(pl);
    }

    return svg;
  }
}