"use strict";

const R_DARK = 37_503;
const GAMMA  = 0.699;
const R_MIN  = 100;
const R_MAX  = 500_000;
const MIN_LUX = 10;
const MAX_LUX = 1000;

function _calcR(lux) {
  return Math.max(R_MIN, Math.min(R_MAX,
    R_DARK / Math.pow(Math.max(0.1, lux), GAMMA)
  ));
}

export default class VirtualLDR {
  constructor(pins = {}, instanceName = null) {
    this.pinA         = pins.A ?? null;
    this.pinB         = pins.B ?? null;
    this.instanceName = instanceName ?? null;

    this.lux         = 300;
    this.voltage     = 0;
    this.current     = 0;
    this.resistance  = _calcR(300);
    this.power       = 0;
    this.onLuxChange = null;

    this._SX0 = 11;
    this._SW  = 118;
    this._SY  = 180;

    this.svg = this._buildSVG();
    this._injectStyles();
    this._bindEvents();
    this._sync();
  }

  getElement()    { return this.svg; }
  getLux()        { return this.lux; }
  getResistance() { return _calcR(this.lux); }

  setLux(lux) {
    this.lux = Math.max(MIN_LUX, Math.min(MAX_LUX, lux));
    this._sync();
  }

  reset() {
    this.lux = 300;
    this._sync();
    this.onLuxChange?.(this.lux);
  }

  _injectStyles() {
    if (document.getElementById("vldr-style")) return;
    const s = document.createElement("style");
    s.id = "vldr-style";
    s.textContent = `
      @keyframes vldr-ray { 0%{stroke-dashoffset:0;opacity:.3} 50%{opacity:1} 100%{stroke-dashoffset:-28;opacity:.3} }
      @keyframes vldr-pulse { 0%,100%{filter:drop-shadow(0 0 3px rgba(240,192,32,.25))} 50%{filter:drop-shadow(0 0 9px rgba(240,192,32,.65))} }
      .vldr-body { animation: vldr-pulse 2.6s ease-in-out infinite; }
      .vldr-ray  { stroke-dasharray:10 6; animation: vldr-ray 1.4s linear infinite; }
    `;
    document.head.appendChild(s);
  }

