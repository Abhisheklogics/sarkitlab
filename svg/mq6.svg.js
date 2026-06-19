export default function MQ6SVG(s, cfg, modelName) {
  return `
<svg viewBox="0 0 450 770">
  <defs>
    <pattern id="sensorMesh_${modelName}" width="5" height="5" patternUnits="userSpaceOnUse">
      <circle cx="2.5" cy="2.5" r="1.5" fill="#444444" />
    </pattern>

    <linearGradient id="metalPin_${modelName}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#b5b5b5" />
      <stop offset="30%" stop-color="#dbdbdb" />
      <stop offset="70%" stop-color="#949494" />
      <stop offset="100%" stop-color="#6e6e6e" />
    </linearGradient>

    <linearGradient id="silverPad_${modelName}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="30%" stop-color="#e0e0e0" />
      <stop offset="70%" stop-color="#aeaeae" />
      <stop offset="100%" stop-color="#8c8c8c" />
    </linearGradient>

    <radialGradient id="innerDomeShade_${modelName}" cx="50%" cy="50%" r="50%">
      <stop offset="70%" stop-color="#b8b8b8" />
      <stop offset="95%" stop-color="#7a7a7a" />
      <stop offset="100%" stop-color="#4e4e4e" />
    </radialGradient>

    <filter id="dropShadow_${modelName}" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="3" dy="5" stdDeviation="4" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- Lighter Teal Blue PCB background based on the image -->
  <rect x="0" y="0" width="450" height="770" rx="40" fill="#0082a3" />
  
  <!-- PCB Traces -->
  <path d="M 45 450 L 45 710 L 95 710" fill="none" stroke="#005973" stroke-width="6" stroke-linecap="round" />
  <path d="M 225 555 L 225 620" fill="none" stroke="#005973" stroke-width="6" stroke-linecap="round" />
  <circle cx="225" cy="627" r="9" fill="none" stroke="#005973" stroke-width="6" />
  <path d="M 405 450 L 405 710 L 355 710" fill="none" stroke="#005973" stroke-width="6" stroke-linecap="round" />

  <!-- Mounting holes -->
  <circle cx="45" cy="45" r="30" fill="url(#silverPad_${modelName})" />
  <circle cx="45" cy="45" r="18" fill="#ffffff" />
  <circle cx="405" cy="45" r="30" fill="url(#silverPad_${modelName})" />
  <circle cx="405" cy="45" r="18" fill="#ffffff" />
  <circle cx="45" cy="695" r="30" fill="url(#silverPad_${modelName})" />
  <circle cx="45" cy="695" r="18" fill="#ffffff" />
  <circle cx="405" cy="695" r="30" fill="url(#silverPad_${modelName})" />
  <circle cx="405" cy="695" r="18" fill="#ffffff" />

  <text x="225" y="60" fill="#ffffff" font-family="'Times New Roman', Times, serif" font-size="52" font-weight="bold" text-anchor="middle" letter-spacing="2">MQ-6</text>

  <!-- Sensor Dome -->
  <g filter="url(#dropShadow_${modelName})">
    <circle cx="225" cy="285" r="195" fill="url(#silverPad_${modelName})" />
    <circle cx="225" cy="285" r="172" fill="#b8b8b8" />
    <circle cx="225" cy="285" r="155" fill="url(#innerDomeShade_${modelName})" />
    <circle cx="225" cy="285" r="155" fill="url(#sensorMesh_${modelName})" />
  </g>

  <!-- LED Labels -->
  <g font-family="'Times New Roman', Times, serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">
    <text x="168" y="500" transform="rotate(90, 168, 500)">PWR</text>
    <text x="342" y="500" transform="rotate(90, 342, 500)">DAT</text>
  </g>

  <!-- LEDs -->
  <g filter="url(#dropShadow_${modelName})">
    <rect x="53" y="540" width="44" height="76" rx="4" fill="#ffffff" />
    <rect x="61" y="548" width="28" height="60" rx="2" fill="#ffeb3b" opacity="0.9" />
  </g>

  <g filter="url(#dropShadow_${modelName})">
    <rect x="353" y="540" width="44" height="76" rx="4" fill="#ffffff" />
    <rect data-led="true" x="361" y="548" width="28" height="60" rx="2" fill="#e0e0e0" opacity="0.9" />
  </g>

  <!-- Designer Label -->
  <text x="25" y="610" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="bold" letter-spacing="0.5" transform="rotate(-90, 25, 610)">Design by Electrodedy</text>


  <!-- MQ3 STYLE LEG UI (Scaled for 450x770, 4 Legs) -->
  <g transform="translate(0, 130) scale(4.5)">
    <!-- LABELS -->
    <g font-family="Times New Roman" font-size="5" font-weight="bold" fill="#ffffff" text-anchor="middle">
      <text x="35" y="111" transform="rotate(-90 35 111)">VCC</text>
      <text x="45" y="111" transform="rotate(-90 45 111)">GND</text>
      <text x="55" y="111" transform="rotate(-90 55 111)">D0</text>
      <text x="65" y="111" transform="rotate(-90 65 111)">A0</text>
    </g>

    <!-- CONNECTOR BASE -->
    <rect x="28" y="116" width="44" height="10" rx="2" fill="#333333" stroke="#444444" stroke-width="1"/>

    <!-- PIN TOPS -->
    <g fill="#111111" stroke="#999999" stroke-width="1.5">
      <circle cx="35" cy="121" r="3"/>
      <circle cx="45" cy="121" r="3"/>
      <circle cx="55" cy="121" r="3"/>
      <circle cx="65" cy="121" r="3"/>
    </g>

    <!-- METAL PINS -->
    <g filter="url(#boardShadow_${modelName})">
      <rect x="33" y="122" width="4" height="24" rx="2" fill="url(#metalPin_${modelName})"/>
      <rect x="43" y="122" width="4" height="24" rx="2" fill="url(#metalPin_${modelName})"/>
      <rect x="53" y="122" width="4" height="24" rx="2" fill="url(#metalPin_${modelName})"/>
      <rect x="63" y="122" width="4" height="24" rx="2" fill="url(#metalPin_${modelName})"/>
    </g>
  </g>

</svg>
`;
}