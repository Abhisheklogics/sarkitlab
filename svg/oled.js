"use strict";

const font5x7 = {
  ' ': [0x00,0x00,0x00,0x00,0x00], '!': [0x00,0x00,0x5F,0x00,0x00],
  '"': [0x00,0x07,0x00,0x07,0x00], '#': [0x14,0x7F,0x14,0x7F,0x14],
  '$': [0x24,0x2A,0x7F,0x2A,0x12], '%': [0x23,0x13,0x08,0x64,0x62],
  '&': [0x36,0x49,0x55,0x22,0x50], '\'':[0x00,0x05,0x03,0x00,0x00],
  '(': [0x00,0x1C,0x22,0x41,0x00], ')': [0x00,0x41,0x22,0x1C,0x00],
  '*': [0x14,0x08,0x3E,0x08,0x14], '+': [0x08,0x08,0x3E,0x08,0x08],
  ',': [0x00,0x50,0x30,0x00,0x00], '-': [0x08,0x08,0x08,0x08,0x08],
  '.': [0x00,0x60,0x60,0x00,0x00], '/': [0x20,0x10,0x08,0x04,0x02],
  '0': [0x3E,0x51,0x49,0x45,0x3E], '1': [0x00,0x42,0x7F,0x40,0x00],
  '2': [0x42,0x61,0x51,0x49,0x46], '3': [0x21,0x41,0x45,0x4B,0x31],
  '4': [0x18,0x14,0x12,0x7F,0x10], '5': [0x27,0x45,0x45,0x45,0x39],
  '6': [0x3C,0x4A,0x49,0x49,0x30], '7': [0x01,0x71,0x09,0x05,0x03],
  '8': [0x36,0x49,0x49,0x49,0x36], '9': [0x06,0x49,0x49,0x29,0x1E],
  ':': [0x00,0x36,0x36,0x00,0x00], ';': [0x00,0x56,0x36,0x00,0x00],
  '<': [0x08,0x14,0x22,0x41,0x00], '=': [0x14,0x14,0x14,0x14,0x14],
  '>': [0x00,0x41,0x22,0x14,0x08], '?': [0x02,0x01,0x51,0x09,0x06],
  '@': [0x32,0x49,0x79,0x41,0x3E],
  'A': [0x7E,0x11,0x11,0x11,0x7E], 'B': [0x7F,0x49,0x49,0x49,0x36],
  'C': [0x3E,0x41,0x41,0x41,0x22], 'D': [0x7F,0x41,0x41,0x22,0x1C],
  'E': [0x7F,0x49,0x49,0x49,0x41], 'F': [0x7F,0x09,0x09,0x09,0x01],
  'G': [0x3E,0x41,0x49,0x49,0x7A], 'H': [0x7F,0x08,0x08,0x08,0x7F],
  'I': [0x00,0x41,0x7F,0x41,0x00], 'J': [0x20,0x40,0x41,0x3F,0x01],
  'K': [0x7F,0x08,0x14,0x22,0x41], 'L': [0x7F,0x40,0x40,0x40,0x40],
  'M': [0x7F,0x02,0x0C,0x02,0x7F], 'N': [0x7F,0x04,0x08,0x10,0x7F],
  'O': [0x3E,0x41,0x41,0x41,0x3E], 'P': [0x7F,0x09,0x09,0x09,0x06],
  'Q': [0x3E,0x41,0x51,0x21,0x5E], 'R': [0x7F,0x09,0x19,0x29,0x46],
  'S': [0x46,0x49,0x49,0x49,0x31], 'T': [0x01,0x01,0x7F,0x01,0x01],
  'U': [0x3F,0x40,0x40,0x40,0x3F], 'V': [0x1F,0x20,0x40,0x20,0x1F],
  'W': [0x3F,0x40,0x38,0x40,0x3F], 'X': [0x63,0x14,0x08,0x14,0x63],
  'Y': [0x07,0x08,0x70,0x08,0x07], 'Z': [0x61,0x51,0x49,0x45,0x43],
  '[': [0x00,0x7F,0x41,0x41,0x00], '\\':[0x02,0x04,0x08,0x10,0x20],
  ']': [0x00,0x41,0x41,0x7F,0x00], '^': [0x04,0x02,0x01,0x02,0x04],
  '_': [0x40,0x40,0x40,0x40,0x40], '`': [0x01,0x02,0x04,0x00,0x00],
  'a': [0x20,0x54,0x54,0x54,0x78], 'b': [0x7F,0x48,0x44,0x44,0x38],
  'c': [0x38,0x44,0x44,0x44,0x20], 'd': [0x38,0x44,0x44,0x48,0x7F],
  'e': [0x38,0x54,0x54,0x54,0x18], 'f': [0x08,0x7E,0x09,0x01,0x02],
  'g': [0x0C,0x52,0x52,0x52,0x3E], 'h': [0x7F,0x08,0x04,0x04,0x78],
  'i': [0x00,0x44,0x7D,0x40,0x00], 'j': [0x20,0x40,0x44,0x3D,0x00],
  'k': [0x7F,0x10,0x28,0x44,0x00], 'l': [0x00,0x41,0x7F,0x40,0x00],
  'm': [0x7C,0x04,0x18,0x04,0x78], 'n': [0x7C,0x08,0x04,0x04,0x78],
  'o': [0x38,0x44,0x44,0x44,0x38], 'p': [0x7C,0x14,0x14,0x14,0x08],
  'q': [0x08,0x14,0x14,0x18,0x7C], 'r': [0x7C,0x08,0x04,0x04,0x08],
  's': [0x48,0x54,0x54,0x54,0x20], 't': [0x04,0x3F,0x44,0x40,0x20],
  'u': [0x3C,0x40,0x40,0x20,0x7C], 'v': [0x1C,0x20,0x40,0x20,0x1C],
  'w': [0x3C,0x40,0x30,0x40,0x3C], 'x': [0x44,0x28,0x10,0x28,0x44],
  'y': [0x0C,0x50,0x50,0x50,0x3C], 'z': [0x44,0x64,0x54,0x4C,0x44],
  '{': [0x00,0x08,0x36,0x41,0x00], '|': [0x00,0x00,0x7F,0x00,0x00],
  '}': [0x00,0x41,0x36,0x08,0x00], '~': [0x08,0x04,0x08,0x10,0x08],
};

