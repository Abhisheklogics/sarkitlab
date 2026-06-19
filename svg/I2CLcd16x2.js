"use strict";

export default class I2CLcd16x2 {
  constructor() {
    this.svg = this._createSVG();

    this._row1El = this.svg.querySelector("#lcdRow1");
    this._row2El = this.svg.querySelector("#lcdRow2");
    this._curEl  = this.svg.querySelector("#lcdCursor");
    this._glass  = this.svg.querySelector("#lcdGlass");
    this._pwrLed = this.svg.querySelector("#pwrLed");

    this.pinVCC = null;
    this.pinGND = null;
    this.pinSDA = null;
    this.pinSCL = null;

    this.validated    = false;
    this.initialized  = false;
    this.instanceName = null;

    this.ROWS    = 2;
    this.COLS    = 16;
    // Real LCD I2C DDRAM width = 40 chars per row (HD44780 standard)
    this._bufLen = 40;

    this.cursorRow     = 0;
    this.cursorCol     = 0;
    this.displayOffset = 0;
    this.backlightOn   = false;

    this._displayOn     = true;
    this._cursorVisible = false;
    this._blinkOn       = false;
    this._leftToRight   = true;
    this._autoScroll    = false;
    this._blinkInterval = null;
    this._blinkState    = false;
    this._customChars   = new Array(8).fill(null);

    // Real HD44780: 2 rows × 40 chars DDRAM
    this._buf = Array.from({ length: 2 }, () => new Array(40).fill(" "));

    this.scrollInterval = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  init() {
  this.initialized    = true;
  this.displayOffset  = 0;
  this._displayOn     = true;
  this._cursorVisible = false;
  this._blinkOn       = false;
  this.cursorRow      = 0;
  this.cursorCol      = 0;
 
  // ── FIX: pehle buffer clear karo, phir backlight, phir render ────────────
  // Pehle wala: backlight() andar color set hoti thi lekin buf empty tha
  // Ab: buffer already spaces se bhara hai (constructor mein), directly backlight on karo
  this._applyBacklightColors(true);
  this.backlightOn = true;
  this._render();
}
 

  begin(cols, rows) {
    this.COLS = cols ?? 16;
    this.ROWS = rows ?? 2;
    this.init();
  }

  backlight(state = true) {
  this.backlightOn = !!state;
  this._applyBacklightColors(state);
}
 
// YE nayi helper method add karo (backlight() ke baad):
_applyBacklightColors(state) {
  const screenFill = state ? "#0a1628" : "#060c0e";
  if (this._glass) this._glass.setAttribute("fill", screenFill);
 
  // ── FIX: text color — on hone par hamesha readable color set karo ────────
  const textColor = state ? "#a8d8ff" : "#1a2a3a";
  if (this._row1El) this._row1El.style.color = textColor;
  if (this._row2El) this._row2El.style.color = textColor;
 
  const divider = this.svg.querySelector("#lcdDivider");
  if (divider) divider.setAttribute("stroke", state ? "#0d1f35" : "#060c0e");
 
  if (this._pwrLed) this._pwrLed.setAttribute("fill", state ? "#00e000" : "#001800");
}

  clear() {
    // Real LCD: clear() resets DDRAM to spaces, cursor to home, offset to 0
    this._buf = Array.from({ length: this.ROWS }, () => new Array(this._bufLen).fill(" "));
    this.cursorRow     = 0;
    this.cursorCol     = 0;
    this.displayOffset = 0;
    this._render();
  }

  home() {
    // Real LCD: home() resets cursor + display offset to 0, DDRAM untouched
    this.cursorRow     = 0;
    this.cursorCol     = 0;
    this.displayOffset = 0;
    this._render();
  }

  // Arduino: setCursor(col, row) — col = x (0-15), row = y (0-1)
  setCursor(col, row) {
    this.cursorRow = Math.max(0, Math.min(Math.trunc(row ?? 0), this.ROWS - 1));
    // cursorCol is DDRAM address — can go up to bufLen-1
    this.cursorCol = Math.max(0, Math.min(Math.trunc(col ?? 0), this._bufLen - 1));
    this._updateCursorEl();
  }

print(text = "") {
  if (!this.initialized) this.init();

  let str;
  if (text === null || text === undefined) {
    str = "";
  } else if (typeof text === "number") {
    if (!Number.isFinite(text)) str = "nan";
    else if (Number.isInteger(text)) str = String(text);
    else str = text.toFixed(2);
  } else if (typeof text === "string") {
    str = text;
  } else {
    str = String(text);
  }

  for (const ch of str) {
    if (ch === "\n") {
      this.cursorRow = (this.cursorRow + 1) % this.ROWS;
      this.cursorCol = 0;
      continue;
    }
 
    // ── FIX: pehle write karo, PHIR overflow check karo ──────────────────
    // Real HD44780: cursorCol >= bufLen par cursor wrap hoti hai BAAD mein
    if (this.cursorCol < this._bufLen && this.cursorRow < this.ROWS) {
      const writeCol = this._leftToRight
        ? this.cursorCol
        : Math.max(0, this.cursorCol - 1);
 
      if (writeCol >= 0 && writeCol < this._bufLen) {
        this._buf[this.cursorRow][writeCol] = ch;
      }
    }
 
    // Cursor advance
    if (this._leftToRight) {
      this.cursorCol++;
 
      // Overflow: next char position set karo
      if (this.cursorCol >= this._bufLen) {
        if (this._autoScroll) {
          this.scrollDisplayLeft();
          this.cursorCol = this._bufLen - 1;
        } else {
          // Real HD44780: next row mein wrap
          this.cursorRow = (this.cursorRow + 1) % this.ROWS;
          this.cursorCol = 0;
        }
      }
    } else {
      if (this.cursorCol > 0) this.cursorCol--;
    }
  }
  this._render();
}

  write(charCode) { this.print(String.fromCharCode(Math.round(charCode))); }

  createChar(num, bitmap) {
    if (num < 0 || num > 7) return;
    this._customChars[num] = Array.isArray(bitmap) ? bitmap.slice(0, 8) : null;
  }

  command(val) {}

  display() {
    this._displayOn = true;
    if (this._row1El) this._row1El.style.visibility = "visible";
    if (this._row2El) this._row2El.style.visibility = "visible";
    this._render();
  }

  noDisplay() {
    this._displayOn = false;
    if (this._row1El) this._row1El.style.visibility = "hidden";
    if (this._row2El) this._row2El.style.visibility = "hidden";
  }

  cursor()   { this._cursorVisible = true;  this._updateCursorEl(); }
  noCursor() { this._cursorVisible = false; this._updateCursorEl(); }

  blink() {
    this._blinkOn = true;
    if (this._blinkInterval) return;
    this._blinkInterval = setInterval(() => {
      this._blinkState = !this._blinkState;
      this._updateCursorEl();
    }, 500);
  }

  noBlink() {
    this._blinkOn = false;
    if (this._blinkInterval) {
      clearInterval(this._blinkInterval);
      this._blinkInterval = null;
    }
    this._blinkState = false;
    this._updateCursorEl();
  }

  leftToRight()  { this._leftToRight = true;  }
  rightToLeft()  { this._leftToRight = false; }
  autoscroll()   { this._autoScroll  = true;  }
  noAutoscroll() { this._autoScroll  = false; }

  // Real HD44780 scrollDisplayLeft:
  // Display window shifts LEFT → text appears to move LEFT
  // displayOffset increases (we read from a higher index in DDRAM)
  scrollDisplayLeft() {
    this.displayOffset = (this.displayOffset + 1) % this._bufLen;
    this._render();
  }

  // Real HD44780 scrollDisplayRight:
  // Display window shifts RIGHT → text appears to move RIGHT
  // displayOffset decreases (we read from a lower index in DDRAM)
  scrollDisplayRight() {
    this.displayOffset = (this.displayOffset - 1 + this._bufLen) % this._bufLen;
    this._render();
  }

  startAutoScroll(ms = 200, dir = -1) {
    this.stopAutoScroll();
    this.scrollInterval = setInterval(() => {
      dir === -1 ? this.scrollDisplayLeft() : this.scrollDisplayRight();
    }, ms);
  }

  stopAutoScroll() {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  reset() {
    this.stopAutoScroll();
    this.noBlink();
    this._buf = Array.from({ length: this.ROWS }, () => new Array(this._bufLen).fill(" "));
    this.backlight(false);
    this.initialized = false;
    this.validated   = false;
    this._render();
  }

  resolvePins(circuitSolver) {}
  getElement() { return this.svg; }

  // ─── Private ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._displayOn) return;

    if (this.initialized && !this.backlightOn) {
      this.backlight(true);
    }

    // Read COLS characters starting from displayOffset, circular in DDRAM
    const row = r => {
      let s = "";
      for (let i = 0; i < this.COLS; i++) {
        // Circular read: (displayOffset + i) mod bufLen
        const idx = (this.displayOffset + i) % this._bufLen;
        s += this._buf[r]?.[idx] ?? " ";
      }
      return s;
    };

    if (this._row1El) this._row1El.textContent = row(0);
    if (this._row2El) this._row2El.textContent = row(1);
    this._updateCursorEl();
  }

  _updateCursorEl() {
    const el = this._curEl;
    if (!el) return;
    const show = this._cursorVisible || (this._blinkOn && this._blinkState);
    el.style.display = show ? "block" : "none";
    if (show) {
      // Cursor screen position = (cursorCol - displayOffset) mod COLS
      const screenCol = ((this.cursorCol - this.displayOffset) % this._bufLen + this._bufLen) % this._bufLen;
      // Only show cursor if it's within visible window
      if (screenCol < this.COLS) {
        el.setAttribute("x", 22 + screenCol * 18.5);
        el.setAttribute("y", this.cursorRow === 0 ? 62 : 112);
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    }
  }

  // ─── SVG ────────────────────────────────────────────────────────────────────

  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "370");
    svg.setAttribute("height",  "175");
    svg.setAttribute("viewBox", "0 0 370 175");
    svg.style.overflow = "visible";

    svg.innerHTML = `
      <defs>
        <pattern id="pcbDot" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.4" fill="#1a6b28" opacity="0.35"/>
        </pattern>
      </defs>

      <!-- PCB drop shadow -->
      <rect x="4" y="4" width="362" height="152" rx="9" fill="#000" opacity="0.45"/>

      <!-- PCB body — dark green -->
      <rect x="0" y="0" width="362" height="150" rx="9" fill="#1a5c1f"/>
      <rect x="0" y="0" width="362" height="150" rx="9" fill="url(#pcbDot)"/>

      <!-- PCB top sheen strip -->
      <rect x="1" y="1" width="360" height="26" rx="8" fill="#2a7a2f" opacity="0.35"/>

      <!-- PCB edge highlight -->
      <rect x="0.5" y="0.5" width="361" height="149" rx="8.5" fill="none" stroke="#2e7d32" stroke-width="1"/>

      <!-- Corner mounting holes -->
      <circle cx="16"  cy="16"  r="6.5" fill="#0d200e" stroke="#3a7a3a" stroke-width="1"/>
      <circle cx="16"  cy="16"  r="3"   fill="#888"/>
      <circle cx="346" cy="16"  r="6.5" fill="#0d200e" stroke="#3a7a3a" stroke-width="1"/>
      <circle cx="346" cy="16"  r="3"   fill="#888"/>
      <circle cx="16"  cy="134" r="6.5" fill="#0d200e" stroke="#3a7a3a" stroke-width="1"/>
      <circle cx="16"  cy="134" r="3"   fill="#888"/>
      <circle cx="346" cy="134" r="6.5" fill="#0d200e" stroke="#3a7a3a" stroke-width="1"/>
      <circle cx="346" cy="134" r="3"   fill="#888"/>

      <!-- Left side pin rows -->
      ${Array.from({length:7},(_,i)=>`
        <circle cx="6"  cy="${20 + i*14}" r="3.5" fill="#0d200e" stroke="#5a9e5a" stroke-width="0.7"/>
        <circle cx="6"  cy="${20 + i*14}" r="1.5" fill="#aaa"/>
        <circle cx="14" cy="${20 + i*14}" r="3.5" fill="#0d200e" stroke="#5a9e5a" stroke-width="0.7"/>
        <circle cx="14" cy="${20 + i*14}" r="1.5" fill="#aaa"/>
      `).join("")}

      <!-- LCD bezel outer frame -->
      <rect x="26" y="12" width="280" height="122" rx="6" fill="#111118" stroke="#222230" stroke-width="1.5"/>

      <!-- LCD screen -->
      <rect id="lcdGlass" x="29" y="15" width="274" height="116" rx="4" fill="#060c0e"/>

      <!-- Screen inner subtle border -->
      <rect x="30" y="16" width="272" height="114" rx="3" fill="none" stroke="#0a1020" stroke-width="0.5"/>

      <!-- Row divider -->
      <line id="lcdDivider" x1="29" y1="73" x2="303" y2="73" stroke="#060c0e" stroke-width="1"/>

      <!-- LCD row 1 text -->
      <foreignObject x="22" y="18" width="280" height="50">
        <div xmlns="http://www.w3.org/1999/xhtml"
             style="width:280px;height:50px;display:flex;align-items:center;
                    overflow:hidden;padding-left:6px;">
          <span id="lcdRow1"
                style="font-family:'Courier New',Courier,monospace;
                       font-size:21px;font-weight:bold;
                       color:#1a2a3a;
                       letter-spacing:0.5px;white-space:pre;
                       display:block;line-height:1;"> </span>
        </div>
      </foreignObject>

      <!-- LCD row 2 text -->
      <foreignObject x="22" y="74" width="280" height="50">
        <div xmlns="http://www.w3.org/1999/xhtml"
             style="width:280px;height:50px;display:flex;align-items:center;
                    overflow:hidden;padding-left:6px;">
          <span id="lcdRow2"
                style="font-family:'Courier New',Courier,monospace;
                       font-size:21px;font-weight:bold;
                       color:#1a2a3a;
                       letter-spacing:0.5px;white-space:pre;
                       display:block;line-height:1;"> </span>
        </div>
      </foreignObject>

      <!-- Cursor (hidden by default) -->
      <rect id="lcdCursor" x="22" y="62" width="17" height="3"
            fill="#a8d8ff" opacity="0.85" style="display:none;"/>

      <!-- Right side — I2C module block -->
      <rect x="310" y="14" width="48" height="120" rx="4" fill="#1e2b30" stroke="#2e3d42" stroke-width="0.7"/>

      <!-- I2C chip body -->
      <rect x="314" y="42" width="40" height="36" rx="2" fill="#1a1a1a" stroke="#333" stroke-width="0.5"/>
      <circle cx="318" cy="46" r="2" fill="#333"/>
      <text x="334" y="56" font-size="6" fill="#666" font-family="monospace" text-anchor="middle">PCF</text>
      <text x="334" y="64" font-size="6" fill="#666" font-family="monospace" text-anchor="middle">8574</text>
      <text x="334" y="72" font-size="5" fill="#555" font-family="monospace" text-anchor="middle">I2C</text>

      <!-- I2C chip legs left -->
      ${[0,1,2,3].map(i=>`<rect x="306" y="${48+i*8}" width="8" height="2" rx="0.5" fill="#8a8a8a"/>`).join("")}
      <!-- I2C chip legs right -->
      ${[0,1,2,3].map(i=>`<rect x="354" y="${48+i*8}" width="8" height="2" rx="0.5" fill="#8a8a8a"/>`).join("")}

      <!-- Contrast potentiometer -->
      <rect x="316" y="84" width="24" height="24" rx="2" fill="#111" stroke="#333" stroke-width="0.5"/>
      <circle cx="328" cy="96" r="9" fill="#222" stroke="#444" stroke-width="0.5"/>
      <circle cx="328" cy="96" r="6" fill="#2a2a2a"/>
      <line x1="328" y1="89" x2="328" y2="93" stroke="#777" stroke-width="1.8" stroke-linecap="round"/>
      <text x="328" y="115" font-size="4.5" fill="#4a6070" font-family="monospace" text-anchor="middle">CONT</text>

      <!-- Power LED area -->
      <rect x="317" y="20" width="22" height="14" rx="2" fill="#111"/>
      <circle id="pwrLed" cx="328" cy="27" r="5" fill="#001800"/>
      <circle cx="326" cy="25" r="1.2" fill="white" opacity="0.2"/>

      <!-- Address pads A0 A1 A2 -->
      <text x="328" y="38" font-size="4" fill="#4a6070" font-family="monospace" text-anchor="middle">A0-A2</text>
      ${[0,1,2].map(i=>`
        <rect x="${318+i*7}" y="39" width="5" height="5" rx="0.5" fill="#263238" stroke="#546e7a" stroke-width="0.3"/>
      `).join("")}

      <!-- Bottom pin connector block -->
      <rect x="72" y="134" width="108" height="24" rx="2" fill="#111" stroke="#333" stroke-width="0.5"/>

      <!-- 4 pin sockets -->
      ${["GND","VCC","SDA","SCL"].map((lbl,i)=>`
        <rect x="${78+i*24}" y="137" width="18" height="16" rx="1.5" fill="#0a0a0a" stroke="#444" stroke-width="0.5"/>
        <rect x="${81+i*24}" y="140" width="12" height="10" rx="1" fill="#050505" stroke="#555" stroke-width="0.3"/>
        <text x="${87+i*24}" y="133" font-size="6.5" fill="#a5d6a7" font-family="monospace" text-anchor="middle">${lbl}</text>
      `).join("")}

      <!-- Pin legs going down -->
      ${[0,1,2,3].map(i=>`
        <rect x="${85+i*24}" y="158" width="3.5" height="17" rx="1" fill="#c0c0c0"/>
      `).join("")}

      <!-- Board label -->
      <text x="186" y="167" font-size="7.5" fill="#81c784" font-family="monospace"
            text-anchor="middle" opacity="0.75">LCD1602 I2C</text>
      <text x="186" y="176" font-size="5.5" fill="#4caf50" font-family="monospace"
            text-anchor="middle" opacity="0.5">0x27 / 0x3F</text>
    `;

    return svg;
  }
}