  _buildSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "140");
    svg.setAttribute("height",  "205");
    svg.setAttribute("viewBox", "0 0 140 205");
    svg.style.cssText = "cursor:pointer;user-select:none;overflow:visible;";

    const defs   = document.createElementNS(ns, "defs");
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "vldr-arr");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8"); marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "4"); marker.setAttribute("markerHeight", "4");
    marker.setAttribute("orient", "auto");
    const mp = document.createElementNS(ns, "path");
    mp.setAttribute("d", "M1.5 1L8.5 5L1.5 9");
    mp.setAttribute("fill", "#F0C020");
    marker.appendChild(mp);
    defs.appendChild(marker);
    svg.appendChild(defs);

    this._raysG = document.createElementNS(ns, "g");
    [
      [22,38,38,68,"0.00s"],[6,56,28,73,"0.18s"],[6,80,27,80,"0.36s"],
      [118,38,102,68,"0.54s"],[134,56,112,73,"0.72s"],[134,80,113,80,"0.90s"],
      [54,14,54,38,"0.27s"],[86,14,86,38,"0.45s"],
    ].forEach(([x1,y1,x2,y2,delay]) => {
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1",x1); l.setAttribute("y1",y1);
      l.setAttribute("x2",x2); l.setAttribute("y2",y2);
      l.setAttribute("stroke","#F0C020");
      l.setAttribute("stroke-width","2.2");
      l.setAttribute("stroke-linecap","round");
      l.setAttribute("marker-end","url(#vldr-arr)");
      l.classList.add("vldr-ray");
      l.style.animationDelay = delay;
      this._raysG.appendChild(l);
    });
    svg.appendChild(this._raysG);

    this._body = document.createElementNS(ns, "circle");
    this._body.setAttribute("cx","70"); this._body.setAttribute("cy","80");
    this._body.setAttribute("r","43");
    this._body.setAttribute("fill","#f0e8c8");
    this._body.setAttribute("stroke","#c8a060");
    this._body.setAttribute("stroke-width","2.5");
    this._body.classList.add("vldr-body");
    svg.appendChild(this._body);

    const track = document.createElementNS(ns, "path");
    track.setAttribute("d","M 45 59 Q 70 59 95 59 Q 95 70 70 70 Q 45 70 45 70 Q 45 81 70 81 Q 95 81 95 81 Q 95 92 70 92 Q 45 92 45 92 Q 45 103 70 103 Q 95 103 95 103");
    track.setAttribute("fill","none");
    track.setAttribute("stroke","#c07030");
    track.setAttribute("stroke-width","3.5");
    track.setAttribute("stroke-linecap","round");
    svg.appendChild(track);

    [54,86].forEach(x => {
      const leg = document.createElementNS(ns, "line");
      leg.setAttribute("x1",x); leg.setAttribute("y1",123);
      leg.setAttribute("x2",x); leg.setAttribute("y2",168);
      leg.setAttribute("stroke","#888");
      leg.setAttribute("stroke-width","3");
      leg.setAttribute("stroke-linecap","round");
      svg.appendChild(leg);
    });

    const badgeBg = document.createElementNS(ns, "rect");
    badgeBg.setAttribute("x","20"); badgeBg.setAttribute("y","0");
    badgeBg.setAttribute("width","100"); badgeBg.setAttribute("height","22");
    badgeBg.setAttribute("rx","7");
    badgeBg.setAttribute("fill","#111827");
    badgeBg.setAttribute("stroke","#F0C020");
    badgeBg.setAttribute("stroke-width","1");
    badgeBg.setAttribute("stroke-opacity","0.6");
    svg.appendChild(badgeBg);

    this._badgeTxt = document.createElementNS(ns, "text");
    this._badgeTxt.setAttribute("x","70"); this._badgeTxt.setAttribute("y","15.5");
    this._badgeTxt.setAttribute("text-anchor","middle");
    this._badgeTxt.setAttribute("fill","#F0C020");
    this._badgeTxt.setAttribute("font-size","11");
    this._badgeTxt.setAttribute("font-weight","700");
    this._badgeTxt.setAttribute("font-family","'Courier New',monospace");
    svg.appendChild(this._badgeTxt);

    const tBg = document.createElementNS(ns, "rect");
    tBg.setAttribute("x",String(this._SX0)); tBg.setAttribute("y",String(this._SY));
    tBg.setAttribute("width",String(this._SW)); tBg.setAttribute("height","6");
    tBg.setAttribute("rx","3"); tBg.setAttribute("fill","#1e293b");
    svg.appendChild(tBg);

    this._fill = document.createElementNS(ns, "rect");
    this._fill.setAttribute("x",String(this._SX0)); this._fill.setAttribute("y",String(this._SY));
    this._fill.setAttribute("width","0"); this._fill.setAttribute("height","6");
    this._fill.setAttribute("rx","3"); this._fill.setAttribute("fill","#F0C020");
    svg.appendChild(this._fill);

    this._thumb = document.createElementNS(ns, "circle");
    this._thumb.setAttribute("cx",String(this._SX0));
    this._thumb.setAttribute("cy",String(this._SY + 3));
    this._thumb.setAttribute("r","9");
    this._thumb.setAttribute("fill","#F0C020");
    this._thumb.setAttribute("stroke","#fff");
    this._thumb.setAttribute("stroke-width","1.5");
    this._thumb.style.cursor = "ew-resize";
    svg.appendChild(this._thumb);

    this._rvalEl = document.createElementNS(ns, "text");
    this._rvalEl.setAttribute("x","70");
    this._rvalEl.setAttribute("y",String(this._SY - 5));
    this._rvalEl.setAttribute("text-anchor","middle");
    this._rvalEl.setAttribute("fill","#60a0e0");
    this._rvalEl.setAttribute("font-size","8.5");
    this._rvalEl.setAttribute("font-weight","700");
    this._rvalEl.setAttribute("font-family","'Courier New',monospace");
    svg.appendChild(this._rvalEl);

    const mkLbl = (x, anchor, txt) => {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x",x); t.setAttribute("y","200");
      t.setAttribute("text-anchor",anchor);
      t.setAttribute("fill","#374151");
      t.setAttribute("font-size","8");
      t.setAttribute("font-family","'Courier New',monospace");
      t.textContent = txt;
      svg.appendChild(t);
    };
    mkLbl(String(this._SX0), "start", "10");
    mkLbl("70", "middle", "lux");
    mkLbl(String(this._SX0 + this._SW), "end", "1k");

    return svg;
  }

  _fillW() {
    return Math.round(Math.max(0, Math.min(1,
      (this.lux - MIN_LUX) / (MAX_LUX - MIN_LUX)
    )) * this._SW);
  }

  _rLabel() {
    const r = _calcR(this.lux);
    if (r >= 100_000) return `${(r/1_000).toFixed(0)}kΩ`;
    if (r >= 1_000)   return `${(r/1_000).toFixed(1)}kΩ`;
    return `${Math.round(r)}Ω`;
  }

  _sync() {
    const t = (this.lux - MIN_LUX) / (MAX_LUX - MIN_LUX);
    const w = this._fillW();

    this._badgeTxt.textContent = `${Math.round(this.lux)} lux`;
    this._fill.setAttribute("width", String(w));
    this._thumb.setAttribute("cx", String(this._SX0 + w));

    const g = Math.round(192 + t * 63);
    const b = Math.round(32  + t * 223);
    this._thumb.setAttribute("fill", `rgb(240,${g},${b})`);

    this._rvalEl.textContent = this._rLabel();

    this._raysG.setAttribute("opacity", (0.2 + 0.8 * t).toFixed(2));
    const dur = (1.8 - t * 0.9).toFixed(2) + "s";
    this._raysG.querySelectorAll(".vldr-ray").forEach(r => {
      r.style.animationDuration = dur;
    });

    const sat = Math.round(65 - t * 40);
    const lit = Math.round(82 + t * 15);
    this._body.setAttribute("fill", `hsl(46,${sat}%,${lit}%)`);
  }

  _bindEvents() {
    let dragging = false;

    const toSvgX = cx => {
      const r = this.svg.getBoundingClientRect();
      return (cx - r.left) * (140 / r.width);
    };

    const applyX = cx => {
      const svgX = toSvgX(cx);
      const t    = Math.max(0, Math.min(1, (svgX - this._SX0) / this._SW));
      this.lux   = MIN_LUX + t * (MAX_LUX - MIN_LUX);
      this._sync();
      this.onLuxChange?.(this.lux);
    };

    const inHit = (cx, cy) => {
      const r    = this.svg.getBoundingClientRect();
      const svgX = (cx - r.left) * (140 / r.width);
      const svgY = (cy - r.top)  * (205 / r.height);
      return svgX >= this._SX0 - 12 && svgX <= this._SX0 + this._SW + 12
          && svgY >= this._SY - 12  && svgY <= this._SY + 18;
    };

    this.svg.addEventListener("mousedown", e => {
      if (!inHit(e.clientX, e.clientY)) return;
      dragging = true;
      e.preventDefault();
      e.stopPropagation();
      applyX(e.clientX);
    });

    this._onMove = e => { if (dragging) { e.preventDefault(); applyX(e.clientX); } };
    this._onUp   = () => { dragging = false; };
    window.addEventListener("mousemove", this._onMove);
    window.addEventListener("mouseup",   this._onUp);

    this.svg.addEventListener("touchstart", e => {
      const touch = e.touches[0];
      if (!inHit(touch.clientX, touch.clientY)) return;
      dragging = true;
      e.stopPropagation();
      applyX(touch.clientX);
    }, { passive: true });

    this.svg.addEventListener("touchmove", e => {
      if (!dragging) return;
      e.preventDefault();
      applyX(e.touches[0].clientX);
    }, { passive: false });

    this.svg.addEventListener("touchend", () => { dragging = false; });
  }

  destroy() {
    window.removeEventListener("mousemove", this._onMove);
    window.removeEventListener("mouseup",   this._onUp);
  }
}