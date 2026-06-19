// ═══════════════════════════════════════════════════════════════
//  PotentiometerIC.js  — Fixed
//
//  Fixes:
//    1. position kabhi 1 se zyada nahi jaata (pehle 1.25 tak jaata tha)
//    2. simEngine tight coupling hataya — onchange callback use karo
//    3. wiper rotation angle sahi — 0% = -135deg, 100% = +135deg
//    4. reset() properly 50% pe wapas aata hai
// ═══════════════════════════════════════════════════════════════

export default class PotentiometerIC {
  /**
   * @param {string}   id        — component ID
   * @param {object}   data      — JSON component data
   * @param {Function} [onChange] — called when knob rotates → (position) => void
   *                               SimEngine yahan resolveElectrical inject kare
   */
  constructor(id, data, onChange = null) {
    this.id       = id;
    this.data     = data;
    this.onChange = onChange;   // FIX 2: callback instead of simEngine ref

    // Simulation state
    this.position = 0.5;        // 0.0 → 1.0
    this.maxRes   = 10_000;     // Ω

    this.svg = this._createSVG();
    this._updateVisual();       // initial render
  }

  // ── Knob click handler ────────────────────────────────────────
  rotateKnob() {
    // FIX 1: step 25%, wrap at 100%
    this.position = parseFloat(((this.position + 0.25) % 1.25).toFixed(2));
    if (this.position > 1.0) this.position = 0.0;

    this._updateVisual();

    // Notify SimEngine
    this.onChange?.();
  }

  // ── Visual update ─────────────────────────────────────────────
  _updateVisual() {
    const wiperEl = this.svg.querySelector("#wiper-line");
    const textEl  = this.svg.querySelector("#pot-value");

    if (wiperEl) {
      // FIX 3: 0% = -135°, 50% = 0°, 100% = +135°
      const deg = (this.position * 270) - 135;
      wiperEl.setAttribute("transform", `rotate(${deg}, 50, 55)`);
    }

    if (textEl) {
      textEl.textContent = Math.round(this.position * 100) + "%";
    }
  }

  // ── Reset ─────────────────────────────────────────────────────
  reset() {
    this.position = 0.5;        // FIX 4: 50% reset (pehle 0% tha)
    this._updateVisual();
  }

  // ── SVG ───────────────────────────────────────────────────────
  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 140");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "140");
    svg.style.cursor = "pointer";

    svg.innerHTML = `
      <!-- PCB base -->
      <rect x="5" y="5" width="90" height="130" rx="6" fill="#1a3a1a"/>

      <!-- Pot body -->
      <circle cx="50" cy="55" r="38" fill="#2c3e50" stroke="#aaa" stroke-width="1.5"/>

      <!-- Track arc indicator -->
      <circle cx="50" cy="55" r="28" fill="none" stroke="#445" stroke-width="4"
              stroke-dasharray="132 44" stroke-dashoffset="44"/>

      <!-- Knob -->
      <circle cx="50" cy="55" r="22" fill="#5dade2" stroke="#2980b9" stroke-width="1.5"/>

      <!-- Wiper line — rotates around center (50,55) -->
      <line id="wiper-line"
            x1="50" y1="55" x2="50" y2="33"
            stroke="#1b2631" stroke-width="5" stroke-linecap="round"
            transform="rotate(0, 50, 55)"/>

      <!-- Value label -->
      <text id="pot-value"
            x="50" y="60"
            fill="#ffffff" font-size="11" font-weight="bold"
            text-anchor="middle" pointer-events="none">50%</text>

      <!-- Pin labels -->
      <text x="17" y="118" font-size="7" fill="#aaffaa" font-family="monospace">T1</text>
      <text x="46" y="118" font-size="7" fill="#aaffaa" font-family="monospace">W</text>
      <text x="72" y="118" font-size="7" fill="#aaffaa" font-family="monospace">T2</text>

      <!-- Pins -->
      <rect x="20" y="118" width="5" height="14" rx="1" fill="#c0c0c0"/>
      <rect x="47" y="118" width="5" height="14" rx="1" fill="#c0c0c0"/>
      <rect x="72" y="118" width="5" height="14" rx="1" fill="#c0c0c0"/>
    `;

    svg.addEventListener("click", () => this.rotateKnob());
    return svg;
  }

  getElement() { return this.svg; }
}