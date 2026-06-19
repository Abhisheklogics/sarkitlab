import { AudioEngine } from "../src/utils/AudioEngine.js";

export default class VirtualBuzzer {
  constructor() {
    this.state      = false;
    this.freq       = null;
    this._osc       = null;
    this._gain      = null;
    this._audioCtx  = AudioEngine.ensure();
    this.svg        = this._createSVG();
  }

  _createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width",   "90");
    svg.setAttribute("height",  "90");
    svg.setAttribute("viewBox", "0 0 100 100");

    const body = document.createElementNS(ns, "circle");
    body.setAttribute("cx", "50"); body.setAttribute("cy", "50");
    body.setAttribute("r",  "40"); body.setAttribute("fill", "#1c1c1c");
    body.setAttribute("stroke", "#000"); body.setAttribute("stroke-width", "3");

    const top = document.createElementNS(ns, "circle");
    top.setAttribute("cx", "50"); top.setAttribute("cy", "50");
    top.setAttribute("r",  "30"); top.setAttribute("fill", "#2a2a2a");

    const hole = document.createElementNS(ns, "circle");
    hole.setAttribute("cx", "50"); hole.setAttribute("cy", "50");
    hole.setAttribute("r",   "6"); hole.setAttribute("fill", "#000");

    const minus = document.createElementNS(ns, "rect");
    minus.setAttribute("x", "43"); minus.setAttribute("y", "75");
    minus.setAttribute("width", "14"); minus.setAttribute("height", "3");
    minus.setAttribute("fill", "#eee");

    const plusV = document.createElementNS(ns, "rect");
    plusV.setAttribute("x", "49"); plusV.setAttribute("y", "17");
    plusV.setAttribute("width", "3"); plusV.setAttribute("height", "14");
    plusV.setAttribute("fill", "#eee");

    const plusH = document.createElementNS(ns, "rect");
    plusH.setAttribute("x", "43"); plusH.setAttribute("y", "23");
    plusH.setAttribute("width", "14"); plusH.setAttribute("height", "3");
    plusH.setAttribute("fill", "#eee");

    svg.append(body, top, hole, minus, plusV, plusH);
    this._body = body;
    this._top  = top;
    return svg;
  }

  getElement() { return this.svg; }

  playTone(freq = 1000, volume = 1) {
    if (this._audioCtx.state !== "running") return;

    freq   = Math.max(20, Math.min(20000, freq));
    volume = Math.max(0.02, Math.min(1, volume));

    if (this._osc && this.state && this.freq === freq) {
      this._gain.gain.setTargetAtTime(volume * 0.3, this._audioCtx.currentTime, 0.01);
      return;
    }

    this._destroyNodes();

    this._gain = this._audioCtx.createGain();
    this._gain.gain.setValueAtTime(0, this._audioCtx.currentTime);
    this._gain.gain.linearRampToValueAtTime(volume * 0.3, this._audioCtx.currentTime + 0.005);
    this._gain.connect(this._audioCtx.destination);

    this._osc = this._audioCtx.createOscillator();
    this._osc.type = "square";
    this._osc.frequency.setValueAtTime(freq, this._audioCtx.currentTime);
    this._osc.connect(this._gain);
    this._osc.start();

    this.state = true;
    this.freq  = freq;
    this._body.setAttribute("fill", "#ff9800");
    this._top.setAttribute("fill",  "#ffc107");
  }

  stopTone() {
    if (!this.state) return;
    this.state = false;
    this.freq  = null;
    this._fadeAndDestroy();
    this._body.setAttribute("fill", "#1c1c1c");
    this._top.setAttribute("fill",  "#2a2a2a");
  }

  _fadeAndDestroy() {
    if (!this._gain || !this._audioCtx) { this._destroyNodes(); return; }
    const t = this._audioCtx.currentTime;
    this._gain.gain.setTargetAtTime(0, t, 0.01);
    const osc  = this._osc;
    const gain = this._gain;
    this._osc  = null;
    this._gain = null;
    setTimeout(() => {
      try { osc?.stop(); osc?.disconnect(); gain?.disconnect(); } catch (_) {}
    }, 80);
  }

  _destroyNodes() {
    try { this._osc?.stop(); this._osc?.disconnect(); } catch (_) {}
    try { this._gain?.disconnect(); } catch (_) {}
    this._osc  = null;
    this._gain = null;
  }
}