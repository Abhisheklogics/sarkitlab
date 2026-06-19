"use strict";

export default class FourDigitSevenSegment {
  constructor() {
    this.svg = this._createSVG();
    this.svg.__instance = this;

    this.codePinsValid   = false;
    this.wiringPinsValid = false;
    this.validated       = false;

    this.codeCLK = null;
    this.codeDIO = null;
    this.wireCLK = null;
    this.wireDIO = null;

    this.clkLevel    = 1;
    this.dioLevel    = 1;
    this.lastCLK     = 1;
    this.dataLatched = false;

    this.brightness         = 7;
    this._userBrightnessSet = false;

    this.colonOn = false;

    this.colonTop    = this.svg.querySelector("#colonTop");
    this.colonBottom = this.svg.querySelector("#colonBottom");
    this.pointDot    = this.svg.querySelector("#pointDot");

    this.digits = [];
    for (let i = 0; i < 4; i++) {
      this.digits.push({
        A: this.svg.querySelector(`#d${i}A`),
        B: this.svg.querySelector(`#d${i}B`),
        C: this.svg.querySelector(`#d${i}C`),
        D: this.svg.querySelector(`#d${i}D`),
        E: this.svg.querySelector(`#d${i}E`),
        F: this.svg.querySelector(`#d${i}F`),
        G: this.svg.querySelector(`#d${i}G`),
      });
    }
  }

  clear() {
    for (let i = 0; i < 4; i++) this.clearDigit(i);
    this.setColon(false);
    this.point(false);
  }

  clearDigit(d) {
    if (!this.digits[d]) return;
    Object.values(this.digits[d]).forEach(seg => {
      if (seg) seg.setAttribute("fill", "#1a0000");
    });
  }

  setColon(state) {
    this.colonOn = !!state;
    const color = this.colonOn ? this._segColor() : "#1a0000";
    if (this.colonTop)    this.colonTop.setAttribute("fill",    color);
    if (this.colonBottom) this.colonBottom.setAttribute("fill", color);
  }

  point(state) { this.setColon(!!state); }

  showDigit(d, char) {
    this.clearDigit(d);
    const segs = SEG_MAP[String(char).toUpperCase()];
    if (!segs) return;
    const bright = this._segColor();
    segs.forEach(s => {
      if (this.digits[d]?.[s]) this.digits[d][s].setAttribute("fill", bright);
    });
  }

  setBrightness(level = 7, on = true) {
    this.brightness         = Math.min(7, Math.max(0, Math.round(level)));
    this._userBrightnessSet = true;
    if (!on) { this.svg.style.opacity = "0"; return; }
    this.svg.style.opacity = String(0.35 + this.brightness * 0.09);
  }

  displayNumber(value, leadingZeros = false, pos = 0) {
    if (value === undefined || value === null) return;

    let str    = String(value);
    let colonOn = false;

    if (str.includes(":")) {
      colonOn = true;
      str = str.replace(":", "");
    }
    this.setColon(colonOn);
    str = str.toUpperCase();

    const numDigits = 4 - (pos || 0);
    if (/^-?\d+$/.test(str.trim())) {
      str = leadingZeros
        ? str.padStart(numDigits, "0")
        : str.padStart(numDigits, " ");
    } else {
      str = str.padStart(numDigits, " ");
    }
    str = str.slice(-numDigits);

    for (let i = 0; i < 4; i++) {
      if (i < (pos || 0)) { this.clearDigit(i); continue; }
      const ch = str[i - (pos || 0)];
      if (!ch || ch === " ") this.clearDigit(i);
      else this.showDigit(i, ch);
    }
  }

  setSegments(segArray, length = 4, pos = 0) {
    if (!Array.isArray(segArray)) return;
    for (let i = 0; i < length; i++) {
      const di = i + pos;
      if (di >= 4) break;
      const byte  = segArray[i] ?? 0;
      this.clearDigit(di);
      const segs  = ["A","B","C","D","E","F","G"];
      const color = this._segColor();
      segs.forEach((s, bit) => {
        if ((byte >> bit) & 1) {
          const el = this.digits[di]?.[s];
          if (el) el.setAttribute("fill", color);
        }
      });
    }
  }

  showMinus() {
    for (let i = 0; i < 4; i++) this.clearDigit(i);
    if (this.digits[0]?.G) this.digits[0].G.setAttribute("fill", this._segColor());
  }

  setCodePins(clk, dio) {
    this.codeCLK       = Number.isInteger(clk) ? clk : null;
    this.codeDIO       = Number.isInteger(dio) ? dio : null;
    this.codePinsValid = this.codeCLK !== null && this.codeDIO !== null;
  }

