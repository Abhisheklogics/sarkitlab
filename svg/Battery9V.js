"use strict";

const SMOOTH_TAU = 0.15;

export default class VirtualBattery9V {



  constructor(pins = {}, instanceName = null, registryId = null) {
    this.pinPositive  = pins.positive ?? null;
    this.pinNegative  = pins.negative ?? null;
    this.instanceName = instanceName  ?? null;
    this.voltage      = 9;
    this._sVt         = null;
    this._sI          = null;
    this._sSoc        = null;
    this.svg          = this.createSVG();
  }

  createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "200");
    svg.setAttribute("height",  "350");
    svg.setAttribute("viewBox", "0 0 200 350");

    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = `
      <linearGradient id="copperRealistic" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#3d1c04" />
        <stop offset="8%"   stop-color="#8a4b24" />
        <stop offset="18%"  stop-color="#f0a56c" />
        <stop offset="35%"  stop-color="#ffe1b8" />
        <stop offset="50%"  stop-color="#df8a45" />
        <stop offset="75%"  stop-color="#914d23" />
        <stop offset="90%"  stop-color="#ffb982" />
        <stop offset="100%" stop-color="#3d1c04" />
      </linearGradient>
      <linearGradient id="blackRealistic" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#050505" />
        <stop offset="10%"  stop-color="#2a2a2a" />
        <stop offset="25%"  stop-color="#111111" />
        <stop offset="50%"  stop-color="#1a1a1a" />
        <stop offset="80%"  stop-color="#0a0a0a" />
        <stop offset="95%"  stop-color="#222222" />
        <stop offset="100%" stop-color="#000000" />
      </linearGradient>
      <linearGradient id="glossOverlay" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="rgba(255,255,255,0)"    />
        <stop offset="15%"  stop-color="rgba(255,255,255,0.4)"  />
        <stop offset="20%"  stop-color="rgba(255,255,255,0)"    />
        <stop offset="85%"  stop-color="rgba(255,255,255,0)"    />
        <stop offset="90%"  stop-color="rgba(255,255,255,0.15)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0)"    />
      </linearGradient>
      <linearGradient id="chromeHoriz" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#555" />
        <stop offset="20%"  stop-color="#ddd" />
        <stop offset="40%"  stop-color="#fff" />
        <stop offset="60%"  stop-color="#999" />
        <stop offset="80%"  stop-color="#eee" />
        <stop offset="100%" stop-color="#444" />
      </linearGradient>
      <linearGradient id="chromeVert" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#fff" />
        <stop offset="30%"  stop-color="#eee" />
        <stop offset="70%"  stop-color="#aaa" />
        <stop offset="100%" stop-color="#555" />
      </linearGradient>
      <linearGradient id="rimLight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#fff" />
        <stop offset="10%"  stop-color="#999" />
        <stop offset="100%" stop-color="#333" />
      </linearGradient>
      <filter id="shadowHeavy" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="5" dy="12" stdDeviation="8" flood-color="#000" flood-opacity="0.6"/>
      </filter>
      <filter id="terminalHole">
        <feOffset dx="0" dy="4"/>
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite operator="out" in="SourceGraphic" in2="blur" result="inv"/>
        <feFlood flood-color="black" flood-opacity="0.9" result="color"/>
        <feComposite operator="in" in="color" in2="inv" result="shadow"/>
        <feComposite operator="over" in="shadow" in2="SourceGraphic"/>
      </filter>
      <filter id="crimpShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="2" stdDeviation="1" flood-color="#000" flood-opacity="0.8"/>
      </filter>
      <clipPath id="batClip">
        <rect x="25" y="60" width="150" height="260" rx="12" />
      </clipPath>
    `;
    svg.appendChild(defs);

    const bodyGroup = document.createElementNS(ns, "g");
    bodyGroup.setAttribute("filter", "url(#shadowHeavy)");

    const mk = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
      return el;
    };

    this._bodyRect = mk("rect", { x:"25", y:"60", width:"150", height:"260", rx:"12", fill:"url(#blackRealistic)" });
    bodyGroup.appendChild(this._bodyRect);

    bodyGroup.appendChild(mk("rect", { x:"25", y:"60", width:"150", height:"100", fill:"url(#copperRealistic)", "clip-path":"url(#batClip)" }));
    bodyGroup.appendChild(mk("rect", { x:"25", y:"70", width:"150", height:"6",   fill:"none", stroke:"#3d1c04", "stroke-width":"3", filter:"url(#crimpShadow)", "clip-path":"url(#batClip)" }));
    bodyGroup.appendChild(mk("line", { x1:"25", y1:"160", x2:"175", y2:"160", stroke:"#000",    "stroke-width":"3" }));
    bodyGroup.appendChild(mk("line", { x1:"25", y1:"162", x2:"175", y2:"162", stroke:"#ffb982", "stroke-width":"1", opacity:"0.3" }));
    bodyGroup.appendChild(mk("rect", { x:"25", y:"60", width:"150", height:"260", rx:"12", fill:"url(#glossOverlay)" }));
    bodyGroup.appendChild(mk("rect", { x:"30", y:"56", width:"140", height:"10",  rx:"4",  fill:"#1a1a1a", stroke:"#000", "stroke-width":"2" }));

    const negG = document.createElementNS(ns, "g");
    negG.appendChild(mk("rect",    { x:"45", y:"28", width:"40", height:"30", rx:"3", fill:"url(#chromeHoriz)", stroke:"#333", "stroke-width":"1" }));
    negG.appendChild(mk("ellipse", { cx:"65", cy:"28", rx:"20", ry:"8",  fill:"url(#rimLight)" }));
    negG.appendChild(mk("ellipse", { cx:"65", cy:"28", rx:"18", ry:"6",  fill:"url(#chromeVert)" }));
    negG.appendChild(mk("ellipse", { cx:"65", cy:"28", rx:"11", ry:"4",  fill:"#111", filter:"url(#terminalHole)" }));
    negG.appendChild(mk("line",    { x1:"53", y1:"30", x2:"53", y2:"58", stroke:"#333", "stroke-width":"1" }));
    negG.appendChild(mk("line",    { x1:"77", y1:"30", x2:"77", y2:"58", stroke:"#333", "stroke-width":"1" }));
    bodyGroup.appendChild(negG);

    const posG = document.createElementNS(ns, "g");
    posG.appendChild(mk("rect",    { x:"120", y:"32", width:"30", height:"26", fill:"url(#chromeHoriz)", stroke:"#333", "stroke-width":"1" }));
    posG.appendChild(mk("ellipse", { cx:"135", cy:"32", rx:"15", ry:"5",  fill:"url(#rimLight)" }));
    posG.appendChild(mk("rect",    { x:"123", y:"25", width:"24", height:"7", fill:"url(#chromeHoriz)" }));
    posG.appendChild(mk("ellipse", { cx:"135", cy:"25", rx:"12", ry:"4",  fill:"url(#rimLight)" }));
    posG.appendChild(mk("ellipse", { cx:"135", cy:"25", rx:"10", ry:"3",  fill:"url(#chromeVert)" }));
    posG.appendChild(mk("ellipse", { cx:"135", cy:"25", rx:"5",  ry:"1.5", fill:"rgba(0,0,0,0.2)" }));
    bodyGroup.appendChild(posG);

    svg.appendChild(bodyGroup);
    return svg;
  }

  updatePhysics({
    soc       = 1,
    voc       = 9.0,
    rint      = 2,
    current   = 0,
    vterminal = 9.0,
    dead      = false,
    overload  = false,
  collapsed = false,

} = {}) {
    if (!this.svg) return;

    if (dead) {
      this._sVt  = 0;
      this._sI   = 0;
      this._sSoc = 0;
    } else {
      const dt    = 0.016;
      const alpha = 1 - Math.exp(-dt / SMOOTH_TAU);
      this._sVt  = this._sVt  === null ? vterminal : this._sVt  + alpha * (vterminal - this._sVt);
      this._sI   = this._sI   === null ? current   : this._sI   + alpha * (current   - this._sI);
      this._sSoc = this._sSoc === null ? soc       : this._sSoc + alpha * (soc       - this._sSoc);
    }

    const dVt  = dead ? 0 : this._sVt;
    const dI   = dead ? 0 : this._sI;
    const dSoc = dead ? 0 : Math.max(0, Math.min(1, this._sSoc));

    if (this._bodyRect) {
      if (dead)          this._bodyRect.setAttribute("fill", "#1a1a1a");
      else if (overload) this._bodyRect.setAttribute("fill", "#3a0a00");
      else               this._bodyRect.setAttribute("fill", "url(#blackRealistic)");
    }

    let label = this.svg.querySelector("#bat9v-vt-label");
    if (!label) {
      const ns = "http://www.w3.org/2000/svg";
      label = document.createElementNS(ns, "text");
      label.setAttribute("id",          "bat9v-vt-label");
      label.setAttribute("x",           "100");
      label.setAttribute("y",           "230");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size",   "22");
      label.setAttribute("font-family", "monospace");
      label.setAttribute("font-weight", "bold");
      label.setAttribute("fill",        "#e0e0e0");
      this.svg.appendChild(label);
    }
    const vdrop = Math.max(0, (arguments[0]?.voc ?? dVt) - dVt).toFixed(2);
label.textContent = dead      ? "DEAD"
                  : collapsed ? `${dVt.toFixed(1)}V ↓`
                  : overload  ? `${dVt.toFixed(1)}V (−${vdrop}V)`
                  : `${dVt.toFixed(1)}V`;

    label.setAttribute("fill", dead ? "#616161" : overload ? "#ff6d00" : "#e0e0e0");

    let socBg = this.svg.querySelector("#bat9v-soc-bg");
    if (!socBg) {
      const ns = "http://www.w3.org/2000/svg";
      socBg = document.createElementNS(ns, "rect");
      socBg.setAttribute("id", "bat9v-soc-bg");
      socBg.setAttribute("x", "36"); socBg.setAttribute("y", "270");
      socBg.setAttribute("width", "128"); socBg.setAttribute("height", "8");
      socBg.setAttribute("rx", "4"); socBg.setAttribute("fill", "#1a1a1a");
      this.svg.appendChild(socBg);
    }

    let socBar = this.svg.querySelector("#bat9v-soc-bar");
    if (!socBar) {
      const ns = "http://www.w3.org/2000/svg";
      socBar = document.createElementNS(ns, "rect");
      socBar.setAttribute("id",     "bat9v-soc-bar");
      socBar.setAttribute("x",      "36");
      socBar.setAttribute("y",      "270");
      socBar.setAttribute("width",  "128");
      socBar.setAttribute("height", "8");
      socBar.setAttribute("rx",     "4");
      this.svg.appendChild(socBar);
    }
    socBar.setAttribute("width", String(Math.round(dSoc * 128)));
    socBar.setAttribute("fill",
      dead       ? "#424242"  :
      dSoc > 0.5 ? "#69f0ae" :
      dSoc > 0.2 ? "#ffca28" : "#ef5350"
    );

    let socTxt = this.svg.querySelector("#bat9v-soc-txt");
    if (!socTxt) {
      const ns = "http://www.w3.org/2000/svg";
      socTxt = document.createElementNS(ns, "text");
      socTxt.setAttribute("id",          "bat9v-soc-txt");
      socTxt.setAttribute("x",           "100");
      socTxt.setAttribute("y",           "295");
      socTxt.setAttribute("text-anchor", "middle");
      socTxt.setAttribute("font-size",   "11");
      socTxt.setAttribute("font-family", "monospace");
      socTxt.setAttribute("fill",        "#78909c");
      this.svg.appendChild(socTxt);
    }
    socTxt.textContent = dead
      ? "DEPLETED"
      : `${(dSoc * 100).toFixed(0)}% · ${(dI * 1000).toFixed(1)}mA`;
  }

  getElement() { return this.svg; }
}