export default class OLED {

  static manifest = {
    id:         "oled",
    label:      "OLED 128×64",
    group:      "Output",
    imageSrc:   "images/oled.jpg",
    width:      210,
    height:     160,
    cssClasses: ["oled"],
    physics:    { conductive: false, requiresClosedLoop: false },
    pins: [
      { id: "GND", x: 58,  y: 148 },
      { id: "VCC", x: 78,  y: 148 },
      { id: "SCL", x: 98,  y: 148 },
      { id: "SDA", x: 118, y: 148 },
    ],
    factory: (_ctx) => new OLED(128, 64),
  };

  constructor(width = 128, height = 64) {
    this.width  = width;
    this.height = height;

    this.cursorX   = 0;
    this.cursorY   = 0;
    this.textSize  = 1;
    this.textColor = 1;
    this._textWrap = true;     // FIX Bug 9: setTextWrap state
    this._inverted = false;    // FIX Bug 8: invertDisplay state

    this.pixels      = new Uint8Array(width * height);
    this.initialized = false;

    this.commandMode = false;
    this.dataMode    = false;
    this.displayOn   = true;

    this._svg   = this._createSVG();
    this._layer = this._svg.querySelector("#oledPixelLayer");
    this._renderPending = false;
  }

  // ── Public API ────────────────────────────────────────────────

  begin() {
    this.clearDisplay();
    this.initialized = true;
  }

  clearDisplay() {
    this.pixels.fill(0);
    this.cursorX = 0;
    this.cursorY = 0;
    this._scheduleRender();
  }

  clear() { this.clearDisplay(); }

  reset() {
    this.initialized = false;
    this._inverted   = false;
    this._textWrap   = true;
    this.clearDisplay();
  }

  setCursor(x, y) {
    this.cursorX = Math.round(x);
    this.cursorY = Math.round(y);
  }

