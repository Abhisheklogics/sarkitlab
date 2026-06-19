export default function MQ135SVG(s, cfg, modelName) {
  const pcb = s?.pcb || "#00897b";
  const ring = s?.ring || "#66bb6a";
  const mesh = s?.mesh || "#757575";
  const glow = s?.glow || "#c8e6c9";

  return `
<defs>

  <!-- SHADOW -->
  <filter id="boardShadow_${modelName}"
          x="-20%"
          y="-20%"
          width="160%"
          height="160%">

    <feDropShadow dx="2"
                  dy="5"
                  stdDeviation="5"
                  flood-opacity="0.30"/>
  </filter>


  <!-- SENSOR MESH -->
  <pattern id="sensorMesh_${modelName}"
           width="4"
           height="4"
           patternUnits="userSpaceOnUse"
           patternTransform="rotate(45)">

    <rect width="4"
          height="4"
          fill="#222222"/>

    <line x1="0"
          y1="0"
          x2="0"
          y2="4"
          stroke="#444444"
          stroke-width="1.2"/>

    <line x1="0"
          y1="0"
          x2="4"
          y2="0"
          stroke="#444444"
          stroke-width="1.2"/>

  </pattern>


  <!-- METAL PIN -->
  <linearGradient id="metalPin_${modelName}"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%">

    <stop offset="0%" stop-color="#b5b5b5"/>
    <stop offset="30%" stop-color="#dbdbdb"/>
    <stop offset="70%" stop-color="#949494"/>
    <stop offset="100%" stop-color="#6e6e6e"/>

  </linearGradient>


  <!-- SILVER -->
  <linearGradient id="silverPad_${modelName}"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%">

    <stop offset="0%" stop-color="#eeeeee"/>
    <stop offset="100%" stop-color="#b5b5b5"/>

  </linearGradient>


  <!-- SENSOR SHADE -->
  <radialGradient id="sensorRingShade_${modelName}"
                  cx="50%"
                  cy="50%"
                  r="50%"
                  fx="30%"
                  fy="30%">

    <stop offset="90%"
          stop-color="#cccccc"
          stop-opacity="0"/>

    <stop offset="100%"
          stop-color="#555555"
          stop-opacity="0.4"/>

  </radialGradient>

</defs>


<!-- PCB -->
<rect x="6"
      y="2"
      width="88"
      height="142"
      rx="8"
      fill="${pcb}"/>


<!-- INNER PCB -->
<rect x="9"
      y="5"
      width="82"
      height="136"
      rx="6"
      fill="#ffffff"
      opacity="0.06"/>


<!-- TRACKS -->
<path d="M15 76 L15 118 L28 118"
      fill="none"
      stroke="rgba(0,0,0,0.3)"
      stroke-width="1.5"
      stroke-linecap="round"/>

<path d="M50 86 L50 104"
      fill="none"
      stroke="rgba(0,0,0,0.3)"
      stroke-width="1.5"
      stroke-linecap="round"/>

<circle cx="50"
        cy="106"
        r="2.5"
        fill="none"
        stroke="rgba(0,0,0,0.3)"
        stroke-width="1.5"/>

<path d="M85 76 L85 118 L72 118"
      fill="none"
      stroke="rgba(0,0,0,0.3)"
      stroke-width="1.5"
      stroke-linecap="round"/>


<!-- HOLES -->
<circle cx="18"
        cy="16"
        r="6"
        fill="url(#silverPad_${modelName})"/>

<circle cx="18"
        cy="16"
        r="3"
        fill="#ffffff"/>

<circle cx="82"
        cy="16"
        r="6"
        fill="url(#silverPad_${modelName})"/>

<circle cx="82"
        cy="16"
        r="3"
        fill="#ffffff"/>

<circle cx="18"
        cy="128"
        r="6"
        fill="url(#silverPad_${modelName})"/>

<circle cx="18"
        cy="128"
        r="3"
        fill="#ffffff"/>

<circle cx="82"
        cy="128"
        r="6"
        fill="url(#silverPad_${modelName})"/>

<circle cx="82"
        cy="128"
        r="3"
        fill="#ffffff"/>


<!-- SENSOR TITLE -->
<text x="50"
      y="13"
      fill="#ffffff"
      font-family="Times New Roman"
      font-size="9"
      font-weight="bold"
      text-anchor="middle"
      letter-spacing="1">

  ${modelName}

</text>


<!-- SENSOR -->
<g filter="url(#boardShadow_${modelName})">

  <!-- OUTER -->
  <circle cx="50"
          cy="50"
          r="26"
          fill="url(#silverPad_${modelName})"/>

  <!-- RING -->
  <circle cx="50"
          cy="50"
          r="24"
          fill="${ring}"/>

  <!-- INNER -->
  <circle cx="50"
          cy="50"
          r="16"
          fill="#111111"/>

  <!-- MESH -->
  <circle cx="50"
          cy="50"
          r="15"
          fill="url(#sensorMesh_${modelName})"/>

  <!-- SHADE -->
  <circle cx="50"
          cy="50"
          r="24"
          fill="url(#sensorRingShade_${modelName})"/>

</g>


<!-- HEATER COIL -->
<circle cx="50"
        cy="50"
        r="9"
        fill="none"
        stroke="#455a64"
        stroke-width="1.5"
        stroke-dasharray="3 2"
        opacity="0.7"/>


<!-- GAS BAR -->
<rect x="77"
      y="36"
      width="8"
      height="42"
      rx="2"
      fill="#263238"
      stroke="#607d8b"
      stroke-width="1"/>

<rect id="gasFill"
      x="78.5"
      y="76"
      width="5"
      height="0"
      rx="1.5"
      fill="${ring}"/>


<!-- STATUS LED -->
<circle data-led="true"
        cx="82"
        cy="26"
        r="4"
        fill="#263238"
        stroke="${glow}"
        stroke-width="1.2"/>

<circle cx="80.7"
        cy="24.8"
        r="1"
        fill="#fff"
        opacity="0.5"/>


<!-- LABELS -->
<g font-family="Times New Roman"
   font-size="5"
   font-weight="bold"
   fill="#ffffff"
   text-anchor="middle">

  <text x="40"
        y="111"
        transform="rotate(-90 40 111)">
    VCC
  </text>

  <text x="50"
        y="111"
        transform="rotate(-90 50 111)">
    GND
  </text>

  <text x="60"
        y="111"
        transform="rotate(-90 60 111)">
    A0
  </text>

</g>


<!-- CONNECTOR BASE -->
<rect x="33"
      y="116"
      width="34"
      height="10"
      rx="2"
      fill="#333333"
      stroke="#444444"
      stroke-width="1"/>


<!-- PIN TOPS -->
<g fill="#111111"
   stroke="#999999"
   stroke-width="1.5">

  <circle cx="40"
          cy="121"
          r="3"/>

  <circle cx="50"
          cy="121"
          r="3"/>

  <circle cx="60"
          cy="121"
          r="3"/>

</g>


<!-- METAL PINS -->
<g filter="url(#boardShadow_${modelName})">

  <rect x="38"
        y="122"
        width="4"
        height="24"
        rx="2"
        fill="url(#metalPin_${modelName})"/>

  <rect x="48"
        y="122"
        width="4"
        height="24"
        rx="2"
        fill="url(#metalPin_${modelName})"/>

  <rect x="58"
        y="122"
        width="4"
        height="24"
        rx="2"
        fill="url(#metalPin_${modelName})"/>

</g>
`;
}
