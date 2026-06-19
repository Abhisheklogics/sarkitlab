export default class VirtualInductor {
  constructor(
    inductance   = 10e-3,
    pins         = {},
    instanceName = null,
    registryId   = null,
    openEditorFn = null
  ) {
    this.inductance        = inductance;
    this.dcr               = null;
    this.saturationCurrent = null;
    this.coreQ             = 40;

    this.pinA         = pins.a ?? pins.A ?? null;
    this.pinB         = pins.b ?? pins.B ?? null;
    this.instanceName = instanceName;
    this.registryId   = registryId;

    this.Iprev        = 0;
    this.Icurrent     = 0;
    this.Vcurrent     = 0;
    this.Leffective   = inductance;
    this.energyStored = 0;
    this.power        = 0;
    this.isSaturated  = false;

    this._editorOpen     = false;
    this._editor         = null;
    this._outsideClick   = null;
    this._flybackTimer   = null;
this._smoothI       = 0;
this._smoothV       = 0;
this._dispI         = 0; 
this._dispV         = 0;
this._alpha         = 0.10;
    this.svg = this._buildSVG();
    this._editor = this._createEditor();
    document.body.appendChild(this._editor);
    this._attachEvents();
  }

  // ── Formatters ─────────────────────────────────────────────────────────

  _fmtL(L = this.inductance) {
    if (L >= 10)   return `${L.toFixed(1)} H`;
    if (L >= 1)    return `${L.toFixed(2)} H`;
    if (L >= 1e-3) return `${+(L * 1e3).toFixed(2)} mH`;
    if (L >= 1e-6) return `${+(L * 1e6).toFixed(1)} µH`;
    return `${+(L * 1e9).toFixed(0)} nH`;
  }

  _fmtI(I) {
    const abs = Math.abs(I);
    if (abs < 1e-6)  return `${(I*1e9).toFixed(0)}nA`;
    if (abs < 1e-3)  return `${(I*1e6).toFixed(1)}µA`;
    if (abs < 1)     return `${(I*1e3).toFixed(2)}mA`;
    return `${I.toFixed(4)}A`;
  }

  _svgEl(tag, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  // ── SVG ────────────────────────────────────────────────────────────────

  _buildSVG() {
    const W = 210, H = 84;
    const svg = this._svgEl("svg", {
      width: W, height: H,
      viewBox: `0 0 ${W} ${H}`,
      style: "pointer-events:all; cursor:pointer; overflow:visible; user-select:none;"
    });

    svg.appendChild(this._svgEl("rect", { x:0, y:0, width:W, height:H, fill:"transparent", stroke:"none" }));

    const midY   = H / 2;
    const coilX0 = 30;
    const coilX1 = W - 30;
    const coilW  = coilX1 - coilX0;
    const nTurns = 14;
    const turnW  = coilW / nTurns;
    const coilRY = 17;

    this._leadL = this._svgEl("line", { x1:0, y1:midY, x2:coilX0, y2:midY, stroke:"#8a6540", "stroke-width":7, "stroke-linecap":"round" });
    this._leadR = this._svgEl("line", { x1:coilX1, y1:midY, x2:W, y2:midY, stroke:"#8a6540", "stroke-width":7, "stroke-linecap":"round" });
    svg.appendChild(this._leadL);
    svg.appendChild(this._leadR);

    for (let i = 0; i <= nTurns; i++) {
      const cx = coilX0 + i * turnW;
      svg.appendChild(this._svgEl("ellipse", {
        cx, cy: midY, rx: turnW * 0.54, ry: coilRY,
        fill:"none", stroke:"#3d1e04", "stroke-width":3.5,
        "stroke-dasharray": `${Math.PI * coilRY} ${Math.PI * coilRY}`,
        "stroke-dashoffset": `${-Math.PI * coilRY / 2}`
      }));
    }

    this._coilFills = [];
    for (let i = 0; i < nTurns; i++) {
      const cx = coilX0 + (i + 0.5) * turnW;
      const fill = this._svgEl("ellipse", { cx, cy: midY, rx: turnW * 0.44, ry: coilRY - 5, fill:"#b87830" });
      this._coilFills.push(fill);
      svg.appendChild(fill);
    }

    this._frontArcs = [];
    for (let i = 0; i <= nTurns; i++) {
      const cx = coilX0 + i * turnW;
      const arc = this._svgEl("ellipse", {
        cx, cy: midY, rx: turnW * 0.54, ry: coilRY,
        fill:"none", stroke:"#8a4810", "stroke-width":6.5,
        "stroke-dasharray": `${Math.PI * coilRY} ${Math.PI * coilRY}`,
        "stroke-dashoffset": `${Math.PI * coilRY / 2}`
      });
      this._frontArcs.push(arc);
      svg.appendChild(arc);
    }

    svg.appendChild(this._svgEl("rect", { x: W/2 - 33, y: midY - 13, width:66, height:26, rx:8, fill:"rgba(8,8,16,0.78)" }));

    this._labelEl = this._svgEl("text", {
      x: W/2, y: midY + 3, "text-anchor":"middle", fill:"#f6c87a",
      "font-size":11, "font-family":"'Courier New',monospace", "font-weight":"bold"
    });
    this._labelEl.textContent = this._fmtL();
    svg.appendChild(this._labelEl);
this._currentEl = this._svgEl("text", {
  x: W/2, y: H - 10, "text-anchor":"middle", fill:"#4a6080",
  "font-size":8.5, "font-family":"'Courier New',monospace"
});
this._currentEl.textContent = "0.000 A";
svg.appendChild(this._currentEl);

this._voltEl = this._svgEl("text", {
  x: W/2, y: 11, "text-anchor":"middle", fill:"#4a6080",
  "font-size":8, "font-family":"'Courier New',monospace"
});
this._voltEl.textContent = "0.00 V";
svg.appendChild(this._voltEl);

    this._satBg = this._svgEl("rect", { x:3, y:3, width:16, height:16, rx:4, fill:"#7a5000", opacity:"0" });
    svg.appendChild(this._satBg);
    this._satText = this._svgEl("text", {
      x:11, y:14, "text-anchor":"middle", fill:"#f6c87a",
      "font-size":8, "font-family":"monospace", "font-weight":"bold", opacity:"0"
    });
    this._satText.textContent = "S";
    svg.appendChild(this._satText);

    this._flybackBg = this._svgEl("rect", { x: W-19, y:3, width:16, height:16, rx:4, fill:"#8a0000", opacity:"0" });
    svg.appendChild(this._flybackBg);
    this._flybackText = this._svgEl("text", {
      x: W-11, y:14, "text-anchor":"middle", fill:"#ffffff",
      "font-size":8, "font-family":"monospace", "font-weight":"bold", opacity:"0"
    });
    this._flybackText.textContent = "!";
    svg.appendChild(this._flybackText);

    svg.appendChild(this._svgEl("rect", { x:3, y:22, width:4, height:40, rx:2, fill:"#0a0a14" }));
    this._energyBar = this._svgEl("rect", { x:4, y:61, width:2, height:0, rx:1, fill:"#f6c87a" });
    svg.appendChild(this._energyBar);

    // dblclick hint
  const hintEl = this._svgEl("text", {
      x: W/2, y: H - 1, "text-anchor":"middle", fill:"#546e7a",
      "font-size":5.5, "font-family":"monospace", "pointer-events":"none"
    });
    hintEl.textContent = "dblclick";
    svg.appendChild(hintEl);

    return svg;
  }

  _updateLabel() {
    if (this._labelEl) this._labelEl.textContent = this._fmtL();
  }

  // ── Editor popup (same style as ZenerDiode / Capacitor) ────────────────

  _createEditor() {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position:      "fixed",
      display:       "none",
      flexDirection: "column",
      gap:           "10px",
      background:    "#1a2332",
      border:        "1.5px solid #f6c87a",
      borderRadius:  "10px",
      padding:       "14px 16px",
      boxShadow:     "0 8px 32px rgba(0,0,0,0.6)",
      zIndex:        "99999",
      minWidth:      "240px",
      fontFamily:    "monospace",
      color:         "#eceff1",
    });

    div.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#f6c87a;letter-spacing:1px;margin-bottom:2px;">
        〰 INDUCTOR VALUE
      </div>

      <div style="display:flex;gap:8px;align-items:center;">
        <input id="indVal" type="number" min="0.001" step="any" value="10"
          style="flex:1;background:#0d1929;border:1px solid #f6c87a;border-radius:6px;
                 color:#eceff1;font-size:14px;font-family:monospace;padding:6px 10px;outline:none;"/>
        <select id="indUnit"
          style="background:#0d1929;border:1px solid #f6c87a;border-radius:6px;
                 color:#eceff1;font-size:13px;font-family:monospace;padding:6px 8px;outline:none;">
          <option value="1e-9">nH</option>
          <option value="1e-6">µH</option>
          <option value="1e-3" selected>mH</option>
          <option value="1">H</option>
        </select>
      </div>

      <!-- Presets -->
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${[
          ["10nH",10e-9,0.001,10],["100nH",100e-9,0.005,8],
          ["1µH",1e-6,0.01,6],  ["10µH",10e-6,0.02,5],
          ["100µH",100e-6,0.05,4],["1mH",1e-3,0.1,3],
          ["10mH",10e-3,0.5,1], ["100mH",100e-3,2.0,0.5],
          ["1H",1.0,10,0.3]
        ].map(([l,L,dcr,isat]) =>
          `<button data-l="${L}" data-dcr="${dcr}" data-isat="${isat}"
            style="background:#3d2a10;border:1px solid #6a4020;border-radius:4px;
                   color:#f6c87a;font-size:10px;font-family:monospace;
                   padding:3px 6px;cursor:pointer;">${l}</button>`
        ).join("")}
      </div>

      <!-- DCR -->
      <div style="border-top:1px solid #3d2a10;padding-top:8px;">
        <div style="font-size:11px;color:#78909c;margin-bottom:5px;">DCR — winding resistance</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="indDcr" type="number" min="0.001" max="200" step="0.001" value="0.1"
            style="width:90px;background:#0d1929;border:1px solid #3d2a10;border-radius:6px;
                   color:#eceff1;font-size:13px;font-family:monospace;padding:5px 8px;outline:none;"/>
          <span style="color:#78909c;font-size:11px;">Ω</span>
        </div>
      </div>

      <!-- Isat -->
      <div style="border-top:1px solid #3d2a10;padding-top:8px;">
        <div style="font-size:11px;color:#78909c;margin-bottom:5px;">Saturation current (Isat)</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="indIsat" type="number" min="0.001" max="100" step="0.001" value="1.0"
            style="width:90px;background:#0d1929;border:1px solid #3d2a10;border-radius:6px;
                   color:#eceff1;font-size:13px;font-family:monospace;padding:5px 8px;outline:none;"/>
          <span style="color:#78909c;font-size:11px;">A</span>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:2px;">
        <button id="indApply"
          style="flex:1;background:#3d2a10;border:none;border-radius:6px;color:#f6c87a;
                 font-size:13px;font-family:monospace;padding:7px;cursor:pointer;
                 font-weight:700;letter-spacing:1px;">APPLY</button>
        <button id="indCancel"
          style="flex:1;background:#263238;border:none;border-radius:6px;color:#b0bec5;
                 font-size:13px;font-family:monospace;padding:7px;cursor:pointer;">CANCEL</button>
      </div>
    `;
    return div;
  }

  _openEditor(x, y) {
    this._editorOpen = true;
    const d = this._editor;

    // Pre-fill current values
    const { val, unit } = this._decomposeL(this.inductance);
    d.querySelector("#indVal").value  = val;
    d.querySelector("#indUnit").value = unit;
    d.querySelector("#indDcr").value  = (this.dcr ?? _defaultDCR(this.inductance)).toFixed(3);
    d.querySelector("#indIsat").value = (this.saturationCurrent ?? _defaultIsat(this.inductance)).toFixed(3);

    d.style.display = "flex";
    d.style.left    = `${x}px`;
    d.style.top     = `${y}px`;

    requestAnimationFrame(() => {
      const rect = d.getBoundingClientRect();
      if (rect.right  > window.innerWidth)  d.style.left = `${window.innerWidth  - rect.width  - 10}px`;
      if (rect.bottom > window.innerHeight) d.style.top  = `${window.innerHeight - rect.height - 10}px`;
    });
  }

  _closeEditor() {
    this._editorOpen = false;
    this._editor.style.display = "none";
  }

  _applyEditor() {
    const val  = parseFloat(this._editor.querySelector("#indVal").value);
    const unit = parseFloat(this._editor.querySelector("#indUnit").value);
    const dcr  = parseFloat(this._editor.querySelector("#indDcr").value);
    const isat = parseFloat(this._editor.querySelector("#indIsat").value);
    if (!isNaN(val)  && val  > 0) this.inductance        = val * unit;
    if (!isNaN(dcr)  && dcr  > 0) this.dcr               = dcr;
    if (!isNaN(isat) && isat > 0) this.saturationCurrent = isat;
    this._updateLabel();
    this._closeEditor();
  }

  // ── Events ─────────────────────────────────────────────────────────────

  _attachEvents() {
    // dblclick on SVG → open editor (same as ZenerDiode / Capacitor)
    this.svg.addEventListener("dblclick", e => {
      e.stopPropagation();
      this._openEditor(e.clientX + 12, e.clientY + 12);
    });

    this._editor.querySelector("#indApply").addEventListener("click", e => {
      e.stopPropagation(); this._applyEditor();
    });
    this._editor.querySelector("#indCancel").addEventListener("click", e => {
      e.stopPropagation(); this._closeEditor();
    });

    // Preset buttons
    this._editor.querySelectorAll("button[data-l]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this.inductance        = parseFloat(btn.dataset.l);
        this.dcr               = parseFloat(btn.dataset.dcr);
        this.saturationCurrent = parseFloat(btn.dataset.isat);
        this._updateLabel();
        this._closeEditor();
      });
    });

    this._editor.querySelector("#indVal").addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.stopPropagation(); this._applyEditor(); }
      if (e.key === "Escape") { e.stopPropagation(); this._closeEditor(); }
    });

    // Click outside → close
    this._outsideClick = e => {
      if (this._editorOpen &&
          !this._editor.contains(e.target) &&
          !this.svg.contains(e.target)) {
        this._closeEditor();
      }
    };
    document.addEventListener("mousedown", this._outsideClick);
  }

  // ── Decompose inductance into val + unit string ─────────────────────────

  _decomposeL(L) {
    if (L >= 1)    return { val: +(L).toPrecision(4),        unit: "1"    };
    if (L >= 1e-3) return { val: +(L * 1e3).toPrecision(4), unit: "1e-3" };
    if (L >= 1e-6) return { val: +(L * 1e6).toPrecision(4), unit: "1e-6" };
    return               { val: +(L * 1e9).toPrecision(4),  unit: "1e-9" };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getElement() { return this.svg; }

  setInductance(henrys) {
    this.inductance = Math.max(1e-12, henrys);
    this._updateLabel();
  }

 updateCurrent(I) {
  this.Iprev    = I;
  this.Icurrent = I;
 
  // Exponential smoothing
  const a = this._alpha;
  this._smoothI = a * I                    + (1 - a) * this._smoothI;
  this._smoothV = a * (this.Vcurrent ?? 0) + (1 - a) * this._smoothV;
 
  // Update text only when change > 2% threshold (prevents constant flicker)
  const iChanged = Math.abs(this._smoothI - this._dispI) >
                   Math.max(Math.abs(this._dispI) * 0.02, 1e-6);
  const vChanged = Math.abs(this._smoothV - this._dispV) >
                   Math.max(Math.abs(this._dispV) * 0.02, 1e-4);
 
  if (iChanged) {
    this._dispI = this._smoothI;
    if (this._currentEl) {
      this._currentEl.textContent = this._fmtI(this._smoothI);
      this._currentEl.setAttribute("fill",
        Math.abs(this._smoothI) > 1e-4 ? "#4fc38a" : "#2d4a30");
    }
  }
 
  if (vChanged) {
    this._dispV = this._smoothV;
    if (this._voltEl) {
      this._voltEl.textContent = `${this._smoothV.toFixed(2)}V`;
      this._voltEl.setAttribute("fill",
        Math.abs(this._smoothV) > 0.1 ? "#f6a050" : "#3a2a10");
    }
  }
 
  // Coil visual — use smoothed value, update only when load changes by >1%
  const absI   = Math.abs(this._smoothI);
  const Isat   = this.saturationCurrent ?? _defaultIsat(this.inductance);
  const load   = Math.min(1, absI / Math.max(Isat, 1e-6));
 
  // Cache last load to avoid recalculating colors every tick
  if (Math.abs(load - (this._lastLoad ?? -1)) > 0.01) {
    this._lastLoad = load;
 
    const r_fill = Math.round(184 + load * 60);
    const g_fill = Math.round(120 - load * 100);
    const b_fill = Math.round(48  - load * 45);
    this._coilFills?.forEach(f => f.setAttribute("fill", `rgb(${r_fill},${g_fill},${b_fill})`));
 
    const r_arc = Math.round(138 + load * 100);
    const g_arc = Math.round(72  - load * 60);
    const b_arc = Math.round(16  - load * 14);
    this._frontArcs?.forEach(arc => arc.setAttribute("stroke", `rgb(${r_arc},${g_arc},${b_arc})`));
 
    const leadColor = load > 0.5
      ? `rgb(${Math.round(140+load*50)},${Math.round(100-load*50)},40)`
      : "#8a6540";
    this._leadL?.setAttribute("stroke", leadColor);
    this._leadR?.setAttribute("stroke", leadColor);
 
    if (this._energyBar) {
      const barH = Math.round(load * 38);
      this._energyBar.setAttribute("height", String(barH));
      this._energyBar.setAttribute("y",      String(61 - barH));
      this._energyBar.setAttribute("fill",   load > 0.8 ? "#fc8181" : "#f6c87a");
    }
 
    if (this._satBg && this._satText) {
      if (load > 0.9) {
        this._satBg.setAttribute("opacity", "1");
        this._satText.setAttribute("opacity", "1");
        this._satBg.setAttribute("fill", "#8a3000");
      } else if (load > 0.7) {
        this._satBg.setAttribute("opacity", "0.7");
        this._satText.setAttribute("opacity", "0.7");
        this._satBg.setAttribute("fill", "#7a5000");
      } else {
        this._satBg.setAttribute("opacity", "0");
        this._satText.setAttribute("opacity", "0");
      }
    }
  }
}

  flashFlyback() {
    if (!this._flybackBg || this._flybackTimer) return;
    this._flybackBg.setAttribute("opacity", "1");
    this._flybackText.setAttribute("opacity", "1");
    this._frontArcs?.forEach(a => a.setAttribute("stroke", "#ff2020"));
    this._flybackTimer = setTimeout(() => {
      this._flybackBg.setAttribute("opacity", "0");
      this._flybackText.setAttribute("opacity", "0");
      this._flybackTimer = null;
      this.updateCurrent(this.Icurrent ?? 0);
    }, 450);
  }

  destroy() {
    this._editor.remove();
    document.removeEventListener("mousedown", this._outsideClick);
    if (this._flybackTimer) clearTimeout(this._flybackTimer);
  }

  reset() {
    this.Iprev = 0; this.Icurrent = 0; this.Vcurrent = 0;
    this._smoothI = 0;
    this._smoothV = 0;
    this._dispI   = 0;
this._dispV   = 0;
this._lastLoad = -1;
    this.energyStored = 0; this.power = 0; this.isSaturated = false;
    this.updateCurrent(0);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _defaultDCR(L) {
  if (L >= 10)     return 100.0;
  if (L >= 1)      return 10.0;
  if (L >= 100e-3) return 2.0;
  if (L >= 10e-3)  return 0.5;
  if (L >= 1e-3)   return 0.1;
  if (L >= 100e-6) return 0.03;
  return 0.01;
}

function _defaultIsat(L) {
  if (L >= 10)     return 0.1;
  if (L >= 1)      return 0.3;
  if (L >= 100e-3) return 0.5;
  if (L >= 10e-3)  return 1.0;
  if (L >= 1e-3)   return 3.0;
  if (L >= 100e-6) return 6.0;
  return 10.0;
}