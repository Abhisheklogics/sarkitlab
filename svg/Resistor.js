"use strict";

function parseResistance(val) {
  if (typeof val === "number") return val;
  const s = String(val).toLowerCase().replace(/[ωΩ\s]/g, "").trim();
  if (s.includes("meg")) return parseFloat(s) * 1_000_000;
  if (s.includes("k"))   return parseFloat(s) * 1_000;
  if (s.includes("m"))   return parseFloat(s) * 1_000_000;
  return Number(s) || 1000;
}

function formatResistance(ohms) {
  if (ohms >= 1_000_000) return `${+(ohms / 1_000_000).toPrecision(3)}MΩ`;
  if (ohms >= 1_000)     return `${+(ohms / 1_000).toPrecision(3)}kΩ`;
  return `${+ohms.toPrecision(3)}Ω`;
}

function digitToColor(d) {
  return ["#000","#8B4513","#FF0000","#FFA500","#FFFF00",
          "#008000","#0000FF","#EE82EE","#808080","#FFFFFF"][d] ?? "#000";
}

function multiplierToColor(m) {
  // m = number of trailing zeros (power of 10)
  // 0→black, 1→brown, 2→red, 3→orange, 4→yellow, 5→green, 6→blue
  return ["#000","#8B4513","#FF0000","#FFA500","#FFFF00",
          "#008000","#0000FF","#EE82EE","#808080","#FFFFFF"][m] ?? "#FFD700";
}

export default class Resistor {
  constructor(
    value        = "1kΩ",
    pins         = {},
    instanceName = null,
    registryId   = null,
    openResistorEditor
  ) {
    this.value = value;
    this.ohms  = parseResistance(value);

    this.pinA = pins.a ?? null;
    this.pinB = pins.b ?? null;

    this.instanceName      = instanceName ?? null;
    this.openResistorEditor = openResistorEditor;

    this.svg          = this.createSVG();
    this.svg.__instance = this;

    if (registryId) this._registryId = registryId;

    this.lookup = {
      band1: this.svg.querySelector("#rsBand1"),
      band2: this.svg.querySelector("#rsBand2"),
      band3: this.svg.querySelector("#rsBand3"),
      label: this.svg.querySelector("#rsLabel"),
    };

    this.svg.addEventListener("dblclick", () => {
      this.openResistorEditor?.(this);
    });

    this.updateColorBands(this.ohms);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setOhms(ohms) {
    // ohms can be number OR string ("10kΩ", "4.7k", etc.)
    // Always go through parseResistance so value is always correct
    this.ohms  = parseResistance(ohms);
    this.value = formatResistance(this.ohms);
    if (this.lookup.label) this.lookup.label.textContent = this.value;
    this.updateColorBands(this.ohms);
  }

  setValue(val) {
    // alias — some callers use setValue(string)
    this.setOhms(val);
  }

  // ── Color bands ───────────────────────────────────────────────────────────

  updateColorBands(R) {
    if (!R || R <= 0) return;

    // Convert to 2-significant-digit + multiplier form
    // e.g. 10000 → d1=1, d2=0, mult=3 (orange)
    //      470   → d1=4, d2=7, mult=1 (brown)
    //      100000000 → d1=1, d2=0, mult=6 (blue) — 100MΩ
    const exp  = Math.floor(Math.log10(R));
    const mult = Math.max(0, exp - 1);
    const sig  = Math.round(R / Math.pow(10, mult));
    const d1   = Math.floor(sig / 10) % 10;
    const d2   = sig % 10;

    if (this.lookup.band1) this.lookup.band1.setAttribute("fill", digitToColor(d1));
    if (this.lookup.band2) this.lookup.band2.setAttribute("fill", digitToColor(d2));
    if (this.lookup.band3) this.lookup.band3.setAttribute("fill", multiplierToColor(mult));
  }

  // ── SVG ───────────────────────────────────────────────────────────────────

  createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "80");
    svg.setAttribute("height",  "100");
    svg.setAttribute("viewBox", "0 0 80 180");

    svg.innerHTML = `
      <rect id="rsLegL" x="36" y="0"   width="6" height="55"  fill="#bbb"/>
      <rect id="rsLegR" x="36" y="125" width="6" height="55"  fill="#bbb"/>
      <rect id="rsBody" x="20" y="55"  width="40" height="70" rx="10"
            fill="#d7b48c" stroke="#bfa17a" stroke-width="3"/>
      <rect id="rsBand1" x="20" y="68"  width="40" height="10"/>
      <rect id="rsBand2" x="20" y="85"  width="40" height="10"/>
      <rect id="rsBand3" x="20" y="102" width="40" height="10"/>
      <text id="rsLabel" x="40" y="150"
            text-anchor="middle" font-size="14">${this.value}</text>
    `;
    return svg;
  }

  getElement() { return this.svg; }
}