  setTextSize(size) {
    this.textSize = Math.max(1, Math.min(Math.round(size), 8));
  }

  setTextColor(color) {
    this.textColor = color ? 1 : 0;
  }

  // FIX Bug 9: setTextWrap implement kiya
  setTextWrap(wrap) {
    this._textWrap = !!wrap;
  }

  // FIX Bug 8: invertDisplay implement kiya
  invertDisplay(invert) {
    this._inverted = !!invert;
    this._scheduleRender();
  }

print(text) {
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
  this._writeText(str);
}

  // FIX Bug 10: println cursorX reset pehle, phir newline
  println(text = "") {
    this._writeText(String(text));
    this._newline();
  }

  display() {
    this._scheduleRender();
  }

  drawPixel(x, y, color = 1) {
    this._setPixel(x, y, color ? 1 : 0);
    this._scheduleRender();
  }

  drawLine(x0, y0, x1, y1, color = 1) {
    x0=Math.round(x0); y0=Math.round(y0);
    x1=Math.round(x1); y1=Math.round(y1);
    let dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
    let sx = x0<x1?1:-1, sy = y0<y1?1:-1, err = dx-dy;
    while (true) {
      this._setPixel(x0, y0, color?1:0);
      if (x0===x1 && y0===y1) break;
      let e2 = 2*err;
      if (e2 > -dy) { err-=dy; x0+=sx; }
      if (e2 <  dx) { err+=dx; y0+=sy; }
    }
    this._scheduleRender();
  }

  // FIX Bug 4: drawFastHLine implement kiya
  drawFastHLine(x, y, w, color = 1) {
    for (let i = 0; i < w; i++) this._setPixel(x+i, y, color?1:0);
    this._scheduleRender();
  }

  // FIX Bug 4: drawFastVLine implement kiya
  drawFastVLine(x, y, h, color = 1) {
    for (let i = 0; i < h; i++) this._setPixel(x, y+i, color?1:0);
    this._scheduleRender();
  }

  drawRect(x, y, w, h, color = 1) {
    this.drawFastHLine(x,     y,     w, color);
    this.drawFastHLine(x,     y+h-1, w, color);
    this.drawFastVLine(x,     y,     h, color);
    this.drawFastVLine(x+w-1, y,     h, color);
  }

  fillRect(x, y, w, h, color = 1) {
    for (let row = y; row < y+h; row++)
      for (let col = x; col < x+w; col++)
        this._setPixel(col, row, color?1:0);
    this._scheduleRender();
  }

  // FIX Bug 7: fillScreen implement kiya
  fillScreen(color = 1) {
    this.pixels.fill(color ? 1 : 0);
    this._scheduleRender();
  }

  drawCircle(cx, cy, r, color = 1) {
    cx=Math.round(cx); cy=Math.round(cy); r=Math.round(r);
    let x=0, y=r, d=1-r;
    while (x<=y) {
      [[cx+x,cy+y],[cx-x,cy+y],[cx+x,cy-y],[cx-x,cy-y],
       [cx+y,cy+x],[cx-y,cy+x],[cx+y,cy-x],[cx-y,cy-x]]
        .forEach(([px,py]) => this._setPixel(px,py,color?1:0));
      if (d<0) d+=2*x+3;
      else { d+=2*(x-y)+5; y--; }
      x++;
    }
    this._scheduleRender();
  }

  // FIX Bug 3: fillCircle implement kiya
  fillCircle(cx, cy, r, color = 1) {
    cx=Math.round(cx); cy=Math.round(cy); r=Math.round(r);
    for (let y = -r; y <= r; y++) {
      const hw = Math.round(Math.sqrt(r*r - y*y));
      this.drawFastHLine(cx - hw, cy + y, hw*2+1, color);
    }
  }

  // FIX Bug 5: drawTriangle implement kiya
  drawTriangle(x0, y0, x1, y1, x2, y2, color = 1) {
    this.drawLine(x0,y0, x1,y1, color);
    this.drawLine(x1,y1, x2,y2, color);
    this.drawLine(x2,y2, x0,y0, color);
  }