  pinsMatch() {
    if (!this.codePinsValid || !this.wiringPinsValid) return false;
    return this.codeCLK === this.wireCLK && this.codeDIO === this.wireDIO;
  }

  updatePin(pinNum, level) {
    if (pinNum === this.wireCLK) {
      this.lastCLK  = this.clkLevel;
      this.clkLevel = level;
    }
    if (pinNum === this.wireDIO) {
      this.dioLevel = level;
    }
    if (this.lastCLK === 0 && this.clkLevel === 1) {
      this.dataLatched = true;
    }
  }

  _segColor() {
    const r = Math.round(180 + this.brightness * 10);
    const g = Math.round(this.brightness * 3);
    return `rgb(${Math.min(r, 255)},${g},0)`;
  }

  getElement() { return this.svg; }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");

    // --- Layout constants ---
    // Each digit: 58px wide, 90px tall
    // Gap between digits: 12px
    // Colon area: 18px between digit 1 and 2
    // Total width: 4*58 + 3*12 + 18(colon gap) + 20(padding each side) = 324
    // But we add 10px right padding so last digit not cut: 334 total
    const PAD   = 12;   // left/right outer padding
    const DW    = 58;   // digit width
    const DH    = 90;   // digit height
    const SW    = 42;   // segment width (H segs)
    const ST    = 8;    // segment thickness
    const GAP   = 10;   // gap between digits
    const COL_W = 18;   // colon zone width
    const DY    = 22;   // digit top y

    // Digit start X positions
    // d0: PAD
    // d1: PAD + DW + GAP
    // [colon zone]
    // d2: PAD + 2*(DW+GAP) + COL_W
    // d3: PAD + 3*(DW+GAP) + COL_W
    const digitX = [
      PAD,
      PAD + DW + GAP,
      PAD + 2*(DW + GAP) + COL_W,
      PAD + 3*(DW + GAP) + COL_W,
    ];

    // Total SVG width: last digit right edge + right padding
    const SVG_W = digitX[3] + DW + PAD;
    const SVG_H = 160;

