"use strict";

// ─────────────────────────────────────────────────────────────────────────────
//  VirtualNPNTransistor — SVG UI component
//  Fixes vs previous version:
//   [8]  setValues() now accepts all 10 fields from NPNTransistorModel
//   [9]  "reverse" region handled in all color/label maps
//   [10] thermalRunaway shows red warning banner
//   [11] SVG enlarged to 180×310 to fit all metrics
//   [12] Info panel expanded — 7 metric rows + state + warning
// ─────────────────────────────────────────────────────────────────────────────

export default class VirtualNPNTransistor {
  constructor(pins = {}) {
    this.beta  = 100;
    this._state = "cutoff";

    // stored values
    this._vbe  = 0; this._vce  = 0; this._vbc = 0;
    this._ib   = 0; this._ic   = 0; this._ie  = 0;
    this._hfe  = 0; this._pdiss = 0; this._temp = 26.85;
    this._thermalRunaway = false;

    // DOM refs
    this._bodyEl    = null;
    this._ledEl     = null;
    this._stateEl   = null;
    this._beLineEl  = null;
    this._warnEl    = null;
    this._warnBgEl  = null;

    // metric text refs  [label, value]
    this._rows = {};

    this.svg = this._createSVG();
    this.svg.__instance = this;
  }

  // ── Called by NPNTransistorModel.update() ──────────────────────────────────

  setState(state) {
    if (this._state === state) return;
    this._state = state;
    this._render();
  }

  // FIX [8]: accept all fields model sends
  setValues({
    vbe = 0, vce = 0, vbc = 0,
    ib  = 0, ic  = 0, ie  = 0,
    hfe = 0, pdiss = 0, temp_c = 26.85,
    region, thermalRunaway = false,
  } = {}) {
    this._vbe  = vbe;  this._vce  = vce;  this._vbc  = vbc;
    this._ib   = ib;   this._ic   = ic;   this._ie   = ie;
    this._hfe  = hfe;  this._pdiss = pdiss; this._temp = temp_c;
    this._thermalRunaway = thermalRunaway;
    if (region) this._state = region;
    this._render();
  }

  getElement() { return this.svg; }

  // ── Render ─────────────────────────────────────────────────────────────────

  _render() {
    const s = this._state;

    // FIX [9]: "reverse" added to all maps
    const BODY_COLOR = {
      cutoff:     "#1e2229",
      active:     "#92400e",
      saturation: "#14532d",
      reverse:    "#1e1a2e",
    };
    const LED_COLOR = {
      cutoff:     "#374151",
      active:     "#f59e0b",
      saturation: "#22c55e",
      reverse:    "#818cf8",
    };
    const STATE_LABEL = {
      cutoff:     "CUT-OFF",
      active:     "ACTIVE",
      saturation: "SATURATION",
      reverse:    "REVERSE",
    };
    const STATE_COLOR = {
      cutoff:     "#6b7280",
      active:     "#fbbf24",
      saturation: "#4ade80",
      reverse:    "#818cf8",
    };

    this._bodyEl?.setAttribute("fill",  BODY_COLOR[s]  ?? "#1e2229");
    this._ledEl?.setAttribute("fill",   LED_COLOR[s]   ?? "#374151");

    if (this._stateEl) {
      this._stateEl.textContent = STATE_LABEL[s] ?? s.toUpperCase();
      this._stateEl.setAttribute("fill", STATE_COLOR[s] ?? "#6b7280");
    }

    // BE junction line color
    const beColor = (s === "off" || s === "cutoff") ? "#374151" : "#f59e0b";
    this._beLineEl?.setAttribute("stroke", beColor);

    // ── Metric rows ──────────────────────────────────────────────────────────
    const fmt = (v, digits = 3) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return "—";
      const abs = Math.abs(n);
      if (abs === 0)       return "0";
      if (abs >= 1)        return n.toFixed(digits > 2 ? 2 : digits);
      if (abs >= 1e-3)     return (n * 1e3).toFixed(2) + "m";
      if (abs >= 1e-6)     return (n * 1e6).toFixed(2) + "µ";
      if (abs >= 1e-9)     return (n * 1e9).toFixed(2) + "n";
      return n.toExponential(2);
    };

    const setRow = (key, val) => {
      if (this._rows[key]) this._rows[key].textContent = val;
    };

    setRow("vbe",   `VBE   ${this._vbe.toFixed(3)} V`);
    setRow("vce",   `VCE   ${this._vce.toFixed(3)} V`);
    setRow("vbc",   `VBC   ${this._vbc.toFixed(3)} V`);
    setRow("ib",    `IB    ${fmt(this._ib)}A`);
    setRow("ic",    `IC    ${fmt(this._ic)}A`);
    setRow("ie",    `IE    ${fmt(this._ie)}A`);
    setRow("hfe",   `hFE   ${Number.isFinite(this._hfe) ? this._hfe.toFixed(0) : "—"}`);
    setRow("pdiss", `Pdiss ${(this._pdiss * 1000).toFixed(1)} mW`);
    setRow("temp",  `Tj    ${this._temp.toFixed(1)} °C`);

