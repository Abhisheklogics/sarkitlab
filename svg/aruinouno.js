export default class ArduinoUno {
    constructor(id, wireSys, pinsArray) {
        this.id = id;
        this.wireSys = wireSys;
        this.pinsArray = pinsArray;
        this.pins = [];
        this.usbConnected = false;

        this.svg = this.createSVG();
    }

    createSVG() {
        // Size badha diya gaya hai (Large UI)
        const width = 400; 
        const height = 200;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        
        svg.setAttribute("width", width + 120); 
        svg.setAttribute("height", height);
      
        svg.style.overflow = "visible";

        let html = `
            <defs>
                <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                    <feOffset dx="2" dy="4" />
                    <feComposite in2="SourceGraphic" operator="over" />
                </filter>
                
                <style>
                    .pin-tooltip { fill: #14dac9; stroke: #fff; stroke-width: 1; rx: 4; ry: 4; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
                    .pin-tooltip-text { fill: #222; font-family: 'Segoe UI', Arial; font-size: 12px; font-weight: bold; pointer-events: none; opacity: 0; transition: opacity 0.2s; text-anchor: middle; }
                    .show-tooltip .pin-tooltip, .show-tooltip .pin-tooltip-text { opacity: 1; }
                    .connection-point { fill: #444; stroke: #777; stroke-width: 0.5; transition: all 0.2s; cursor: pointer; }
                    .connection-point:hover { fill: #14dac9; r: 5; }
                    .board-text { fill: rgba(255,255,255,0.8); font-family: sans-serif; pointer-events: none; }
                </style>
            </defs>

            <g filter="url(#shadow)">
                <path d="M 60 30 L 440 30 A 15 15 0 0 1 455 45 L 455 180 L 445 180 L 445 195 L 455 195 L 455 345 A 15 15 0 0 1 440 360 L 75 360 A 15 15 0 0 1 60 345 L 60 195 L 75 195 L 75 180 L 60 180 L 60 45 A 15 15 0 0 1 75 30 Z" fill="#256075" />
                
                <circle cx="430" cy="55" r="8" fill="none" stroke="white" stroke-width="1.5" opacity="0.5" />
                <circle cx="430" cy="335" r="8" fill="none" stroke="white" stroke-width="1.5" opacity="0.5" />
                <circle cx="85" cy="55" r="8" fill="none" stroke="white" stroke-width="1.5" opacity="0.5" />

                <g transform="translate(320, 100) scale(0.8)">
                    <path d="M0,0 A20,20 0 1,0 40,0 A20,20 0 1,0 0,0 M12,0 H28 M20,-8 V8" fill="none" stroke="white" stroke-width="4"/>
                    <path d="M45,0 A20,20 0 1,0 85,0 A20,20 0 1,0 45,0 M57,0 H73" fill="none" stroke="white" stroke-width="4"/>
                    <text x="42" y="45" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="Arial">ARDUINO</text>
                    <text x="42" y="70" text-anchor="middle" fill="white" font-size="24" font-weight="bold" font-family="Arial">UNO</text>
                </g>

                <text x="320" y="340" class="board-text" font-size="9">DIGITAL (PWM ~)</text>
                <text x="250" y="340" class="board-text" font-size="9">ANALOG IN</text>

                <rect x="40" y="60" width="80" height="65" fill="#ddd" rx="3" /> <rect x="45" y="68" width="65" height="50" fill="#bbb" rx="2" /> <rect x="45" y="240" width="85" height="60" fill="#222" rx="4" /> <rect x="200" y="220" width="180" height="50" fill="#333" rx="3" />
                <circle cx="210" cy="245" r="4" fill="#14dac9" /> <text x="290" y="252" fill="#777" font-size="14" font-family="Arial" font-weight="bold" text-anchor="middle" style="letter-spacing:2px">ATMEGA328P-PU</text>

                <rect x="140" y="70" width="30" height="25" fill="#bbb" rx="2"/> <rect x="120" y="220" width="15" height="25" fill="#333" /> <rect x="160" y="35" width="245" height="22" fill="#222" rx="2" /> <rect x="220" y="330" width="180" height="22" fill="#222" rx="2" /> </g>

            <g id="usb-cable" transform="translate(-150, 70) scale(1.2)" visibility="hidden">
                <rect x="0" y="0" width="100" height="40" fill="#333" rx="6" />
                <rect x="100" y="8" width="35" height="24" fill="#999" rx="2" />
                <path d="M 0 20 L -60 20" stroke="#222" stroke-width="12" fill="none" />
                <text x="40" y="25" fill="#555" font-size="8" font-family="Arial">USB</text>
            </g>
            
            <g id="tooltip-group" style="pointer-events:none">
                <rect class="pin-tooltip" x="0" y="0" width="50" height="20" />
                <text class="pin-tooltip-text" x="0" y="0">Pin</text>
            </g>
        `;

        svg.innerHTML = html;
        this.usbCable = svg.querySelector("#usb-cable");
        this.tooltipGroup = svg.querySelector("#tooltip-group");
        this.tooltipRect = this.tooltipGroup.querySelector(".pin-tooltip");
        this.tooltipText = this.tooltipGroup.querySelector(".pin-tooltip-text");

        this.createHeaders(svg);
        return svg;
    }

    createHeaders(svg) {
        const dNames = ["AREF", "GND", "13", "12", "~11", "~10", "~9", "8", "7", "~6", "~5", "4", "~3", "2", "TX>1", "RX<0"];
        dNames.forEach((name, i) => {
            this.drawHeaderPin(svg, 172 + (i * 15), 46, name, "top");
        });

        const pNames = ["Vin", "GND", "GND", "5V", "3.3V", "RESET", "A0", "A1", "A2", "A3", "A4", "A5"];
        pNames.forEach((name, i) => {
            this.drawHeaderPin(svg, 232 + (i * 15), 341, name, "bottom");
        });
    }

    drawHeaderPin(svg, x, y, name, side) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", 4.5);
        circle.setAttribute("class", "connection-point");
        
        circle.addEventListener("mouseover", (e) => this.showTooltip(e, name, side));
        circle.addEventListener("mouseout", () => this.hideTooltip());
        circle.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            this.wireSys.startWire(e, circle);
        });

        svg.appendChild(circle);
        this.pins.push({ id: name, element: circle });
        if (this.pinsArray) this.pinsArray.push({ pinId: `${this.id}:${name}`, element: circle, componentInstance: this });
    }

    showTooltip(e, name, side) {
        const cx = parseFloat(e.target.getAttribute("cx"));
        const cy = parseFloat(e.target.getAttribute("cy"));
        this.tooltipText.textContent = name;
        const textBBox = this.tooltipText.getBBox();
        const boxWidth = textBBox.width + 12;
        
        this.tooltipRect.setAttribute("width", boxWidth);
        let ty = (side === "top") ? cy - 25 : cy + 25;
        
        this.tooltipRect.setAttribute("x", cx - boxWidth / 2);
        this.tooltipRect.setAttribute("y", ty - 14);
        this.tooltipText.setAttribute("x", cx);
        this.tooltipText.setAttribute("y", ty);
        this.tooltipGroup.classList.add("show-tooltip");
    }

    hideTooltip() { this.tooltipGroup.classList.remove("show-tooltip"); }

    connectUSB() {
        if (this.usbConnected) return;
        this.usbCable.setAttribute("visibility", "visible");
        let pos = -150;
        const animate = () => {
            if (pos >= 10) { this.usbConnected = true; return; }
            pos += 8;
            this.usbCable.setAttribute("transform", `translate(${pos}, 70) scale(1.2)`);
            requestAnimationFrame(animate);
        };
        animate();
    }

    disconnectUSB() {
        if (!this.usbConnected) return;
        let pos = 10;
        const animate = () => {
            if (pos <= -150) { this.usbCable.setAttribute("visibility", "hidden"); this.usbConnected = false; return; }
            pos -= 8;
            this.usbCable.setAttribute("transform", `translate(${pos}, 70) scale(1.2)`);
            requestAnimationFrame(animate);
        };
        animate();
    }

    getElement() { return this.svg; }
}