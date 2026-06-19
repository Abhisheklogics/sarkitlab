

export default class Capacitor {
    static manifest = {
    id:         "capacitor",
    label:      "capacitor",
    group:      "Power",
    imageSrc:   "images/capacitor.png",   // sidebar card image
    width:      80,                    // svg.setAttribute width se match
    height:     110,                    // svg.setAttribute height se match
    cssClasses: ["capacitor"],
  

    instanceNameBase: "capacitor",

    pins: [
      { id: "T1", x: 30,  y: 50},
      { id: "T2", x: 35, y: 25 },
    ],

    // Constructor koi ctx nahi maangta — Group A jaisa simple hai
    factory: () => new  Capacitor(),
  };
  constructor(capacitance = 100e-6, pins = {}, _a, _b, onEdit) {
    this.capacitance = capacitance;
    this.onEdit      = onEdit ?? null;
    this._editorOpen = false;

    // Simulation state (updated by CapacitorModel)
    this.voltage      = 0;
    this.current      = 0;
    this.Vcurrent     = 0;
    this.Vprev        = 0;
    this.Icurrent     = 0;
    this.energyStored = 0;
    this.chargeStored = 0;
    this._isReversed  = false;
    this._nets        = null;
this.maxVoltage = 50;
    this.svg     = this._createSVG();
    this._editor = this._createEditor();
    document.body.appendChild(this._editor);
    this._bindEvents();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getElement() { return this.svg; }
  getValue()   { return this.capacitance; }

  setValue(f) {
    this.capacitance = Math.max(1e-15, f);  // floor at 1fF
    this._updateLabel();
    this.onEdit?.(this);
  }

  // Called by CapacitorModel.update() every sim tick
  updateVoltage(vc) {
    this.Vcurrent    = vc;
    this.voltage     = vc;
    this.energyStored = 0.5 * this.capacitance * vc * vc;
    this.chargeStored = this.capacitance * Math.abs(vc);
    this._updateChargeBar(vc);
  }

  reset() {
    this.voltage = this.Vcurrent = this.Vprev = 0;
    this.Icurrent = this.energyStored = this.chargeStored = 0;
    this._isReversed = false;
    this._nets = null;
    this._updateChargeBar(0);
  }

  destroy() {
    this._editor.remove();
    document.removeEventListener("mousedown", this._outsideClick);
  }

  // ── SVG ───────────────────────────────────────────────────────────────────

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "80");
    svg.setAttribute("height",  "110");
    svg.setAttribute("viewBox", "0 0 80 110");
    svg.style.overflow = "visible";
    svg.style.cursor   = "pointer";