  // FIX Bug 5: fillTriangle implement kiya (scanline fill)
  fillTriangle(x0, y0, x1, y1, x2, y2, color = 1) {
    // Sort by y
    if (y0 > y1) { [x0,x1]=[x1,x0]; [y0,y1]=[y1,y0]; }
    if (y0 > y2) { [x0,x2]=[x2,x0]; [y0,y2]=[y2,y0]; }
    if (y1 > y2) { [x1,x2]=[x2,x1]; [y1,y2]=[y2,y1]; }
    const total = y2 - y0 || 1;
    for (let y = y0; y <= y2; y++) {
      const upper = y < y1 || y1 === y0;
      const seg   = upper ? (y1-y0||1) : (y2-y1||1);
      const base  = upper ? (y-y0)     : (y-y1);
      let xa = x0 + (x2-x0) * (y-y0) / total;
      let xb = upper
        ? x0 + (x1-x0) * base / seg
        : x1 + (x2-x1) * base / seg;
      if (xa > xb) [xa,xb]=[xb,xa];
      this.drawFastHLine(Math.round(xa), y, Math.round(xb-xa)+1, color);
    }
  }

  // FIX Bug 6: drawRoundRect implement kiya
  drawRoundRect(x, y, w, h, r, color = 1) {
    r = Math.min(r, Math.floor(w/2), Math.floor(h/2));
    this.drawFastHLine(x+r,   y,     w-2*r, color);
    this.drawFastHLine(x+r,   y+h-1, w-2*r, color);
    this.drawFastVLine(x,     y+r,   h-2*r, color);
    this.drawFastVLine(x+w-1, y+r,   h-2*r, color);
    this._drawCorner(x+r,     y+r,     r, 1, color);
    this._drawCorner(x+w-1-r, y+r,     r, 2, color);
    this._drawCorner(x+w-1-r, y+h-1-r, r, 4, color);
    this._drawCorner(x+r,     y+h-1-r, r, 8, color);
  }

  // FIX Bug 6: fillRoundRect implement kiya
  fillRoundRect(x, y, w, h, r, color = 1) {
    r = Math.min(r, Math.floor(w/2), Math.floor(h/2));
    this.fillRect(x+r, y, w-2*r, h, color);
    this._fillCorner(x+r,     y+r,     r, 1, color);
    this._fillCorner(x+w-1-r, y+r,     r, 2, color);
    this._fillCorner(x+w-1-r, y+h-1-r, r, 4, color);
    this._fillCorner(x+r,     y+h-1-r, r, 8, color);
  }

  // FIX Bug 7: drawChar implement kiya (direct pixel placement)
  drawChar(x, y, ch, color, bg, size = 1) {
    this._drawChar(x, y, String.fromCharCode(ch), size, color, bg);
    this._scheduleRender();
  }

