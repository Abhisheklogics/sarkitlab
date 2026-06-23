import MQ2SVG   from "./mq2.svg.js";
import MQ3SVG   from "./mq3.svg.js";
import MQ4SVG   from "./mq4.svg.js";
import MQ5SVG   from "./mq5.svg.js";
import MQ6SVG   from "./mq6.svg.js";
import MQ7SVG   from "./mq7.svg.js";
import MQ8SVG   from "./mq8.svg.js";
import MQ9SVG   from "./mq9.svg.js";
import MQ131SVG from "./mq131.svg.js";
import MQ135SVG from "./mq135.svg.js";
import GasSensorModel from "../src/models/Sensors/gassensors.js";

const SENSOR_TEMPLATES = {
  "MQ-2": MQ2SVG, "MQ-3": MQ3SVG, "MQ-4": MQ4SVG,
  "MQ-5": MQ5SVG, "MQ-6": MQ6SVG, "MQ-7": MQ7SVG,
  "MQ-8": MQ8SVG, "MQ-9": MQ9SVG,
  "MQ-131": MQ131SVG, "MQ-135": MQ135SVG,
};

const SENSOR_COLORS = {
  "MQ-2":   "#9e9e9e",
  "MQ-3":   "#ffee58",
  "MQ-4":   "#29b6f6",
  "MQ-5":   "#ffa726",
  "MQ-6":   "#ec407a",
  "MQ-7":   "#ce93d8",
  "MQ-8":   "#ef5350",
  "MQ-9":   "#aed581",
  "MQ-131": "#ffca28",
  "MQ-135": "#66bb6a",
};

const ADC_MAX    = 1023;
const VREF       = 5.0;
const MAX_PARTS  = 40;

export default class MQSensorIC {

  constructor(id, data, simEngine) {
    if (!id)   throw new TypeError("[MQSensorIC] id required");
    if (!data) throw new TypeError("[MQSensorIC] data required");

    this.id        = id;
    this.simEngine = simEngine ?? null;
    this.modelName = data.name ?? "MQ-2";

    const db = GasSensorModel.getSensorDB();
    this.spec = db[this.modelName] ?? db["MQ-2"];

    this.startTime        = Date.now();
    this.currentPPM       = this.spec.ppmMin;
    this.currentAnalog    = 0;
    this.outputVoltage    = 0;
    this.isTriggered      = false;
    this.doTriggered      = false;
    this.powered          = false;
    this.poweredPrev      = false;
    this.warmupDone       = false;
    this.warmupFactor     = 0;
    this.heaterPhase      = "HIGH";
    this.calibratedR0     = this.spec.R0;
    this.lastRs           = this.spec.R0;
    this.lastRsR0         = 1.0;
    this.thresholdVoltage = 2.5;
    this.hasAO            = false;
    this.hasDO            = false;

    this.panel       = null;
    this.panelOpen   = false;
    this.animFrame   = null;
    this.particles   = [];
    this.canvas      = null;
    this.ctx         = null;

    this.potAngle    = this.voltageToAngle(this.thresholdVoltage);
    this.potDragging = false;
    this.potLastY    = 0;

    this.boundPotMove  = this.onPotMove.bind(this);
    this.boundPotUp    = this.onPotUp.bind(this);
    this.boundOutside  = this.onOutsideClick.bind(this);

    this.svg       = this.createSVG();
    this.statusLed = this.svg.querySelector("[data-led]");
    this.barFill   = this.svg.querySelector("#gasFill");
  }

  getAnalogValue() { return Math.round(this.currentAnalog); }
  getVoltage()     { return this.outputVoltage; }
  getElement()     { return this.svg; }

  getPinDefs() {
    return [
      { id: "VCC", x: 20, y: 148 },
      { id: "GND", x: 40, y: 148 },
      { id: "DO",  x: 60, y: 148 },
      { id: "AO",  x: 80, y: 148 },
    ];
  }

  setPowered(powered) {
    const wasPowered = this.powered;
    this.powered     = powered;
    if (powered && !wasPowered) {
      this.startTime   = Date.now();
      this.warmupDone  = false;
      this.warmupFactor = 0;
    }
    if (!powered) {
      this.warmupDone      = false;
      this.warmupFactor    = 0;
      this.poweredPrev     = false;
      this.currentAnalog   = 0;
      this.outputVoltage   = 0;
      this.isTriggered     = false;
      this.doTriggered     = false;
      this.heaterPhase     = "HIGH";
      this.updateVisuals(false);
    }
    if (this.panelOpen) this.renderPanel();
  }