    svg.innerHTML = `
      <!-- Outer glow ring -->
      <ellipse cx="40" cy="38" rx="31" ry="33" fill="#0d47a1" opacity="0.35"/>

      <!-- Main round body -->
      <ellipse cx="40" cy="36" rx="30" ry="32" fill="#1976d2"/>

      <!-- Gloss highlights -->
      <ellipse cx="30" cy="22" rx="10" ry="13" fill="white" opacity="0.22"/>
      <ellipse cx="27" cy="19" rx="5"  ry="7"  fill="white" opacity="0.28"/>

      <!-- Bottom shade -->
      <ellipse cx="40" cy="60" rx="28" ry="10" fill="#0d47a1" opacity="0.3"/>

      <!-- Flat base (where pins exit) -->
      <rect x="14" y="58" width="52" height="13" rx="3" fill="#1565c0"/>
      <rect x="14" y="58" width="52" height="4"  rx="2" fill="#1e88e5" opacity="0.5"/>

      <!-- Body outline -->
      <ellipse cx="40" cy="36" rx="30" ry="32"
               fill="none" stroke="#0d47a1" stroke-width="1.5"/>

      <!-- Charge bar background (shows stored energy, real-time) -->
      <rect id="chargeBarBg" x="16" y="14" width="48" height="6" rx="3"
            fill="#0d47a1" opacity="0.6"/>
      <!-- Charge bar fill -->
      <rect id="chargeBarFill" x="16" y="14" width="0" height="6" rx="3"
            fill="#64b5f6" opacity="0.9"/>

      <!-- Value label -->
      <text id="capLabel" x="40" y="36"
            font-size="9" font-family="monospace" font-weight="bold"
            fill="white" text-anchor="middle" dominant-baseline="middle"
            pointer-events="none">
        ${this._formatValue(this.capacitance)}
      </text>

      <!-- Voltage readout (updates during sim) -->
      <text id="capVoltage" x="40" y="48"
            font-size="6" font-family="monospace"
            fill="#90caf9" text-anchor="middle" pointer-events="none">
        0.00V
      </text>

      <!-- dblclick hint -->
      <text x="40" y="57" font-size="5" font-family="monospace"
            fill="#42a5f5" text-anchor="middle" pointer-events="none" opacity="0.7">
        dblclick edit
      </text>

      <!-- Pins -->
      <line x1="28" y1="71" x2="28" y2="110"
            stroke="#9e9e9e" stroke-width="5" stroke-linecap="round"/>
      <line x1="52" y1="71" x2="52" y2="110"
            stroke="#9e9e9e" stroke-width="5" stroke-linecap="round"/>
    `;
    return svg;
  }

  _updateLabel() {
    const lbl = this.svg.querySelector("#capLabel");
    if (lbl) lbl.textContent = this._formatValue(this.capacitance);
  }

  // Real-time charge bar — width proportional to stored voltage vs rated 50V
  _updateChargeBar(vc) {
    const fill    = this.svg.querySelector("#chargeBarFill");
    const voltEl  = this.svg.querySelector("#capVoltage");
    if (!fill) return;

    // Max display voltage: 50V (typical rated voltage)
    const ratio = Math.min(1, Math.abs(vc) / (this.maxVoltage ?? 50));
    const w     = Math.round(ratio * 48);

    // Color: green (low) → yellow → red (high charge)
    const hue = Math.round((1 - ratio) * 120);  // 120=green, 0=red
    fill.setAttribute("width", String(w));
    fill.setAttribute("fill",  `hsl(${hue}, 75%, 55%)`);

    if (voltEl) {
      voltEl.textContent = vc !== 0 ? `${vc.toFixed(2)}V` : "0.00V";
      voltEl.setAttribute("fill", vc > 0.1 ? "#64b5f6" : "#546e7a");
    }
  }

  // ── Editor popup ──────────────────────────────────────────────────────────

  _createEditor() {
    const div = document.createElement("div");
    div.id = `cap-editor-${Math.random().toString(36).slice(2)}`;
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
      minWidth:      "230px",
      fontFamily:    "monospace",
      color:         "#e3f2fd",
    });

    div.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#42a5f5;letter-spacing:1px;">
        ⚡ CAPACITOR VALUE
      </div>

      <div style="display:flex;gap:8px;align-items:center;">
        <input id="capVal" type="number" min="0.001" step="any" value="100"
          style="flex:1;background:#0d1929;border:1px solid #42a5f5;border-radius:6px;
                 color:#e3f2fd;font-size:14px;font-family:monospace;padding:6px 10px;outline:none;"/>
        <select id="capUnit"
          style="background:#0d1929;border:1px solid #42a5f5;border-radius:6px;
                 color:#e3f2fd;font-size:13px;font-family:monospace;padding:6px 8px;outline:none;">
          <option value="1e-12">pF</option>
          <option value="1e-9">nF</option>
          <option value="1e-6" selected>µF</option>
          <option value="1e-3">mF</option>
          <option value="1">F</option>
        </select>
      </div>

      <!-- Live preview of actual Farads value -->
      <div id="capFaradsPreview"
        style="font-size:10px;color:#546e7a;margin-top:-4px;padding-left:2px;">
        = 100 µF = 0.0001 F
      </div>

      <!-- Quick presets — grouped by unit -->
      <div style="font-size:10px;color:#546e7a;margin-bottom:2px;">Quick presets:</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${[
          ["10pF",   "10",   "1e-12"],
          ["100pF",  "100",  "1e-12"],
          ["1nF",    "1",    "1e-9" ],
          ["10nF",   "10",   "1e-9" ],
          ["100nF",  "100",  "1e-9" ],
          ["1µF",    "1",    "1e-6" ],
          ["10µF",   "10",   "1e-6" ],
          ["100µF",  "100",  "1e-6" ],
          ["470µF",  "470",  "1e-6" ],
          ["1000µF", "1000", "1e-6" ],
        ].map(([label, val, unit]) =>
          `<button data-val="${val}" data-unit="${unit}"
            style="background:#0d47a1;border:1px solid #1976d2;border-radius:4px;
                   color:#bbdefb;font-size:10px;font-family:monospace;
                   padding:3px 7px;cursor:pointer;"
          >${label}</button>`
        ).join("")}
      </div>

      <div style="display:flex;gap:8px;margin-top:2px;">
        <button id="capApply"
          style="flex:1;background:#1565c0;border:none;border-radius:6px;
                 color:white;font-size:13px;font-family:monospace;
                 padding:7px;cursor:pointer;font-weight:700;">APPLY</button>
        <button id="capCancel"
          style="flex:1;background:#37474f;border:none;border-radius:6px;
                 color:#cfd8dc;font-size:13px;font-family:monospace;
                 padding:7px;cursor:pointer;">CANCEL</button>
      </div>
    `;
    return div;
  }

  _openEditor(x, y) {
    this._editorOpen = true;
    const d = this._editor;

    // FIX: decompose current value into correct unit range
    const { val, unit, unitStr } = this._decomposeValue(this.capacitance);
    const valInput  = d.querySelector("#capVal");
    const unitSel   = d.querySelector("#capUnit");
    valInput.value  = val;
    unitSel.value   = unit;

    this._updatePreview(val, unit);

    d.style.display = "flex";
    d.style.left    = `${x}px`;
    d.style.top     = `${y}px`;

    requestAnimationFrame(() => {
      const rect = d.getBoundingClientRect();
      if (rect.right  > window.innerWidth)  d.style.left = `${window.innerWidth  - rect.width  - 10}px`;
      if (rect.bottom > window.innerHeight) d.style.top  = `${window.innerHeight - rect.height - 10}px`;
    });

    valInput.focus();
    valInput.select();
  }

  _closeEditor() {
    this._editorOpen       = false;
    this._editor.style.display = "none";
  }

  _applyEditor() {
    const val  = parseFloat(this._editor.querySelector("#capVal").value);
    const unit = parseFloat(this._editor.querySelector("#capUnit").value);
    if (!isNaN(val) && val > 0) {
      this.setValue(val * unit);
    }
    this._closeEditor();
  }

  // Shows "= X µF = Y F" preview so user knows exact value
  _updatePreview(val, unit) {
    const preview = this._editor.querySelector("#capFaradsPreview");
    if (!preview) return;
    const f       = parseFloat(val) * parseFloat(unit);
    if (isNaN(f) || f <= 0) { preview.textContent = ""; return; }
    preview.textContent = `= ${this._formatValue(f)} = ${f.toExponential(3)} F`;
    preview.style.color = "#80cbc4";
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    this.svg.addEventListener("dblclick", e => {
      e.stopPropagation();
      this._openEditor(e.clientX + 12, e.clientY + 12);
    });

    this._editor.querySelector("#capApply").addEventListener("click", e => {
      e.stopPropagation(); this._applyEditor();
    });
    this._editor.querySelector("#capCancel").addEventListener("click", e => {
      e.stopPropagation(); this._closeEditor();
    });

    // Live preview update when val/unit changes
    const valInput = this._editor.querySelector("#capVal");
    const unitSel  = this._editor.querySelector("#capUnit");
    const onInput  = () => this._updatePreview(valInput.value, unitSel.value);
    valInput.addEventListener("input",  onInput);
    unitSel.addEventListener("change", onInput);

    // Preset buttons — FIX: set BOTH value AND unit select correctly
    this._editor.querySelectorAll("button[data-val]").forEach(btn => {
     // _bindEvents() mein preset button click handler mein:
btn.addEventListener("click", e => {
    e.stopPropagation();
    const val  = btn.dataset.val;
    const unit = btn.dataset.unit;
    unitSel.value  = unit;
    valInput.value = val;
    this._updatePreview(val, unit);
    const f = parseFloat(val) * parseFloat(unit);
    this.setValue(f);
    this._closeEditor();
});
// Koi maxVoltage set nahi ho raha — isliye _applyEditor() mein bhi add karo
    });

    valInput.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.stopPropagation(); this._applyEditor(); }
      if (e.key === "Escape") { e.stopPropagation(); this._closeEditor(); }
    });

    this._outsideClick = e => {
      if (this._editorOpen &&
          !this._editor.contains(e.target) &&
          !this.svg.contains(e.target)) {
        this._closeEditor();
      }
    };
    document.addEventListener("mousedown", this._outsideClick);
  }

  // ── Formatting ─────────────────────────────────────────────────────────────
  //
  // FIX: _formatValue handles full range correctly including pF
  // FIX: _decomposeValue returns matching unit string for <select> option values

  _formatValue(f) {
    if (!f || f <= 0) return "0";
    if (f >= 1)       return `${+f.toPrecision(4)}F`;
    if (f >= 1e-3)    return `${+(f * 1e3).toPrecision(3)}mF`;
    if (f >= 1e-6)    return `${+(f * 1e6).toPrecision(3)}µF`;
    if (f >= 1e-9)    return `${+(f * 1e9).toPrecision(3)}nF`;
    if (f >= 1e-12)   return `${+(f * 1e12).toPrecision(3)}pF`;
    return `${+(f * 1e12).toPrecision(3)}pF`;  // sub-pF → show as pF
  }

  // FIX: Returns unit as string matching <option value="..."> exactly
  _decomposeValue(f) {
    if (f >= 1)     return { val: +(f).toPrecision(4),        unit: "1",     unitStr: "F"   };
    if (f >= 1e-3)  return { val: +(f * 1e3).toPrecision(4), unit: "1e-3",  unitStr: "mF"  };
    if (f >= 1e-6)  return { val: +(f * 1e6).toPrecision(4), unit: "1e-6",  unitStr: "µF"  };
    if (f >= 1e-9)  return { val: +(f * 1e9).toPrecision(4), unit: "1e-9",  unitStr: "nF"  };
    // pF and below
    return               { val: +(f * 1e12).toPrecision(4), unit: "1e-12", unitStr: "pF"  };
  }
}