  // FIX Bug 7: drawBitmap implement kiya
  drawBitmap(x, y, bitmap, w, h, color = 1) {
    if (!Array.isArray(bitmap)) return;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const byteIdx = Math.floor((j*w + i) / 8);
        const bitIdx  = 7 - ((j*w + i) % 8);
        if ((bitmap[byteIdx] >> bitIdx) & 1)
          this._setPixel(x+i, y+j, color?1:0);
      }
    }
    this._scheduleRender();
  }

  receiveI2C(bytes) {
    for (const b of bytes) {
      if      (b === 0x00) { this.commandMode=true;  this.dataMode=false;  continue; }
      else if (b === 0x40) { this.commandMode=false; this.dataMode=true;   continue; }
      if      (this.commandMode) this._execCmd(b);
      else if (this.dataMode)    this._writeDataByte(b);
    }
  }

  bindPins(map) {
    this.sdaPin = map.SDA?.number ?? null;
    this.sclPin = map.SCL?.number ?? null;
  }

  getElement() { return this._svg; }

  // ── Private helpers ───────────────────────────────────────────

  _setPixel(x, y, v) {
    x=Math.round(x); y=Math.round(y);
    if (x<0 || y<0 || x>=this.width || y>=this.height) return;
    this.pixels[y * this.width + x] = v;
  }

  // FIX Bug 2: _drawChar bit order fix — font5x7 mein column data hai
  // har column byte mein bit0 = top row, bit6 = bottom row
  _drawChar(x, y, ch, size, color, bg) {
    size  = size  ?? this.textSize;
    color = color ?? this.textColor;
    const f = font5x7[ch];
    if (!f) return;
    for (let col = 0; col < 5; col++) {
      let colData = f[col];
      for (let row = 0; row < 7; row++) {
        const on = (colData >> row) & 1;  // bit0 = row0 (top) — SAHI ORDER
        if (on || bg !== undefined) {
          const pv = on ? (color?1:0) : (bg?1:0);
          for (let dx = 0; dx < size; dx++)
            for (let dy = 0; dy < size; dy++)
              this._setPixel(x + col*size + dx, y + row*size + dy, pv);
        }
      }
    }
    // 1px gap column (char spacing)
    if (bg !== undefined) {
      for (let r = 0; r < 7*size; r++)
        this._setPixel(x + 5*size, y + r, bg?1:0);
    }
  }

  _writeText(text) {
    const size = this.textSize;
    for (const ch of text) {
      if (ch === '\n') { this._newline(); continue; }
      this._drawChar(this.cursorX, this.cursorY, ch);
      this.cursorX += 6 * size;
      // FIX Bug 9: _textWrap flag respect karo
      if (this._textWrap && this.cursorX + 5*size >= this.width) this._newline();
    }
    this._scheduleRender();
  }

  // FIX Minor: off-by-one fix — `>` nahi `>=`
  _newline() {
    const size = this.textSize;
    this.cursorX  = 0;
    this.cursorY += 8 * size;
    if (this.cursorY + 7*size > this.height) this.cursorY = 0;
  }

  // Corner helper for roundRect (quadrant bitmask: 1=top-left, 2=top-right, 4=bottom-right, 8=bottom-left)
  _drawCorner(x0, y0, r, corner, color) {
    let x=0, y=r, d=1-r;
    while (x<=y) {
      if (corner&4) { this._setPixel(x0+x, y0+y, color?1:0); this._setPixel(x0+y, y0+x, color?1:0); }
      if (corner&2) { this._setPixel(x0+x, y0-y, color?1:0); this._setPixel(x0+y, y0-x, color?1:0); }
      if (corner&8) { this._setPixel(x0-y, y0+x, color?1:0); this._setPixel(x0-x, y0+y, color?1:0); }
      if (corner&1) { this._setPixel(x0-y, y0-x, color?1:0); this._setPixel(x0-x, y0-y, color?1:0); }
      if (d<0) d+=2*x+3; else { d+=2*(x-y)+5; y--; }
      x++;
    }
  }

  _fillCorner(x0, y0, r, corner, color) {
    let x=0, y=r, d=1-r;
    while (x<=y) {
      if (corner&4) { this.drawFastVLine(x0+x, y0, y+1, color); this.drawFastVLine(x0+y, y0, x+1, color); }
      if (corner&2) { this.drawFastVLine(x0+x, y0-y, y+1, color); this.drawFastVLine(x0+y, y0-x, x+1, color); }
      if (corner&8) { this.drawFastVLine(x0-x-1, y0, y+1, color); this.drawFastVLine(x0-y-1, y0, x+1, color); }
      if (corner&1) { this.drawFastVLine(x0-x-1, y0-y, y+1, color); this.drawFastVLine(x0-y-1, y0-x, x+1, color); }
      if (d<0) d+=2*x+3; else { d+=2*(x-y)+5; y--; }
      x++;
    }
  }

  // FIX Bug 1: pixel scaling — 128 logical pixels → 168 SVG pixels
  // scale = 168/128 = 1.3125 per pixel
  _flush() {
    if (!this._layer) return;
    const parts  = [];
    const W      = this.width;   // 128
    const H      = this.height;  // 64
    const px     = this.pixels;
    const ox     = 21;           // SVG display area x offset
    const oy     = 16;           // SVG display area y offset
    const scaleX = 168 / W;      // FIX: 1.3125 — har pixel 1.3125px wide
    const scaleY = 64  / H;      // 1.0 — height same hai

    const onColor  = this._inverted ? "#000d1a" : "#00eaff";
    const offColor = this._inverted ? "#00eaff" : null;   // off pixels sirf invert mode mein

    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const on = px[y * W + x];
        if (!on && !this._inverted) { x++; continue; }

        // Run-length: same state wale pixels ek rect mein
        let end = x + 1;
        while (end < W && px[y * W + end] === on) end++;

        const rx = ox + Math.round(x   * scaleX);
        const rw = Math.round(end * scaleX) - Math.round(x * scaleX);
        const ry = oy + Math.round(y   * scaleY);
        const rh = Math.max(1, Math.round(scaleY));
        const fill = on ? onColor : offColor;

        if (fill) {
          parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}"/>`);
        }
        x = end;
      }
    }
    this._layer.innerHTML = parts.join("");
  }

  _scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;
    requestAnimationFrame(() => {
      this._renderPending = false;
      this._flush();
    });
  }

  _execCmd(cmd) {
    if      (cmd === 0xAE) this.displayOn = false;
    else if (cmd === 0xAF) this.displayOn = true;
    else if (cmd === 0xA7) this._inverted = true;
    else if (cmd === 0xA6) this._inverted = false;
  }

  _writeDataByte(byte) {
    for (let bit = 0; bit < 8; bit++) {
      this._setPixel(this.cursorX, this.cursorY + bit, (byte >> bit) & 1);
    }
    this.cursorX++;
  }

  // FIX Minor: SVG viewBox height 160 kiya — pins (y=148) properly fit hain
  _createSVG() {
    const NS  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width",   "210");
    svg.setAttribute("height",  "160");
    svg.setAttribute("viewBox", "0 0 210 160");

    const el = (tag, attrs) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
    const txt = (content, attrs) => {
      const e = el("text", attrs);
      e.textContent = content;
      return e;
    };

    // PCB body
    svg.appendChild(el("rect", {
      x:"0", y:"0", width:"210", height:"160",
      rx:"6", ry:"6",
      fill:"#0a1628", stroke:"#1e3a5f", "stroke-width":"2",
    }));

    // Screen bezel
    svg.appendChild(el("rect", {
      x:"12", y:"8", width:"186", height:"82",
      rx:"5", ry:"5",
      fill:"#050d1a", stroke:"#0d2137", "stroke-width":"2",
    }));

    // Active display area — 168×64 (scaled from 128×64)
    svg.appendChild(el("rect", {
      x:"21", y:"16", width:"168", height:"64",
      fill:"#000d1a",
    }));

    // Pixel layer
    svg.appendChild(el("g", { id:"oledPixelLayer" }));

    // Glare strip
    svg.appendChild(el("rect", {
      x:"21", y:"16", width:"168", height:"10",
      rx:"2", fill:"rgba(255,255,255,0.04)",
      "pointer-events":"none",
    }));

    // Model label
    svg.appendChild(txt("SSD1306  0.96\"  I2C", {
      x:"105", y:"100",
      "font-size":"7", fill:"#1e5f8f",
      "font-family":"monospace", "text-anchor":"middle",
      "letter-spacing":"1",
    }));

    // Pin labels
    const pinLabels = [
      { label:"GND", x:"63"  },
      { label:"VCC", x:"83"  },
      { label:"SCL", x:"103" },
      { label:"SDA", x:"123" },
    ];
    for (const { label, x } of pinLabels) {
      svg.appendChild(txt(label, {
        x, y:"118",
        "font-size":"7", fill:"#4a9eff",
        "font-family":"monospace", "text-anchor":"middle",
      }));
    }

    // Pin connector block
    svg.appendChild(el("rect", {
      x:"48", y:"120", width:"84", height:"14",
      rx:"2", fill:"#111", stroke:"#333", "stroke-width":"0.5",
    }));

    // Pin legs
    for (let i = 0; i < 4; i++) {
      svg.appendChild(el("rect", {
        x: String(56 + i*20), y:"134",
        width:"4", height:"18",
        rx:"1", fill:"#b0b0b0",
      }));
    }

    return svg;
  }
}