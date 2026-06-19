export default class PolarizedCapacitor {
       static manifest = {
    id:         "polorizedcapacitor",
    label:      "polorizedcapacitor",
    group:      "Power",
    imageSrc:   "images/pcapacitor.png",   // sidebar card image
    width:      76,                    // svg.setAttribute width se match
    height:     138,                    // svg.setAttribute height se match
    cssClasses: ["polorizedcapacitor"],
  

    instanceNameBase: "polorizedcapacitor",

    pins: [
      { id: "P", x: 30,  y: 50, power: "power" },
      { id: "N", x: 35, y: 25, power: "negtive" },
    ],

    // Constructor koi ctx nahi maangta — Group A jaisa simple hai
    factory: () => new  PolarizedCapacitor(),
  };
  constructor(
    capacitance  = 100e-6,
    pins         = {},
    instanceName = null,
    registryId   = null,
    openEditorFn = null
  ) {
    this.capacitance  = capacitance;
    this.maxVoltage   = 25;
    this.esr          = null;
    this.polarized    = true;

    this.pinPositive  = pins.positive ?? pins.P ?? null;
    this.pinNegative  = pins.negative ?? pins.N ?? null;
    this.instanceName = instanceName;
    this.registryId   = registryId;

    this.Vprev        = 0;
    this.Icurrent     = 0;
    this.Vcurrent     = 0;
    this.energyStored = 0;
    this.chargeStored = 0;
    this.power        = 0;

    this._editorOpen       = false;
    this._editor           = null;
    this._outsideClick     = null;
    this._overvoltageTimer = null;
    this._isReversed       = false;

    this.svg = this._buildSVG();
    this._editor = this._createEditor();
    document.body.appendChild(this._editor);
    this._attachEvents();
  }

  // ── Formatters ─────────────────────────────────────────────────────────

  _fmtC(C = this.capacitance) {
    if (C >= 1)      return `${C.toFixed(2)} F`;
    if (C >= 1e-3)   return `${+(C * 1e3).toFixed(3)} mF`;
    if (C >= 1e-6)   return `${+(C * 1e6).toFixed(2)} µF`;
    if (C >= 1e-9)   return `${+(C * 1e9).toFixed(1)} nF`;
    return `${+(C * 1e12).toFixed(0)} pF`;
  }

  _fmtV(v) {
    return Math.abs(v) < 0.001 ? "0.00V" : `${v.toFixed(2)}V`;
  }

  _fmtI(i) {
    const abs = Math.abs(i);
    if (abs < 1e-6)  return `${(i*1e9).toFixed(0)}nA`;
    if (abs < 1e-3)  return `${(i*1e6).toFixed(1)}µA`;
    if (abs < 1)     return `${(i*1e3).toFixed(2)}mA`;
    return `${i.toFixed(3)}A`;
  }

  _svgEl(tag, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  // ── SVG Build ──────────────────────────────────────────────────────────

  _buildSVG() {
    const W = 76, H = 138;
    const svg = this._svgEl("svg", {
      width: W, height: H,
      viewBox: `0 0 ${W} ${H}`,
      style: "pointer-events:all; cursor:pointer; overflow:visible; user-select:none;"
    });

    svg.appendChild(this._svgEl("rect", { x:0, y:0, width:W, height:H, fill:"transparent", stroke:"none" }));

    this._bodyRect = this._svgEl("rect", {
      x:12, y:14, width:50, height:88, rx:14,
      fill:"#1a2744", stroke:"#253560", "stroke-width":"1"
    });
    svg.appendChild(this._bodyRect);

    svg.appendChild(this._svgEl("rect", { x:12, y:20, width:9, height:76, rx:6, fill:"#1f3060", opacity:"0.8" }));
    svg.appendChild(this._svgEl("rect", { x:54, y:20, width:8, height:76, rx:4, fill:"#0d1830", opacity:"0.6" }));

    this._minusBand = this._svgEl("rect", { x:12, y:74, width:50, height:28, rx:0, fill:"#111827" });
    svg.appendChild(this._minusBand);
    svg.appendChild(this._svgEl("rect", { x:12, y:96, width:50, height:6, rx:0, fill:"#111827" }));
    svg.appendChild(this._svgEl("ellipse", { cx:37, cy:102, rx:25, ry:7, fill:"#0a0f1a" }));

    for (let i = 0; i < 3; i++) {
      const t = this._svgEl("text", { x: 21 + i * 14, y: 91, fill:"#3b7dd8", "font-size":12, "font-family":"monospace", "font-weight":"bold", "text-anchor":"middle" });
      t.textContent = "−";
      svg.appendChild(t);
    }

    svg.appendChild(this._svgEl("ellipse", { cx:37, cy:20, rx:25, ry:9, fill:"#3d4f6e" }));
    this._topCap = this._svgEl("ellipse", { cx:37, cy:14, rx:25, ry:9, fill:"#8fa8c8" });
    svg.appendChild(this._topCap);

    const ventG = this._svgEl("g", { stroke:"#5a7090", "stroke-width":"1.5", "stroke-linecap":"round" });
    [[37,5,37,23],[28,7,46,21],[46,7,28,21],[26,14,48,14]].forEach(([x1,y1,x2,y2]) =>
      ventG.appendChild(this._svgEl("line", {x1,y1,x2,y2}))
    );
    svg.appendChild(ventG);

    svg.appendChild(this._svgEl("rect", { x:56, y:18, width:5, height:76, rx:2.5, fill:"#0a0f1a" }));
    this._chargeBar = this._svgEl("rect", { x:57, y:93, width:3, height:0, rx:1.5, fill:"#3b7dd8" });
    svg.appendChild(this._chargeBar);

    this._labelEl = this._svgEl("text", {
      x:37, y:48, "text-anchor":"middle", fill:"#e8edf5",
      "font-size":9.5, "font-family":"'Courier New',monospace", "font-weight":"bold"
    });
    this._labelEl.textContent = this._fmtC();
    svg.appendChild(this._labelEl);

    this._ratingEl = this._svgEl("text", {
      x:37, y:59, "text-anchor":"middle", fill:"#7899c0",
      "font-size":7.5, "font-family":"'Courier New',monospace"
    });
    this._ratingEl.textContent = `${this.maxVoltage}V`;
    svg.appendChild(this._ratingEl);

    this._voltEl = this._svgEl("text", {
      x:37, y:69, "text-anchor":"middle", fill:"#4fc38a",
      "font-size":7.5, "font-family":"'Courier New',monospace", "font-weight":"bold"
    });
    this._voltEl.textContent = "0.00V";
    svg.appendChild(this._voltEl);

    svg.appendChild(this._svgEl("line", { x1:28, y1:102, x2:28, y2:132, stroke:"#c0ccd8", "stroke-width":3.5, "stroke-linecap":"round" }));
    svg.appendChild(this._svgEl("line", { x1:46, y1:102, x2:46, y2:129, stroke:"#c0ccd8", "stroke-width":3.5, "stroke-linecap":"round" }));

    const plus = this._svgEl("text", { x:19, y:128, fill:"#e07070", "font-size":12, "font-family":"monospace", "font-weight":"bold" });
    plus.textContent = "+";
    svg.appendChild(plus);

    this._ovFlash = this._svgEl("rect", { x:12, y:14, width:50, height:88, rx:14, fill:"#ff2020", opacity:"0", "pointer-events":"none" });
    svg.appendChild(this._ovFlash);

    this._revIndicator = this._svgEl("rect", { x:12, y:14, width:50, height:20, rx:0, fill:"#cc2020", opacity:"0", "pointer-events":"none" });
    svg.appendChild(this._revIndicator);

    this._revText = this._svgEl("text", {
      x:37, y:27, "text-anchor":"middle", fill:"#ffffff",
      "font-size":8, "font-family":"monospace", "font-weight":"bold",
      opacity:"0", "pointer-events":"none"
    });
    this._revText.textContent = "REV!";
    svg.appendChild(this._revText);

    // dblclick hint
    const hintEl = this._svgEl("text", {
      x:37, y:11, "text-anchor":"middle", fill:"#546e7a",
      "font-size":5.5, "font-family":"monospace", "pointer-events":"none"
    });
    hintEl.textContent = "dblclick";
    svg.appendChild(hintEl);

    return svg;
  }

  _updateLabel() {
    if (this._labelEl)  this._labelEl.textContent  = this._fmtC();
    if (this._ratingEl) this._ratingEl.textContent = `${this.maxVoltage}V`;
  }

  // ── Editor popup (same style as ZenerDiode / Capacitor) ────────────────

  _createEditor() {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position:      "fixed",
      display:       "none",
      flexDirection: "column",
      gap:           "10px",
      background:    "#1e2a3a",
      border:        "1.5px solid #42a5f5",
      borderRadius:  "10px",
      padding:       "14px 16px",
      boxShadow:     "0 8px 32px rgba(0,0,0,0.55)",
      zIndex:        "99999",
      minWidth:      "240px",
      fontFamily:    "monospace",
      color:         "#e3f2fd",
    });

    div.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#90cdf4;letter-spacing:1px;margin-bottom:2px;">
        ⬤ POLARIZED CAPACITOR
      </div>

      <!-- Capacitance -->
      <div style="font-size:11px;color:#78909c;margin-bottom:3px;">Capacitance</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="pcVal" type="number" min="0.001" step="any" value="100"
          style="flex:1;background:#0d1929;border:1px solid #42a5f5;border-radius:6px;
                 color:#e3f2fd;font-size:14px;font-family:monospace;padding:6px 10px;outline:none;"/>
        <select id="pcUnit"
          style="background:#0d1929;border:1px solid #42a5f5;border-radius:6px;
                 color:#e3f2fd;font-size:13px;font-family:monospace;padding:6px 8px;outline:none;">
          <option value="1e-12">pF</option>
          <option value="1e-9">nF</option>
          <option value="1e-6" selected>µF</option>
          <option value="1e-3">mF</option>
          <option value="1">F</option>
        </select>
      </div>

      <!-- Presets -->
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${[
          ["1µF/50V",  1e-6,   50],
          ["10µF/25V", 10e-6,  25],
          ["47µF/16V", 47e-6,  16],
          ["100µF/16V",100e-6, 16],
          ["220µF/10V",220e-6, 10],
          ["470µF/10V",470e-6, 10],
          ["1000µF/6V",1000e-6, 6.3],
          ["1mF/3.5V", 1e-3,   3.5],
          ["1F/2.7V",  1.0,    2.7],
        ].map(([l, c, v]) =>
          `<button data-cap="${c}" data-mv="${v}"
            style="background:#0d47a1;border:1px solid #1976d2;border-radius:4px;
                   color:#bbdefb;font-size:10px;font-family:monospace;
                   padding:3px 6px;cursor:pointer;">${l}</button>`
        ).join("")}
      </div>

      <!-- Voltage rating -->
      <div style="border-top:1px solid #37474f;padding-top:8px;">
        <div style="font-size:11px;color:#78909c;margin-bottom:5px;">Voltage rating</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="pcMaxV" type="number" min="1" max="1000" step="1" value="25"
            style="width:80px;background:#0d1929;border:1px solid #37474f;border-radius:6px;
                   color:#e3f2fd;font-size:13px;font-family:monospace;padding:5px 8px;outline:none;"/>
          <span style="color:#78909c;font-size:11px;">V</span>
        </div>
      </div>

      <!-- ESR -->
      <div style="border-top:1px solid #37474f;padding-top:8px;">
        <div style="font-size:11px;color:#78909c;margin-bottom:5px;">ESR (equivalent series resistance)</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="pcEsr" type="number" min="0.001" max="5000" step="0.001" value="80"
            style="width:80px;background:#0d1929;border:1px solid #37474f;border-radius:6px;
                   color:#e3f2fd;font-size:13px;font-family:monospace;padding:5px 8px;outline:none;"/>
          <span style="color:#78909c;font-size:11px;">mΩ</span>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:2px;">
        <button id="pcApply"
          style="flex:1;background:#1565c0;border:none;border-radius:6px;color:white;
                 font-size:13px;font-family:monospace;padding:7px;cursor:pointer;
                 font-weight:700;letter-spacing:1px;">APPLY</button>
        <button id="pcCancel"
          style="flex:1;background:#37474f;border:none;border-radius:6px;color:#cfd8dc;
                 font-size:13px;font-family:monospace;padding:7px;cursor:pointer;">CANCEL</button>
      </div>
    `;
    return div;
  }

  _openEditor(x, y) {
    this._editorOpen = true;
    const d = this._editor;

    // Pre-fill current values
    const { val, unit } = this._decomposeC(this.capacitance);
    d.querySelector("#pcVal").value  = val;
    d.querySelector("#pcUnit").value = unit;
    d.querySelector("#pcMaxV").value = this.maxVoltage;
    d.querySelector("#pcEsr").value  = +((this.esr ?? _defaultESR(this.capacitance)) * 1000).toFixed(1);

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
    const val  = parseFloat(this._editor.querySelector("#pcVal").value);
    const unit = parseFloat(this._editor.querySelector("#pcUnit").value);
    const maxV = parseFloat(this._editor.querySelector("#pcMaxV").value);
    const esr  = parseFloat(this._editor.querySelector("#pcEsr").value);
    if (!isNaN(val)  && val  > 0) this.capacitance = val * unit;
    if (!isNaN(maxV) && maxV > 0) this.maxVoltage  = maxV;
    if (!isNaN(esr)  && esr  > 0) this.esr         = esr / 1000;
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

    this._editor.querySelector("#pcApply").addEventListener("click", e => {
      e.stopPropagation(); this._applyEditor();
    });
    this._editor.querySelector("#pcCancel").addEventListener("click", e => {
      e.stopPropagation(); this._closeEditor();
    });

    // Preset buttons
    this._editor.querySelectorAll("button[data-cap]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this.capacitance = parseFloat(btn.dataset.cap);
        this.maxVoltage  = parseFloat(btn.dataset.mv);
        this._updateLabel();
        this._closeEditor();
      });
    });

    this._editor.querySelector("#pcVal").addEventListener("keydown", e => {
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

  // ── Decompose capacitance into val + unit string ────────────────────────

  _decomposeC(f) {
    if (f >= 1)    return { val: +(f).toPrecision(4),         unit: "1"     };
    if (f >= 1e-3) return { val: +(f * 1e3).toPrecision(4),  unit: "1e-3"  };
    if (f >= 1e-6) return { val: +(f * 1e6).toPrecision(4),  unit: "1e-6"  };
    if (f >= 1e-9) return { val: +(f * 1e9).toPrecision(4),  unit: "1e-9"  };
    return               { val: +(f * 1e12).toPrecision(4),  unit: "1e-12" };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getElement() { return this.svg; }

  setCapacitance(farads) {
    this.capacitance = Math.max(1e-15, farads);
    this._updateLabel();
  }

  updateVoltage(v) {
    this.Vprev    = v;
    this.Vcurrent = v;

    const abs   = Math.abs(v);
    const pct   = this.maxVoltage > 0 ? Math.min(1, abs / this.maxVoltage) : 0;
    const isRev = this.polarized && v < -0.3;
    this._isReversed = isRev;

    if (this._voltEl) {
      this._voltEl.textContent = this._fmtV(v);
      this._voltEl.setAttribute("fill",
        isRev      ? "#fc3030" :
        pct > 0.9  ? "#fc8181" :
        abs > 0.05 ? "#4fc38a" : "#2d4a6a"
      );
    }

    if (this._chargeBar) {
      const barH = Math.round(pct * 70);
      const barY = 93 - barH;
      this._chargeBar.setAttribute("height", String(barH));
      this._chargeBar.setAttribute("y",      String(barY));
      const hue = isRev ? 0 : Math.round((1 - pct) * 220);
      this._chargeBar.setAttribute("fill", isRev ? "#cc2020" : `hsl(${hue},72%,52%)`);
    }

    if (this._bodyRect) {
      if (isRev) {
        this._bodyRect.setAttribute("fill", "#2a1010");
      } else {
        const r = Math.round(26  + pct * 18);
        const g = Math.round(39  + pct * 12);
        const b = Math.round(68  + pct * 22);
        this._bodyRect.setAttribute("fill", `rgb(${r},${g},${b})`);
      }
    }

    if (this._revIndicator && this._revText) {
      const op = isRev ? "0.85" : "0";
      this._revIndicator.setAttribute("opacity", op);
      this._revText.setAttribute("opacity",      op);
    }

    if (!isRev && abs > this.maxVoltage * 1.05) this._flashOvervoltage();
  }

  _flashOvervoltage() {
    if (this._overvoltageTimer) return;
    this._ovFlash.setAttribute("opacity", "0.5");
    this._overvoltageTimer = setTimeout(() => {
      this._ovFlash.setAttribute("opacity", "0");
      this._overvoltageTimer = null;
    }, 280);
  }

destroy() {
    this._editor.remove();
    document.removeEventListener("mousedown", this._outsideClick);
    if (this._overvoltageTimer) {
        clearTimeout(this._overvoltageTimer);
        this._overvoltageTimer = null;
    }
}

  reset() {
    this.Vprev = 0; this.Icurrent = 0; this.Vcurrent = 0;
    this.energyStored = 0; this.chargeStored = 0; this.power = 0;
    this._isReversed = false;
    this.updateVoltage(0);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _defaultESR(C) {
  if (C < 1e-12)  return 50;
  if (C < 1e-9)   return 10;
  if (C < 100e-9) return 2;
  if (C < 1e-6)   return 0.5;
  if (C < 10e-6)  return 0.15;
  if (C < 100e-6) return 0.08;
  return 0.03;
}