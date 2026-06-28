"use strict";

import { registry }          from "./ComponentRegistry.js";
import CircuitSolver         from "../engine/circuitsolver.js";
import ElectricalResolver    from "../engine/ElectricalResolver.js";
import DigitalInputResolver  from "../engine/DigitalInputResolver.js";
import { ALL_ENGINE_OPS, PIN_MODES, checkPinMode } from "./Componentdefinitions.js";

class BreakSignal    extends Error { constructor()  { super("break");   this.name = "BreakSignal";    } }
class ContinueSignal extends Error { constructor()  { super("continue");this.name = "ContinueSignal"; } }
class ReturnSignal   extends Error { constructor(v) { super("return");  this.name = "ReturnSignal";   this.value = v; } }
class RestartSignal  extends Error { constructor()  { super("restart"); this.name = "RestartSignal";  } }

export class SimulationError extends Error {
  constructor(message, { context = "runtime", line = null, hint = null } = {}) {
    super(message);
    this.name    = "SimulationError";
    this.context = context;
    this.line    = line;
    this.hint    = hint;
  }
}

const MAX_LOOP_ITERATIONS = 1_000_000;
const ARDUINO_TYPES       = ["arduino", "uno", "mega", "nano", "micro"];

const SAFE_MATH = {
  __map(v, il, ih, ol, oh) {
    if (ih === il) return ol;
    const mapped = (v - il) * (oh - ol) / (ih - il) + ol;
    return oh >= ol ? Math.max(ol, Math.min(oh, mapped)) : Math.max(oh, Math.min(ol, mapped));
  },
  __constrain(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  __random(a, b) {
    if (b === undefined) return Math.floor(Math.random() * a);
    return Math.floor(Math.random() * (b - a)) + a;
  },
};

export default class SimulationEngine {

  static MAX_LOOP_ITERATIONS = MAX_LOOP_ITERATIONS;
  static DELAY_YIELD_MS      = 8;

  constructor(parsed, deps = {}) {
    if (!parsed) throw new TypeError("[SimEngine] Constructor requires a parsed AST object.");

    this.parsed  = parsed;
    this.netlist = null;
    this.board   = parsed.board ?? "arduino";

    this.pinStates       = deps.pinStates      ?? {};
    this.digitalInputs   = deps.digitalInputs  ?? {};
    this.digitalOutputs  = deps.digitalOutputs ?? {};
    this.digitalVoltages = {};
    this.pirDevices      = Array.isArray(deps.pirDevices) ? deps.pirDevices : [];

    this.toneState = { active: false, pin: null, freq: null, duration: null };

    this.registry             = registry;
    this.wireSystem           = deps.wireSystem ?? null;
    this.electricalResolver   = new ElectricalResolver(this.registry, this);
    this.circuitSolver        = new CircuitSolver(this.registry, this.wireSystem, this.pinStates, this);
    this.digitalInputResolver = new DigitalInputResolver();

    this.electricalState = {
      netVoltage : new Map(),
      netState   : new Map(),
      powerNets  : new Set(),
      gndNets    : new Set(),
      netCurrent : new Map(),
      circuits   : [],
    };

    this.simState = {
      wifi:              null,
      wifiMode:          null,
      eeprom:            null,
      prefs:             {},
      ledc:              {},
      analogResolution:  10,
      _restartRequested: false,
    };

    this.loopRunning = false;
    this.startTime   = null;

    this.globalVars = parsed.variables ? { ...parsed.variables } : {};
    this.vars       = this.globalVars;

    this.serialOutput   = [];
    this.onSerialOutput = typeof deps.onSerialOutput === "function" ? deps.onSerialOutput : null;

    this.warnings    = [];
    this.onWarning   = typeof deps.onWarning   === "function" ? deps.onWarning   : null;
    this.onStop      = typeof deps.onStop      === "function" ? deps.onStop      : null;
    this.onError     = typeof deps.onError     === "function" ? deps.onError     : null;
    this.onPinChange = typeof deps.onPinChange === "function" ? deps.onPinChange : null;

    this._componentHandlers = { ...ALL_ENGINE_OPS };
    this._arduinoCache      = null;
    this._pinViolationCache = new Set();
    this._lastResolveTime   = null;

    // Netlist cache — sirf jab topology badle tab rebuild
    this._resolvedNetlistVersion = null;
    this._electricalBaseResult   = null;

    // Background tick state
    this._elecTickRunning = false;
  }

  // ─── Background electrical tick ────────────────────────────────────────────
  // Ye tab bhi chalta hai jab Arduino loop kuch nahi karta
  // Sirf circuitSolver.solve() karta hai — koi pin/var change nahi
  _startElecTick() {
    if (this._elecTickRunning) return;
    this._elecTickRunning = true;

    let lastTickTime = performance.now();

    const tick = (now) => {
      if (!this.loopRunning || !this._elecTickRunning) {
        this._elecTickRunning = false;
        return;
      }

      // Agar resolveElectrical() abhi chal rahi hai toh skip karo
      if (this._resolveInProgress) {
        requestAnimationFrame(tick);
        return;
      }

      const dtMs = Math.min(now - lastTickTime, 50);
      lastTickTime = now;

      // Sirf solve — resolver nahi, kyunki topology nahi badi
      if (this.netlist && this.electricalState && dtMs > 0) {
        const SIM_DT   = 1e-3;
        const substeps = Math.max(1, Math.min(20, Math.round(dtMs / (SIM_DT * 1000))));
        this.circuitSolver.setTimestep(SIM_DT);
        for (let i = 0; i < substeps; i++) {
          this.circuitSolver.solve(this.electricalState);
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  _stopElecTick() {
    this._elecTickRunning = false;
  }

  // ─── resolveElectrical ─────────────────────────────────────────────────────
  // Pin state ya topology change hone par call karo
  // Background tick se alag — ye full resolver + solver dono karta hai
  resolveElectrical() {
    if (!this.netlist) return;

    this._resolveInProgress = true;

    try {
      const result = this.electricalResolver.resolve(
        this.netlist, this.digitalVoltages, this.pinStates
      );
      result.powerNets ??= new Set();
      result.gndNets   ??= new Set();
      this.electricalState = result;

      const now      = performance.now();
      const realDtMs = this._lastResolveTime != null
        ? Math.min(now - this._lastResolveTime, 100)
        : (1000 / 60);
      this._lastResolveTime = now;

      const SIM_DT   = 1e-3;
      const substeps = Math.max(1, Math.min(20, Math.round(realDtMs / (SIM_DT * 1000))));
      this.circuitSolver.setTimestep(SIM_DT);
      for (let i = 0; i < substeps; i++) {
        this.circuitSolver.solve(this.electricalState);
      }
    } finally {
      this._resolveInProgress = false;
    }
  }

  // ─── nextFrame & delay ─────────────────────────────────────────────────────
  nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  async delay(ms) {
    const duration = Number(ms);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const end = performance.now() + duration;
    while (performance.now() < end) {
      if (!this.loopRunning) return;
      this.resolveElectrical();
      await this.nextFrame();
    }
  }

  async delayMicroseconds(us) {
    await this.delay(Number(us) / 1000);
  }

  millis() { return this.startTime !== null ? Math.round(performance.now() - this.startTime) : 0; }
  micros() { return this.startTime !== null ? Math.round((performance.now() - this.startTime) * 1000) : 0; }

  // ─── run ───────────────────────────────────────────────────────────────────
  async run(parsed = this.parsed) {
    if (!parsed) { console.error("[SimEngine] run() called with no parsed AST."); return; }

    this.startTime                  = performance.now();
    this.loopRunning                = true;
    this.simState._restartRequested = false;
    this._pinViolationCache.clear();
    this._arduinoCache              = null;

    this._loadParserInstancesToRegistry(parsed);
    this._applyKeypadLayout(parsed);

    this.netlist = this.wireSystem?.buildNetlist() ?? null;
    if (!this.netlist) {
      console.warn("[SimEngine] Wire system not initialised — electrical resolution disabled.");
    }

    // Background tick shuru karo — Arduino loop se independent
    this._startElecTick();

    try {
      await this._executeBlock(parsed.setup ?? [], this.globalVars, parsed.functions ?? {});
    } catch (err) {
      if (err instanceof RestartSignal) { return this.run(parsed); }
      this._handleError("setup", err);
      return;
    }

    this.resolveElectrical();

    while (this.loopRunning) {
      if (this.simState._restartRequested) {
        this.simState._restartRequested = false;
        this.globalVars = parsed.variables ? { ...parsed.variables } : {};
        this.vars       = this.globalVars;
        this._pinViolationCache.clear();
        try { await this._executeBlock(parsed.setup ?? [], this.globalVars, parsed.functions ?? {}); }
        catch (e) { this._handleError("restart-setup", e); break; }
        continue;
      }

      for (const pir of this.pirDevices) pir.update?.();

      try {
        await this._executeBlock(parsed.loop ?? [], this.globalVars, parsed.functions ?? {});
      } catch (err) {
        if (err instanceof BreakSignal || err instanceof ContinueSignal) {
          // loop restart
        } else if (err instanceof RestartSignal) {
          this.simState._restartRequested = true;
          continue;
        } else {
          this._handleError("loop", err);
          break;
        }
      }

      await this.nextFrame();
    }

    this._stopElecTick();
    this.onStop?.();
  }

  stop() {
    this.loopRunning = false;
    this._stopElecTick();
  }

  _handleError(context, err) {
    const msg = err?.message ?? String(err);
    console.error(`[SimEngine] Error in ${context}:`, err);
    this.onError?.({
      message: msg,
      context,
      hint:  err?.hint  ?? null,
      line:  err?.line  ?? null,
    });
    this.loopRunning = false;
    this._stopElecTick();
  }

  _warn(message, { pin = null, operation = null } = {}) {
    const key = `${operation}:${pin}:${message}`;
    if (this._pinViolationCache.has(key)) return;
    this._pinViolationCache.add(key);
    console.warn(`[SimEngine] ${message}`);
    this.warnings.push({ message, pin, operation, ts: this.millis() });
    this.onWarning?.({ message, pin, operation });
  }

  _throw(message, opts = {}) {
    throw new SimulationError(message, opts);
  }

  _enforcePinMode(pin, operation) {
    const key    = `D${pin}`;
    const result = checkPinMode(this.pinStates, key, operation);
    if (!result.ok) {
      this._throw(result.message, { context: operation, hint: `Use pinMode(${pin}, ${this._suggestedMode(operation)}) before ${operation}()` });
    }
  }

  _suggestedMode(operation) {
    const writeOps = ["digitalWrite", "analogWrite", "dacWrite", "tone"];
    return writeOps.includes(operation) ? "OUTPUT" : "INPUT";
  }

_loadParserInstancesToRegistry(parsed) {
  const CLASS_TO_TYPES = {
    "liquidcrystal_i2c":  ["lcd", "lcd-16x2-i2c", "lcd16x2i2c"],
    "liquidcrystal":      ["lcd", "lcd-16x2", "lcd16x2"],
    "adafruit_ssd1306":   ["oled", "ssd1306"],
    "adafruit_sh110x":    ["oled", "ssd1306"],
    "u8g2":               ["oled", "ssd1306"],
    "tm1637display":      ["4-digit-7-segment", "tm1637"],
    "adafruit_neopixel":  ["neopixel", "ws2812"],
    "fastled":            ["neopixel", "ws2812"],
    "dht":                ["dht", "dht11", "dht22"],
    "dht11":              ["dht11", "dht"],
    "dht22":              ["dht22", "dht"],
    "servo":              ["servo"],
    "esp32servo":         ["servo"],
    "stepper":            ["stepper", "stepper-motor"],
    "accelstepper":       ["stepper", "stepper-motor"],
    "keypad":             ["keypad", "keypad-4x4"],
    "mpu6050":            ["mpu6050"],
    "hcsr04":             ["hcsr04", "ultrasonic"],
    "newping":            ["hcsr04", "ultrasonic"],
    "irrecv":             ["irrecv", "ir-receiver"],
    "softwareserial":     ["softwareserial"],
    "liquidcrystal_i2c_pcf8574": ["lcd", "lcd-16x2-i2c"],
  };

  for (const [instanceName, info] of Object.entries(parsed.instances ?? {})) {
    // Agar pehle se bind ho chuka → skip
    if (registry.getComponentByInstance(instanceName)) continue;

    const className = info.class ?? "";
    // "LiquidCrystal_I2C" → "liquidcrystal_i2c"
    const classKey  = className.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Raw lowercase with underscores
    const classRaw  = className.toLowerCase();

    // Saari possible registry types collect karo
    const typesToTry = new Set();

    // 1. Direct class name variations
    typesToTry.add(classRaw);
    typesToTry.add(classKey);
    typesToTry.add(classRaw.replace(/_/g, "-"));
    typesToTry.add(classRaw.replace(/-/g, "_"));

    // 2. Mapped types from CLASS_TO_TYPES
    const mapped = CLASS_TO_TYPES[classRaw] ?? CLASS_TO_TYPES[classKey];
    if (mapped) mapped.forEach(t => typesToTry.add(t));

    // 3. Try karo har type
    let comp = null;
    for (const t of typesToTry) {
      comp = registry.getFirstUnattachedComponent(t);
      if (comp) break;
    }

    if (!comp) {
      console.warn(`[SimEngine] No free '${className}' for instance '${instanceName}'.`);
      this.onError?.({
        message: `Canvas pe '${className}' component nahi mila — '${instanceName}' ke liye ${className} canvas pe add karo.`,
        context: "setup",
        hint:    `Canvas pe ${className} component drag karo`,
        line:    null,
      });
      continue;
    }

    // Instance bind karo — name kuch bhi ho
    comp.instance                   = comp.instance ?? {};
    comp.instance.attached          = true;
    comp.instance.instanceName      = instanceName;
    registry.setInstanceNameForComponent(comp.id, instanceName);
  }
}
_applyKeypadLayout(parsed) {
  const vars = parsed.variables ?? {};
  for (const [instanceName, info] of Object.entries(parsed.instances ?? {})) {
    if (info.class?.toLowerCase() !== "keypad") continue;
    const comp = this.registry.getComponentByInstance(instanceName);
    if (!comp?.instance) continue;

    const args = info.constructorArgs ?? "";
    const makeKeyMapMatch = args.match(/makeKeymap\s*\(\s*(\w+)\s*\)/);
    if (!makeKeyMapMatch) continue;

    const layoutVarName = makeKeyMapMatch[1];
    const layoutVar     = vars[layoutVarName];
    if (!Array.isArray(layoutVar?.value)) continue;

    const flat = layoutVar.value;
    if (flat.length !== 16) continue;

    const layout = [
      flat.slice(0,  4).map(c => typeof c === "string" ? c : String(c)),
      flat.slice(4,  8).map(c => typeof c === "string" ? c : String(c)),
      flat.slice(8,  12).map(c => typeof c === "string" ? c : String(c)),
      flat.slice(12, 16).map(c => typeof c === "string" ? c : String(c)),
    ];

    comp.instance.layout = layout;

    comp.instance._svg?.querySelectorAll("text.kp-label").forEach((el, i) => {
      const r = Math.floor(i / 4);
      const c = i % 4;
      el.textContent = layout[r]?.[c] ?? "";
    });
  }
}
_findDHTComponent(pin, instanceName) {
    // Pehle instance name se dhundho
    if (instanceName) {
      const byName = registry.getComponentByInstance(instanceName);
      if (byName) {
        const t = byName.type?.toLowerCase();
        if (t === "dht" || t === "dht11" || t === "dht22") return byName;
      }
    }
    // Type se dhundho
    return registry.getAll().find(c => {
      const t = c.type?.toLowerCase();
      const typeMatch = t === "dht11" || t === "dht" || t === "dht22" || t === "dht21";
      if (!typeMatch) return false;
      if (pin != null) {
        const dp = c._dataPin ?? c.instance?._dataPin;
        if (dp != null && dp !== pin) return false;
      }
      return true;
    });
  }

  evaluateExpression(expr, vars = this.globalVars) {
    if (expr === null || expr === undefined) return 0;
    if (typeof expr === "number")            return expr;
    if (typeof expr === "boolean")           return expr ? 1 : 0;

 if (typeof expr === "string" && expr.length === 1 && expr !== "0" && expr !== "1") {
      const code = expr.charCodeAt(0);
      if (code === 0) return 0;
      if (expr !== expr.trim() || /^[a-zA-Z*#0-9]$/.test(expr)) return code;
    }
 let e = String(expr).trim();

    e = e.replace(/\(\s*(?:int|float|long|char|byte|double|unsigned\s+\w+)\s*\)\s*/g, "");
    e = this._substituteReadFunctions(e, vars);

    e = e
      .replace(/\bHIGH\b/g,           "1")
      .replace(/\bLOW\b/g,            "0")
      .replace(/\bNO_KEY\b/g,         "'\x00'")
      .replace(/\bKEY_PRESSED\b/g,    "1")
      .replace(/\bKEY_RELEASED\b/g,   "2")
      .replace(/\bKEY_HOLD\b/g,       "3")
      .replace(/\bIDLE\b/g,           "0")
      .replace(/\bPRESSED\b/g,        "1")
      .replace(/\bHOLD\b/g,           "3")
      .replace(/\bTRUE\b/gi,          "true")
      .replace(/\bFALSE\b/gi,         "false")
      .replace(/\bINPUT_PULLUP\b/g,   "2")
      .replace(/\bINPUT_PULLDOWN\b/g, "3")
      .replace(/\bINPUT\b/g,          "0")
      .replace(/\bOUTPUT\b/g,         "1")
      .replace(/\bOPEN_DRAIN\b/g,     "4")
      .replace(/\bWL_CONNECTED\b/g,   "3")
      .replace(/\bWIFI_STA\b/g,       "1")
      .replace(/\bWIFI_AP\b/g,        "2")
      .replace(/\bWIFI_AP_STA\b/g,    "3")
      .replace(/\bLED_BUILTIN\b/g,    this.board === "esp32" ? "2" : "13")
      .replace(/\bBUILTIN_LED\b/g,    this.board === "esp8266" ? "2" : "13")
      .replace(/\bmillis\s*\(\s*\)/g, String(this.millis()))
      .replace(/\bmicros\s*\(\s*\)/g, String(this.micros()));

    e = e
      .replace(/\bSSD1306_SWITCHCAPVCC\b/g, "1")
      .replace(/\bSSD1306_EXTERNALVCC\b/g,  "2")
      .replace(/\bSSD1306_WHITE\b/g,        "1")
      .replace(/\bSSD1306_BLACK\b/g,        "0")
      .replace(/\bSSD1306_INVERSE\b/g,      "2");

    e = e.replace(/\bisnan\s*\(\s*([^)]+)\s*\)/g,  (_, x) => `isNaN(${x})`);
    e = e.replace(/\bisinf\s*\(\s*([^)]+)\s*\)/g,  (_, x) => `!isFinite(${x})`);
    e = e.replace(/\bstrcmp\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g, (_, a, b) => `(String(${a})===String(${b})?0:1)`);
    e = e.replace(/\bstrlen\s*\(\s*([^)]+)\s*\)/g, (_, s) => `(String(${s}).length)`);
    e = e.replace(/\bdtostrf\s*\([^)]+\)/g, "0");
    e = e.replace(/\bbitRead\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g,           (_, v, b)      => `(((${v}|0)>>(${b}|0))&1)`);
    e = e.replace(/\bbitSet\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g,            (_, v, b)      => `((${v}|0)|(1<<(${b}|0)))`);
    e = e.replace(/\bbitClear\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g,          (_, v, b)      => `((${v}|0)&~(1<<(${b}|0)))`);
    e = e.replace(/\bbitWrite\s*\(\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g, (_, v, b, bv) => `(${bv}?((${v}|0)|(1<<(${b}|0))):((${v}|0)&~(1<<(${b}|0))))`);
    e = e.replace(/\bbit\s*\(\s*([^)]+)\s*\)/g,     (_, n) => `(1<<(${n}|0))`);
    e = e.replace(/\blowByte\s*\(\s*([^)]+)\s*\)/g,  (_, x) => `((${x}|0)&0xFF)`);
    e = e.replace(/\bhighByte\s*\(\s*([^)]+)\s*\)/g, (_, x) => `(((${x}|0)>>8)&0xFF)`);
    e = e.replace(/\bword\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g, (_, h, l) => `(((${h}|0)<<8)|(${l}|0))`);
    e = e.replace(/'\\''/g, "0");
    e = e.replace(/'\\0'/g,  "0");
    e = e.replace(/'\\n'/g,  "10");
    e = e.replace(/'\\r'/g,  "13");
    e = e.replace(/'\\t'/g,  "9");
    e = e.replace(/'(.)'/g,  (_, c) => String(c.charCodeAt(0)));

    const _evalExpr = (exprStr) => {
      const resolved = exprStr.replace(/\b([A-Za-z_]\w*)\b/g, (m, n) => {
        const v = vars[n] ?? this.globalVars[n];
        return (v !== undefined && !Array.isArray(v)) ? String(v) : m;
      });
      try { return Number(Function(`"use strict"; return (${resolved});`)()); }
      catch { return 0; }
    };

    const _getStr = (varName) => String(vars[varName] ?? this.globalVars[varName] ?? "");

    e = e.replace(/\b([A-Za-z_]\w*)\.substring\s*\(\s*([\s\S]+?)\s*,\s*([\s\S]+?)\s*\)/g,
      (_, varName, startExpr, endExpr) => {
        const s = _getStr(varName);
        const a = _evalExpr(startExpr); const b = _evalExpr(endExpr);
        return JSON.stringify(s.substring(Math.max(0, isNaN(a)?0:a), Math.max(0, isNaN(b)?s.length:b)));
      });
    e = e.replace(/\b([A-Za-z_]\w*)\.substring\s*\(\s*([\s\S]+?)\s*\)/g,
      (_, varName, startExpr) => {
        const s = _getStr(varName); const a = _evalExpr(startExpr);
        return JSON.stringify(s.substring(Math.max(0, isNaN(a)?0:a)));
      });
    e = e.replace(/\b([A-Za-z_]\w*)\.length\s*\(\s*\)/g,    (_, v) => String(_getStr(v).length));
    e = e.replace(/\b([A-Za-z_]\w*)\.length\b(?!\s*\()/g,   (_, v) => String(_getStr(v).length));
    e = e.replace(/\b([A-Za-z_]\w*)\.indexOf\s*\(\s*([^)]+)\s*\)/g,
      (_, varName, search) => String(_getStr(varName).indexOf(search.trim().replace(/^["']|["']$/g, ""))));
    e = e.replace(/\b([A-Za-z_]\w*)\.charAt\s*\(\s*([^)]+)\s*\)/g,
      (_, varName, idxExpr) => { const i = _evalExpr(idxExpr); return JSON.stringify(_getStr(varName).charAt(isNaN(i)?0:i)); });
    e = e.replace(/\b([A-Za-z_]\w*)\.toInt\s*\(\s*\)/g,      (_, v) => String(parseInt(_getStr(v), 10) || 0));
    e = e.replace(/\b([A-Za-z_]\w*)\.toFloat\s*\(\s*\)/g,    (_, v) => String(parseFloat(_getStr(v)) || 0));
    e = e.replace(/\b([A-Za-z_]\w*)\.equals\s*\(\s*([^)]+)\s*\)/g,
      (_, varName, other) => _getStr(varName) === other.trim().replace(/^["']|["']$/g, "") ? "1" : "0");
    e = e.replace(/\b([A-Za-z_]\w*)\.startsWith\s*\(\s*([^)]+)\s*\)/g,
      (_, varName, prefix) => _getStr(varName).startsWith(prefix.trim().replace(/^["']|["']$/g, "")) ? "1" : "0");
    e = e.replace(/\b([A-Za-z_]\w*)\.endsWith\s*\(\s*([^)]+)\s*\)/g,
      (_, varName, suffix) => _getStr(varName).endsWith(suffix.trim().replace(/^["']|["']$/g, "")) ? "1" : "0");
    e = e.replace(/\b([A-Za-z_]\w*)\.replace\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g,
      (_, varName, from, to) => JSON.stringify(_getStr(varName).split(from.trim().replace(/^["']|["']$/g,"")).join(to.trim().replace(/^["']|["']$/g,""))));
    e = e.replace(/\b([A-Za-z_]\w*)\.trim\s*\(\s*\)/g,        (_, v) => JSON.stringify(_getStr(v).trim()));
    e = e.replace(/\b([A-Za-z_]\w*)\.toUpperCase\s*\(\s*\)/g, (_, v) => JSON.stringify(_getStr(v).toUpperCase()));
    e = e.replace(/\b([A-Za-z_]\w*)\.toLowerCase\s*\(\s*\)/g, (_, v) => JSON.stringify(_getStr(v).toLowerCase()));

    e = e.replace(/\b([A-Za-z_]\w*)\b/g, (match, name) => {
      if (name in vars)            return Array.isArray(vars[name])            ? match : String(vars[name]);
      if (name in this.globalVars) return Array.isArray(this.globalVars[name]) ? match : String(this.globalVars[name]);
      return match;
    });

    return this._safeEval(e);
  }

  _safeEval(expr) {
    const tokens = expr.replace(/\s+/g, " ").trim();
    const safe = tokens
      .replace(/\bmap\b/g,       "__map")
      .replace(/\bconstrain\b/g, "__constrain")
      .replace(/\brandom\b/g,    "__random")
      .replace(/\bmin\b/g,       "Math.min")
      .replace(/\bmax\b/g,       "Math.max")
      .replace(/\babs\b/g,       "Math.abs")
      .replace(/\bpow\b/g,       "Math.pow")
      .replace(/\bsqrt\b/g,      "Math.sqrt")
      .replace(/\bsin\b/g,       "Math.sin")
      .replace(/\bcos\b/g,       "Math.cos")
      .replace(/\btan\b/g,       "Math.tan")
      .replace(/\bfloor\b/g,     "Math.floor")
      .replace(/\bceil\b/g,      "Math.ceil")
      .replace(/\bround\b/g,     "Math.round")
      .replace(/\blog\b/g,       "Math.log")
      .replace(/\bexp\b/g,       "Math.exp")
      .replace(/\bradians\b/g,   "(__x => __x * Math.PI / 180)(1")
      .replace(/\bdegrees\b/g,   "(__x => __x * 180 / Math.PI)(1")
      .replace(/\bisNaN\b/g,     "isNaN")
      .replace(/\bisFinite\b/g,  "isFinite");

    if (/\b(eval|Function|import|require|fetch|XMLHttpRequest|window\.|document\.|globalThis|process\.|__proto__|constructor)\b/.test(safe)) {
      console.warn(`[SimEngine] Blocked unsafe expression: "${safe}"`);
      return 0;
    }

    try {
      const fn = new Function("__map", "__constrain", "__random", `"use strict"; return (${safe});`);
      const result = fn(SAFE_MATH.__map, SAFE_MATH.__constrain, SAFE_MATH.__random);
      return typeof result === "boolean" ? (result ? 1 : 0) : (Number.isFinite(result) ? result : 0);
    } catch {
      return 0;
    }
  }

  _substituteReadFunctions(expr, vars) {
  const arduino = this._findArduinoComponent();
 
  expr = expr.replace(/\b([A-Za-z_]\w*)\b/g, (match, name) => {
    const v = vars[name] ?? this.globalVars[name];
    return (v !== undefined && typeof v !== "object" && !Array.isArray(v))
      ? String(v) : match;
  });
 
  expr = expr.replace(/digitalRead\s*\(\s*([^)]+)\s*\)/g, (_, pinExpr) => {
    const pin  = this._resolvePin(pinExpr.trim(), vars);
    const key  = `D${pin}`;
    const mode = this.pinStates[key];
 
    if (!mode) {
      this._throw(`digitalRead(${pin}): pinMode() not set.`, { context: "digitalRead" });
    }
    if (mode === PIN_MODES.OUTPUT) {
      this._throw(`digitalRead(${pin}): Pin is OUTPUT.`, { context: "digitalRead" });
    }
 
    if (!arduino) {
      return mode === PIN_MODES.INPUT_PULLUP ? "1" : "0";
    }
 
    const pinStr = this._pinStr(pin);
    const netId  = this.circuitSolver.findNet(arduino.id, pinStr)
                ?? this.circuitSolver.findNet(arduino.id, String(pin))
                ?? this.circuitSolver.findNet(arduino.id, `D${pin}`);
 
    if (!netId) {
      return mode === PIN_MODES.INPUT_PULLUP ? "1" : "0";
    }
 
    const voltage = this.electricalState.netVoltage.get(netId) ?? 0;
    return voltage >= 2.5 ? "1" : "0";
  });
 
  expr = expr.replace(/analogRead\s*\(\s*([^)]+)\s*\)/g, (_, pinExpr) => {
    const pin = this._resolvePin(pinExpr.trim(), vars);
    const key = `D${pin}`;
 
    if (!this.pinStates[key] && pin >= 14 && pin <= 19) {
      this.pinStates[key] = PIN_MODES.INPUT;
    }
    const resolvedMode = this.pinStates[key];
    if (!resolvedMode) {
      this._throw(`analogRead(${pin}): pinMode() not set.`, { context: "analogRead" });
    }
    if (resolvedMode === PIN_MODES.OUTPUT) {
      this._throw(`analogRead(${pin}): Pin is OUTPUT.`, { context: "analogRead" });
    }
 
    if (!arduino) return "0";
 
    const pinStr = this._pinStr(pin);
    const netId  = this.circuitSolver.findNet(arduino.id, pinStr)
                ?? this.circuitSolver.findNet(arduino.id, String(pin))
                ?? this.circuitSolver.findNet(arduino.id, `A${pin - 14}`);
 
    if (!netId) return "0";
 
    const voltage = this.electricalState.netVoltage.get(netId) ?? 0;
    const maxVal  = (1 << (this.simState.analogResolution ?? 10)) - 1;
    const vRef    = (this.board === "esp32" || this.board === "esp8266") ? 3.3 : 5.0;
    return String(Math.max(0, Math.min(maxVal, Math.round((voltage / vRef) * maxVal))));
  });
 
  return expr;
}
 

_resolvePin(pin, vars = this.globalVars) {
  if (pin === null || pin === undefined) return null;
  let p = String(pin).trim();
 
  if (vars[p]               !== undefined) p = String(vars[p]);
  else if (this.globalVars[p] !== undefined) p = String(this.globalVars[p]);
 
  if (/^A[0-5]$/i.test(p)) return 14 + parseInt(p.slice(1), 10);
 
  const espMatch = p.match(/^(?:GPIO|D)(\d+)$/i);
  if (espMatch) return Number(espMatch[1]);
 
  if (!isNaN(p) && p !== "") return Number(p);
  return p;
}

_pinStr(pin) {
  if (typeof pin === "number") {
    if (pin >= 14 && pin <= 19) return `A${pin - 14}`;
    return String(pin);
  }
  const s = String(pin).trim();
  if (/^A[0-5]$/i.test(s)) return s.toUpperCase();
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 14 && n <= 19) return `A${n - 14}`;
  return s;
}

  _findArduinoComponent() {
    if (this._arduinoCache) return this._arduinoCache;
    this._arduinoCache = this.registry.getAll()
      .find(c => ARDUINO_TYPES.some(t => c.type?.toLowerCase().includes(t))) ?? null;
    return this._arduinoCache;
  }

  async _executeBlock(ops, vars, functions) {
    if (!Array.isArray(ops)) return;
    for (const op of ops) {
      if (!this.loopRunning) return;
      await this._executeOp(op, vars, functions);
    }
  }

  async _executeOp(op, vars, functions) {
    if (!op?.type) return;

    const ctx = {
      registry:        this.registry,
      circuitSolver:   this.circuitSolver,
      electricalState: this.electricalState,
      pinStates:       this.pinStates,
      pinModes:        this.pinStates,
      digitalInputs:   this.digitalInputs,
      simState:        this.simState,
      board:           this.board,
      vars,
      evaluate:       (expr) => this.evaluateExpression(expr, vars),
      evalArgList:    (argsStr) => this._evalArgList(argsStr, vars),
      resolvePin:     (pin) => this._resolvePin(pin, vars),
      nextFrame:      () => this.nextFrame(),
      warn:           (msg, opts) => this._warn(msg, opts),
      error:          (msg, opts) => this._throw(msg, opts),
      onSerialOutput: this.onSerialOutput,
    };

    switch (op.type) {

      case "varDeclaration": {
        if (op.varType === "array") {
          vars[op.name] = op.value !== undefined ? op.value : [];
        } else {
          vars[op.name] = op.value !== undefined ? this.evaluateExpression(op.value, vars) : 0;
        }
        if (op.name in this.globalVars) this.globalVars[op.name] = vars[op.name];
        break;
      }

      case "assign": {
        const arrMatch = op.left.match(/^([A-Za-z_]\w*)\s*\[\s*([^\]]+)\s*\]$/);
        if (arrMatch) {
          const [, name, idxExpr] = arrMatch;
          const idx = Math.trunc(this.evaluateExpression(idxExpr, vars));
          if (!Array.isArray(vars[name])) vars[name] = [];
          vars[name][idx] = this.evaluateExpression(op.right, vars);
        } else {
          vars[op.left] = this.evaluateExpression(op.right, vars);
          if (op.left in this.globalVars) this.globalVars[op.left] = vars[op.left];
        }
        break;
      }

      case "compoundAssign": {
        const cur = this.evaluateExpression(op.left, vars);
        let next;
        switch (op.op) {
          case "++": next = cur + 1; break;
          case "--": next = cur - 1; break;
          case "+=": next = cur + this.evaluateExpression(op.right, vars); break;
          case "-=": next = cur - this.evaluateExpression(op.right, vars); break;
          case "*=": next = cur * this.evaluateExpression(op.right, vars); break;
          case "/=": { const d = this.evaluateExpression(op.right, vars); next = d !== 0 ? cur / d : cur; break; }
          case "%=": { const d = this.evaluateExpression(op.right, vars); next = d !== 0 ? cur % d : cur; break; }
          case "&=": next = (cur | 0) & (this.evaluateExpression(op.right, vars) | 0); break;
          case "|=": next = (cur | 0) | (this.evaluateExpression(op.right, vars) | 0); break;
          case "^=": next = (cur | 0) ^ (this.evaluateExpression(op.right, vars) | 0); break;
          default:   next = cur;
        }
        vars[op.left] = next;
        if (op.left in this.globalVars) this.globalVars[op.left] = next;
        break;
      }

     case "if": {
       let condRaw = this.evaluateExpression(op.condition, vars);
        if (typeof condRaw === "string") {
          // '\0' = NO_KEY = false, koi bhi real char = true
          condRaw = (
            condRaw.length > 0 &&
            condRaw !== '\0' &&
            condRaw !== '\x00' &&
            condRaw.charCodeAt(0) !== 0
          ) ? 1 : 0;
        }
        const cond  = !!condRaw;
        const block = cond ? (op.then ?? []) : (op.else ?? []);
        await this._executeBlock(block, vars, functions);
        break;
      }

      case "for": {
        const loopVars = { ...vars };
        if (op.init) await this._executeBlock(this._quickParse(op.init, loopVars), loopVars, functions);
        let iter = 0;
        while (this.loopRunning) {
          if (op.condition && !this.evaluateExpression(op.condition, loopVars)) break;
          if (++iter > MAX_LOOP_ITERATIONS) this._throw("For loop exceeded maximum iterations.", { context: "for" });
          try { await this._executeBlock(op.body ?? [], loopVars, functions); }
          catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) { /* fall to update */ }
            else throw sig;
          }
          if (op.update) await this._executeBlock(this._quickParse(op.update + ";", loopVars), loopVars, functions);
          await this.nextFrame();
        }
        for (const k of Object.keys(loopVars)) { if (k in this.globalVars) this.globalVars[k] = loopVars[k]; }
        break;
      }

      case "while": {
        let iter = 0;
        while (this.loopRunning && this.evaluateExpression(op.condition, vars)) {
          if (++iter > MAX_LOOP_ITERATIONS) this._throw("While loop exceeded maximum iterations.", { context: "while" });
          try { await this._executeBlock(op.body ?? [], vars, functions); }
          catch (sig) { if (sig instanceof BreakSignal) break; if (sig instanceof ContinueSignal) continue; throw sig; }
          await this.nextFrame();
        }
        break;
      }

      case "doWhile": {
        let iter = 0;
        do {
          if (++iter > MAX_LOOP_ITERATIONS) this._throw("Do-while exceeded maximum iterations.", { context: "doWhile" });
          try { await this._executeBlock(op.body ?? [], vars, functions); }
          catch (sig) { if (sig instanceof BreakSignal) break; if (sig instanceof ContinueSignal) continue; throw sig; }
          await this.nextFrame();
        } while (this.loopRunning && this.evaluateExpression(op.condition, vars));
        break;
      }

      case "switch": {
        const val = this.evaluateExpression(op.expr, vars);
        let matched = false;
        for (const c of (op.cases ?? [])) {
          if (!matched && (c.value === "default" || this.evaluateExpression(c.value, vars) == val)) matched = true;
          if (matched) {
            try { await this._executeBlock(c.body, vars, functions); }
            catch (sig) { if (sig instanceof BreakSignal) break; throw sig; }
          }
        }
        break;
      }
case "methodCallAssign": {
        const assignOp = { ...op, type: "methodCall" };
        await this._executeOp(assignOp, vars, functions);
        break;
      }
      case "break":    throw new BreakSignal();
      case "continue": throw new ContinueSignal();
      case "return":   throw new ReturnSignal(this.evaluateExpression(op.value, vars));

      case "functionCall": {
        const fn = functions?.[op.name];
        if (!fn) {
          switch (op.name) {
            case "analogRead": {
              const _pin = this._resolvePin(String(vars[op.args?.[0]] ?? this.globalVars[op.args?.[0]] ?? op.args?.[0] ?? ""), vars);
              const _key = `D${_pin}`;
              if (!this.pinStates[_key] && _pin >= 14 && _pin <= 19) this.pinStates[_key] = PIN_MODES.INPUT;
              const _mode = this.pinStates[_key];
              if (!_mode || _mode === PIN_MODES.OUTPUT) { if (op.variable) vars[op.variable] = 0; break; }
              const _ard = this._findArduinoComponent();
              const _netId = _ard ? this.circuitSolver.findNet(_ard.id, this._pinStr(_pin)) : null;
              let _val = 0;
              if (_netId) {
                const _v = this.electricalState.netVoltage.get(_netId) ?? 0;
                const _mx = (1 << (this.simState.analogResolution ?? 10)) - 1;
                const _vref = (this.board === "esp32" || this.board === "esp8266") ? 3.3 : 5.0;
                _val = Math.max(0, Math.min(_mx, Math.round((_v / _vref) * _mx)));
              }
              if (op.variable) vars[op.variable] = _val;
              break;
            }
        case "digitalRead": {
  const _pin   = this._resolvePin(String(vars[op.args?.[0]] ?? this.globalVars[op.args?.[0]] ?? op.args?.[0] ?? ""), vars);
  const _key   = `D${_pin}`;
  const _mode  = this.pinStates[_key];
  if (!_mode || _mode === PIN_MODES.OUTPUT) { if (op.variable) vars[op.variable] = 0; break; }
  const _ard   = this._findArduinoComponent();
  const _netId = _ard ? this.circuitSolver.findNet(_ard.id, this._pinStr(_pin)) : null;
  const _volt  = _netId ? (this.electricalState.netVoltage.get(_netId) ?? 0) : -1;
  const _val   = _netId ? (_volt >= 2.5 ? 1 : 0) : (_mode === PIN_MODES.INPUT_PULLUP ? 1 : 0);
  console.log(`[digitalRead] pin=${_pin}, key=${_key}, mode=${_mode}, netId=${_netId}, voltage=${_volt.toFixed(3)}, result=${_val}`);
  if (op.variable) vars[op.variable] = _val;
  break;
}
            case "map": {
              const [v, il, ih, ol, oh] = (op.args ?? []).map(a => this.evaluateExpression(a, vars));
              if (op.variable) vars[op.variable] = ih === il ? ol : (v - il) * (oh - ol) / (ih - il) + ol;
              break;
            }
            case "constrain": {
              const [v, lo, hi] = (op.args ?? []).map(a => this.evaluateExpression(a, vars));
              if (op.variable) vars[op.variable] = Math.max(lo, Math.min(hi, v));
              break;
            }
            case "random": {
              const [a, b] = (op.args ?? []).map(a => this.evaluateExpression(a, vars));
              if (op.variable) vars[op.variable] = b === undefined ? Math.floor(Math.random() * a) : Math.floor(Math.random() * (b - a)) + a;
              break;
            }
            case "abs":        if (op.variable) vars[op.variable] = Math.abs(this.evaluateExpression(op.args?.[0], vars)); break;
            case "min":        if (op.variable) vars[op.variable] = Math.min(...(op.args ?? []).map(a => this.evaluateExpression(a, vars))); break;
            case "max":        if (op.variable) vars[op.variable] = Math.max(...(op.args ?? []).map(a => this.evaluateExpression(a, vars))); break;
            case "sq":         if (op.variable) { const v = this.evaluateExpression(op.args?.[0], vars); vars[op.variable] = v * v; } break;
            case "sqrt":       if (op.variable) vars[op.variable] = Math.sqrt(Math.max(0, this.evaluateExpression(op.args?.[0], vars))); break;
            case "pow":        if (op.variable) vars[op.variable] = Math.pow(this.evaluateExpression(op.args?.[0], vars), this.evaluateExpression(op.args?.[1], vars)); break;
            case "sin":        if (op.variable) vars[op.variable] = Math.sin(this.evaluateExpression(op.args?.[0], vars)); break;
            case "cos":        if (op.variable) vars[op.variable] = Math.cos(this.evaluateExpression(op.args?.[0], vars)); break;
            case "tan":        if (op.variable) vars[op.variable] = Math.tan(this.evaluateExpression(op.args?.[0], vars)); break;
            case "log":        if (op.variable) vars[op.variable] = Math.log(this.evaluateExpression(op.args?.[0], vars)); break;
            case "exp":        if (op.variable) vars[op.variable] = Math.exp(this.evaluateExpression(op.args?.[0], vars)); break;
            case "floor":      if (op.variable) vars[op.variable] = Math.floor(this.evaluateExpression(op.args?.[0], vars)); break;
            case "ceil":       if (op.variable) vars[op.variable] = Math.ceil(this.evaluateExpression(op.args?.[0], vars)); break;
            case "round":      if (op.variable) vars[op.variable] = Math.round(this.evaluateExpression(op.args?.[0], vars)); break;
            case "isnan":
            case "isNaN":      if (op.variable) vars[op.variable] = isNaN(this.evaluateExpression(op.args?.[0], vars)) ? 1 : 0; break;
            case "String":     if (op.variable) vars[op.variable] = String(this.evaluateExpression(op.args?.[0], vars)); break;
            case "parseInt":   if (op.variable) vars[op.variable] = parseInt(this.evaluateExpression(op.args?.[0], vars)); break;
            case "parseFloat": if (op.variable) vars[op.variable] = parseFloat(this.evaluateExpression(op.args?.[0], vars)); break;
            default:
              console.warn(`[SimEngine] Unknown function '${op.name}' — skipping.`);
              break;
          }
          break;
        }
        const argValues = (op.args ?? []).map(a => this.evaluateExpression(a, vars));
        const localVars = { ...this.globalVars };
        (fn.params ?? []).forEach((p, idx) => { localVars[p.name ?? p] = argValues[idx] ?? 0; });
        const bodyOps = Array.isArray(fn.body) ? fn.body : [];
        let returnVal = 0;
        try { await this._executeBlock(bodyOps, localVars, functions); }
        catch (sig) { if (sig instanceof ReturnSignal) returnVal = sig.value ?? 0; else throw sig; }
        if (op.variable) vars[op.variable] = returnVal;
        for (const k of Object.keys(this.globalVars)) { if (k in localVars) this.globalVars[k] = localVars[k]; }
        break;
      }

      case "pinMode": {
        const pin     = this._resolvePin(op.pin, vars);
        const modeRaw = String(this.evaluateExpression(op.mode, vars));
        const modeStr = modeRaw === "0" ? PIN_MODES.INPUT
                      : modeRaw === "1" ? PIN_MODES.OUTPUT
                      : modeRaw === "2" ? PIN_MODES.INPUT_PULLUP
                      : modeRaw === "3" ? PIN_MODES.INPUT_PULLDOWN
                      : Object.values(PIN_MODES).includes(modeRaw) ? modeRaw : modeRaw;
        const key      = `D${pin}`;
        const prevMode = this.pinStates[key];
        this.pinStates[key] = modeStr;
        for (const k of [...this._pinViolationCache]) { if (k.includes(`:${pin}:`)) this._pinViolationCache.delete(k); }
        this.onPinChange?.({ pin, mode: modeStr, prevMode });
        break;
      }

      case "digitalWrite": {
        const pin    = this._resolvePin(op.pin, vars);
        const key    = `D${pin}`;
        this._enforcePinMode(pin, "digitalWrite");
        const raw    = this.evaluateExpression(op.state, vars);
        const isHigh = raw === 1 || raw === true || raw === "HIGH" || raw === "1";
        this.digitalVoltages[key] = isHigh ? 1 : 0;
        this.resolveElectrical();
        this.onPinChange?.({ pin, value: this.digitalVoltages[key], mode: "OUTPUT" });
        await this.nextFrame();
        break;
      }

      case "analogRead": {
        const _pin = this._resolvePin(String(vars[op.args?.[0]] ?? this.globalVars[op.args?.[0]] ?? op.args?.[0] ?? ""), vars);
        const _key = `D${_pin}`;
        if (!this.pinStates[_key] && _pin >= 14 && _pin <= 19) this.pinStates[_key] = PIN_MODES.INPUT;
        const _mode = this.pinStates[_key];
        if (!_mode || _mode === PIN_MODES.OUTPUT) { if (op.variable) vars[op.variable] = 0; break; }
        const _ard   = this._findArduinoComponent();
        const _netId = _ard ? this.circuitSolver.findNet(_ard.id, this._pinStr(_pin)) : null;
        let _val = 0;
        if (_netId) {
          const _v    = this.electricalState.netVoltage.get(_netId) ?? 0;
          const _mx   = (1 << (this.simState.analogResolution ?? 10)) - 1;
          const _vref = (this.board === "esp32" || this.board === "esp8266") ? 3.3 : 5.0;
          _val = Math.max(0, Math.min(_mx, Math.round((_v / _vref) * _mx)));
        }
        if (op.variable) vars[op.variable] = _val;
        break;
      }

      case "digitalRead": {
        const _pin   = this._resolvePin(String(vars[op.args?.[0]] ?? this.globalVars[op.args?.[0]] ?? op.args?.[0] ?? ""), vars);
        const _key   = `D${_pin}`;
        const _mode  = this.pinStates[_key];
        if (!_mode || _mode === PIN_MODES.OUTPUT) { if (op.variable) vars[op.variable] = 0; break; }
        const _ard   = this._findArduinoComponent();
        const _netId = _ard ? this.circuitSolver.findNet(_ard.id, this._pinStr(_pin)) : null;
        const _val   = _netId ? ((this.electricalState.netVoltage.get(_netId) ?? 0) >= 2.5 ? 1 : 0) : (_mode === PIN_MODES.INPUT_PULLUP ? 1 : 0);
        if (op.variable) vars[op.variable] = _val;
        break;
      }

      case "analogWrite": {
        const pin   = this._resolvePin(op.pin, vars);
        const key   = `D${pin}`;
        this._enforcePinMode(pin, "analogWrite");
        const value = Math.max(0, Math.min(255, Math.round(this.evaluateExpression(op.value, vars))));
        this.digitalVoltages[key] = value;
        this.resolveElectrical();
        this.onPinChange?.({ pin, value, mode: PIN_MODES.OUTPUT, pwm: true });
        await this.nextFrame();
        break;
      }

      case "methodCall": {
        const objName = op.object;
        const method  = op.method;
        const args    = (op.args ?? []).map(a => this.evaluateExpression(a, vars));

        const knownTypes = ["servo","lcd","oled","stepper","dht","keypad","neopixel","4-digit-7-segment","hcsr04","mpu6050","irrecv","softwareserial"];
    let boundComp = this.registry.getComponentByInstance(objName);
if (!boundComp) {
  const CLASS_TO_TYPES = {
    "liquidcrystal_i2c": ["lcd", "lcd-16x2-i2c"],
    "liquidcrystal":     ["lcd", "lcd-16x2"],
    "adafruit_ssd1306":  ["oled", "ssd1306"],
    "tm1637display":     ["4-digit-7-segment", "tm1637"],
    "adafruit_neopixel": ["neopixel", "ws2812"],
    "dht":               ["dht", "dht11", "dht22"],
    "dht11":             ["dht11", "dht"],
    "dht22":             ["dht22", "dht"],
    "servo":             ["servo"],
    "esp32servo":        ["servo"],
    "stepper":           ["stepper"],
    "accelstepper":      ["stepper"],
    "keypad":            ["keypad", "keypad-4x4"],
    "mpu6050":           ["mpu6050"],
    "hcsr04":            ["hcsr04", "ultrasonic"],
    "newping":           ["hcsr04", "ultrasonic"],
    "irrecv":            ["irrecv"],
    "softwareserial":    ["softwareserial"],
  };

  // Parsed instances se class name nikalo
  const parsedInst = this.parsed?.instances?.[objName];
  const classRaw   = parsedInst?.class?.toLowerCase() ?? "";
  const classKey   = classRaw.replace(/[^a-z0-9]/g, "");

  const extraTypes = CLASS_TO_TYPES[classRaw]
                  ?? CLASS_TO_TYPES[classKey]
                  ?? [];

  const allTypes = [...new Set([...knownTypes, ...extraTypes])];

  for (const t of allTypes) {
    const c = this.registry.getOrBindComponent?.(t, objName);
    if (c) { boundComp = c; break; }
  }
}

        if (method === "attach") {
          const pin  = this._resolvePin(String(args[0] ?? 0), vars);
          const comp = boundComp ?? this.registry.getAll().find(c => c.type === "servo");
          if (comp?.instance) {
            if (!this._servoMap) this._servoMap = {};
            this._servoMap[objName]      = comp;
            comp.instance.attachedPin    = pin;
            comp.instance.attachedPinKey = `D${pin}`;
            comp.instance.attached       = true;
            comp.instance.powered        = true;
            comp.instance.minUs          = Number(args[1]) || 544;
            comp.instance.maxUs          = Number(args[2]) || 2400;
            comp.instance.targetAngle    = comp.instance.targetAngle ?? 90;
          }
          break;
        }
        if (method === "write") {
          const angle     = Math.max(0, Math.min(180, Number(args[0])));
          const servoComp = this._servoMap?.[objName] ?? this.registry.getAll().find(c => c.type === "servo");
          if (servoComp?.instance?.attached) { servoComp.instance.targetAngle = angle; this.resolveElectrical(); }
          break;
        }
        if (method === "writeMicroseconds") {
          const us = Number(args[0]);
          const sc = this._servoMap?.[objName] ?? this.registry.getAll().find(c => c.type === "servo");
          if (sc?.instance?.attached) {
            const min = sc.instance.minUs ?? 544; const max = sc.instance.maxUs ?? 2400;
            sc.instance.targetAngle = Math.max(0, Math.min(180, Math.round(((us - min) / (max - min)) * 180)));
            this.resolveElectrical();
          }
          break;
        }
if (method === "getKey") {
          const kComp = boundComp
                     ?? this.registry.getComponentByInstance(objName)
                     ?? this.registry.getAll().find(c => c.type === "keypad");
          const inst = kComp?.instance;
          if (!inst) { if (op.variable) vars[op.variable] = '\0'; break; }
          if (!inst.codeParsed) inst.codeParsed = true;
          const key = inst.getKey?.() ?? '\0';
          if (op.variable) vars[op.variable] = key;
          break;
        }
        if (method === "detach") {
          const sc = this._servoMap?.[objName] ?? this.registry.getAll().find(c => c.type === "servo");
          if (sc?.instance) { sc.instance.attached = false; sc.instance.powered = false; }
          break;
        }
        if (method === "read") {
          const sc = this._servoMap?.[objName] ?? this.registry.getAll().find(c => c.type === "servo");
          if (op.variable) vars[op.variable] = sc?.instance?.targetAngle ?? 90;
          break;
        }
        if (method === "attached") {
          const sc = this._servoMap?.[objName] ?? this.registry.getAll().find(c => c.type === "servo");
          if (op.variable) vars[op.variable] = sc?.instance?.attached ? 1 : 0;
          break;
        }
        if (["print","println"].includes(method)) {
          const comp = boundComp ?? this.registry.getAll().find(c => c.type === "lcd");
          if (comp?.instance) comp.instance.print(typeof args[0] === "string" ? args[0] : String(args[0] ?? ""));
          break;
        }
        if (method === "setCursor")    { (boundComp ?? this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.setCursor?.(args[0]??0, args[1]??0); break; }
        if (method === "clear")        { const li=(boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance; const oi=this.registry.getAll().find(c=>c.type==="oled")?.instance; if(li)li.clear?.(); else oi?.clearDisplay?.(); break; }
        if (method === "home")         { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.home?.(); break; }
        if (method === "init")         { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.init?.(); break; }
        if (method === "backlight")    { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.backlight?.(true); break; }
        if (method === "noBacklight")  { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.backlight?.(false); break; }
        if (method === "noDisplay")    { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.noDisplay?.(); break; }
        if (method === "display")      { const li=(boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance; const oi=this.registry.getAll().find(c=>c.type==="oled")?.instance; li?.display?.(); if(!li)oi?.display?.(); break; }
        if (method === "blink")        { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.blink?.(); break; }
        if (method === "noBlink")      { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.noBlink?.(); break; }
        if (method === "cursor")       { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.cursor?.(); break; }
        if (method === "noCursor")     { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.noCursor?.(); break; }
        if (method === "autoscroll")   { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.autoscroll?.(); break; }
        if (method === "noAutoscroll") { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.noAutoscroll?.(); break; }
        if (method === "leftToRight")  { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.leftToRight?.(); break; }
        if (method === "rightToLeft")  { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.rightToLeft?.(); break; }
        if (method === "scrollDisplayLeft")  { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.scrollDisplayLeft?.(); break; }
        if (method === "scrollDisplayRight") { (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance?.scrollDisplayRight?.(); break; }
        if (method === "createChar")   { const inst=(boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance; const arr=Array.isArray(args[1])?args[1]:(vars[op.args?.[1]]??[]); inst?.createChar?.(args[0],arr); break; }
        if (method === "begin") {
          const oledInst = this.registry.getAll().find(c=>c.type==="oled")?.instance;
          const lcdInst  = (boundComp??this.registry.getAll().find(c=>c.type==="lcd"))?.instance;
          const dhtComp  = this.registry.getAll().find(c=>c.type==="dht"||c.type==="dht11");
          if (boundComp?.type==="dht"||boundComp?.type==="dht11") { boundComp.instance?.begin?.(); break; }
          if (dhtComp && !boundComp) { dhtComp.instance?.begin?.(); break; }
          oledInst?.begin?.();
          if (!oledInst && lcdInst) { lcdInst.resolvePins?.(this.circuitSolver); if (lcdInst.validated) lcdInst.begin?.(args[0],args[1]); }
          break;
        }
        if (method === "clearDisplay")     { this.registry.getAll().find(c=>c.type==="oled")?.instance?.clearDisplay?.(); break; }
        if (method === "setTextSize")      { this.registry.getAll().find(c=>c.type==="oled")?.instance?.setTextSize?.(Math.max(1,Math.min(8,args[0]??1))); break; }
        if (method === "setTextColor")     { this.registry.getAll().find(c=>c.type==="oled")?.instance?.setTextColor?.(args[0]==="WHITE"||args[0]===1?1:0); break; }
        if (method === "invertDisplay")    { this.registry.getAll().find(c=>c.type==="oled")?.instance?.invertDisplay?.(!!args[0]); break; }
        if (method === "drawPixel")        { this.registry.getAll().find(c=>c.type==="oled")?.instance?.drawPixel?.(...args); break; }
        if (method === "drawLine")         { this.registry.getAll().find(c=>c.type==="oled")?.instance?.drawLine?.(...args); break; }
        if (method === "drawRect")         { this.registry.getAll().find(c=>c.type==="oled")?.instance?.drawRect?.(...args); break; }
        if (method === "fillRect")         { this.registry.getAll().find(c=>c.type==="oled")?.instance?.fillRect?.(...args); break; }
        if (method === "drawCircle")       { this.registry.getAll().find(c=>c.type==="oled")?.instance?.drawCircle?.(...args); break; }
        if (method === "fillCircle")       { this.registry.getAll().find(c=>c.type==="oled")?.instance?.fillCircle?.(...args); break; }
        if (method === "drawTriangle")     { this.registry.getAll().find(c=>c.type==="oled")?.instance?.drawTriangle?.(...args); break; }
        if (method === "fillTriangle")     { this.registry.getAll().find(c=>c.type==="oled")?.instance?.fillTriangle?.(...args); break; }
        if (method === "setTextWrap")      { this.registry.getAll().find(c=>c.type==="oled")?.instance?.setTextWrap?.(!!args[0]); break; }
        if (method === "dim")              { this.registry.getAll().find(c=>c.type==="oled")?.instance?.dim?.(!!args[0]); break; }
        if (method === "startscrollright") { this.registry.getAll().find(c=>c.type==="oled")?.instance?.startscrollright?.(...args); break; }
        if (method === "startscrollleft")  { this.registry.getAll().find(c=>c.type==="oled")?.instance?.startscrollleft?.(...args); break; }
        if (method === "stopscroll")       { this.registry.getAll().find(c=>c.type==="oled")?.instance?.stopscroll?.(); break; }
       if (method === "readTemperature") {
          const dhtComp = boundComp
            ?? this.registry.getComponentByInstance(objName)
            ?? this.registry.getAll().find(c => {
                 const t = c.type?.toLowerCase();
                 return t === "dht" || t === "dht11" || t === "dht22";
               });
          const isF  = args[0] === true || args[0] === 1 || args[0] === "true";
          const inst = dhtComp?.instance;
          let val;
          if (inst?.readTemperature) val = inst.readTemperature(isF);
          else if (inst)             val = inst.temperature ?? inst._temperature ?? (isF ? 77.0 : 25.0);
          else                       val = isF ? 77.0 : 25.0;
          if (!Number.isFinite(val)) val = isF ? 77.0 : 25.0;
          if (op.variable) {
            vars[op.variable]            = val;
            this.globalVars[op.variable] = val;
          }
          break;
        }
       if (method === "readHumidity") {
          const dhtComp = boundComp
            ?? this.registry.getComponentByInstance(objName)
            ?? this.registry.getAll().find(c => {
                 const t = c.type?.toLowerCase();
                 return t === "dht" || t === "dht11" || t === "dht22";
               });
          const inst = dhtComp?.instance;
          let val;
          if (inst?.readHumidity) val = inst.readHumidity();
          else if (inst)          val = inst.humidity ?? inst._humidity ?? 55.0;
          else                    val = 55.0;
          if (!Number.isFinite(val)) val = 55.0;
          if (op.variable) {
            vars[op.variable]            = val;
            this.globalVars[op.variable] = val;
          }
          break;
        }
        if (method === "computeHeatIndex") {
          const t=Number(args[0]??25), h=Number(args[1]??55);
          const hi=-8.78469475556+1.61139411*t+2.33854883889*h-0.14611605*t*h-0.012308094*t*t-0.016424828*h*h+0.002211732*t*t*h+0.00072546*t*h*h-0.000003582*t*t*h*h;
          if (op.variable) vars[op.variable] = hi;
          break;
        }
        if (method === "setSpeed")           { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.setSpeed?.(Number(args[0])); break; }
        if (method === "setMaxSpeed")        { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.setMaxSpeed?.(Number(args[0])); break; }
        if (method === "setAcceleration")    { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.setAcceleration?.(Number(args[0])); break; }
        if (method === "moveTo")             { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.moveTo?.(Math.round(Number(args[0]))); break; }
        if (method === "move")               { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.move?.(Math.round(Number(args[0]))); break; }
        if (method === "step")               { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.step?.(Math.round(Number(args[0]))); await this.nextFrame(); break; }
        if (method === "run")                { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.run?.(); await this.nextFrame(); break; }
        if (method === "runSpeed")           { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.runSpeed?.(); await this.nextFrame(); break; }
        if (method === "stop")               { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.stop?.(); break; }
        if (method === "enableOutputs")      { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.enableOutputs?.(); break; }
        if (method === "disableOutputs")     { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.disableOutputs?.(); break; }
        if (method === "runToPosition")      { const sc=(boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance; if(sc){while(sc.distanceToGo?.()!==0){sc.run?.();await this.nextFrame();}} break; }
        if (method === "runToNewPosition")   { const sc=(boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance; if(sc){sc.moveTo?.(Math.round(Number(args[0])));while(sc.distanceToGo?.()!==0){sc.run?.();await this.nextFrame();}} break; }
        if (method === "currentPosition")    { if(op.variable)vars[op.variable]=(boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.currentPosition?.()??0; break; }
        if (method === "distanceToGo")       { if(op.variable)vars[op.variable]=(boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.distanceToGo?.()??0; break; }
        if (method === "isRunning")          { if(op.variable)vars[op.variable]=(boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.isRunning?.()??false?1:0; break; }
        if (method === "speed")              { if(op.variable)vars[op.variable]=(boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.speed?.()??0; break; }
        if (method === "setCurrentPosition") { (boundComp??this.registry.getAll().find(c=>c.type==="stepper"))?.instance?.setCurrentPosition?.(Math.round(Number(args[0]))); break; }
        if (method === "ping_cm")     { if(op.variable)vars[op.variable]=(boundComp??this.registry.getAll().find(c=>c.type==="hcsr04"))?.instance?.distanceCm??20; break; }
        if (method === "ping_in")     { if(op.variable)vars[op.variable]=((boundComp??this.registry.getAll().find(c=>c.type==="hcsr04"))?.instance?.distanceCm??20)/2.54; break; }
        if (method === "ping")        { if(op.variable)vars[op.variable]=((boundComp??this.registry.getAll().find(c=>c.type==="hcsr04"))?.instance?.distanceCm??20)*58.2; break; }
        if (method === "ping_median") { if(op.variable)vars[op.variable]=((boundComp??this.registry.getAll().find(c=>c.type==="hcsr04"))?.instance?.distanceCm??20)*58.2; break; }
        if (method === "convert_cm")  { if(op.variable)vars[op.variable]=Number(args[0])/58.2; break; }
        if (method === "isPressed")   { const kc=boundComp??this.registry.getAll().find(c=>c.type==="keypad"); const cur=kc?.instance?.getKey?.()??null; if(op.variable)vars[op.variable]=(cur===String(args[0]))?1:0; break; }
        if (method === "setHoldTime" || method === "setDebounceTime") { break; }
        if (method === "getState")    { if(op.variable)vars[op.variable]=0; break; }
        if (method === "show")              { (boundComp??this.registry.getAll().find(c=>c.type==="neopixel"))?.instance?.show?.(); break; }
        if (method === "setBrightness" && (boundComp?.type==="neopixel"||!boundComp)) { (boundComp??this.registry.getAll().find(c=>c.type==="neopixel"))?.instance?.setBrightness?.(Math.max(0,Math.min(255,args[0]))); break; }
        if (method === "setPixelColor")     { (boundComp??this.registry.getAll().find(c=>c.type==="neopixel"))?.instance?.setPixelColor?.(...args); break; }
        if (method === "fill")              { (boundComp??this.registry.getAll().find(c=>c.type==="neopixel"))?.instance?.fill?.(...args); break; }
        if (method === "Color")             { const[r,g,b]=args; if(op.variable)vars[op.variable]=((r&0xFF)<<16)|((g&0xFF)<<8)|(b&0xFF); break; }
        if (method === "numPixels")         { if(op.variable)vars[op.variable]=(boundComp??this.registry.getAll().find(c=>c.type==="neopixel"))?.instance?.numPixels?.()??0; break; }
        if (method === "getPixelColor")     { if(op.variable)vars[op.variable]=0; break; }
        if (method === "showNumberDec")     { const seg=boundComp??this.registry.getAll().find(c=>c.type==="4-digit-7-segment"); seg?.instance?.displayNumber?.(Math.round(args[0]??0)); break; }
        if (method === "showNumberDecEx")   { const seg=boundComp??this.registry.getAll().find(c=>c.type==="4-digit-7-segment"); const val=Math.round(args[0]??0); const dots=Number(args[1]??0); const colon=!!(dots&0b01000000); let str=String(val).padStart(4,"0"); if(colon)str=str.slice(0,2)+":"+str.slice(2); seg?.instance?.displayNumber?.(str); break; }
        if (method === "setBrightness" && boundComp?.type==="4-digit-7-segment") { boundComp.instance?.setBrightness?.(Math.max(0,Math.min(7,Math.round(args[0])))); break; }
        if ((method==="print"||method==="println") && boundComp?.type==="softwareserial") { const line=String(args[0]??""); this.onSerialOutput?.(method==="println"?line+"\n":line); break; }
        if (method==="read"    && boundComp?.type==="softwareserial") { if(op.variable)vars[op.variable]=-1; break; }
        if (method==="available"&&boundComp?.type==="softwareserial") { if(op.variable)vars[op.variable]=0;  break; }
        if (["beginTransmission","endTransmission","write","requestFrom"].includes(method)&&(objName==="Wire"||objName==="wire")) { break; }
        if (method==="read"    &&(objName==="Wire"||objName==="wire")) { if(op.variable)vars[op.variable]=0; break; }
        if (method==="available"&&(objName==="Wire"||objName==="wire")){ if(op.variable)vars[op.variable]=0; break; }
        if (method==="initialize")    { break; }
        if (method==="testConnection"){ if(op.variable)vars[op.variable]=1; break; }
        if (method==="getMotion6")    { const vals=[0,0,16384,0,0,0]; (op.rawArgs??[]).forEach((n,i)=>{if(n&&typeof n==="string")vars[n.replace(/[*&]/g,"")]=vals[i]??0;}); break; }
        if (method==="getTemperature"){ if(op.variable)vars[op.variable]=2560; break; }
        if (method==="enableIRIn")    { break; }
        if (method==="decode")        { if(op.variable)vars[op.variable]=0; break; }
        if (method==="resume")        { break; }

        console.warn(`[SimEngine] Unhandled methodCall: ${objName}.${method}(${args.join(", ")})`);
        break;
      }

      case "analogReadResolution": {
        if (this.board !== "esp32" && this.board !== "esp8266") this._throw("analogReadResolution() is ESP32/ESP8266 only.", { context: "analogReadResolution" });
        this.simState.analogResolution = Math.max(1, Math.min(12, Number(op.bits)));
        break;
      }

      case "dacWrite": {
        const pin = this._resolvePin(op.pin, vars);
        if (this.board !== "esp32") this._throw(`dacWrite(${pin}): ESP32-only.`, { context: "dacWrite" });
        if (pin !== 25 && pin !== 26) this._throw(`dacWrite(${pin}): Only pins 25 and 26.`, { context: "dacWrite" });
        this._enforcePinMode(pin, "dacWrite");
        const value = Math.max(0, Math.min(255, Math.round(this.evaluateExpression(op.value, vars))));
        this.digitalVoltages[`D${pin}`] = value;
        this.resolveElectrical();
        this.onPinChange?.({ pin, value, mode: "DAC" });
        await this.nextFrame();
        break;
      }

      case "touchRead": {
        if (this.board !== "esp32") this._throw("touchRead() is ESP32-only.", { context: "touchRead" });
        if (op.variable) vars[op.variable] = 50;
        break;
      }

      case "hallRead": {
        if (this.board !== "esp32") this._throw("hallRead() is ESP32-only.", { context: "hallRead" });
        if (op.variable) vars[op.variable] = 0;
        break;
      }

      case "delay":             await this.delay(Number(this.evaluateExpression(op.time, vars))); break;
      case "delayMicroseconds": await this.delayMicroseconds(Number(this.evaluateExpression(op.time, vars))); break;
      case "millis":            if (op.variable) vars[op.variable] = this.millis(); break;
      case "micros":            if (op.variable) vars[op.variable] = this.micros(); break;

      case "tone": {
        const pin  = this._resolvePin(op.pin, vars);
        const freq = Number(this.evaluateExpression(op.frequency, vars));
        const dur  = op.duration ? Number(this.evaluateExpression(op.duration, vars)) : null;
        if (!Number.isFinite(freq) || freq <= 0) this._throw(`tone(${pin}, ${freq}): Invalid frequency.`, { context: "tone" });
        this._enforcePinMode(pin, "tone");
        this.toneState = { active: true, pin, freq, duration: dur };
        this.resolveElectrical();
        if (dur && dur > 0) setTimeout(() => { if (this.toneState.pin === pin) this.toneState = { active: false, pin: null, freq: null, duration: null }; }, dur);
        break;
      }

      case "noTone": {
        const pin = this._resolvePin(op.pin, vars);
        if (this.toneState.pin === pin) this.toneState = { active: false, pin: null, freq: null, duration: null };
        this.resolveElectrical();
        break;
      }

      case "getKey": {
        const kpComp = registry.getAll().find(c => c.type === "keypad");
        if (kpComp?.instance) { kpComp.instance.codeParsed = true; if (op.variable) vars[op.variable] = kpComp.instance.getKey() ?? '\0'; }
        else if (op.variable) vars[op.variable] = '\0';
        break;
      }

      case "pulseIn": {
        const pin  = this._resolvePin(op.pin, vars);
        const key  = `D${pin}`;
        const mode = this.pinStates[key];
        if (!mode) this._throw(`pulseIn(${pin}): No pinMode() set.`, { context: "pulseIn" });
        if (mode === PIN_MODES.OUTPUT) this._throw(`pulseIn(${pin}): Pin is OUTPUT.`, { context: "pulseIn" });
        const arduino = this._findArduinoComponent();
        const netId   = arduino ? this.circuitSolver.findNet(arduino.id, this._pinStr(pin)) : null;
        let pulseWidth = 0;
        if (netId) {
          for (const comp of this.registry.getAll()) {
            if (comp.type === "ultrasonic" || comp.type === "hcsr04") {
              const echoNet = comp._echoNet ?? this.circuitSolver.findNet(comp.id, "echo");
              if (echoNet === netId && comp.instance?.powered) { pulseWidth = comp.instance.echoTime ?? 0; break; }
            }
          }
        }
        if (op.variable) vars[op.variable] = pulseWidth;
        break;
      }

      case "serialBegin":   { break; }
      case "serialPrint":
      case "serialPrintln": {
        const text = op.text !== null && op.text !== undefined ? String(op.text) : String(this.evaluateExpression(op.expr, vars));
        const line = op.type === "serialPrintln" ? text + "\n" : text;
        this.serialOutput.push(line);
        this.onSerialOutput?.(line);
        break;
      }
      case "serialRead":      if (op.variable) vars[op.variable] = -1; break;
      case "serialAvailable": if (op.variable) vars[op.variable] = 0;  break;

      case "ledcSetup": {
        if (this.board !== "esp32") this._throw("ledcSetup() is ESP32-only.", { context: "ledcSetup" });
        const [ch, freq, bits] = this._evalArgList(op.args, vars);
        this.simState.ledc[ch] = { freq, bits };
        break;
      }
      case "ledcAttachPin": {
        if (this.board !== "esp32") this._throw("ledcAttachPin() is ESP32-only.", { context: "ledcAttachPin" });
        const [pin] = this._evalArgList(op.args, vars);
        this.pinStates[`D${pin}`] = PIN_MODES.OUTPUT;
        break;
      }
      case "ledcWrite": {
        if (this.board !== "esp32") break;
        const [ch] = this._evalArgList(op.args, vars);
        if (this.simState.ledc[ch]) this.resolveElectrical();
        break;
      }
      case "ledcWriteTone": break;
      case "ledcDetachPin": break;

      case "xTaskCreate": {
        if (this.board !== "esp32") this._throw("xTaskCreate() is ESP32/FreeRTOS-only.", { context: "xTaskCreate" });
        break;
      }

      default: {
        const handler = this._componentHandlers[op.type];
        if (handler) await handler(op, ctx);
        else console.warn(`[SimEngine] Unhandled op type: "${op.type}"`, op);
        break;
      }
    }
  }

  _evalArgList(argsStr, vars) {
    if (!argsStr || !String(argsStr).trim()) return [];
    return String(argsStr).split(",").map(a => this.evaluateExpression(a.trim(), vars));
  }

  _quickParse(stmt, vars) {
    const s  = stmt.trim().replace(/;$/, "");
    const pp = s.match(/^(?:\+\+|--)?([A-Za-z_]\w*)(\+\+|--)?$/);
    if (pp && (pp[0].startsWith("++") || pp[0].startsWith("--") || pp[2])) {
      const op = pp[0].startsWith("++") || pp[2] === "++" ? "++" : "--";
      return [{ type: "compoundAssign", left: pp[1] || pp[0].slice(2), op, right: "" }];
    }
    const ca = s.match(/^([A-Za-z_]\w*)\s*([+\-*\/%&|^]=)\s*(.+)$/);
    if (ca) return [{ type: "compoundAssign", left: ca[1], op: ca[2], right: ca[3].trim() }];
    const sa = s.match(/^(?:\w+\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (sa) return [{ type: "assign", left: sa[1], right: sa[2].trim() }];
    return [];
  }
}