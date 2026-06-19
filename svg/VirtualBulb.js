export default class VirtualBulb {

  constructor(resistance = 60, onEdit) {
    this.resistance  = resistance;
    this.powered     = false;
    this.intensity   = 0;
    this.onEdit      = onEdit ?? null;
    this._tempNorm   = 0;
    this._uid        = Math.random().toString(36).slice(2, 7);
    this.svg         = this._createSVG();
    this._bindEvents();
  }

  getElement() { return this.svg; }

  setOn(intensity = 1) {
    this.powered   = true;
    this.intensity = Math.max(0, Math.min(1, intensity));
    this._applyGlow(this.intensity);
  }

  setOff() {
    this.powered   = false;
    this.intensity = 0;
    this._applyGlow(0);
  }

  applyElectrical(current = 0, intensity = 0) {
    if (current <= 0 || intensity <= 0) this.setOff();
    else                                this.setOn(intensity);
  }

  reset() {
    this.powered    = false;
    this.intensity  = 0;
    this.resistance = 60;
    this._tempNorm  = 0;
    this._applyGlow(0);
  }

  _createSVG() {
    const u   = this._uid;
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "90");
    svg.setAttribute("height",  "120");
    svg.setAttribute("viewBox", "0 0 90 120");
    svg.style.overflow = "visible";
    svg.style.cursor   = "default";

    svg.innerHTML = `
      <defs>
        <radialGradient id="bulbGlow-${u}" cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stop-color="#fff9c4" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ff6f00" stop-opacity="0"/>
        </radialGradient>

        <radialGradient id="bulbFill-${u}" cx="40%" cy="35%" r="60%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#37474f" stop-opacity="1"/>
        </radialGradient>

        <radialGradient id="bulbFillOn-${u}" cx="40%" cy="35%" r="60%">
          <stop offset="0%"   stop-color="#fff9c4" stop-opacity="1"/>
          <stop offset="60%"  stop-color="#ffb300" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#e65100" stop-opacity="0.8"/>
        </radialGradient>

        <filter id="bulbBloom-${u}" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <ellipse id="glowHalo-${u}" cx="45" cy="42" rx="36" ry="38"
               fill="url(#bulbGlow-${u})" opacity="0" filter="url(#bulbBloom-${u})"/>

      <path id="bulbGlass-${u}"
            d="M 45,8 C 18,8 12,28 12,44 C 12,65 25,76 32,82
               L 32,92 L 58,92 L 58,82 C 65,76 78,65 78,44
               C 78,28 72,8 45,8 Z"
            fill="url(#bulbFill-${u})"
            stroke="#78909c" stroke-width="2"/>

      <line id="fil1-${u}" x1="37" y1="82" x2="37" y2="56" stroke="#78909c" stroke-width="1.2" opacity="0.6"/>
      <line id="fil2-${u}" x1="53" y1="82" x2="53" y2="56" stroke="#78909c" stroke-width="1.2" opacity="0.6"/>

      <polyline id="filament-${u}"
                points="37,56 40,48 43,54 45,46 47,54 50,48 53,56"
                fill="none" stroke="#90a4ae" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"/>

      <rect x="30" y="92"  width="30" height="4" rx="1" fill="#546e7a"/>
      <rect x="30" y="97"  width="30" height="4" rx="1" fill="#455a64"/>
      <rect x="30" y="102" width="30" height="4" rx="1" fill="#546e7a"/>
      <rect x="32" y="106" width="26" height="6" rx="2" fill="#37474f"/>

      <line x1="36" y1="112" x2="36" y2="120" stroke="#9e9e9e" stroke-width="4" stroke-linecap="round"/>
      <line x1="54" y1="112" x2="54" y2="120" stroke="#9e9e9e" stroke-width="4" stroke-linecap="round"/>

      <ellipse cx="35" cy="28" rx="7" ry="12" fill="white" opacity="0.12"/>
    `;
    return svg;
  }

  _applyGlow(t) {
    const u        = this._uid;
    const glass    = this.svg.querySelector(`#bulbGlass-${u}`);
    const halo     = this.svg.querySelector(`#glowHalo-${u}`);
    const filament = this.svg.querySelector(`#filament-${u}`);
    const fil1     = this.svg.querySelector(`#fil1-${u}`);
    const fil2     = this.svg.querySelector(`#fil2-${u}`);
    const glow     = this.svg.querySelector(`#bulbGlow-${u}`);

    if (t <= 0) {
      if (glass)    glass.setAttribute("fill", `url(#bulbFill-${u})`);
      if (halo)     halo.setAttribute("opacity", "0");
      if (filament) filament.setAttribute("stroke", "#90a4ae");
      if (fil1)     fil1.setAttribute("stroke", "#78909c");
      if (fil2)     fil2.setAttribute("stroke", "#78909c");
      if (glow) {
        glow.children[0].setAttribute("stop-opacity", "0");
        glow.children[1].setAttribute("stop-opacity", "0");
      }
    } else {
      const r      = 255;
      const g      = Math.round(180 * t + 75);
      const b      = Math.round(20 * t);
      const warmth = `rgba(${r},${g},${b},${t})`;

      if (glass)    glass.setAttribute("fill", `url(#bulbFillOn-${u})`);
      if (halo)     halo.setAttribute("opacity", String(t * 0.85));
      if (filament) {
        filament.setAttribute("stroke", `rgb(255,${Math.round(200 * t + 55)},${Math.round(50 * t)})`);
        filament.setAttribute("stroke-width", String(1.5 + t * 1.5));
      }
      if (fil1) fil1.setAttribute("stroke", warmth);
      if (fil2) fil2.setAttribute("stroke", warmth);
      if (glow) {
        glow.children[0].setAttribute("stop-opacity", String(t * 0.9));
        glow.children[1].setAttribute("stop-opacity", String(t * 0.6));
      }
    }
  }

  _bindEvents() {
    this.svg.addEventListener("dblclick", e => e.stopPropagation());
  }
}