    // FIX [10]: thermal runaway warning
    if (this._warnBgEl && this._warnEl) {
      const show = this._thermalRunaway;
      this._warnBgEl.setAttribute("visibility", show ? "visible" : "hidden");
      this._warnEl.setAttribute("visibility",   show ? "visible" : "hidden");
    }
  }

  // ── SVG construction ───────────────────────────────────────────────────────

  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    // FIX [11]: enlarged canvas
    svg.setAttribute("width",   "180");
    svg.setAttribute("height",  "310");
    svg.setAttribute("viewBox", "0 0 180 310");
    svg.style.overflow = "visible";

    const mk = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      if (text !== undefined) el.textContent = text;
      return el;
    };

    // ── Package body ─────────────────────────────────────────────────────────
    this._bodyEl = mk("rect", {
      x: 15, y: 18, width: 150, height: 108, rx: 12,
      fill: "#1e2229", stroke: "#374151", "stroke-width": "1.5",
    });
    svg.appendChild(this._bodyEl);

    // Type label
    svg.appendChild(mk("text", {
      x: 90, y: 12,
      fill: "#4b5563", "font-size": "9", "font-family": "monospace",
      "text-anchor": "middle", "font-weight": "600",
    }, "NPN BJT"));

    // ── LED indicator ────────────────────────────────────────────────────────
    this._ledEl = mk("circle", { cx: 155, cy: 30, r: 6, fill: "#374151" });
    svg.appendChild(this._ledEl);

    // ── Transistor symbol ────────────────────────────────────────────────────
    const sx = 90, sy = 72;

    // Collector–Emitter trunk
    svg.appendChild(mk("line", {
      x1: sx, y1: sy - 30, x2: sx, y2: sy + 30,
      stroke: "#9ca3af", "stroke-width": "2.5", "stroke-linecap": "round",
    }));

    // Base horizontal
    svg.appendChild(mk("line", {
      x1: sx - 32, y1: sy, x2: sx, y2: sy,
      stroke: "#9ca3af", "stroke-width": "2.5", "stroke-linecap": "round",
    }));

    // B-E junction line (color-coded by state)
    this._beLineEl = mk("line", {
      x1: sx, y1: sy, x2: sx + 22, y2: sy + 22,
      stroke: "#374151", "stroke-width": "2.5", "stroke-linecap": "round",
    });
    svg.appendChild(this._beLineEl);

    // B-C junction line
    svg.appendChild(mk("line", {
      x1: sx, y1: sy, x2: sx + 22, y2: sy - 22,
      stroke: "#9ca3af", "stroke-width": "2.5", "stroke-linecap": "round",
    }));

    // Emitter arrow (NPN pointing out)
    svg.appendChild(mk("polygon", {
      points: `${sx+20},${sy+24} ${sx+26},${sy+15} ${sx+12},${sy+17}`,
      fill: "#9ca3af",
    }));

    // Pin labels
    for (const [label, x, y] of [
      ["B", sx - 42, sy + 4],
      ["C", sx + 35, sy - 24],
      ["E", sx + 35, sy + 30],
    ]) {
      svg.appendChild(mk("text", {
        x, y, fill: "#6b7280", "font-size": "9",
        "font-family": "monospace", "text-anchor": "middle",
      }, label));
    }

    // ── Info panel ────────────────────────────────────────────────────────────
    // FIX [12]: expanded panel — enough room for 9 metric rows
    svg.appendChild(mk("rect", {
      x: 8, y: 136, width: 164, height: 158, rx: 6,
      fill: "#111318", stroke: "#1f2937", "stroke-width": "1",
    }));

    // State label (large, centered)
    this._stateEl = mk("text", {
      x: 90, y: 156,
      fill: "#6b7280", "font-size": "11", "font-weight": "bold",
      "font-family": "monospace", "text-anchor": "middle",
    }, "CUT-OFF");
    svg.appendChild(this._stateEl);

    // Divider line under state
    svg.appendChild(mk("line", {
      x1: 18, y1: 162, x2: 162, y2: 162,
      stroke: "#1f2937", "stroke-width": "0.8",
    }));

    // ── Metric rows ──────────────────────────────────────────────────────────
    const METRICS = [
      ["vbe",   "#4b5563"], ["vce",   "#4b5563"], ["vbc",   "#374151"],
      ["ib",    "#4b5563"], ["ic",    "#60a5fa"], ["ie",    "#4b5563"],
      ["hfe",   "#a78bfa"], ["pdiss", "#f97316"], ["temp",  "#fb7185"],
    ];

    METRICS.forEach(([key, color], i) => {
      const y = 176 + i * 13;
      const el = mk("text", {
        x: 18, y,
        fill: color, "font-size": "9", "font-family": "monospace",
      }, "");
      this._rows[key] = el;
      svg.appendChild(el);
    });

    // FIX [10]: Thermal runaway warning banner
    this._warnBgEl = mk("rect", {
      x: 8, y: 296, width: 164, height: 10, rx: 3,
      fill: "#7f1d1d", visibility: "hidden",
    });
    svg.appendChild(this._warnBgEl);

    this._warnEl = mk("text", {
      x: 90, y: 304,
      fill: "#fca5a5", "font-size": "8", "font-family": "monospace",
      "text-anchor": "middle", "font-weight": "bold",
      visibility: "hidden",
    }, "⚠ THERMAL RUNAWAY");
    svg.appendChild(this._warnEl);

    this._render();
    return svg;
  }
}