    svg.setAttribute("width",   String(SVG_W));
    svg.setAttribute("height",  String(SVG_H));
    svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);
    svg.style.overflow = "visible";

    const makeSeg = (id, x, y, w, h) =>
      `<rect id="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1a0000"/>`;

    const makeDigit = (d, ox) => {
      // Horizontal segments: x = ox + (DW-SW)/2, full SW wide
      const xs  = ox + (DW - SW) / 2;
      // Vertical segment x positions
      const xL  = ox;              // left vertical segs
      const xR  = ox + DW - ST;    // right vertical segs
      // Vertical segment heights
      const vH  = (DH - 3 * ST) / 2 - 2;
      // Y positions
      const yA  = DY;                       // top H seg
      const yF  = DY + ST + 2;              // left-top V seg start
      const yB  = DY + ST + 2;              // right-top V seg start
      const yG  = DY + ST + 2 + vH + 2;    // mid H seg
      const yE  = yG + ST + 2;              // left-bot V seg start
      const yC  = yG + ST + 2;              // right-bot V seg start
      const yD  = DY + DH - ST;             // bot H seg

      return `
        ${makeSeg(`d${d}A`, xs,  yA, SW, ST)}
        ${makeSeg(`d${d}B`, xR,  yB, ST, vH)}
        ${makeSeg(`d${d}C`, xR,  yC, ST, vH)}
        ${makeSeg(`d${d}D`, xs,  yD, SW, ST)}
        ${makeSeg(`d${d}E`, xL,  yE, ST, vH)}
        ${makeSeg(`d${d}F`, xL,  yF, ST, vH)}
        ${makeSeg(`d${d}G`, xs,  yG, SW, ST)}
      `;
    };

    // Colon X center: between d1 right edge and d2 left edge
    const colonX = digitX[1] + DW + GAP / 2 + COL_W / 2;
    const colonY1 = DY + DH * 0.33;
    const colonY2 = DY + DH * 0.67;

    // Decimal point: right of last digit, vertically at bottom
    const dotX = digitX[3] + DW + 4;
    const dotY = DY + DH - ST / 2;

    svg.innerHTML = `
      <!-- PCB shadow -->
      <rect x="3" y="3" width="${SVG_W-2}" height="${SVG_H-2}" rx="8" fill="#000" opacity="0.45"/>
      <!-- PCB body -->
      <rect x="0" y="0" width="${SVG_W}" height="${SVG_H}" rx="8" fill="#0d0d0d"/>
      <rect x="0" y="0" width="${SVG_W}" height="4" rx="3" fill="#1a1a1a"/>

      <!-- Display housing -->
      <rect x="${PAD-4}" y="12" width="${SVG_W - 2*(PAD-4)}" height="108"
            rx="5" fill="#080808" stroke="#222" stroke-width="1"/>
      <rect x="${PAD-2}" y="14" width="${SVG_W - 2*(PAD-2)}" height="104"
            rx="4" fill="#0a0000"/>
      <!-- Glass glare -->
      <rect x="${PAD}" y="15" width="100" height="2" rx="1" fill="white" opacity="0.03"/>

      <!-- 4 digits -->
      ${digitX.map((ox, i) => makeDigit(i, ox)).join("")}

      <!-- Colon dots -->
      <circle id="colonTop"    cx="${colonX}" cy="${colonY1}" r="5" fill="#1a0000"/>
      <circle id="colonBottom" cx="${colonX}" cy="${colonY2}" r="5" fill="#1a0000"/>

      <!-- Decimal point after last digit -->
      <circle id="pointDot" cx="${dotX}" cy="${dotY}" r="4" fill="#1a0000"/>

      <!-- TM1637 IC -->
      <rect x="${SVG_W/2 - 22}" y="122" width="44" height="22"
            rx="2" fill="#151515" stroke="#2a2a2a" stroke-width="0.5"/>
      <circle cx="${SVG_W/2 - 19}" cy="125" r="1.5" fill="#1e1e1e"/>
      <text x="${SVG_W/2}" y="131" font-size="5" fill="#4a4a4a"
            font-family="monospace" text-anchor="middle">TM1637</text>
      <text x="${SVG_W/2}" y="137" font-size="4" fill="#3a3a3a"
            font-family="monospace" text-anchor="middle">TITAN MICRO</text>

      <!-- 100nF cap -->
      <rect x="${SVG_W/2 + 28}" y="122" width="16" height="8"
            rx="1.5" fill="#d4a017" stroke="#b8860b" stroke-width="0.5"/>
      <text x="${SVG_W/2 + 36}" y="134" font-size="4" fill="#5a5a5a"
            font-family="monospace" text-anchor="middle">104</text>

      <!-- Pin header: CLK DIO VCC GND -->
      <rect x="${SVG_W/2 - 44}" y="119" width="88" height="18"
            rx="2" fill="#1a1a1a" stroke="#333" stroke-width="0.5"/>
      ${["CLK","DIO","VCC","GND"].map((lbl,i) => `
        <rect x="${SVG_W/2 - 41 + i*20}" y="121" width="12" height="12"
              rx="1" fill="#0d0d0d" stroke="#444" stroke-width="0.5"/>
        <rect x="${SVG_W/2 - 38 + i*20}" y="124" width="6" height="6"
              rx="0.5" fill="#080808" stroke="#555" stroke-width="0.3"/>
        <text x="${SVG_W/2 - 35 + i*20}" y="118" font-size="5.5" fill="#9e9e9e"
              font-family="monospace" text-anchor="middle">${lbl}</text>
      `).join("")}
      ${[0,1,2,3].map(i => `
        <rect x="${SVG_W/2 - 37 + i*20}" y="137" width="3" height="18"
              rx="1" fill="#bdbdbd"/>
      `).join("")}

      <!-- Silkscreen label -->
      <text x="${SVG_W/2}" y="152" font-size="6.5" fill="#3a3a3a"
            font-family="monospace" text-anchor="middle">TM1637 4-DIGIT LED</text>
    `;

    return svg;
  }
}

const SEG_MAP = {
  "0":["A","B","C","D","E","F"],
  "1":["B","C"],
  "2":["A","B","D","E","G"],
  "3":["A","B","C","D","G"],
  "4":["B","C","F","G"],
  "5":["A","C","D","F","G"],
  "6":["A","C","D","E","F","G"],
  "7":["A","B","C"],
  "8":["A","B","C","D","E","F","G"],
  "9":["A","B","C","D","F","G"],
  "A":["A","B","C","E","F","G"],
  "B":["C","D","E","F","G"],
  "C":["A","D","E","F"],
  "D":["B","C","D","E","G"],
  "E":["A","D","E","F","G"],
  "F":["A","E","F","G"],
  "H":["B","C","E","F","G"],
  "I":["B","C"],
  "J":["B","C","D","E"],
  "L":["D","E","F"],
  "N":["A","B","C","E","F"],
  "O":["A","B","C","D","E","F"],
  "P":["A","B","E","F","G"],
  "R":["A","E","F"],
  "S":["A","C","D","F","G"],
  "T":["D","E","F","G"],
  "U":["B","C","D","E","F"],
  "Y":["B","C","D","F","G"],
  "-":["G"],
  "_":["D"],
  " ":[],
};