  setDigitalMode(hasAO, hasDO) {
    this.hasAO = hasAO;
    this.hasDO = hasDO;
  }

  updateFromModel(ppm, voltage, adc, triggered) {
    this.currentPPM    = ppm;
    this.outputVoltage = voltage;
    this.currentAnalog = adc;
    this.isTriggered   = triggered;
    this.updateVisuals(triggered);
    if (this.panelOpen) this.refreshPanelLive();
  }

  reset() {
    this.closePanel();
    this.currentPPM      = this.spec.ppmMin;
    this.currentAnalog   = 0;
    this.outputVoltage   = 0;
    this.isTriggered     = false;
    this.doTriggered     = false;
    this.powered         = false;
    this.warmupDone      = false;
    this.warmupFactor    = 0;
    this.heaterPhase     = "HIGH";
    this.calibratedR0    = this.spec.R0;
    this.updateVisuals(false);
    this.simEngine       = null;
  }

  destroy() { this.closePanel(); }

  voltageToAngle(v) { return -135 + (Math.max(0, Math.min(VREF, v)) / VREF) * 270; }
  angleToVoltage(a) { return Math.max(0, Math.min(VREF, ((a + 135) / 270) * VREF)); }

  createSVG() {
    const ns  = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 150");
    svg.setAttribute("width",   "100");
    svg.setAttribute("height",  "150");
    svg.style.overflow = "visible";
    svg.style.cursor   = "pointer";
    svg.title          = `${this.modelName} — double-click to open panel`;
    const template     = SENSOR_TEMPLATES[this.modelName] || MQ2SVG;
    svg.innerHTML      = template(null, this.spec, this.modelName);
    svg.addEventListener("dblclick", e => {
      e.stopPropagation();
      this.panelOpen ? this.closePanel() : this.openPanel();
    });
    return svg;
  }

  updateVisuals(triggered) {
    if (this.statusLed)
      this.statusLed.setAttribute("fill", triggered ? "#ff1744" : "#37474f");

    if (this.barFill) {
      const pct = Math.round((this.currentAnalog / ADC_MAX) * 38);
      this.barFill.setAttribute("height", String(pct));
      this.barFill.setAttribute("y",      String(62 - pct));
      const hue = Math.round((1 - this.currentAnalog / ADC_MAX) * 120);
      this.barFill.setAttribute("fill", `hsl(${hue},80%,45%)`);
    }
  }

  openPanel() {
    if (this.panel) { this.panelOpen = true; this.renderPanel(); return; }
    const panel  = document.createElement("div");
    this.panel   = panel;
    Object.assign(panel.style, {
      position:     "fixed",
      top:          "60px",
      right:        "12px",
      width:        "300px",
      background:   "#0d1929",
      border:       "1.5px solid #1e3a5f",
      borderRadius: "12px",
      padding:      "14px",
      zIndex:       "99999",
      fontFamily:   "monospace",
      color:        "#e3f2fd",
      boxShadow:    "0 8px 32px rgba(0,0,0,0.7)",
      userSelect:   "none",
      maxHeight:    "90vh",
      overflowY:    "auto",
    });
    document.body.appendChild(panel);
    this.panelOpen = true;
    setTimeout(() => document.addEventListener("mousedown", this.boundOutside), 100);
    this.renderPanel();
    this.startParticleLoop();
  }

  closePanel() {
    if (this.panel) { this.panel.remove(); this.panel = null; }
    this.panelOpen = false;
    if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
    document.removeEventListener("mousedown", this.boundOutside);
    window.removeEventListener("mousemove", this.boundPotMove);
    window.removeEventListener("mouseup",   this.boundPotUp);
  }

  onOutsideClick(e) {
    if (this.panel && !this.panel.contains(e.target) && !this.svg.contains(e.target))
      this.closePanel();
  }

