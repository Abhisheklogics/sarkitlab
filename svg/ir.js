export default class IRSensor {

    constructor(pins, digitalInputsRef, loopRunning) {
        this.pins = pins;
        this.digitalInputs = digitalInputsRef;
        this.state = 0;
        this.range = false;
        this.loopRunning = loopRunning;
        this.isDragging = false;
        this.wasDragging = false;

        this.svg = this.createSvg();
        this.circle = this.svg.querySelector("#sensorCircle");
        console.log(this.circle);

        this.svg.addEventListener("click", (e) => {
            this.showRange();
            this.showCircle();
        });

        document.addEventListener("click", (e) => {
            if (this.wasDragging) {
                this.wasDragging = false;
                return;
            }

            if (!this.svg.contains(e.target)) {
                console.log("Clicked outside IR sensor");
                this.hideRange();
                this.hideCircle();   // 👈 yahi add kiya
            }
        });

        this.circle.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            this.mouseDown(e);         // ← mouseDown handles everything now
        });

        // Stop click from bubbling to document after drag/click on circle
        this.circle.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    createSvg() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        svg.setAttribute("width", "200");
        svg.setAttribute("height", "200");
        svg.setAttribute("viewBox", "0 0 100 120");
        svg.setAttribute("id", "ir-sensor");
        svg.setAttribute("overflow", "visible");   // ← FIX: consistent overflow across browsers
        svg.style.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.5))';

        svg.innerHTML = `
                <!-- ================= DEFINITIONS: COLORS & GRADIENTS ================= -->
        <defs>

            <!-- PCB base red gradient -->
            <linearGradient id="pcbBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6c6c" />
                <stop offset="100%" style="stop-color:#ff0000" />
            </linearGradient>

            <!-- Clear LED / glass-like highlight -->
            <radialGradient id="clearLed" cx="50%" cy="40%" r="50%">
                <stop offset="0%" style="stop-color:#ffffff; stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#cfd8dc; stop-opacity:0.9" />
            </radialGradient>

            <!-- Metallic shine effect -->
            <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#999" />
                <stop offset="50%" style="stop-color:#fff" />
                <stop offset="100%" style="stop-color:#888" />
            </linearGradient>

            <!-- IC body dark gradient -->
            <linearGradient id="icBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#5a5757" />
                <stop offset="100%" style="stop-color:#222222" />
            </linearGradient>

            <!-- IC leg metallic gradient -->
            <linearGradient id="legGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#888" />
                <stop offset="50%" style="stop-color:#fff" />
                <stop offset="100%" style="stop-color:#676767" />
            </linearGradient>

            <!-- Gold pin / connector gradient -->
            <linearGradient id="goldPin" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#bf953f" />
                <stop offset="50%" stop-color="#fcf6ba" />
                <stop offset="100%" stop-color="#aa771c" />
            </linearGradient>

            <!-- Background panel gradient -->
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#4f74d6" />
                <stop offset="100%" stop-color="#2c4a8a" />
            </linearGradient>

            <!-- Gear main body gradient -->
            <radialGradient id="gearGrad" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stop-color="#4b6fd1" />
                <stop offset="100%" stop-color="#22345f" />
            </radialGradient>

            <!-- Gear teeth shading -->
            <linearGradient id="teethGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#3a56a0" />
                <stop offset="100%" stop-color="#1f2f63" />
            </linearGradient>

            <!-- Inner screw metal gradient -->
            <radialGradient id="screwGrad" cx="50%" cy="45%" r="55%">
                <stop offset="0%" stop-color="#ffffff" />
                <stop offset="100%" stop-color="#cfcab8" />
            </radialGradient>

            <!-- Screw cross highlight -->
            <linearGradient id="crossGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6a6a6a" />
                <stop offset="100%" stop-color="#2f2f2f" />
            </linearGradient>

        </defs>

        <!-- ================= MAIN PCB BOARD ================= -->
        <rect x="10" y="30" width="80" height="150" rx="1" fill="url(#pcbBlue)" stroke="#a50000" stroke-width="2" />

        <defs>
            <!-- Cylindrical body shading -->
            <linearGradient  id="bodyShade" x1="0" x2="1" y1="0" y2="0">
                <stop  />
                <stop  />
                <stop  />
            </linearGradient>

            <!-- Dome radial highlight -->
            <radialGradient id="dome" cx="0.5" cy="0.2" r="0.8">
                <stop offset="0" stop-color="#fff" stop-opacity="0.9" />
                <stop offset="1" stop-color="#bbbbbb" stop-opacity="0.4" />
            </radialGradient>

            <!-- Metal leg gradient -->
            <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#444" />
                <stop offset="0.3" stop-color="#bbb" />
                <stop offset="0.6" stop-color="#666" />
                <stop offset="1" stop-color="#222" />
            </linearGradient>



            <!-- Dome radial highlight -->
            <radialGradient id="dome" cx="0.5" cy="0.2" r="0.8">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0.9" />
                <stop offset="1" stop-color="#bbbbbb" stop-opacity="0.4" />
            </radialGradient>

            <!-- Metal leg gradient -->
            <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#444" />
                <stop offset="0.3" stop-color="#bbb" />
                <stop offset="0.6" stop-color="#666" />
                <stop offset="1" stop-color="#222" />
            </linearGradient>

            <!-- black led  -->

            <!-- Cylindrical body shading -->
            <linearGradient id="bbodyShade" x1="0" x2="1" y1="0" y2="0">
                <stop offset="2" stop-color="#000000" />
                <stop offset="0.9" stop-color="#000000" />
                <stop offset="5" stop-color="#000000" />
            </linearGradient>

            <!-- Dome radial highlight -->
            <radialGradient id="bdome" cx="0.5" cy="0.2" r="0.8">
                <stop offset="0" stop-color="#000" stop-opacity="0.9" />
                <stop offset="1" stop-color="#000" stop-opacity="0.4" />
            </radialGradient>

            <!-- Metal leg gradient -->
            <linearGradient id="bmetal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#000" />
                <stop offset="0.3" stop-color="#bbb" />
                <stop offset="0.6" stop-color="#666" />
                <stop offset="1" stop-color="#222" />
            </linearGradient>

            <!-- 3D metal effect for soldering holes -->
            <radialGradient id="solder3D" cx="35%" cy="30%" r="65%">
                <stop offset="0%" stop-color="#ffffff" />
                <stop offset="35%" stop-color="#e6e6e6" />
                <stop offset="70%" stop-color="#b5b5b5" />
                <stop offset="100%" stop-color="#7a7a7a" />
            </radialGradient>


        </defs>


        <!-- ================= COMPONENT OUTLINE MARKINGS ================= -->
        <rect x="13" y="65" width="14" height="10" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="29" y="65" width="14" height="10" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="44.5" y="65" width="14" height="10" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="60" y="65" width="14" height="10" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="75.5" y="65" width="14" height="10" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="20" y="113" width="14" height="6" fill="none" stroke="#ffff" stroke-width="1" />
        <circle cx="50" cy="160" r="6" fill="#fff" stroke="#ffff" stroke-width="0.6" />
        <circle cx="50" cy="160" r="8" fill="none" stroke="#ffff" stroke-width="0.5" />
        <!-- Top & bottom socket outlines -->
        <rect x="60" y="35" width="16" height="12" rx="0.5" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="20" y="35" width="16" height="12" rx="0.5" fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="62" y="113" width="16" height="6" rx="0." fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="29" y="151.5" width="8" height="15" rx="0." fill="none" stroke="#ffff" stroke-width="1" />
        <rect x="65" y="151.5" width="8" height="15" rx="0." fill="none" stroke="#ffff" stroke-width="1" />

        <!-- white led -->
        <g transform="translate(8, 0) scale(0.05)">
            <!-- Anode leg (round) -->
            <path fill="url(#metal)" stroke="#000" stroke-width="1.6" d="M363 576l17-39v-56l29-11-86-58-1-50-33-2 2 71 35 29-5 25-41 29-9 46
       52 15 3 5 6 200 29 0z" />

            <!-- Cathode leg (rectangular) -->
            <rect x="460" y="530" width="26" height="250" fill="url(#metal)" stroke="#000" stroke-width="1.6" />

            <!-- LED cylindrical body (3D shaded) -->
            <path fill="url(#bodyShade)" id="" stroke="#a0a0a0" stroke-width="1.6" opacity="0.55" d="M566 589s-92 43-337 11c-3-15-2-65-2-65l22-8s-3-304 1-330c-4-33 61-111
       132-112 95-2 142 87 141 92 11 28 22 345 22 345l19 5 2 62z" />

            <!-- Dome highlight -->
            <path fill="url(#dome)" opacity="0.45" d="M564 588s-91 42-331 11c-3-15-2-65-2-65l22-8s-3-302 1-327c-4-33 59-110
       129-111 93-2 140 87 138 92 11 28 22 342 22 342l19 5 2 61z" />

            <!-- LED soldering holes -->
            <circle cx="345" cy="800" r="45" fill="url(#solder3D)" stroke="#000" stroke-width="4" />
            <circle cx="472" cy="800" r="45" fill="url(#solder3D)" stroke="#000" stroke-width="4" />


            <!-- black led body -->
            <g transform="translate(800, 2) scale(1)">
                <!-- Anode leg (round) -->
                <path fill="url(#bmetal)" stroke="#000" stroke-width="1.6" d="M363 576l17-39v-56l29-11-86-58-1-50-33-2 2 71 35 29-5 25-41 29-9 46
       52 15 3 5 6 200 29 0z" />

                <!-- Cathode leg (rectangular) -->
                <rect x="460" y="530" width="26" height="250" fill="url(#bmetal)" stroke="#000" stroke-width="1.6" />

                <!-- LED cylindrical body (3D shaded) -->
                <path fill="#000" stroke="#a0a0a0" stroke-width="1.6" opacity="0.55" d="M566 589s-92 43-337 11c-3-15-2-65-2-65l22-8s-3-304 1-330c-4-33 61-111
       132-112 95-2 142 87 141 92 11 28 22 345 22 345l19 5 2 62z" />

                <!-- Dome highlight -->
                <path fill="#000" opacity="0.45" d="M564 588s-91 42-331 11c-3-15-2-65-2-65l22-8s-3-302 1-327c-4-33 59-110
       129-111 93-2 140 87 138 92 11 28 22 342 22 342l19 5 2 61z" />

            </g>
            <g transform="translate(795, 0) ">
                <circle cx="345" cy="800" r="45" fill="url(#solder3D)" stroke="#000" stroke-width="4" />
                <circle cx="472" cy="800" r="45" fill="url(#solder3D)" stroke="#000" stroke-width="4" />
            </g>
        </g>


        <!-- ================= IC + PIN DETAILS ================= -->

        <!-- First IC leg -->
        <rect x="14" y="69" width="12" height="2" fill="url(#legGrad)" />
        <rect x="17" y="66" width="6" height="8" rx="0.5" fill="url(#icBodyGrad)" />
        <rect x="21" y="66" width="1" height="8" rx="0.5" fill="url(#legGrad)" />

        <!-- Second IC leg -->
        <rect x="30" y="69" width="12" height="2" fill="url(#legGrad)" />
        <rect x="33" y="66" width="6" height="8" rx="0.5" fill="url(#icBodyGrad)" />
        <rect x="37" y="66" width="1" height="8" rx="0.5" fill="url(#legGrad)" />

        <!-- Third IC leg -->
        <rect x="46" y="69" width="12" height="2" fill="url(#legGrad)" />
        <rect x="49" y="66" width="6" height="8" rx="0.5" fill="url(#icBodyGrad)" />
        <rect x="53" y="66" width="1" height="8" rx="0.5" fill="url(#legGrad)" />

        <!-- Gold connector pins -->
        <rect x="61" y="69" width="12" height="2" fill="url(#legGrad)" />
        <rect x="64" y="66" width="6" height="8" rx="0.5" fill="#d2b48c" />
        <rect x="64" y="72" width="6.5" height="1" rx="0.5" fill="#8b6f47" />

        <rect x="77" y="69" width="12" height="2" fill="url(#legGrad)" />
        <rect x="80" y="66" width="6" height="8" rx="0.5" fill="#d2b48c" />
        <rect x="80" y="72" width="6.5" height="1" rx="0.5" fill="#8b6f47" />
        <!-- bottom diode -->
        <g transform="translate(30 140) scale(0.9) translate(25 -143)">
            <!-- First IC leg -->
            <rect x="14" y="115" width="12" height="2" fill="url(#legGrad)" />
            <rect x="16" y="113.5" width="8" height="5" rx="0.5" fill="url(#icBodyGrad)" />
            <rect x="21" y="113.5" width="1" height="5" rx="0.5" fill="url(#legGrad)" />
        </g>
        <!-- second diode -->

        <g transform="translate(30 140) scale(0.9) translate(-24 -143)">
            <!-- First IC leg -->
            <rect x="14" y="115" width="12" height="2" fill="url(#legGrad)" />
            <rect x="16" y="113.5" width="8" height="5" rx="0.5" fill="url(#icBodyGrad)" />
            <rect x="21" y="113.5" width="1" height="5" rx="0.5" fill="url(#legGrad)" />
        </g>
        <g transform="translate(30 140) scale(1.1) translate(15 128) rotate(180)">
            <!-- First IC leg -->
            <rect x="11.5" y="105" width="2" height="12" fill="url(#legGrad)" />
            <rect x="10" y="107" width="5" height="8" rx="0.5" fill="url(#icBodyGrad)" />
            <rect x="10" y="108" width="5" height="1" rx="0.5" fill="url(#legGrad)" />
        </g>

        <g transform="translate(30 140) scale(1.1) translate(48 128) rotate(180)">
            <!-- First IC leg -->
            <rect x="11.5" y="105" width="2" height="12" fill="url(#legGrad)" />
            <rect x="10" y="107" width="5" height="8" rx="0.5" fill="url(#icBodyGrad)" />
            <rect x="10" y="108" width="5" height="1" rx="0.5" fill="url(#legGrad)" />
        </g>

        <!-- Background -->
        <rect x="58" y="85" width="25" height="25" fill="url(#bgGrad)" stroke="#2c4a8c" stroke-width="1.5" rx="1" />

        <!-- SCALE ALL INNER COMPONENTS -->
        <g transform="translate(70.1 97) scale(0.21) translate(-64 -64)">

            <!-- Gear teeth -->
            <g transform="translate(64 64)" fill="#2a3f78">
                <rect x="-3" y="-54" width="6" height="10" />
                <rect x="-3" y="44" width="6" height="10" />
                <rect x="44" y="-3" width="10" height="6" />
                <rect x="-54" y="-3" width="10" height="6" />

                <rect x="32" y="-44" width="6" height="10" transform="rotate(45)" />
                <rect x="-38" y="-44" width="6" height="10" transform="rotate(-45)" />
                <rect x="32" y="34" width="6" height="10" transform="rotate(-45)" />
                <rect x="-38" y="34" width="6" height="10" transform="rotate(45)" />
            </g>

            <!-- Dark blue gear circle -->
            <circle cx="64" cy="64" r="44" fill="url(#gearGrad)" stroke="#fff" stroke-width="2" />

            <!-- CLOCK PATTERN LINES -->
            <g transform="translate(64 64)">
                <g stroke="#fff" stroke-width="1">
                    <line y1="-42" y2="-34" />
                    <line y1="34" y2="42" />
                    <line x1="-42" x2="-34" />
                    <line x1="34" x2="42" />

                    <line y1="-42" y2="-34" transform="rotate(30)" />
                    <line y1="-42" y2="-34" transform="rotate(60)" />
                    <line y1="-42" y2="-34" transform="rotate(120)" />
                    <line y1="-42" y2="-34" transform="rotate(150)" />
                    <line y1="-42" y2="-34" transform="rotate(210)" />
                    <line y1="-42" y2="-34" transform="rotate(240)" />
                    <line y1="-42" y2="-34" transform="rotate(300)" />
                    <line y1="-42" y2="-34" transform="rotate(330)" />
                </g>

                <g stroke="#ffff" stroke-width="1" opacity="0.9">
                    <line y1="-42" y2="-38" transform="rotate(15)" />
                    <line y1="-42" y2="-38" transform="rotate(45)" />
                    <line y1="-42" y2="-38" transform="rotate(75)" />
                    <line y1="-42" y2="-38" transform="rotate(105)" />
                    <line y1="-42" y2="-38" transform="rotate(135)" />
                    <line y1="-42" y2="-38" transform="rotate(165)" />
                    <line y1="-42" y2="-38" transform="rotate(195)" />
                    <line y1="-42" y2="-38" transform="rotate(225)" />
                    <line y1="-42" y2="-38" transform="rotate(255)" />
                    <line y1="-42" y2="-38" transform="rotate(285)" />
                    <line y1="-42" y2="-38" transform="rotate(315)" />
                    <line y1="-42" y2="-38" transform="rotate(345)" />
                </g>
            </g>

            <!-- Inner screw face -->
            <circle cx="64" cy="64" r="26" fill="#e9e6da" stroke="#6b6b6b" stroke-width="2" />

            <!-- Phillips cross -->
            <rect x="60" y="44" width="8" height="40" fill="url(#crossGrad)" />
            <rect x="44" y="60" width="40" height="8" fill="url(#crossGrad)" />

        </g>


        <!-- SIZE ADJUST (ALTERNATE METHOD) -->
        <g id="scaleFix" transform="translate(50 60) scale(0.9) translate(-50 -60)"></g>

        <linearGradient id="icBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#333333" />
            <stop offset="100%" stop-color="#1a1a1a" />
        </linearGradient>

        <!-- GOLDEN IC PIN GRADIENT -->
        <linearGradient id="leadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffef9a" />
            <stop offset="50%" stop-color="#ffd700" />
            <stop offset="100%" stop-color="#b8860b" />
        </linearGradient>

        <filter id="icBevel">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
            <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.5" specularExponent="15"
                lighting-color="#ffffff" result="spec">
                <fePointLight x="-20" y="-20" z="50" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="spec" />
            <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
        </defs>

        <g transform="translate(30 97.5) scale(0.3) translate(50 -48) rotate(90)">

            <g fill="url(#leadGrad)">
                <rect x="5" y="25" width="12" height="6" rx="1" />
                <rect x="5" y="45" width="12" height="6" rx="1" />
                <rect x="5" y="65" width="12" height="6" rx="1" />
                <rect x="5" y="85" width="12" height="6" rx="1" />
                <rect x="83" y="25" width="12" height="6" rx="1" />
                <rect x="83" y="45" width="12" height="6" rx="1" />
                <rect x="83" y="65" width="12" height="6" rx="1" />
                <rect x="83" y="85" width="12" height="6" rx="1" />
            </g>

            <rect x="15" y="15" width="70" height="90" rx="4" fill="url(#icBodyGrad)" filter="url(#icBevel)" />

            <circle cx="25" cy="25" r="3" fill="#111" stroke="#444" stroke-width="0.5" />

            <g font-family="monospace" font-weight="bold" text-anchor="middle" opacity="100">
                <text x="50" y="55" font-size="10" fill="#aaa">LM393</text>
                <text x="50" y="70" font-size="7" fill="#888">N2405G</text>
            </g>

            <rect x="18" y="18" width="64" height="2" fill="white" opacity="0.05" />

        </g>

        <g transform="translate(30, 180)">

            <rect x="6" y="5" width="4" height="22" fill="url(#goldPin)" filter="url(#bevel3d)" />
            <rect x="18" y="5" width="4" height="22" fill="url(#goldPin)" filter="url(#bevel3d)" />
            <rect x="30" y="5" width="4" height="22" fill="url(#goldPin)" filter="url(#bevel3d)" />
            <rect x="0" y="0" width="40" height="8" rx="1" fill="#111" />
        </g>

        <g fill="white" font-family="Arial" font-size="5" text-anchor="middle">
            <text x="36.5" y="177">VCC</text>
            <text x="49.5" y="177">GND</text>
            <text x="62.5" y="177">OUT</text>

        </g>
<rect id="sensorRect" x="-9" y="-70" width="120" height="70" fill="none" visibility="hidden" />
<circle id="sensorCircle" cx="65" cy="-90" r="12" fill="red" style="cursor: grab;" />
        `;

        return svg;
    }

    hideRange() {
        const sensorRect = this.svg.querySelector("#sensorRect");
        sensorRect.setAttribute("visibility", "hidden");
    }

    showRange() {
        const sensorRect = this.svg.querySelector("#sensorRect");
        sensorRect.setAttribute("visibility", "visible");
        sensorRect.setAttribute("stroke", "black");
        sensorRect.setAttribute("stroke-width", "2");
    }

    statechange() {
        // Only reset state if NOT currently dragging
        setTimeout(() => {
            if (!this.isDragging) {      // ← FIX: don't reset state mid-drag
                this.state = 0;
            }
        }, 1000);
    }

    clickCircle() {
        const sensorRect = this.svg.querySelector("#sensorRect");
        sensorRect.setAttribute("visibility", "visible");
        sensorRect.setAttribute("stroke", "black");
        sensorRect.setAttribute("stroke-width", "2");

        this.state = 1;
        this.state == 1 && this.statechange();
    }

    mouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.wasDragging = false;
        this.circle.style.cursor = "grabbing";

        // Show range on drag start
        this.showRange();              // ← moved here so clickCircle statechange doesn't interfere

        const svgRect = this.svg.getBoundingClientRect();
        const viewBox = this.svg.viewBox.baseVal;

        const cx = parseFloat(this.circle.getAttribute("cx"));
        const cy = parseFloat(this.circle.getAttribute("cy"));

        this.offsetX = (e.clientX - svgRect.left) * (viewBox.width / svgRect.width) + viewBox.x - cx;
        this.offsetY = (e.clientY - svgRect.top) * (viewBox.height / svgRect.height) + viewBox.y - cy;

        document.addEventListener("mousemove", this.mouseMove);
        document.addEventListener("mouseup", this.mouseUp);
    }

 mouseMove = (e) => {
  if (!this.isDragging) return;
 
  const svgRect = this.svg.getBoundingClientRect();
  const viewBox = this.svg.viewBox.baseVal;
 
  const sensorRect = this.svg.querySelector("#sensorRect");
  const x      = parseFloat(sensorRect.getAttribute("x"));
  const y      = parseFloat(sensorRect.getAttribute("y"));
  const width  = parseFloat(sensorRect.getAttribute("width"));
  const height = parseFloat(sensorRect.getAttribute("height"));
 
  const mouseX = (e.clientX - svgRect.left) * (viewBox.width  / svgRect.width)  + viewBox.x;
  const mouseY = (e.clientY - svgRect.top)  * (viewBox.height / svgRect.height) + viewBox.y;
 
  const cx = mouseX - this.offsetX;
  const cy = mouseY - this.offsetY;
 
  this.circle.setAttribute("cx", cx);
  this.circle.setAttribute("cy", cy);
 
  const prevState = this.state;
 
  const insideBox = cx >= x && cx <= x + width && cy >= y && cy <= y + height;
  this.state = insideBox ? 1 : 0;
 
  if (this.digitalInputs && this.pins?.out != null) {
    this.digitalInputs[this.pins.out] = this.state;
  }
 
  if (prevState !== this.state) {
    this._simEngine?.resolveElectrical?.();
  }
}

    mouseUp = (e) => {
  if (!this.isDragging) return;
 
  this.isDragging  = false;
  this.wasDragging = true;
  this.circle.style.cursor = "grab";
 
  const svgRect = this.svg.getBoundingClientRect();
  const viewBox = this.svg.viewBox.baseVal;
  const sensorRect = this.svg.querySelector("#sensorRect");
 
  const x      = parseFloat(sensorRect.getAttribute("x"));
  const y      = parseFloat(sensorRect.getAttribute("y"));
  const width  = parseFloat(sensorRect.getAttribute("width"));
  const height = parseFloat(sensorRect.getAttribute("height"));
 
  const cx = parseFloat(this.circle.getAttribute("cx"));
  const cy = parseFloat(this.circle.getAttribute("cy"));
 
  const prevState = this.state;
  const insideBox = cx >= x && cx <= x + width && cy >= y && cy <= y + height;
  this.state = insideBox ? 1 : 0;
 
  if (this.digitalInputs && this.pins?.out != null) {
    this.digitalInputs[this.pins.out] = this.state;
  }
 
  if (prevState !== this.state) {
    this._simEngine?.resolveElectrical?.();
  }
 
  document.removeEventListener("mousemove", this.mouseMove);
  document.removeEventListener("mouseup",   this.mouseUp);
}
 



















    hideCircle() {
        this.circle.setAttribute("visibility", "hidden");
    }
    showCircle() {
        this.circle.setAttribute("visibility", "visible");
    }

    getElement() { return this.svg; }
}