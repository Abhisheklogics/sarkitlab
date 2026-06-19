"use strict";

export default class ZenerDiode {
  constructor(pins = {}, _unused, id, vz = 5.1, onEdit) {
    this.id          = id ?? "zener";
    this.vz          = vz;
    this.vf          = 0.6;
    this.rKnee       = 5;
    this.iSat        = 1e-14;
    this.onEdit      = onEdit ?? null;
    this._editorOpen = false;

    this.state   = "OFF";
    this.voltage = 0;
    this.current = 0;
    this.power   = 0;

    this.svg     = this._createSVG();
    this._editor = this._createEditor();
    document.body.appendChild(this._editor);
    this._bindEvents();
  }

  getElement() { return this.svg; }

  setVz(vz) {
    this.vz = vz;
    this._updateLabel();
    this.onEdit?.(this);
  }

  reset() {
    this.vz    = 5.1;
    this.vf    = 0.6;
    this.rKnee = 5;
    this._updateLabel();
    this.onEdit?.(this);
  }

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "50");
    svg.setAttribute("height",  "120");
    svg.setAttribute("viewBox", "0 0 50 120");
    svg.style.overflow = "visible";
    svg.style.cursor   = "pointer";

    svg.innerHTML = `
      <line x1="25" y1="0"  x2="25" y2="28"  stroke="#9e9e9e" stroke-width="4" stroke-linecap="round"/>
      <rect x="8"  y="28" width="34" height="64" rx="3" fill="#111" opacity="0.4"/>
      <rect x="7"  y="27" width="36" height="66" rx="3" fill="#2c2c2c"/>
      <rect x="7"  y="55" width="36" height="10" fill="#546e7a"/>
      <rect x="8"  y="28" width="10" height="64" rx="2" fill="white" opacity="0.04"/>
      <line x1="7"  y1="55" x2="13" y2="55" stroke="#90a4ae" stroke-width="1.5"/>
      <line x1="37" y1="65" x2="43" y2="65" stroke="#90a4ae" stroke-width="1.5"/>
      <line x1="25" y1="93" x2="25" y2="120" stroke="#9e9e9e" stroke-width="4" stroke-linecap="round"/>
      <text id="zenerLabel" x="25" y="65"
            font-size="8" font-family="monospace" font-weight="bold"
            fill="#eceff1" text-anchor="middle" dominant-baseline="middle"
            pointer-events="none">${this.vz}V</text>
      <text x="25" y="22"  font-size="7" font-family="monospace" fill="#80cbc4" text-anchor="middle" pointer-events="none">A</text>
      <text x="25" y="112" font-size="7" font-family="monospace" fill="#ef9a9a" text-anchor="middle" pointer-events="none">K</text>
      <text x="25" y="106" font-size="5.5" font-family="monospace" fill="#546e7a" text-anchor="middle" pointer-events="none">dblclick</text>
    `;
    return svg;
  }

  _updateLabel() {
    const lbl = this.svg.querySelector("#zenerLabel");
    if (lbl) lbl.textContent = `${this.vz}V`;
  }

  _createEditor() {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position:      "fixed",
      display:       "none",
      flexDirection: "column",
      gap:           "10px",
      background:    "#1a2332",
      border:        "1.5px solid #546e7a",
      borderRadius:  "10px",
      padding:       "14px 16px",
      boxShadow:     "0 8px 32px rgba(0,0,0,0.6)",
      zIndex:        "99999",
      minWidth:      "240px",
      fontFamily:    "monospace",
      color:         "#eceff1",
    });

    div.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#80cbc4;letter-spacing:1px;margin-bottom:2px;">⚡ ZENER PARAMETERS</div>

      <div style="font-size:11px;color:#78909c;">Breakdown voltage (Vz)</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="vzVal" type="number" min="0.1" step="0.1" value="${this.vz}"
          style="flex:1;background:#0d1929;border:1px solid #546e7a;border-radius:6px;color:#eceff1;font-size:14px;font-family:monospace;padding:6px 10px;outline:none;"/>
        <span style="color:#80cbc4;font-weight:bold;">V</span>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${["1.8","2.4","2.7","3.0","3.3","3.6","3.9","4.3","4.7","5.1","5.6","6.2","6.8","7.5","8.2","9.1","10","12","15","18","24"]
          .map(v => `<button data-vz="${v}" style="background:#263238;border:1px solid #455a64;border-radius:4px;color:#b0bec5;font-size:10px;font-family:monospace;padding:3px 6px;cursor:pointer;">${v}V</button>`)
          .join("")}
      </div>

      <div style="border-top:1px solid #37474f;padding-top:8px;display:flex;flex-direction:column;gap:8px;">
        <div>
          <div style="font-size:11px;color:#78909c;margin-bottom:4px;">Forward drop (Vf)</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="vfVal" type="number" min="0.1" step="0.05" value="${this.vf}"
              style="width:80px;background:#0d1929;border:1px solid #455a64;border-radius:6px;color:#eceff1;font-size:13px;font-family:monospace;padding:5px 8px;outline:none;"/>
            <span style="color:#78909c;font-size:11px;">V  (typically 0.6V)</span>
          </div>
        </div>
        <div>
          <div style="font-size:11px;color:#78909c;margin-bottom:4px;">Knee resistance (Rk) — breakdown sharpness</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="rkVal" type="number" min="0.1" step="0.5" value="${this.rKnee}"
              style="width:80px;background:#0d1929;border:1px solid #455a64;border-radius:6px;color:#eceff1;font-size:13px;font-family:monospace;padding:5px 8px;outline:none;"/>
            <span style="color:#78909c;font-size:11px;">Ω  (lower = sharper clamp)</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:2px;">
        <button id="zenerApply"  style="flex:1;background:#37474f;border:none;border-radius:6px;color:white;font-size:13px;font-family:monospace;padding:7px;cursor:pointer;font-weight:700;letter-spacing:1px;">APPLY</button>
        <button id="zenerCancel" style="flex:1;background:#263238;border:none;border-radius:6px;color:#b0bec5;font-size:13px;font-family:monospace;padding:7px;cursor:pointer;">CANCEL</button>
      </div>
    `;
    return div;
  }

  _openEditor(x, y) {
    this._editorOpen = true;
    const d = this._editor;
    d.querySelector("#vzVal").value = this.vz;
    d.querySelector("#vfVal").value = this.vf;
    d.querySelector("#rkVal").value = this.rKnee;
    d.style.display = "flex";
    d.style.left    = `${x}px`;
    d.style.top     = `${y}px`;
    requestAnimationFrame(() => {
      const r = d.getBoundingClientRect();
      if (r.right  > window.innerWidth)  d.style.left = `${window.innerWidth  - r.width  - 10}px`;
      if (r.bottom > window.innerHeight) d.style.top  = `${window.innerHeight - r.height - 10}px`;
    });
  }

  _closeEditor() {
    this._editorOpen = false;
    this._editor.style.display = "none";
  }

  _applyEditor() {
    const vz = parseFloat(this._editor.querySelector("#vzVal").value);
    const vf = parseFloat(this._editor.querySelector("#vfVal").value);
    const rk = parseFloat(this._editor.querySelector("#rkVal").value);
    if (!isNaN(vz) && vz > 0) this.vz    = vz;
    if (!isNaN(vf) && vf > 0) this.vf    = vf;
    if (!isNaN(rk) && rk > 0) this.rKnee = rk;
    this._updateLabel();
    this.onEdit?.(this);
    this._closeEditor();
  }

  _bindEvents() {
    this.svg.addEventListener("dblclick", e => {
      e.stopPropagation();
      this._openEditor(e.clientX + 12, e.clientY + 12);
    });

    this._editor.querySelector("#zenerApply").addEventListener("click",  e => { e.stopPropagation(); this._applyEditor(); });
    this._editor.querySelector("#zenerCancel").addEventListener("click", e => { e.stopPropagation(); this._closeEditor(); });

    this._editor.querySelectorAll("button[data-vz]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this.vz = parseFloat(btn.dataset.vz);
        this._updateLabel();
        this.onEdit?.(this);
        this._closeEditor();
      });
    });

    this._editor.querySelector("#vzVal").addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.stopPropagation(); this._applyEditor(); }
      if (e.key === "Escape") { e.stopPropagation(); this._closeEditor(); }
    });

    this._outsideClick = e => {
      if (this._editorOpen && !this._editor.contains(e.target) && !this.svg.contains(e.target)) {
        this._closeEditor();
      }
    };
    document.addEventListener("mousedown", this._outsideClick);
  }

  destroy() {
    this._editor.remove();
    document.removeEventListener("mousedown", this._outsideClick);
  }
}