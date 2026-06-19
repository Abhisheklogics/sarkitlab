"use strict";

import CreatePins from "../src/createPins.js";

const PIN_GAP_X  = 18;
const PIN_GAP_Y  = 16;
const START_X    = 45;
const BB_WIDTH   = 600;
const BB_HEIGHT  = 310;
const PIN_SIZE   = 9;

const ROWS_TOP    = ["a","b","c","d","e"];
const ROWS_BOTTOM = ["f","g","h","i","j"];

const LAYOUT = {
  topNegRailY:  10,
  topPosRailY:  26,
  gridTopY:     55,
  get icTrenchY()   { return this.gridTopY + 5 * PIN_GAP_Y + 8; },
  get icTrenchH()   { return 28; },
  get gridBottomY() { return this.icTrenchY + this.icTrenchH + 8; },
  get botPosRailY() { return this.gridBottomY + 5 * PIN_GAP_Y + 18; },
  get botNegRailY() { return this.botPosRailY + PIN_GAP_Y; },
};

export default class Breadboard {

  constructor(compId, wireSys, pinsArray) {
    this.id            = compId;
    this.columns       = 30;
    this.wireSys       = wireSys;
    this.pinsArray     = pinsArray;
    this._cachedShorts = null;
    this.svg           = this._buildSVG();
  }

  _buildSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${BB_WIDTH} ${BB_HEIGHT}`);
    svg.setAttribute("width",   BB_WIDTH);
    svg.setAttribute("height",  BB_HEIGHT);
    svg.style.willChange = "transform";
    svg.style.contain    = "layout style paint";
    svg.style.overflow   = "visible";

    this._appendBackground(svg);
    const pinCreator = new CreatePins(svg, this.wireSys, this.pinsArray, this);
    this._buildPins(svg, pinCreator);
    return svg;
  }

  _appendBackground(svg) {
    const L    = LAYOUT;
    const endX = START_X + (this.columns - 1) * PIN_GAP_X;

    svg.innerHTML = `
      <rect width="${BB_WIDTH}" height="${BB_HEIGHT}" rx="10"
            fill="#f0f0ee" stroke="#c8c8c0" stroke-width="1.5"/>
      <rect x="5" y="5" width="${BB_WIDTH - 10}" height="${BB_HEIGHT - 10}"
            rx="8" fill="#f5f5f2"/>

      <rect x="28" y="${L.topNegRailY - 2}" width="${BB_WIDTH - 36}" height="${PIN_GAP_Y + 2}"
            rx="4" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
      <line x1="${START_X - 8}" y1="${L.topNegRailY + 4}" x2="${endX + 8}" y2="${L.topNegRailY + 4}"
            stroke="#1a56db" stroke-width="1.5" opacity="0.7"/>
      <line x1="${START_X - 8}" y1="${L.topPosRailY + 4}" x2="${endX + 8}" y2="${L.topPosRailY + 4}"
            stroke="#e02424" stroke-width="1.5" opacity="0.7"/>
      <text x="15" y="${L.topNegRailY + 8}" font-family="Arial" font-size="8" fill="#1a56db" font-weight="bold">−</text>
      <text x="15" y="${L.topPosRailY + 8}" font-family="Arial" font-size="8" fill="#e02424" font-weight="bold">+</text>

      <rect x="28" y="${L.gridTopY - 4}" width="${BB_WIDTH - 56}" height="${5 * PIN_GAP_Y + 4}"
            rx="3" fill="#ececea" stroke="#d8d8d0" stroke-width="0.5"/>

      <rect x="28" y="${L.icTrenchY}" width="${BB_WIDTH - 56}" height="${L.icTrenchH}"
            rx="3" fill="#dcdcda" stroke="#bbb" stroke-width="0.8"/>
      <text x="${BB_WIDTH / 2}" y="${L.icTrenchY + L.icTrenchH / 2 + 4}"
            font-family="Arial" font-size="7" fill="#aaa" text-anchor="middle">IC Trench</text>

      <rect x="28" y="${L.gridBottomY - 4}" width="${BB_WIDTH - 56}" height="${5 * PIN_GAP_Y + 4}"
            rx="3" fill="#ececea" stroke="#d8d8d0" stroke-width="0.5"/>