  renderPanel() {
    const panel = this.panel;
    if (!panel) return;

    const spec       = this.spec;
    const adc        = Math.round(this.currentAnalog);
    const volt       = this.outputVoltage.toFixed(3);
    const rs         = Math.round(this.lastRs ?? spec.R0);
    const r0         = Math.round(this.calibratedR0);
    const rsR0       = (this.lastRsR0 ?? 1).toFixed(3);
    const thrV       = this.thresholdVoltage.toFixed(2);
    const triggered  = this.isTriggered;
    const ppm        = Math.round(this.currentPPM);
    const warmupPct  = Math.round((this.warmupFactor ?? 0) * 100);
    const color      = SENSOR_COLORS[this.modelName] ?? "#42a5f5";

    const fmtR = v => v >= 1000 ? (v / 1000).toFixed(1) + "kΩ" : v + "Ω";

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <span style="font-size:15px;font-weight:700;color:${color};">${this.modelName}</span>
          <span style="font-size:10px;color:#78909c;margin-left:6px;">${spec.targetGas}</span>
        </div>
        <button id="mqClose" style="background:none;border:none;color:#546e7a;font-size:16px;cursor:pointer;padding:2px 6px;">✕</button>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Sensor Parameters</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">PPM</div>
            <div id="lv_ppm" style="font-size:13px;font-weight:700;color:${color};">${ppm}</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">Rs</div>
            <div id="lv_rs" style="font-size:13px;font-weight:700;color:#42a5f5;">${fmtR(rs)}</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">Rs/R0</div>
            <div id="lv_rsr0" style="font-size:13px;font-weight:700;color:#80cbc4;">${rsR0}</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">R0 (calibrated)</div>
            <div id="lv_r0" style="font-size:13px;font-weight:700;color:#90a4ae;">${fmtR(r0)}</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">RL</div>
            <div style="font-size:13px;font-weight:700;color:#90a4ae;">${fmtR(spec.RL)}</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">AO Voltage</div>
            <div id="lv_ao" style="font-size:13px;font-weight:700;color:#ffa726;">${volt}V</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">ADC Reading</div>
            <div id="lv_adc" style="font-size:13px;font-weight:700;color:#ffa726;">${adc}</div>
          </div>
          <div style="background:#0a1520;border-radius:6px;padding:6px;">
            <div style="font-size:8px;color:#546e7a;">Warm-up</div>
            <div id="lv_wu" style="font-size:13px;font-weight:700;color:${warmupPct >= 99 ? '#69f0ae' : '#ffca28'};">${warmupPct}%</div>
          </div>
        </div>

        <div style="margin-top:8px;background:#0a1520;border-radius:6px;padding:6px;display:flex;align-items:center;gap:8px;">
          <div style="font-size:8px;color:#546e7a;">Heater</div>
          ${spec.heaterCycle
            ? `<div id="lv_heat" style="font-size:10px;font-weight:700;color:${this.heaterPhase === 'HIGH' ? '#ef5350' : '#42a5f5'};">${this.heaterPhase} (${this.heaterPhase === 'HIGH' ? spec.heaterCycle.highV + 'V' : spec.heaterCycle.lowV + 'V'})</div>`
            : `<div style="font-size:10px;color:#69f0ae;">Continuous ${spec.heaterVoltage}V</div>`
          }
        </div>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Voltage Divider</div>
        <div style="display:flex;align-items:stretch;gap:0;">
          <div style="display:flex;flex-direction:column;align-items:center;width:36px;">
            <div style="font-size:9px;color:#ffa726;font-weight:700;">VCC</div>
            <div style="font-size:9px;color:#ffa726;">5V</div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;">
            <div style="width:2px;height:10px;background:#546e7a;"></div>
            <div style="border:1.5px solid #42a5f5;border-radius:4px;padding:4px 8px;background:#0a1520;width:90px;text-align:center;">
              <div style="font-size:8px;color:#78909c;">Rs (sensor)</div>
              <div id="dv_rs" style="font-size:11px;font-weight:700;color:#42a5f5;">${fmtR(rs)}</div>
            </div>
            <div style="width:2px;height:6px;background:#546e7a;"></div>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="width:8px;height:2px;background:#546e7a;"></div>
              <div style="background:#1b3a20;border:1.5px solid #4caf50;border-radius:10px;padding:3px 8px;">
                <span style="font-size:9px;color:#69f0ae;font-weight:700;">AO</span>
                <span id="dv_ao" style="font-size:11px;color:#ffa726;font-weight:700;margin-left:4px;">${volt}V</span>
              </div>
              <div style="width:8px;height:2px;background:#546e7a;"></div>
            </div>
            <div style="width:2px;height:6px;background:#546e7a;"></div>
            <div style="border:1.5px solid #546e7a;border-radius:4px;padding:4px 8px;background:#0a1520;width:90px;text-align:center;">
              <div style="font-size:8px;color:#78909c;">RL (load)</div>
              <div style="font-size:11px;font-weight:700;color:#90a4ae;">${fmtR(spec.RL)}</div>
            </div>
            <div style="width:2px;height:10px;background:#546e7a;"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:36px;">
            <div style="font-size:9px;color:#78909c;">GND</div>
            <div style="font-size:9px;color:#78909c;">0V</div>
          </div>
        </div>
        <div style="margin-top:6px;font-size:9px;color:#37474f;text-align:center;">
          V<sub>AO</sub> = 5V × RL / (Rs + RL) — Rs↓ means gas↑
        </div>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Gas Concentration</div>
        <canvas id="mqParticleCanvas" width="272" height="60"
          style="border-radius:6px;display:block;width:100%;background:#060e1a;margin-bottom:8px;"></canvas>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#78909c;margin-bottom:4px;">
          <span>${spec.ppmMin} PPM</span>
          <span id="ppm_display" style="color:${color};font-weight:700;">${ppm} PPM</span>
          <span>${spec.ppmMax} PPM</span>
        </div>
        <input id="mqPPMSlider" type="range"
          min="${spec.ppmMin}" max="${spec.ppmMax}" value="${ppm}"
          step="${Math.max(1, Math.round((spec.ppmMax - spec.ppmMin) / 200))}"
          style="width:100%;accent-color:${color};cursor:pointer;"/>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Rs/R0 Datasheet Curve</div>
        <canvas id="mqGraphCanvas" width="272" height="100"
          style="border-radius:6px;display:block;width:100%;background:#030a12;"></canvas>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;margin-bottom:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">LM393 Comparator / DO Output</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <svg id="mqPotSVG" width="60" height="60" viewBox="0 0 64 64" style="cursor:ns-resize;flex-shrink:0;">
            <circle cx="32" cy="32" r="28" fill="#1a2744" stroke="#253560" stroke-width="2"/>
            <circle cx="32" cy="32" r="20" fill="#0d1929" stroke="#1e3a5f" stroke-width="1.5"/>
            <path d="M 10.3 53.7 A 28 28 0 1 1 53.7 53.7" fill="none" stroke="#1e3a5f" stroke-width="4" stroke-linecap="round"/>
            <path id="mqPotArc" d="" fill="none" stroke="#42a5f5" stroke-width="4" stroke-linecap="round"/>
            <line id="mqPotLine" x1="32" y1="32" x2="32" y2="12"
              stroke="#e3f2fd" stroke-width="2.5" stroke-linecap="round"
              transform="rotate(${this.potAngle.toFixed(1)},32,32)"/>
            <circle cx="32" cy="32" r="4" fill="#42a5f5"/>
          </svg>
          <div style="flex:1;">
            <div style="font-size:10px;color:#90a4ae;">
              Threshold = <span id="thrVLabel" style="color:#ffa726;font-weight:700;">${thrV}V</span>
            </div>
            <div style="font-size:9px;color:#37474f;margin-top:2px;">Drag ↕ to adjust voltage</div>
            <div style="margin-top:6px;font-size:9px;color:#546e7a;">
              AO <span id="cmp_ao" style="color:#ffa726;">${volt}V</span>
              <span id="cmp_op" style="margin:0 4px;">${parseFloat(volt) > parseFloat(thrV) ? '>' : parseFloat(volt) < parseFloat(thrV) ? '<' : '='}</span>
              THR <span id="cmp_thr" style="color:#42a5f5;">${thrV}V</span>
            </div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
              <div style="width:10px;height:10px;border-radius:50%;
                background:${triggered ? '#ff1744' : '#00c853'};
                box-shadow:0 0 ${triggered ? '8' : '4'}px ${triggered ? '#ff1744' : '#00c853'};"></div>
              <span style="font-size:9px;color:${triggered ? '#ff5252' : '#69f0ae'};">
                DO ${triggered ? 'LOW (comparator tripped)' : 'HIGH (below threshold)'}
              </span>
            </div>
            <div style="margin-top:4px;font-size:8px;color:#37474f;">
              Hysteresis: ${(0.1).toFixed(2)}V
            </div>
          </div>
        </div>
      </div>

      <div style="background:#060e1a;border-radius:8px;padding:10px;">
        <div style="font-size:9px;color:#78909c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Calibration</div>
        <div style="font-size:9px;color:#546e7a;margin-bottom:8px;">
          Place sensor in clean air, then press calibrate. Current Rs becomes R0.
        </div>
        <button id="mqCalibrate"
          style="width:100%;padding:8px;background:#1a3a1a;border:1.5px solid #4caf50;
          border-radius:6px;color:#69f0ae;font-family:monospace;font-size:10px;
          cursor:pointer;letter-spacing:1px;font-weight:700;">
          CALIBRATE IN CLEAN AIR
        </button>
        <div id="calResult" style="font-size:9px;color:#37474f;margin-top:6px;text-align:center;"></div>
      </div>
    `;

    panel.querySelector("#mqClose")?.addEventListener("click", () => this.closePanel());

    const slider = panel.querySelector("#mqPPMSlider");
    if (slider) slider.addEventListener("input", () => this.setPPM(parseFloat(slider.value)));

    const potSVG = panel.querySelector("#mqPotSVG");
    if (potSVG) {
      potSVG.addEventListener("mousedown", e => {
        e.preventDefault();
        this.potDragging = true;
        this.potLastY    = e.clientY;
        window.addEventListener("mousemove", this.boundPotMove);
        window.addEventListener("mouseup",   this.boundPotUp);
      });
      potSVG.addEventListener("touchstart", e => {
        e.preventDefault();
        this.potDragging = true;
        this.potLastY    = e.touches[0].clientY;
        window.addEventListener("touchmove", this.boundPotMove, { passive: false });
        window.addEventListener("touchend",  this.boundPotUp);
      }, { passive: false });
      this.updatePotVisual(panel);
    }

    const calBtn = panel.querySelector("#mqCalibrate");
    if (calBtn) {
      calBtn.addEventListener("click", () => {
        const rs = this.lastRs ?? this.spec.R0;
        if (rs > 50 && this.powered) {
          this.calibratedR0 = rs;
          const res = panel.querySelector("#calResult");
          if (res) res.textContent = `R0 set to ${rs >= 1000 ? (rs/1000).toFixed(1)+'kΩ' : rs+'Ω'}`;
          const r0el = panel.querySelector("#lv_r0");
          if (r0el) r0el.textContent = rs >= 1000 ? (rs/1000).toFixed(1)+'kΩ' : Math.round(rs)+'Ω';
        } else {
          const res = panel.querySelector("#calResult");
          if (res) res.textContent = "Power on sensor first.";
        }
      });
    }

    this.canvas = panel.querySelector("#mqParticleCanvas");
    if (this.canvas) this.ctx = this.canvas.getContext("2d");

    this.drawDatasheetGraph(panel);
  }

  refreshPanelLive() {
    const panel = this.panel;
    if (!panel) return;

    const adc    = Math.round(this.currentAnalog);
    const volt   = this.outputVoltage.toFixed(3);
    const rs     = Math.round(this.lastRs ?? this.spec.R0);
    const rsR0   = (this.lastRsR0 ?? 1).toFixed(3);
    const thrV   = this.thresholdVoltage.toFixed(2);
    const ppm    = Math.round(this.currentPPM);
    const warmup = Math.round((this.warmupFactor ?? 0) * 100);

    const fmtR = v => v >= 1000 ? (v/1000).toFixed(1)+'kΩ' : v+'Ω';
    const set  = (id, v) => { const e = panel.querySelector(id); if (e) e.textContent = v; };

    set("#lv_ppm",  ppm + " PPM");
    set("#lv_rs",   fmtR(rs));
    set("#lv_rsr0", rsR0);
    set("#lv_ao",   volt + "V");
    set("#lv_adc",  adc);
    set("#lv_wu",   warmup + "%");
    set("#dv_rs",   fmtR(rs));
    set("#dv_ao",   volt + "V");
    set("#ppm_display", ppm + " PPM");
    set("#cmp_ao",  volt + "V");
    set("#cmp_thr", thrV + "V");
    set("#cmp_op",  parseFloat(volt) > parseFloat(thrV) ? '>' : parseFloat(volt) < parseFloat(thrV) ? '<' : '=');

    const heaterEl = panel.querySelector("#lv_heat");
    if (heaterEl && this.spec.heaterCycle) {
      heaterEl.textContent = `${this.heaterPhase} (${this.heaterPhase === 'HIGH' ? this.spec.heaterCycle.highV+'V' : this.spec.heaterCycle.lowV+'V'})`;
      heaterEl.style.color = this.heaterPhase === "HIGH" ? "#ef5350" : "#42a5f5";
    }

    const wuEl = panel.querySelector("#lv_wu");
    if (wuEl) wuEl.style.color = warmup >= 99 ? "#69f0ae" : "#ffca28";

    this.drawDatasheetGraph(panel);
  }

  setPPM(ppm) {
    const spec       = this.spec;
    this.currentPPM  = Math.max(spec.ppmMin, Math.min(spec.ppmMax, ppm));

    const rsR0 = GasSensorModel.interpolateRsR0(spec.curve, this.currentPPM);
    const rs   = rsR0 * (this.calibratedR0 ?? spec.R0);
    const vAO  = this.powered ? 5.0 * spec.RL / (rs + spec.RL) : 0;
    const adc  = Math.round((vAO / 5.0) * ADC_MAX);

    this.lastRs        = rs;
    this.lastRsR0      = rsR0;
    this.outputVoltage = vAO;
    this.currentAnalog = adc;

    const thrV = this.thresholdVoltage;
    if (!this.doTriggered && vAO > thrV)
      this.doTriggered = true;
    else if (this.doTriggered && vAO < thrV - 0.1)
      this.doTriggered = false;

    this.isTriggered = this.doTriggered;
    this.updateVisuals(this.isTriggered);

    if (this.panelOpen) this.refreshPanelLive();

    this.simEngine?.resolveElectrical?.();
  }

  onPotMove(e) {
    if (!this.potDragging) return;
    const clientY         = e.touches ? e.touches[0].clientY : e.clientY;
    const delta           = this.potLastY - clientY;
    this.potLastY         = clientY;
    this.potAngle         = Math.max(-135, Math.min(135, this.potAngle + delta * 1.2));
    this.thresholdVoltage = this.angleToVoltage(this.potAngle);

    if (this.panel) {
      const tv = this.panel.querySelector("#thrVLabel");
      if (tv) tv.textContent = this.thresholdVoltage.toFixed(2) + "V";
      this.updatePotVisual(this.panel);
    }
    e.preventDefault?.();
  }

  onPotUp() {
    this.potDragging = false;
    window.removeEventListener("mousemove", this.boundPotMove);
    window.removeEventListener("mouseup",   this.boundPotUp);
    window.removeEventListener("touchmove", this.boundPotMove);
    window.removeEventListener("touchend",  this.boundPotUp);
    if (this.panel) this.renderPanel();
  }

  updatePotVisual(panel) {
    const line = panel?.querySelector("#mqPotLine");
    const arc  = panel?.querySelector("#mqPotArc");
    if (line) line.setAttribute("transform", `rotate(${this.potAngle.toFixed(1)},32,32)`);
    if (arc)  arc.setAttribute("d", this.buildArcPath(this.potAngle));
  }

  buildArcPath(angle) {
    const r     = 28, cx = 32, cy = 32;
    const toRad = d => (d - 90) * Math.PI / 180;
    const start = -135;
    const x1    = cx + r * Math.cos(toRad(start));
    const y1    = cy + r * Math.sin(toRad(start));
    const x2    = cx + r * Math.cos(toRad(angle));
    const y2    = cy + r * Math.sin(toRad(angle));
    const large = (angle - start) > 180 ? 1 : 0;
    if (Math.abs(angle - start) < 2) return "";
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  drawDatasheetGraph(panel) {
    const canvas = panel?.querySelector("#mqGraphCanvas");
    if (!canvas) return;
    const ctx  = canvas.getContext("2d");
    const W    = canvas.width;
    const H    = canvas.height;
    const spec = this.spec;
    const color = SENSOR_COLORS[this.modelName] ?? "#42a5f5";

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#030a12";
    ctx.fillRect(0, 0, W, H);

    const padL = 36, padR = 10, padT = 10, padB = 24;
    const gW = W - padL - padR;
    const gH = H - padT - padB;

    const curve  = spec.curve;
    const ppmMin = curve[0].ppm;
    const ppmMax = curve[curve.length - 1].ppm;
    const rMin   = curve[curve.length - 1].rsr0 * 0.5;
    const rMax   = curve[0].rsr0 * 1.5;

    const xMap = ppm => padL + (Math.log10(ppm) - Math.log10(ppmMin)) / (Math.log10(ppmMax) - Math.log10(ppmMin)) * gW;
    const yMap = r   => padT + gH - (Math.log10(r) - Math.log10(rMin)) / (Math.log10(rMax) - Math.log10(rMin)) * gH;

    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth   = 0.5;
    [0.2, 0.5, 1, 2, 5].forEach(r => {
      if (r < rMin || r > rMax) return;
      const y = yMap(r);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gW, y); ctx.stroke();
      ctx.fillStyle = "#37474f"; ctx.font = "8px monospace"; ctx.textAlign = "right";
      ctx.fillText(r.toFixed(1), padL - 3, y + 3);
    });

    const ppmTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].filter(p => p >= ppmMin && p <= ppmMax);
    ppmTicks.forEach(p => {
      const x = xMap(p);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + gH); ctx.stroke();
      ctx.fillStyle = "#37474f"; ctx.font = "7px monospace"; ctx.textAlign = "center";
      ctx.fillText(p >= 1000 ? p/1000+'k' : p, x, padT + gH + 14);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    curve.forEach((pt, i) => {
      const x = xMap(pt.ppm);
      const y = yMap(pt.rsr0);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    const curPPM  = this.currentPPM;
    const curRsR0 = this.lastRsR0 ?? 1;
    if (curPPM >= ppmMin && curPPM <= ppmMax && curRsR0 >= rMin && curRsR0 <= rMax) {
      const ox = xMap(curPPM);
      const oy = yMap(curRsR0);
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.fillStyle = "#546e7a"; ctx.font = "7px monospace"; ctx.textAlign = "left";
    ctx.fillText("Rs/R0", 2, padT + 8);
    ctx.textAlign = "center";
    ctx.fillText("PPM", padL + gW / 2, H - 2);
  }

  startParticleLoop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    const loop = () => {
      if (!this.panelOpen) return;
      this.tickParticles();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  tickParticles() {
    const canvas = this.canvas;
    const ctx    = this.ctx;
    if (!canvas || !ctx) return;

    const W      = canvas.width;
    const H      = canvas.height;
    const spec   = this.spec;
    const ppm    = this.currentPPM;
    const t      = (Math.log10(Math.max(ppm, spec.ppmMin)) - Math.log10(spec.ppmMin)) /
                   (Math.log10(spec.ppmMax) - Math.log10(spec.ppmMin));
    const color  = SENSOR_COLORS[this.modelName] ?? "#42a5f5";
    const target = Math.floor(t * MAX_PARTS);

    while (this.particles.length < target) {
      this.particles.push({
        x: Math.random() * W, y: H * 0.9 + Math.random() * H * 0.1,
        vx: (Math.random() - 0.5) * 0.6, vy: -(Math.random() * 0.8 + 0.2),
        r: Math.random() * 2.5 + 1, op: Math.random() * 0.6 + 0.2,
        life: Math.random() * 100 + 60, age: 0,
      });
    }
    while (this.particles.length > target) this.particles.shift();

    ctx.clearRect(0, 0, W, H);

    const r2 = parseInt(color.slice(1, 3), 16);
    const g2 = parseInt(color.slice(3, 5), 16);
    const b2 = parseInt(color.slice(5, 7), 16);

    if (t > 0.05) {
      ctx.fillStyle = `rgba(${r2},${g2},${b2},${t * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }

    this.particles = this.particles.filter(p => p.age < p.life);
    for (const p of this.particles) {
      p.x += p.vx + (Math.random() - 0.5) * 0.3;
      p.y += p.vy;
      p.age++;
      const lr    = p.age / p.life;
      const fade  = lr < 0.2 ? lr / 0.2 : lr > 0.7 ? 1 - (lr - 0.7) / 0.3 : 1.0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r2},${g2},${b2},${p.op * fade})`;
      ctx.fill();
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
    }

    ctx.font      = "bold 9px monospace";
    ctx.fillStyle = t > 0.1 ? color : "#37474f";
    ctx.textAlign = "center";
    ctx.fillText(
      t > 0.01 ? `${spec.targetGas} — ${Math.round(ppm)} PPM` : "Clean air",
      W / 2, 12
    );
  }
}