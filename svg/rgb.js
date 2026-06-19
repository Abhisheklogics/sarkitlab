export default class RGBLed {
  constructor(svgElement = null) {
    this.svg = svgElement ?? this.createSVG();

    this.lookup = {
      bulb: this.svg.querySelector("#rgbBulb"),
      glow: this.svg.querySelector("#rgbGlow")
    };

    this.channels = { R: 0, G: 0, B: 0 };
  }

  applyElectrical(current = 0, intensity = 0, pinId) {
    if (current <= 0 || intensity <= 0) {
      this.channels[pinId] = 0;
      this.render();
      return;
    }
    this.channels[pinId] = Math.min(intensity, 1);
    this.render();
  }

 createSVG() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "120");
  svg.setAttribute("height", "220");
  svg.setAttribute("viewBox", "0 0 160 325");

  svg.innerHTML = `
    <defs>
      <linearGradient id="ledGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,0,0,0.35)"/>
        <stop offset="100%" stop-color="rgba(180,0,0,0.2)"/>
      </linearGradient>

      <linearGradient id="shine" stroke="black" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.6)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
    </defs>

    <!-- LED Dome -->
    <rect id="rgbBulb"  x="50" y="25" width="100" height="160" rx="50" fill="url(#ledGradient)"/>

    <!-- Glow ellipse (same id as before) -->
    <ellipse id="rgbGlow" cx="100" cy="165" rx="55" ry="20" fill="rgba(180,0,0,0.25)" opacity="0"/>

    <!-- Shine -->
    <path d="M70 35 C85 25, 95 25, 105 35 L105 130 C95 120, 85 120, 70 130 Z" fill="url(#shine)"/>

    <!-- Legs -->
    <svg x="13" y="1" width="210" height="340" viewBox="0 0 360 290">
      <!-- Left outer leg -->
      <path d="M80 150 C 80 200, 40 220, 40 300" stroke="#7e7e7e" stroke-width="15" fill="none" stroke-linecap="round"/>
      <!-- Left inner leg -->
      <path d="M120 150 C 120 200, 90 220, 90 300" stroke="#7e7e7e" stroke-width="15" fill="none" stroke-linecap="round"/>
      <!-- Right inner leg -->
      <path d="M180 150 C 180 200, 210 220, 210 300" stroke="#7e7e7e" stroke-width="15" fill="none" stroke-linecap="round"/>
      <!-- Right outer leg -->
      <path d="M220 150 C 220 200, 260 220, 260 300" stroke="#7e7e7e" stroke-width="15" fill="none" stroke-linecap="round"/>
    </svg>
  `;

  return svg;
}


  turnOn(color, intensity = 1) {
    if (!this.lookup.bulb || !this.lookup.glow) return;
    this.lookup.bulb.setAttribute("fill", color);
    this.lookup.glow.setAttribute("fill", color);
    this.lookup.glow.setAttribute("opacity", 0.3 + intensity * 0.5);
  }

  turnOff() {
    if (!this.lookup.bulb || !this.lookup.glow) return;
    this.lookup.bulb.setAttribute("fill", "url(#ledGradient)");
    this.lookup.glow.setAttribute("opacity", "0");
  }

  render() {
    const R = Math.floor(255 * this.channels.R);
    const G = Math.floor(255 * this.channels.G);
    const B = Math.floor(255 * this.channels.B);

    if (R === 0 && G === 0 && B === 0) {
      this.turnOff();
      return;
    }

    const color = `rgb(${R},${G},${B})`;
    const maxIntensity = Math.max(this.channels.R, this.channels.G, this.channels.B);
    this.turnOn(color, maxIntensity);
  }

  getElement() {
    return this.svg;
  }
}