      <rect x="28" y="${L.botPosRailY - 2}" width="${BB_WIDTH - 36}" height="${PIN_GAP_Y + 2}"
            rx="4" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
      <line x1="${START_X - 8}" y1="${L.botPosRailY + 4}" x2="${endX + 8}" y2="${L.botPosRailY + 4}"
            stroke="#e02424" stroke-width="1.5" opacity="0.7"/>
      <line x1="${START_X - 8}" y1="${L.botNegRailY + 4}" x2="${endX + 8}" y2="${L.botNegRailY + 4}"
            stroke="#1a56db" stroke-width="1.5" opacity="0.7"/>
      <text x="15" y="${L.botPosRailY + 8}" font-family="Arial" font-size="8" fill="#e02424" font-weight="bold">+</text>
      <text x="15" y="${L.botNegRailY + 8}" font-family="Arial" font-size="8" fill="#1a56db" font-weight="bold">−</text>
    `;

    this._appendColumnNumbers(svg);
    this._appendRowLabels(svg);
  }

  _appendColumnNumbers(svg) {
    const L = LAYOUT;
    [5, 10, 15, 20, 25, 30].forEach(col => {
      const x    = START_X + (col - 1) * PIN_GAP_X;
      const topY = L.gridTopY - 8;
      const botY = L.gridBottomY + 5 * PIN_GAP_Y + 12;
      [topY, botY].forEach(y => {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x",           x);
        t.setAttribute("y",           y);
        t.setAttribute("font-family", "Arial");
        t.setAttribute("font-size",   "7");
        t.setAttribute("fill",        "#999");
        t.setAttribute("text-anchor", "middle");
        t.textContent = col;
        svg.appendChild(t);
      });
    });
  }

  _appendRowLabels(svg) {
    const L  = LAYOUT;
    const lx = START_X - 28;
    const rx = START_X + (this.columns - 1) * PIN_GAP_X + 16;

    ROWS_TOP.forEach((row, i) => {
      const y = L.gridTopY + i * PIN_GAP_Y + 7;
      [lx, rx].forEach(x => {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x",           x);
        t.setAttribute("y",           y);
        t.setAttribute("font-family", "Arial");
        t.setAttribute("font-size",   "9");
        t.setAttribute("fill",        "#bbb");
        t.setAttribute("text-anchor", "middle");
        t.textContent = row.toUpperCase();
        svg.appendChild(t);
      });
    });

    ROWS_BOTTOM.forEach((row, i) => {
      const y = L.gridBottomY + i * PIN_GAP_Y + 7;
      [lx, rx].forEach(x => {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x",           x);
        t.setAttribute("y",           y);
        t.setAttribute("font-family", "Arial");
        t.setAttribute("font-size",   "9");
        t.setAttribute("fill",        "#bbb");
        t.setAttribute("text-anchor", "middle");
        t.textContent = row.toUpperCase();
        svg.appendChild(t);
      });
    });
  }

  _buildPins(svg, pinCreator) {
    const L = LAYOUT;

    for (let col = 1; col <= this.columns; col++) {
      const x = START_X + (col - 1) * PIN_GAP_X;

      pinCreator.createPin(svg, x, L.topNegRailY, PIN_SIZE, PIN_SIZE, `tneg${col}`);
      pinCreator.createPin(svg, x, L.topPosRailY, PIN_SIZE, PIN_SIZE, `tpos${col}`);

      ROWS_TOP.forEach((row, rIdx) => {
        const y      = L.gridTopY + rIdx * PIN_GAP_Y;
        const holeId = `${row}${col}`;
        pinCreator.createPin(svg, x, y, PIN_SIZE, PIN_SIZE, holeId);
      });

      ROWS_BOTTOM.forEach((row, rIdx) => {
        const y      = L.gridBottomY + rIdx * PIN_GAP_Y;
        const holeId = `${row}${col}`;
        pinCreator.createPin(svg, x, y, PIN_SIZE, PIN_SIZE, holeId);
      });

      pinCreator.createPin(svg, x, L.botPosRailY, PIN_SIZE, PIN_SIZE, `bpos${col}`);
      pinCreator.createPin(svg, x, L.botNegRailY, PIN_SIZE, PIN_SIZE, `bneg${col}`);
    }
  }

  getActiveShorts() {
    if (this._cachedShorts) return this._cachedShorts;
    const shorts = [];
    const col    = this.columns;

    // ── Rail shorts ─────────────────────────────────────────────
    // Each rail is one continuous conductor: connect col N to col N-1 (chain)
    for (let i = 2; i <= col; i++) {
      shorts.push([`tneg${i - 1}`, `tneg${i}`]);
      shorts.push([`tpos${i - 1}`, `tpos${i}`]);
      shorts.push([`bpos${i - 1}`, `bpos${i}`]);
      shorts.push([`bneg${i - 1}`, `bneg${i}`]);
    }

    // ── Column group shorts ──────────────────────────────────────
    // Top half: a1-b1-c1-d1-e1 all shorted (connect adjacent rows in same column)
    // Bottom half: f1-g1-h1-i1-j1 all shorted
    for (let c = 1; c <= col; c++) {
      for (let r = 0; r < ROWS_TOP.length - 1; r++) {
        shorts.push([`${ROWS_TOP[r]}${c}`, `${ROWS_TOP[r + 1]}${c}`]);
      }
      for (let r = 0; r < ROWS_BOTTOM.length - 1; r++) {
        shorts.push([`${ROWS_BOTTOM[r]}${c}`, `${ROWS_BOTTOM[r + 1]}${c}`]);
      }
    }

    this._cachedShorts = shorts;
    return shorts;
  }

  invalidateShorts() {
    this._cachedShorts = null;
  }

  getHoleNet(row, col) {
    return `${this.id}:${row}${col}`;
  }

  getElement() { return this.svg; }
}