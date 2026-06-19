"use strict";

export const PIN_MODES = Object.freeze({
  INPUT:          "INPUT",
  OUTPUT:         "OUTPUT",
  INPUT_PULLUP:   "INPUT_PULLUP",
  INPUT_PULLDOWN: "INPUT_PULLDOWN",
  PWM:            "PWM",
  ANALOG_IN:      "ANALOG_IN",
  DAC:            "DAC",
  OPEN_DRAIN:     "OPEN_DRAIN",
});

export const PIN_MODE_COMPAT = Object.freeze({
  digitalWrite: ["OUTPUT", "OPEN_DRAIN"],
  analogWrite:  ["OUTPUT", "PWM"],
  dacWrite:     ["OUTPUT", "DAC"],
  digitalRead:  ["INPUT", "INPUT_PULLUP", "INPUT_PULLDOWN", "OPEN_DRAIN"],
  analogRead:   ["INPUT", "ANALOG_IN", "INPUT_PULLUP"],
  tone:         ["OUTPUT"],
  pulseIn:      ["INPUT", "INPUT_PULLUP"],
});

export function checkPinMode(pinStates, pinKey, operation) {
  const mode    = pinStates[pinKey];
  const allowed = PIN_MODE_COMPAT[operation];
  if (!mode) {
    return {
      ok:      false,
      mode:    null,
      fatal:   true,
      message: `Pin ${pinKey.replace("D","")} has no pinMode() set before ${operation}(). Call pinMode() first.`,
    };
  }
  if (!allowed) return { ok: true, mode };
  if (!allowed.includes(mode)) {
    return {
      ok:      false,
      mode,
      fatal:   true,
      message: `Pin ${pinKey.replace("D","")} is set as ${mode} but ${operation}() requires: ${allowed.join(" or ")}. Fix pinMode() call.`,
    };
  }
  return { ok: true, mode };
}

function _accelComp(ctx, instance) {
  return ctx.registry.getOrBindComponent?.("stepper", instance)?.instance
    ?? ctx.registry.getAll?.().find(c => c.type === "stepper")?.instance;
}

function _ultrasonicRead(ctx, instance, unit) {
  const comp = ctx.registry.getOrBindComponent?.("hcsr04", instance)
    ?? ctx.registry.getAll?.().find(c => c.type === "hcsr04");
  const cm = comp?.instance?.distanceCm ?? 20;
  if (unit === "cm") return cm;
  if (unit === "in") return cm / 2.54;
  return cm * 58.2;
}
const CLASS_TO_REGISTRY_TYPES = {
  "liquidcrystal_i2c":  ["lcd", "lcd-16x2-i2c"],
  "liquidcrystal":      ["lcd", "lcd-16x2"],
  "adafruit_ssd1306":   ["oled", "ssd1306"],
  "tm1637display":      ["4-digit-7-segment", "tm1637"],
  "adafruit_neopixel":  ["neopixel", "ws2812"],
  "dht":                ["dht", "dht11", "dht22"],
  "dht11":              ["dht11", "dht"],
  "dht22":              ["dht22", "dht"],
  "servo":              ["servo"],
  "stepper":            ["stepper"],
  "accelstepper":       ["stepper"],
  "keypad":             ["keypad", "keypad-4x4"],
  "mpu6050":            ["mpu6050"],
  "hcsr04":             ["hcsr04", "ultrasonic"],
  "newping":            ["hcsr04", "ultrasonic"],
  "irrecv":             ["irrecv"],
  "softwareserial":     ["softwareserial"],
};

function _getCompByInstance(ctx, instanceName, classHint) {
  // 1. Exact instance name se
  const byName = ctx.registry.getComponentByInstance?.(instanceName);
  if (byName) return byName;

  // 2. Class hint se types nikalo
  const classKey = (classHint ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const types    = CLASS_TO_REGISTRY_TYPES[classKey]
                ?? CLASS_TO_REGISTRY_TYPES[(classHint ?? "").toLowerCase()]
                ?? [];

  for (const t of types) {
    const c = ctx.registry.getOrBindComponent?.(t, instanceName);
    if (c) return c;
  }

  return null;
}
// File ke top pe — "use strict"; ke baad, COMPONENT_DEFINITIONS se pehle:
function _getDHTInstance(ctx, instanceName) {
  // 1. Exact instance name se dhundho
  if (instanceName) {
    const byName = ctx.registry.getComponentByInstance?.(instanceName);
    if (byName?.instance) return byName.instance;
  }
  // 2. Type bind try karo
  const bound =
    ctx.registry.getOrBindComponent?.("dht",   instanceName) ??
    ctx.registry.getOrBindComponent?.("dht11", instanceName) ??
    ctx.registry.getOrBindComponent?.("dht22", instanceName);
  if (bound?.instance) return bound.instance;
  // 3. Last resort
  return ctx.registry.getAll?.().find(
    c => {
      const t = c.type?.toLowerCase();
      return t === "dht" || t === "dht11" || t === "dht22";
    }
  )?.instance ?? null;
}
export const COMPONENT_DEFINITIONS = {

  Servo: {
    className:   "Servo",
    library:     "Servo.h",
    registryKey: "servo",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      {
        pattern: /^(\w+)\.attach\s*\(\s*([A-Za-z_\d]+)(?:\s*,\s*(\d+)\s*,\s*(\d+))?\s*\)\s*;$/i,
        build:   (m) => ({ type: "servoAttach", instance: m[1], pin: m[2], minUs: m[3] ?? "544", maxUs: m[4] ?? "2400" }),
      },
      {
        pattern: /^(\w+)\.write\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build:   (m) => ({ type: "servoWrite", instance: m[1], angle: m[2] }),
      },
      {
        pattern: /^(\w+)\.writeMicroseconds\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build:   (m) => ({ type: "servoWriteMicroseconds", instance: m[1], us: m[2] }),
      },
      {
        pattern: /^(\w+)\.detach\s*\(\s*\)\s*;$/i,
        build:   (m) => ({ type: "servoDetach", instance: m[1] }),
      },
      {
        pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.read\s*\(\s*\)\s*;$/i,
        build:   (m) => ({ type: "servoRead", variable: m[1], instance: m[2] }),
      },
      {
        pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.attached\s*\(\s*\)\s*;$/i,
        build:   (m) => ({ type: "servoAttached", variable: m[1], instance: m[2] }),
      },
    ],
    engineOps: {
      servoAttach: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("servo", op.instance);
        if (!comp) { ctx.warn(`Servo '${op.instance}' not found on canvas.`); return; }
        const pin = ctx.resolvePin(op.pin);
        ctx.pinStates[`D${pin}`]  = PIN_MODES.OUTPUT;
        comp.instance             = comp.instance ?? {};
        comp.instance.attachedPin = pin;
        comp.instance.attached    = true;
        comp.instance.powered     = true;
        comp.instance.minUs       = Number(op.minUs) || 544;
        comp.instance.maxUs       = Number(op.maxUs) || 2400;
        comp.instance.targetAngle = comp.instance.targetAngle ?? 90;
      },
      servoWrite: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("servo", op.instance);
        if (!comp?.instance?.attached) { ctx.error(`servoWrite: '${op.instance}' not attached. Call attach() first.`); return; }
        comp.instance.targetAngle = Math.max(0, Math.min(180, Math.round(ctx.evaluate(op.angle))));
      },
      servoWriteMicroseconds: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("servo", op.instance);
        if (!comp?.instance?.attached) { ctx.error(`servoWriteMicroseconds: '${op.instance}' not attached.`); return; }
        const us  = ctx.evaluate(op.us);
        const min = comp.instance.minUs ?? 544;
        const max = comp.instance.maxUs ?? 2400;
        comp.instance.targetAngle = Math.max(0, Math.min(180, Math.round(((us - min) / (max - min)) * 180)));
      },
      servoDetach: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("servo", op.instance);
        if (!comp) return;
        comp.instance          = comp.instance ?? {};
        comp.instance.attached = false;
        comp.instance.powered  = false;
      },
      servoRead: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("servo", op.instance);
        if (op.variable && comp?.instance?.targetAngle !== undefined)
          ctx.vars[op.variable] = comp.instance.targetAngle;
      },
      servoAttached: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("servo", op.instance);
        if (op.variable) ctx.vars[op.variable] = comp?.instance?.attached ? 1 : 0;
      },
    },
  },

  LiquidCrystal_I2C: {
    className:   "LiquidCrystal_I2C",
    library:     "LiquidCrystal_I2C.h",
    registryKey: "lcd",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.init\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdInit", instance: m[1] }) },
      { pattern: /^(\w+)\.begin\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdBegin", instance: m[1], cols: +m[2], rows: +m[3] }) },
      { pattern: /^(\w+)\.backlight\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdBacklight", instance: m[1] }) },
      { pattern: /^(\w+)\.noBacklight\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoBacklight", instance: m[1] }) },
      { pattern: /^(\w+)\.clear\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdClear", instance: m[1] }) },
      { pattern: /^(\w+)\.home\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdHome", instance: m[1] }) },
      { pattern: /^(\w+)\.setCursor\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdCursor", instance: m[1], col: m[2], row: m[3] }) },
      {
        pattern: /^(\w+)\.print(?:ln)?\s*\(\s*([\s\S]+?)\s*\)\s*;$/i,
        build: (m) => {
          const raw   = m[2].trim();
          const isStr = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
          return { type: "lcdPrint", instance: m[1], text: isStr ? raw.slice(1, -1) : raw, isExpr: !isStr };
        },
      },
      { pattern: /^(\w+)\.write\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdWrite", instance: m[1], value: m[2].trim() }) },
      { pattern: /^(\w+)\.scrollDisplayLeft\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdScrollLeft", instance: m[1] }) },
      { pattern: /^(\w+)\.scrollDisplayRight\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdScrollRight", instance: m[1] }) },
      { pattern: /^(\w+)\.noDisplay\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoDisplay", instance: m[1] }) },
      { pattern: /^(\w+)\.display\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdDisplay", instance: m[1] }) },
      { pattern: /^(\w+)\.blink\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdBlink", instance: m[1] }) },
      { pattern: /^(\w+)\.noBlink\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoBlink", instance: m[1] }) },
      { pattern: /^(\w+)\.cursor\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdShowCursor", instance: m[1] }) },
      { pattern: /^(\w+)\.noCursor\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoCursor", instance: m[1] }) },
      { pattern: /^(\w+)\.leftToRight\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdLeftToRight", instance: m[1] }) },
      { pattern: /^(\w+)\.rightToLeft\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdRightToLeft", instance: m[1] }) },
      { pattern: /^(\w+)\.autoscroll\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdAutoscroll", instance: m[1] }) },
      { pattern: /^(\w+)\.noAutoscroll\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoAutoscroll", instance: m[1] }) },
      { pattern: /^(\w+)\.createChar\s*\(\s*(\d+)\s*,\s*([A-Za-z_]\w*)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdCreateChar", instance: m[1], num: +m[2], varName: m[3] }) },
      { pattern: /^(\w+)\.command\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdCommand", instance: m[1], value: m[2].trim() }) },
    ],
   engineOps: {
  lcdInit: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  if (!c.initialized) c.init();
},
lcdBegin: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  c.begin(op.cols, op.rows);
},
lcdBacklight: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  if (!c.initialized) c.init();
  c.backlight(true);
},
lcdNoBacklight: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  c.backlight(false);
},
lcdClear: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  if (!c.initialized) c.init();
  c.clear();
},
lcdHome: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  if (!c.initialized) c.init();
  c.home();
},
lcdCursor: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  if (!c.initialized) c.init();
  const col = typeof op.col === "number" ? op.col : Math.round(ctx.evaluate(String(op.col)));
  const row = typeof op.row === "number" ? op.row : Math.round(ctx.evaluate(String(op.row)));
  c.setCursor(col, row);
},
lcdPrint: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance;
  if (!c) return;
  if (!c.initialized) c.init();

  if (!op.isExpr) {
    c.print(op.text ?? "");
    return;
  }

  const raw = op.text ?? "";

  // print(val, decimals) format check
  const commaIdx = raw.lastIndexOf(",");
  if (commaIdx !== -1) {
    const maybeDecimals = raw.slice(commaIdx + 1).trim();
    if (/^\d+$/.test(maybeDecimals)) {
      const val = ctx.evaluate(raw.slice(0, commaIdx).trim());
      c.print(Number(val).toFixed(parseInt(maybeDecimals)));
      return;
    }
  }

  // Normal expression — string ya number dono handle karo
  const result = ctx.evaluate(raw);
  if (typeof result === "string") {
    c.print(result);
  } else if (typeof result === "number") {
    c.print(Number.isInteger(result) ? String(result) : result.toFixed(2));
  } else {
    c.print(String(result ?? ""));
  }
},
lcdWrite:         async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; if (!c.initialized) c.init(); c.write(ctx.evaluate(op.value)); },
lcdScrollLeft:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; if (!c.initialized) c.init(); c.scrollDisplayLeft(); },
lcdScrollRight:   async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; if (!c.initialized) c.init(); c.scrollDisplayRight(); },
lcdNoDisplay:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.noDisplay(); },
lcdDisplay:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.display(); },
lcdBlink:         async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.blink(); },
lcdNoBlink:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.noBlink(); },
lcdShowCursor:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.cursor(); },
lcdNoCursor:      async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.noCursor(); },
lcdLeftToRight:   async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.leftToRight(); },
lcdRightToLeft:   async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.rightToLeft(); },
lcdAutoscroll:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.autoscroll(); },
lcdNoAutoscroll:  async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.noAutoscroll(); },
lcdCreateChar:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; const arr = ctx.vars[op.varName] ?? []; c.createChar(op.num, arr); },
lcdCommand:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "LiquidCrystal_I2C")?.instance; if (!c) return; c.command(ctx.evaluate(op.value)); },
    },
  },

  TM1637Display: {
    className:   "TM1637Display",
    library:     "TM1637Display.h",
    registryKey: "4-digit-7-segment",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.setBrightness\s*\(\s*([A-Za-z_\d]+)(?:\s*,\s*(true|false))?\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4Brightness", instance: m[1], level: m[2], on: m[3] !== "false" }) },
      { pattern: /^(\w+)\.showNumberDec\s*\(\s*([A-Za-z_\d]+)(?:\s*,\s*([A-Za-z_\d]+))?(?:\s*,\s*(\d+))?\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4Display", instance: m[1], value: m[2], leadingZeros: m[3] || "false", pos: m[4] || "0" }) },
     {
  pattern: /^(\w+)\.showNumberDecEx\s*\(\s*([A-Za-z_\d\s\+\-\*\/]+?)\s*,\s*(0b[01]+|\d+)(?:\s*,\s*(true|false|[01]))?(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\s*\)\s*;$/i,
  build: (m) => {
    const dotsRaw = m[3] ?? "0";
    const dotsVal = dotsRaw.startsWith("0b") ? parseInt(dotsRaw.slice(2), 2) : parseInt(dotsRaw);
    // leadingZeros: agar m[4] missing ho toh false (real Arduino default)
    const lz = m[4] === "true" || m[4] === "1" ? true : false;
    return {
      type:         "seg4DisplayEx",
      instance:     m[1],
      value:        m[2].trim(),
      dots:         dotsVal,
      leadingZeros: lz,
      length:       m[5] ? parseInt(m[5]) : 4,
      pos:          m[6] ? parseInt(m[6]) : 0,
    };
  },
},
      { pattern: /^(\w+)\.showNumberHexEx\s*\(\s*(0x[a-fA-F\d]+|\d+)(?:\s*,\s*(0b[01]+|\d+))?(?:\s*,\s*(true|false))?(?:\s*,\s*(\d+))?\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4DisplayHex", instance: m[1], value: m[2], dots: m[3] || "0", leadingZeros: m[4] !== "false", pos: m[5] || "0" }) },
      { pattern: /^(\w+)\.showNumberBaseEx\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)(?:\s*,\s*(0b[01]+|\d+))?(?:\s*,\s*(true|false))?(?:\s*,\s*(\d+))?\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4DisplayBase", instance: m[1], base: m[2], value: m[3], dots: m[4] || "0", leadingZeros: m[5] !== "false", pos: m[6] || "0" }) },
      { pattern: /^(\w+)\.setSegments\s*\(\s*([A-Za-z_]\w*)(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4Segments", instance: m[1], varName: m[2], length: m[3] || "4", pos: m[4] || "0" }) },
      { pattern: /^(\w+)\.clear\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4Clear", instance: m[1] }) },
      { pattern: /^(\w+)\.point\s*\(\s*(true|false|[01])\s*\)\s*;$/i,
        build: (m) => ({ type: "seg4Point", instance: m[1], on: m[2] }) },
    ],
    engineOps: {
seg4Brightness: async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance; if (c?.validated) c.setBrightness?.(Math.max(0, Math.min(7, Math.round(ctx.evaluate(op.level)))), op.on !== false); },
seg4Display:    async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance;
  if (!c?.validated) return;
  const val = Math.round(ctx.evaluate(op.value));
  const lz  = op.leadingZeros === true || op.leadingZeros === "true";
  const len = op.length ? Math.min(4, Math.max(1, parseInt(op.length))) : 4;
  const pos = op.pos    ? Math.min(3, Math.max(0, parseInt(op.pos)))    : 0;
  const maxVal = Math.pow(10, len) - 1;
  const minVal = -(Math.pow(10, len - 1) - 1);
  if (val > maxVal || val < minVal) { c.clear?.(); return; }
  c.displayNumber?.(val, lz, pos);
},
seg4DisplayEx:  async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance;
  if (!c?.validated) return;
  const val   = Math.round(ctx.evaluate(op.value));
  const dots  = Number(op.dots ?? 0);
  const colon = !!(dots & 0b01000000);
  const lz    = op.leadingZeros === true || op.leadingZeros === "true";
  const pos   = parseInt(op.pos) || 0;
  const absVal = Math.abs(val);
  let str = lz ? String(absVal).padStart(4, "0") : String(absVal).padStart(4, " ");
  if (colon) str = str.slice(0, 2) + ":" + str.slice(2);
  c.displayNumber?.(str, lz, pos);
},
seg4DisplayHex: async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance; if (!c?.validated) return; const val = parseInt(op.value, 16); c.displayNumber?.(val.toString(16).toUpperCase().padStart(4, "0")); },
seg4Segments:   async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance; if (!c?.validated) return; const arr = ctx.vars[op.varName] ?? []; c.setSegments?.(arr, Math.min(parseInt(op.length)||4, 4), parseInt(op.pos)||0); },
seg4Clear:      async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance; if (c?.validated) c.clear?.(); },
seg4Point:      async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "TM1637Display")?.instance; const on = op.on === "true" || op.on === "1" || op.on === true; if (c?.validated) c.point?.(on); },
    },
  },

  Adafruit_SSD1306: {
    className:         "Adafruit_SSD1306",
    library:           "Adafruit_SSD1306.h",
    registryKey:       "oled",
    boards:            ["arduino", "esp32", "esp8266"],
    requiresReadyFlag: true,
    parserOps: [
      { pattern: /^(\w+)\.begin\s*\([^)]*\)\s*;$/i,                    build: (m) => ({ type: "oledBegin",          instance: m[1] }) },
      { pattern: /^(\w+)\.clearDisplay\s*\(\s*\)\s*;$/i,               build: (m) => ({ type: "oledClear",          instance: m[1] }) },
      { pattern: /^(\w+)\.display\s*\(\s*\)\s*;$/i,                    build: (m) => ({ type: "oledRender",         instance: m[1] }) },
      { pattern: /^(\w+)\.setTextSize\s*\(\s*(\d+)\s*\)\s*;$/i,       build: (m) => ({ type: "oledSetTextSize",    instance: m[1], size: +m[2] }) },
      { pattern: /^(\w+)\.setTextColor\s*\(\s*([^)]+)\s*\)\s*;$/i,    build: (m) => ({ type: "oledSetTextColor",   instance: m[1], color: m[2].trim() }) },
      { pattern: /^(\w+)\.setTextColor\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)\s*;$/i, build: (m) => ({ type: "oledSetTextColor2", instance: m[1], color: m[2].trim(), bg: m[3].trim() }) },

      { pattern: /^(\w+)\.setCursor\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i, build: (m) => ({ type: "oledCursor", instance: m[1], x: m[2], y: m[3] }) },
      { pattern: /^(\w+)\.print\s*\(\s*"([^"]*)"\s*\)\s*;$/i,         build: (m) => ({ type: "oledText",           instance: m[1], text: m[2] }) },
      { pattern: /^(\w+)\.println\s*\(\s*"([^"]*)"\s*\)\s*;$/i,       build: (m) => ({ type: "oledTextLn",         instance: m[1], text: m[2] }) },
      { pattern: /^(\w+)\.print\s*\(\s*([^")][^)]*)\s*\)\s*;$/i,      build: (m) => ({ type: "oledTextExpr",       instance: m[1], expr: m[2].trim() }) },
      { pattern: /^(\w+)\.println\s*\(\s*([^")][^)]*)\s*\)\s*;$/i,    build: (m) => ({ type: "oledTextExprLn",     instance: m[1], expr: m[2].trim() }) },
      { pattern: /^(\w+)\.println\s*\(\s*\)\s*;$/i,                    build: (m) => ({ type: "oledTextLn",         instance: m[1], text: "" }) },
      { pattern: /^(\w+)\.invertDisplay\s*\(\s*([^)]+)\s*\)\s*;$/i,   build: (m) => ({ type: "oledInvert",         instance: m[1], invert: m[2].trim() }) },
      { pattern: /^(\w+)\.drawPixel\s*\(\s*([^)]+)\s*\)\s*;$/i,       build: (m) => ({ type: "oledDrawPixel",      instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawLine\s*\(\s*([^)]+)\s*\)\s*;$/i,        build: (m) => ({ type: "oledDrawLine",       instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawFastHLine\s*\(\s*([^)]+)\s*\)\s*;$/i,   build: (m) => ({ type: "oledDrawFastHLine",  instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawFastVLine\s*\(\s*([^)]+)\s*\)\s*;$/i,   build: (m) => ({ type: "oledDrawFastVLine",  instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawRect\s*\(\s*([^)]+)\s*\)\s*;$/i,        build: (m) => ({ type: "oledDrawRect",       instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.fillRect\s*\(\s*([^)]+)\s*\)\s*;$/i,        build: (m) => ({ type: "oledFillRect",       instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawRoundRect\s*\(\s*([^)]+)\s*\)\s*;$/i,   build: (m) => ({ type: "oledDrawRoundRect",  instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.fillRoundRect\s*\(\s*([^)]+)\s*\)\s*;$/i,   build: (m) => ({ type: "oledFillRoundRect",  instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawCircle\s*\(\s*([^)]+)\s*\)\s*;$/i,      build: (m) => ({ type: "oledDrawCircle",     instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.fillCircle\s*\(\s*([^)]+)\s*\)\s*;$/i,      build: (m) => ({ type: "oledFillCircle",     instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawTriangle\s*\(\s*([^)]+)\s*\)\s*;$/i,    build: (m) => ({ type: "oledDrawTriangle",   instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.fillTriangle\s*\(\s*([^)]+)\s*\)\s*;$/i,    build: (m) => ({ type: "oledFillTriangle",   instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawChar\s*\(\s*([^)]+)\s*\)\s*;$/i,        build: (m) => ({ type: "oledDrawChar",       instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.drawBitmap\s*\(\s*([^)]+)\s*\)\s*;$/i,      build: (m) => ({ type: "oledDrawBitmap",     instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.fillScreen\s*\(\s*([^)]+)\s*\)\s*;$/i,      build: (m) => ({ type: "oledFillScreen",     instance: m[1], color: m[2].trim() }) },
      { pattern: /^(\w+)\.setTextWrap\s*\(\s*([^)]+)\s*\)\s*;$/i,     build: (m) => ({ type: "oledSetTextWrap",    instance: m[1], wrap: m[2].trim() }) },
      { pattern: /^(\w+)\.dim\s*\(\s*([^)]+)\s*\)\s*;$/i,             build: (m) => ({ type: "oledDim",            instance: m[1], dim: m[2].trim() }) },
      { pattern: /^(\w+)\.cp437\s*\(\s*([^)]+)\s*\)\s*;$/i,           build: (m) => ({ type: "oledCp437",          instance: m[1], enable: m[2].trim() }) },
      { pattern: /^(\w+)\.startscrollright\s*\(\s*([^)]+)\s*\)\s*;$/i,build: (m) => ({ type: "oledScrollRight",    instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.startscrollleft\s*\(\s*([^)]+)\s*\)\s*;$/i, build: (m) => ({ type: "oledScrollLeft",     instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.startscrolldiagright\s*\(\s*([^)]+)\s*\)\s*;$/i, build: (m) => ({ type: "oledScrollDiagRight", instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.startscrolldiagleft\s*\(\s*([^)]+)\s*\)\s*;$/i,  build: (m) => ({ type: "oledScrollDiagLeft",  instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.stopscroll\s*\(\s*\)\s*;$/i,                build: (m) => ({ type: "oledStopScroll",     instance: m[1] }) },
      { pattern: /^(\w+)\.getTextBounds\s*\(\s*([^)]+)\s*\)\s*;$/i,   build: (m) => ({ type: "oledGetTextBounds",  instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.width\s*\(\s*\)\s*;$/i,                     build: (m) => ({ type: "oledWidth",          instance: m[1] }) },
      { pattern: /^(\w+)\.height\s*\(\s*\)\s*;$/i,                    build: (m) => ({ type: "oledHeight",         instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.width\s*\(\s*\)\s*;$/i,  build: (m) => ({ type: "oledWidthVar",   variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.height\s*\(\s*\)\s*;$/i, build: (m) => ({ type: "oledHeightVar",  variable: m[1], instance: m[2] }) },
    ],
    engineOps: {
   oledBegin: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance;
  if (!c) return;
  if (!c.initialized) { c.initialized = true; c.cursorX = 0; c.cursorY = 0; c.textSize = 1; c.textColor = 1; }
},
oledClear:        async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.clearDisplay?.(); },
oledRender:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.display?.(); },
oledSetTextSize:  async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.setTextSize?.(Math.max(1, Math.min(8, op.size))); },
oledSetTextColor: async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.setTextColor?.(op.color === "WHITE" || op.color === "1" || op.color === "SSD1306_WHITE" ? 1 : 0); },
oledSetTextColor2:async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (!c) return; const fg = (op.color === "WHITE" || op.color === "1" || op.color === "SSD1306_WHITE") ? 1 : 0; const bg = (op.bg === "BLACK" || op.bg === "0") ? 0 : 1; c.setTextColor?.(fg, bg); },
oledCursor:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (!c) return; const x = typeof op.x === "number" ? op.x : Math.round(ctx.evaluate(String(op.x))); const y = typeof op.y === "number" ? op.y : Math.round(ctx.evaluate(String(op.y))); c.setCursor?.(x, y); },
oledText:       async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance;
  if (c) c.print?.(op.text ?? "");
},
oledTextLn:     async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance;
  if (c) c.println?.(op.text ?? "");
},
oledTextExpr:   async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance;
  if (!c) return;
  const val = ctx.evaluate(op.expr);
  c.print?.(typeof val === "string" ? val : String(val ?? ""));
},
oledTextExprLn: async (op, ctx) => {
  const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance;
  if (!c) return;
  const val = ctx.evaluate(op.expr);
  c.println?.(typeof val === "string" ? val : String(val ?? ""));
},
oledInvert:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.invertDisplay?.(!!ctx.evaluate(op.invert)); },
oledDrawPixel:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawPixel?.(...ctx.evalArgList(op.args)); },
oledDrawLine:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawLine?.(...ctx.evalArgList(op.args)); },
oledDrawRect:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawRect?.(...ctx.evalArgList(op.args)); },
oledFillRect:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.fillRect?.(...ctx.evalArgList(op.args)); },
oledDrawCircle:   async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawCircle?.(...ctx.evalArgList(op.args)); },
oledFillCircle:   async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.fillCircle?.(...ctx.evalArgList(op.args)); },
oledDrawTriangle: async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawTriangle?.(...ctx.evalArgList(op.args)); },
oledFillTriangle: async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.fillTriangle?.(...ctx.evalArgList(op.args)); },
oledDrawRoundRect:  async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawRoundRect?.(...ctx.evalArgList(op.args)); },
oledFillRoundRect:  async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.fillRoundRect?.(...ctx.evalArgList(op.args)); },
oledFillScreen:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.fillScreen?.(op.color === "WHITE" || op.color === "1" ? 1 : 0); },
oledSetTextWrap:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.setTextWrap?.(!!ctx.evaluate(op.wrap)); },
oledWidthVar:       async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 128; },
oledHeightVar:      async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 64; },
oledWidth:          async () => {},
oledHeight:         async () => {},
oledGetTextBounds:  async () => {},
oledDim:            async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.dim?.(!!ctx.evaluate(op.dim)); },
oledScrollRight:    async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.startscrollright?.(...ctx.evalArgList(op.args)); },
oledScrollLeft:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.startscrollleft?.(...ctx.evalArgList(op.args)); },
oledStopScroll:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.stopscroll?.(); },
oledDrawChar:       async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawChar?.(...ctx.evalArgList(op.args)); },
oledDrawBitmap:     async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawBitmap?.(...ctx.evalArgList(op.args)); },
oledDrawFastHLine:  async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawFastHLine?.(...ctx.evalArgList(op.args)); },
oledDrawFastVLine:  async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.drawFastVLine?.(...ctx.evalArgList(op.args)); },
oledCp437:          async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.cp437?.(!!ctx.evaluate(op.enable)); },
oledScrollDiagRight:async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.startscrolldiagright?.(...ctx.evalArgList(op.args)); },
oledScrollDiagLeft: async (op, ctx) => { const c = _getCompByInstance(ctx, op.instance, "Adafruit_SSD1306")?.instance; if (c) c.startscrolldiagleft?.(...ctx.evalArgList(op.args)); },    },
  },

  DHT: {
    className:   "DHT",
    library:     "DHT.h",
    registryKey: "dht",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.begin\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "dhtBegin", instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.readTemperature\s*\(\s*([^)]*)\s*\)\s*;$/i,
        build: (m) => ({ type: "dhtReadTemp", variable: m[1], instance: m[2], fahrenheit: m[3].trim() === "true" }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.readHumidity\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "dhtReadHumidity", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.computeHeatIndex\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "dhtHeatIndex", variable: m[1], instance: m[2], args: m[3].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.isnan\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "dhtIsNaN", variable: m[1], instance: m[2], expr: m[3].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.read\s*\(\s*(true|false)?\s*\)\s*;$/i,
        build: (m) => ({ type: "dhtRead", variable: m[1], instance: m[2], force: m[3] === "true" }) },
    ],
    engineOps: {
 dhtBegin: async (op, ctx) => {
  const inst = _getDHTInstance(ctx, op.instance);
  inst?.begin?.();
},
dhtReadTemp: async (op, ctx) => {
  const inst = _getDHTInstance(ctx, op.instance);
  let temp = inst?.readTemperature?.(op.fahrenheit)
          ?? inst?.temperature
          ?? inst?._temperature
          ?? (op.fahrenheit ? 77.0 : 25.0);
  if (!Number.isFinite(temp)) temp = op.fahrenheit ? 77.0 : 25.0;
  ctx.vars[op.variable]                      = temp;
  if (op.variable in (ctx.registry?.globalVars ?? {}))
    ctx.registry.globalVars[op.variable]     = temp;
},
   dhtReadHumidity: async (op, ctx) => {
  const inst = _getDHTInstance(ctx, op.instance);
  let hum = inst?.readHumidity?.()
         ?? inst?.humidity
         ?? inst?._humidity
         ?? 55.0;
  if (!Number.isFinite(hum)) hum = 55.0;
  ctx.vars[op.variable]                      = hum;
  if (op.variable in (ctx.registry?.globalVars ?? {}))
    ctx.registry.globalVars[op.variable]     = hum;
},
      dhtHeatIndex: async (op, ctx) => {
        const args = ctx.evalArgList(op.args);
        const t = args[0] ?? 25, h = args[1] ?? 55;
        const isFahrenheit = args[2] === true || args[2] === 1;
        let tc = isFahrenheit ? (t - 32) * 5 / 9 : t;
        const hi = -8.78469475556 + 1.61139411*tc + 2.33854883889*h
          - 0.14611605*tc*h - 0.012308094*tc*tc - 0.016424828*h*h
          + 0.002211732*tc*tc*h + 0.00072546*tc*h*h - 0.000003582*tc*tc*h*h;
        ctx.vars[op.variable] = isFahrenheit ? hi * 9/5 + 32 : hi;
      },
      dhtIsNaN: async (op, ctx) => { ctx.vars[op.variable] = isNaN(ctx.evaluate(op.expr)) ? 1 : 0; },
      dhtRead:  async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("dht", op.instance)?.instance;
        ctx.vars[op.variable] = c ? 1 : 0;
      },
    },
  },

  Keypad: {
    className:   "Keypad",
    library:     "Keypad.h",
    registryKey: "keypad",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.getKey\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadGetKey", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.getKey\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadGetKey", variable: null, instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.isPressed\s*\(\s*'([^']+)'\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadIsPressed", variable: m[1], instance: m[2], key: m[3] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.waitForKey\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadWaitForKey", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.getState\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadGetState", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.setDebounceTime\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadSetDebounce", instance: m[1], ms: m[2] }) },
      { pattern: /^(\w+)\.setHoldTime\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadSetHold", instance: m[1], ms: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.isKeyPressed\s*\(\s*'([^']+)'\s*\)\s*;$/i,
        build: (m) => ({ type: "keypadIsKeyPressed", variable: m[1], instance: m[2], key: m[3] }) },
    ],
    engineOps: {
keypadGetKey: async (op, ctx) => {
        const comp = ctx.registry.getComponentByInstance?.(op.instance)
                  ?? ctx.registry.getOrBindComponent?.("keypad", op.instance)
                  ?? ctx.registry.getAll?.().find(c => c.type === "keypad");
        const inst = comp?.instance;
        if (!inst) { if (op.variable) ctx.vars[op.variable] = '\0'; return; }
        if (!inst.codeParsed) inst.codeParsed = true;
        const key = inst.getKey?.() ?? '\0';
        if (op.variable) {
          ctx.vars[op.variable] = key;
          if (key !== '\0') {
            ctx.vars[`__charcode_${op.variable}`] = key.charCodeAt(0);
          }
        }
      },
  keypadIsPressed: async (op, ctx) => {
        const comp = ctx.registry.getComponentByInstance?.(op.instance)
                  ?? ctx.registry.getOrBindComponent?.("keypad", op.instance)
                  ?? ctx.registry.getAll?.().find(c => c.type === "keypad");
        const inst = comp?.instance;
        if (!inst) { if (op.variable) ctx.vars[op.variable] = 0; return; }
        if (!inst.codeParsed) inst.codeParsed = true;
        const cur = inst.pressedKey ?? null;
        if (op.variable) ctx.vars[op.variable] = (cur === op.key) ? 1 : 0;
      },
     keypadWaitForKey: async (op, ctx) => {
        const comp = ctx.registry.getComponentByInstance?.(op.instance)
                  ?? ctx.registry.getOrBindComponent?.("keypad", op.instance)
                  ?? ctx.registry.getAll?.().find(c => c.type === "keypad");
        const inst = comp?.instance;
        if (!inst) { if (op.variable) ctx.vars[op.variable] = '\0'; return; }
        if (!inst.codeParsed) inst.codeParsed = true;
        while (true) {
          const key = inst.pressedKey ?? null;
          if (key !== null) {
            if (op.variable) ctx.vars[op.variable] = key;
            inst._lastReturnedKey = key;
            break;
          }
          await ctx.nextFrame();
        }
      },
      keypadGetState:    async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
      keypadSetDebounce: async () => {},
      keypadSetHold:     async () => {},
      keypadIsKeyPressed: async (op, ctx) => {
        const comp = ctx.registry.getOrBindComponent("keypad", op.instance);
        const cur  = comp?.instance?.getKey?.() ?? (ctx.digitalInputs?.keypad || null);
        if (op.variable) ctx.vars[op.variable] = (cur === op.key) ? 1 : 0;
      },
    },
  },

  Stepper: {
    className:   "Stepper",
    library:     "Stepper.h",
    registryKey: "stepper",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.setSpeed\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "stepperSetSpeed", instance: m[1], rpm: m[2] }) },
      { pattern: /^(\w+)\.step\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "stepperStep", instance: m[1], steps: m[2] }) },
    ],
    engineOps: {
      stepperSetSpeed: async (op, ctx) => { const c = ctx.registry.getOrBindComponent("stepper", op.instance)?.instance; if (c) c.setSpeed?.(ctx.evaluate(op.rpm)); },
      stepperStep:     async (op, ctx) => { const c = ctx.registry.getOrBindComponent("stepper", op.instance)?.instance; if (c) { c.step?.(Math.round(ctx.evaluate(op.steps))); await ctx.nextFrame(); } },
    },
  },

  Wire: {
    className:   "Wire",
    library:     "Wire.h",
    registryKey: "wire",
    isSingleton: true,
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^Wire\.(begin|beginTransmission|endTransmission|write|read|requestFrom)\s*\(([^)]*)\)\s*;$/i,
        build: (m) => ({ type: `wire_${m[1]}`, args: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*Wire\.read\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wire_readVar", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*Wire\.available\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wire_availableVar", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*Wire\.endTransmission\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wire_endTransVar", variable: m[1] }) },
    ],
    engineOps: {
      wire_begin:             async () => {},
      wire_beginTransmission: async () => {},
      wire_endTransmission:   async () => {},
      wire_write:             async () => {},
      wire_read:              async () => {},
      wire_requestFrom:       async () => {},
      wire_readVar:           async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
      wire_availableVar:      async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
      wire_endTransVar:       async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
    },
  },

  SPI: {
    className:   "SPI",
    library:     "SPI.h",
    registryKey: "spi",
    isSingleton: true,
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^SPI\.(begin|end|transfer|setClockDivider|setBitOrder|setDataMode|beginTransaction|endTransaction)\s*\(([^)]*)\)\s*;$/i,
        build: (m) => ({ type: `spi_${m[1]}`, args: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*SPI\.transfer\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "spi_transferVar", variable: m[1], args: m[2].trim() }) },
    ],
    engineOps: {
      spi_begin:              async () => {},
      spi_end:                async () => {},
      spi_transfer:           async () => {},
      spi_setClockDivider:    async () => {},
      spi_setBitOrder:        async () => {},
      spi_setDataMode:        async () => {},
      spi_beginTransaction:   async () => {},
      spi_endTransaction:     async () => {},
      spi_transferVar:        async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
    },
  },

  WiFi: {
    className:   "WiFi",
    library:     "WiFi.h",
    registryKey: "wifi",
    isSingleton: true,
    boards:      ["esp32", "esp8266"],
    parserOps: [
      { pattern: /^WiFi\.begin\s*\(\s*([^)]*)\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiBegin", args: m[1].trim() }) },
      { pattern: /^WiFi\.mode\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiMode", mode: m[1].trim() }) },
      { pattern: /^WiFi\.disconnect\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "wifiDisconnect" }) },
      { pattern: /^WiFi\.setHostname\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiSetHostname", name: m[1].trim() }) },
      { pattern: /^WiFi\.setAutoReconnect\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiSetAutoReconnect", val: m[1].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.status\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiStatus", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.localIP\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiLocalIP", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.RSSI\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiRSSI", variable: m[1] }) },
      { pattern: /^WiFi\.softAP\s*\(\s*([^)]*)\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiSoftAP", args: m[1].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.softAPIP\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiSoftAPIP", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.macAddress\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiMac", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.scanNetworks\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiScan", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.SSID\s*\(\s*([^)]*)\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiSSID", variable: m[1], idx: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.channel\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiChannel", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.gatewayIP\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiGateway", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*WiFi\.subnetMask\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "wifiSubnet", variable: m[1] }) },
      { pattern: /^WiFi\.softAPdisconnect\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "wifiSoftAPDisconnect" }) },
    ],
    engineOps: {
      wifiBegin:            async (op, ctx) => { ctx.simState.wifi = { connected: true, ip: "192.168.1.100", ssid: op.args.replace(/"/g, "").split(",")[0] }; },
      wifiMode:             async (op, ctx) => { ctx.simState.wifiMode = op.mode; },
      wifiDisconnect:       async (op, ctx) => { if (ctx.simState.wifi) ctx.simState.wifi.connected = false; },
      wifiSetHostname:      async () => {},
      wifiSetAutoReconnect: async () => {},
      wifiStatus:           async (op, ctx) => { ctx.vars[op.variable] = ctx.simState.wifi?.connected ? 3 : 0; },
      wifiLocalIP:          async (op, ctx) => { ctx.vars[op.variable] = ctx.simState.wifi?.ip ?? "0.0.0.0"; },
      wifiRSSI:             async (op, ctx) => { ctx.vars[op.variable] = ctx.simState.wifi?.connected ? -55 : -100; },
      wifiSoftAP:           async (op, ctx) => { ctx.simState.wifi = { connected: true, ip: "192.168.4.1", ap: true }; },
      wifiSoftAPIP:         async (op, ctx) => { ctx.vars[op.variable] = "192.168.4.1"; },
      wifiMac:              async (op, ctx) => { ctx.vars[op.variable] = "AA:BB:CC:DD:EE:FF"; },
      wifiScan:             async (op, ctx) => { ctx.vars[op.variable] = 3; },
      wifiSSID:             async (op, ctx) => { ctx.vars[op.variable] = ctx.simState.wifi?.ssid ?? "SimNet"; },
      wifiChannel:          async (op, ctx) => { ctx.vars[op.variable] = 1; },
      wifiGateway:          async (op, ctx) => { ctx.vars[op.variable] = "192.168.1.1"; },
      wifiSubnet:           async (op, ctx) => { ctx.vars[op.variable] = "255.255.255.0"; },
      wifiSoftAPDisconnect: async (op, ctx) => { if (ctx.simState.wifi?.ap) ctx.simState.wifi.connected = false; },
    },
  },

  Preferences: {
    className:   "Preferences",
    library:     "Preferences.h",
    registryKey: "preferences",
    boards:      ["esp32"],
    parserOps: [
      { pattern: /^(\w+)\.begin\s*\(\s*"([^"]+)"\s*,\s*(true|false)\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsBegin", instance: m[1], ns: m[2], readOnly: m[3] === "true" }) },
      { pattern: /^(\w+)\.end\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsEnd", instance: m[1] }) },
      { pattern: /^(\w+)\.put(Int|UInt|Long|ULong|Short|UShort|Char|UChar|Float|Double|Bool|Bytes|String)\s*\(\s*"([^"]+)"\s*,\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsPut", instance: m[1], dataType: m[2], key: m[3], value: m[4].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.get(Int|UInt|Long|ULong|Short|UShort|Char|UChar|Float|Double|Bool|String)\s*\(\s*"([^"]+)"(?:\s*,\s*([^)]+))?\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsGet", variable: m[1], instance: m[2], dataType: m[3], key: m[4], def: m[5] || "0" }) },
      { pattern: /^(\w+)\.clear\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsClear", instance: m[1] }) },
      { pattern: /^(\w+)\.remove\s*\(\s*"([^"]+)"\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsRemove", instance: m[1], key: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.isKey\s*\(\s*"([^"]+)"\s*\)\s*;$/i,
        build: (m) => ({ type: "prefsIsKey", variable: m[1], instance: m[2], key: m[3] }) },
    ],
    engineOps: {
      prefsBegin:  async (op, ctx) => { ctx.simState.prefs = ctx.simState.prefs ?? {}; ctx.simState.prefs[op.ns] = ctx.simState.prefs[op.ns] ?? {}; },
      prefsEnd:    async () => {},
      prefsPut:    async (op, ctx) => { const ns = ctx.simState.prefs ?? {}; const key = Object.keys(ns)[0]; if (key) ns[key][op.key] = ctx.evaluate(op.value); },
      prefsGet:    async (op, ctx) => { const ns = ctx.simState.prefs ?? {}; const key = Object.keys(ns)[0]; ctx.vars[op.variable] = key ? (ns[key][op.key] ?? ctx.evaluate(op.def)) : ctx.evaluate(op.def); },
      prefsClear:  async (op, ctx) => { const keys = Object.keys(ctx.simState.prefs ?? {}); if (keys.length) ctx.simState.prefs[keys[0]] = {}; },
      prefsRemove: async (op, ctx) => { const keys = Object.keys(ctx.simState.prefs ?? {}); if (keys.length) delete ctx.simState.prefs[keys[0]][op.key]; },
      prefsIsKey:  async (op, ctx) => { const ns = ctx.simState.prefs ?? {}; const key = Object.keys(ns)[0]; ctx.vars[op.variable] = (key && op.key in ns[key]) ? 1 : 0; },
    },
  },

  LEDC: {
    className:   "LEDC",
    library:     "esp32-hal-ledc.h",
    registryKey: "ledc",
    isSingleton: true,
    boards:      ["esp32"],
    parserOps: [
      { pattern: /^ledcSetup\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcSetup", args: m[1].trim() }) },
      { pattern: /^ledcAttachPin\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcAttachPin", args: m[1].trim() }) },
      { pattern: /^ledcDetachPin\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcDetachPin", args: m[1].trim() }) },
      { pattern: /^ledcWrite\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcWrite", args: m[1].trim() }) },
      { pattern: /^ledcWriteTone\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcWriteTone", args: m[1].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ledcRead\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcRead", variable: m[1], args: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ledcReadFreq\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcReadFreq", variable: m[1], args: m[2].trim() }) },
      { pattern: /^ledcChangeFrequency\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "ledcChangeFreq", args: m[1].trim() }) },
    ],
    engineOps: {
      ledcSetup:       async (op, ctx) => { const [ch, freq, bits] = ctx.evalArgList(op.args); ctx.simState.ledc = ctx.simState.ledc ?? {}; ctx.simState.ledc[ch] = { freq, bits }; },
      ledcAttachPin:   async (op, ctx) => { const [pin] = ctx.evalArgList(op.args); ctx.pinStates[`D${pin}`] = PIN_MODES.OUTPUT; },
      ledcDetachPin:   async () => {},
      ledcWrite:       async (op, ctx) => { const [ch, duty] = ctx.evalArgList(op.args); const info = ctx.simState.ledc?.[ch]; if (info) { const maxDuty = (1 << (info.bits || 8)) - 1; console.log(`[LEDC] ch${ch} duty=${duty}/${maxDuty}`); } },
      ledcWriteTone:   async (op, ctx) => { const [ch, freq] = ctx.evalArgList(op.args); console.log(`[LEDC] tone ch${ch} @ ${freq}Hz`); },
      ledcRead:        async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
      ledcReadFreq:    async (op, ctx) => { if (op.variable) { const [ch] = ctx.evalArgList(op.args); ctx.vars[op.variable] = ctx.simState.ledc?.[ch]?.freq ?? 0; } },
      ledcChangeFreq:  async (op, ctx) => { const [ch, freq] = ctx.evalArgList(op.args); if (ctx.simState.ledc?.[ch]) ctx.simState.ledc[ch].freq = freq; },
    },
  },

  ESP_NOW: {
    className:   "ESP_NOW",
    library:     "esp_now.h",
    registryKey: "espnow",
    isSingleton: true,
    boards:      ["esp32"],
    parserOps: [
      { pattern: /^esp_now_init\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "espnowInit" }) },
      { pattern: /^esp_now_register_send_cb\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "espnowRegSend", cb: m[1].trim() }) },
      { pattern: /^esp_now_register_recv_cb\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "espnowRegRecv", cb: m[1].trim() }) },
      { pattern: /^esp_now_send\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "espnowSend", args: m[1].trim() }) },
      { pattern: /^esp_now_add_peer\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "espnowAddPeer", args: m[1].trim() }) },
      { pattern: /^esp_now_del_peer\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "espnowDelPeer", args: m[1].trim() }) },
    ],
    engineOps: {
      espnowInit:    async () => {},
      espnowRegSend: async () => {},
      espnowRegRecv: async () => {},
      espnowSend:    async () => {},
      espnowAddPeer: async () => {},
      espnowDelPeer: async () => {},
    },
  },

  EEPROM: {
    className:   "EEPROM",
    library:     "EEPROM.h",
    registryKey: "eeprom",
    isSingleton: true,
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^EEPROM\.begin\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromBegin", size: m[1].trim() }) },
      { pattern: /^EEPROM\.write\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromWrite", addr: m[1].trim(), value: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*EEPROM\.read\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromRead", variable: m[1], addr: m[2].trim() }) },
      { pattern: /^EEPROM\.commit\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "eepromCommit" }) },
      { pattern: /^EEPROM\.update\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromUpdate", addr: m[1].trim(), value: m[2].trim() }) },
      { pattern: /^EEPROM\.put\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromPut", addr: m[1].trim(), value: m[2].trim() }) },
      { pattern: /^EEPROM\.get\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromGet", addr: m[1].trim(), varName: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*EEPROM\.length\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "eepromLength", variable: m[1] }) },
    ],
    engineOps: {
      eepromBegin:  async (op, ctx) => { const sz = Math.min(4096, Math.max(1, ctx.evaluate(op.size))); ctx.simState.eeprom = ctx.simState.eeprom ?? new Uint8Array(sz); },
      eepromWrite:  async (op, ctx) => { const addr = ctx.evaluate(op.addr); if (ctx.simState.eeprom) ctx.simState.eeprom[addr] = ctx.evaluate(op.value) & 0xFF; },
      eepromRead:   async (op, ctx) => { ctx.vars[op.variable] = ctx.simState.eeprom?.[ctx.evaluate(op.addr)] ?? 0xFF; },
      eepromCommit: async () => {},
      eepromUpdate: async (op, ctx) => { const addr = ctx.evaluate(op.addr); const val = ctx.evaluate(op.value) & 0xFF; if (ctx.simState.eeprom?.[addr] !== val) ctx.simState.eeprom[addr] = val; },
      eepromPut: async (op, ctx) => {
        const addr = ctx.evaluate(op.addr);
        const val  = ctx.evaluate(op.value);
        if (ctx.simState.eeprom) { new Uint8Array(new Float32Array([val]).buffer).forEach((b, i) => { ctx.simState.eeprom[addr + i] = b; }); }
      },
      eepromGet: async (op, ctx) => {
        const addr = ctx.evaluate(op.addr);
        if (ctx.simState.eeprom) ctx.vars[op.varName] = new Float32Array(ctx.simState.eeprom.slice(addr, addr + 4).buffer)[0];
      },
      eepromLength: async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = ctx.simState.eeprom?.length ?? 0; },
    },
  },

  ESP8266: {
    className:   "ESP8266",
    library:     "ESP.h",
    registryKey: "esp8266chip",
    isSingleton: true,
    boards:      ["esp8266"],
    parserOps: [
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getFreeHeap\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espGetFreeHeap", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getChipId\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espGetChipId", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getCpuFreqMHz\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espGetCpuFreq", variable: m[1] }) },
      { pattern: /^ESP\.restart\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "espRestart" }) },
      { pattern: /^ESP\.deepSleep\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "espDeepSleep", us: m[1].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getFlashChipSize\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espFlashSize", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getSketchSize\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espSketchSize", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getFreeSketchSpace\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espFreeSketch", variable: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*ESP\.getVcc\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "espGetVcc", variable: m[1] }) },
      { pattern: /^ESP\.reset\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "espReset" }) },
      { pattern: /^ESP\.wdtFeed\s*\(\s*\)\s*;$/i,
        build: (_) => ({ type: "espWdtFeed" }) },
    ],
    engineOps: {
      espGetFreeHeap: async (op, ctx) => { ctx.vars[op.variable] = 40960; },
      espGetChipId:   async (op, ctx) => { ctx.vars[op.variable] = 0xABCD1234; },
      espGetCpuFreq:  async (op, ctx) => { ctx.vars[op.variable] = 80; },
      espRestart:     async (op, ctx) => { ctx.simState._restartRequested = true; },
      espReset:       async (op, ctx) => { ctx.simState._restartRequested = true; },
      espDeepSleep:   async (op, ctx) => { await ctx.nextFrame(); },
      espFlashSize:   async (op, ctx) => { ctx.vars[op.variable] = 4194304; },
      espSketchSize:  async (op, ctx) => { ctx.vars[op.variable] = 256000; },
      espFreeSketch:  async (op, ctx) => { ctx.vars[op.variable] = 2621440; },
      espGetVcc:      async (op, ctx) => { ctx.vars[op.variable] = 3300; },
      espWdtFeed:     async () => {},
    },
  },

  MPU6050: {
    className:   "MPU6050",
    library:     "MPU6050.h",
    registryKey: "mpu6050",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.initialize\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuInit", instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.testConnection\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuTestConn", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.getMotion6\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuGetMotion6", instance: m[1], args: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.getTemperature\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuGetTemp", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.set[XYZ]AccelOffset\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuSetOffset", instance: m[1], value: m[2].trim() }) },
      { pattern: /^(\w+)\.set[XYZ]GyroOffset\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuSetOffset", instance: m[1], value: m[2].trim() }) },
      { pattern: /^(\w+)\.setSleepEnabled\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuSetSleep", instance: m[1], val: m[2].trim() }) },
      { pattern: /^(\w+)\.setFullScaleAccelRange\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuSetAccelRange", instance: m[1], val: m[2].trim() }) },
      { pattern: /^(\w+)\.setFullScaleGyroRange\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuSetGyroRange", instance: m[1], val: m[2].trim() }) },
      { pattern: /^(\w+)\.CalibrateAccel\s*\(\s*([^)]*)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuCalibrate", instance: m[1] }) },
      { pattern: /^(\w+)\.CalibrateGyro\s*\(\s*([^)]*)\s*\)\s*;$/i,
        build: (m) => ({ type: "mpuCalibrate", instance: m[1] }) },
    ],
    engineOps: {
      mpuInit:         async () => {},
      mpuTestConn:     async (op, ctx) => { ctx.vars[op.variable] = 1; },
      mpuGetMotion6:   async (op, ctx) => {
        const args = op.args.split(",").map(a => a.replace(/[*&]/g, "").trim());
        const vals = [0, 0, 16384, 0, 0, 0];
        args.forEach((name, i) => { if (name) ctx.vars[name] = vals[i] ?? 0; });
      },
      mpuGetTemp:      async (op, ctx) => { ctx.vars[op.variable] = 2560; },
      mpuSetOffset:    async () => {},
      mpuSetSleep:     async () => {},
      mpuSetAccelRange:async () => {},
      mpuSetGyroRange: async () => {},
      mpuCalibrate:    async () => {},
    },
  },

  HCSR04: {
    className:   "HCSR04",
    library:     null,
    registryKey: "hcsr04",
    isSingleton: true,
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      {
        pattern: /^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\/\s*(58\.2|58|29\.1|29)\s*;$/,
        build:   (m) => ({ type: "hcsr04Calc", variable: m[1], durationVar: m[2], divisor: m[3] }),
      },
    ],
    engineOps: {
      hcsr04Calc: async (op, ctx) => {
        const dur = ctx.vars[op.durationVar] ?? 1500;
        ctx.vars[op.variable] = dur / parseFloat(op.divisor);
      },
    },
  },

  Adafruit_NeoPixel: {
    className:   "Adafruit_NeoPixel",
    library:     "Adafruit_NeoPixel.h",
    registryKey: "neopixel",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.begin\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "neoBegin", instance: m[1] }) },
      { pattern: /^(\w+)\.show\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "neoShow", instance: m[1] }) },
      { pattern: /^(\w+)\.clear\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "neoClear", instance: m[1] }) },
      { pattern: /^(\w+)\.setBrightness\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoBrightness", instance: m[1], value: m[2].trim() }) },
      { pattern: /^(\w+)\.setPixelColor\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoSetPixel", instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.fill\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoFill", instance: m[1], args: m[2].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.Color\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoColor", variable: m[1], instance: m[2], args: m[3].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.ColorHSV\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoColorHSV", variable: m[1], instance: m[2], args: m[3].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.gamma32\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoGamma32", variable: m[1], instance: m[2], args: m[3].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.getPixelColor\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoGetPixel", variable: m[1], instance: m[2], idx: m[3].trim() }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.numPixels\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "neoNumPixels", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.getBrightness\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "neoGetBrightness", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.updateLength\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoUpdateLength", instance: m[1], len: m[2].trim() }) },
      { pattern: /^(\w+)\.updateType\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoUpdateType", instance: m[1], type: m[2].trim() }) },
      { pattern: /^(\w+)\.setPin\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "neoSetPin", instance: m[1], pin: m[2].trim() }) },
    ],
    engineOps: {
      neoBegin:         async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.begin?.(); },
      neoShow:          async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.show?.(); },
      neoClear:         async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.clear?.(); },
      neoBrightness:    async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.setBrightness?.(Math.max(0, Math.min(255, ctx.evaluate(op.value)))); },
      neoSetPixel:      async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.setPixelColor?.(...ctx.evalArgList(op.args)); },
      neoFill:          async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.fill?.(...ctx.evalArgList(op.args)); },
      neoColor: async (op, ctx) => {
        const [r, g, b] = ctx.evalArgList(op.args);
        if (op.variable) ctx.vars[op.variable] = ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
      },
      neoColorHSV: async (op, ctx) => {
        const [h, s, v] = ctx.evalArgList(op.args);
        const hi = Math.floor((h / 65536) * 6);
        const f  = (h / 65536) * 6 - hi;
        const sv = s / 255, vv = v / 255;
        const p = vv * (1 - sv), q = vv * (1 - f * sv), t = vv * (1 - (1 - f) * sv);
        let r = 0, g = 0, b = 0;
        switch (hi % 6) {
          case 0: r=vv; g=t;  b=p;  break;
          case 1: r=q;  g=vv; b=p;  break;
          case 2: r=p;  g=vv; b=t;  break;
          case 3: r=p;  g=q;  b=vv; break;
          case 4: r=t;  g=p;  b=vv; break;
          case 5: r=vv; g=p;  b=q;  break;
        }
        if (op.variable) ctx.vars[op.variable] = ((Math.round(r*255) & 0xFF) << 16) | ((Math.round(g*255) & 0xFF) << 8) | (Math.round(b*255) & 0xFF);
      },
      neoGamma32:       async (op, ctx) => { const [c32] = ctx.evalArgList(op.args); if (op.variable) ctx.vars[op.variable] = c32; },
      neoGetPixel:      async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (op.variable) ctx.vars[op.variable] = c?.getPixelColor?.(ctx.evaluate(op.idx)) ?? 0; },
      neoNumPixels:     async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (op.variable) ctx.vars[op.variable] = c?.numPixels?.() ?? 0; },
      neoGetBrightness: async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (op.variable) ctx.vars[op.variable] = c?.getBrightness?.() ?? 255; },
      neoUpdateLength:  async (op, ctx) => { const c = ctx.registry.getOrBindComponent("neopixel", op.instance)?.instance; if (c) c.updateLength?.(ctx.evaluate(op.len)); },
      neoUpdateType:    async () => {},
      neoSetPin:        async () => {},
    },
  },

  IRremote: {
    className:   "IRrecv",
    library:     "IRremote.h",
    registryKey: "irrecv",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.enableIRIn\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "irEnable", instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.decode\s*\(\s*[^)]*\s*\)\s*;$/i,
        build: (m) => ({ type: "irDecode", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.resume\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "irResume", instance: m[1] }) },
      { pattern: /^(\w+)\.disableIRIn\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "irDisable", instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.decodedIRData\.decodedRawData\s*;$/i,
        build: (m) => ({ type: "irRawData", variable: m[1], instance: m[2] }) },
    ],
    engineOps: {
      irEnable:  async () => {},
      irDisable: async () => {},
      irDecode:  async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
      irResume:  async () => {},
      irRawData: async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
    },
  },

  SoftwareSerial: {
    className:   "SoftwareSerial",
    library:     "SoftwareSerial.h",
    registryKey: "softwareserial",
    boards:      ["arduino"],
    parserOps: [
      { pattern: /^(\w+)\.begin\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialBegin", instance: m[1], baud: m[2].trim() }) },
      { pattern: /^(\w+)\.print(?:ln)?\s*\(\s*([\s\S]+?)\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialPrint", instance: m[1], text: m[2].trim(), isLn: /println/.test(m[0]) }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.read\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialRead", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.available\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialAvail", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.write\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialWrite", instance: m[1], value: m[2].trim() }) },
      { pattern: /^(\w+)\.flush\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialFlush", instance: m[1] }) },
      { pattern: /^(\w+)\.end\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialEnd", instance: m[1] }) },
      { pattern: /^(\w+)\.listen\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialListen", instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.isListening\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialIsListening", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.peek\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialPeek", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.overflow\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "swSerialOverflow", variable: m[1], instance: m[2] }) },
    ],
    engineOps: {
      swSerialBegin:       async (op, ctx) => { console.log(`[SoftwareSerial] begin(${ctx.evaluate(op.baud)})`); },
      swSerialPrint:       async (op, ctx) => {
        const raw   = op.text;
        const isStr = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
        const text  = isStr ? raw.slice(1, -1) : String(ctx.evaluate(raw));
        const line  = op.isLn ? text + "\n" : text;
        ctx.onSerialOutput?.(line);
      },
      swSerialRead:        async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = -1; },
      swSerialAvail:       async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
      swSerialWrite:       async (op, ctx) => { const v = ctx.evaluate(op.value); ctx.onSerialOutput?.(String.fromCharCode(Math.round(v))); },
      swSerialFlush:       async () => {},
      swSerialEnd:         async () => {},
      swSerialListen:      async () => {},
      swSerialIsListening: async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 1; },
      swSerialPeek:        async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = -1; },
      swSerialOverflow:    async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = 0; },
    },
  },

  LiquidCrystal: {  
    className:   "LiquidCrystal",
    library:     "LiquidCrystal.h",
    registryKey: "lcd",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.begin\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdBegin", instance: m[1], cols: +m[2], rows: +m[3] }) },
      { pattern: /^(\w+)\.clear\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdClear", instance: m[1] }) },
      { pattern: /^(\w+)\.home\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdHome", instance: m[1] }) },
{ pattern: /^(\w+)\.setCursor\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdCursor", instance: m[1], col: m[2], row: m[3] }) },
      {
        pattern: /^(\w+)\.print(?:ln)?\s*\(\s*([\s\S]+?)\s*\)\s*;$/i,
        build: (m) => {
          const raw   = m[2].trim();
          const isStr = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
          return { type: "lcdPrint", instance: m[1], text: isStr ? raw.slice(1, -1) : raw, isExpr: !isStr };
        },
      },
      { pattern: /^(\w+)\.write\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdWrite", instance: m[1], value: m[2].trim() }) },
      { pattern: /^(\w+)\.scrollDisplayLeft\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdScrollLeft", instance: m[1] }) },
      { pattern: /^(\w+)\.scrollDisplayRight\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdScrollRight", instance: m[1] }) },
      { pattern: /^(\w+)\.noDisplay\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoDisplay", instance: m[1] }) },
      { pattern: /^(\w+)\.display\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdDisplay", instance: m[1] }) },
      { pattern: /^(\w+)\.blink\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdBlink", instance: m[1] }) },
      { pattern: /^(\w+)\.noBlink\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoBlink", instance: m[1] }) },
      { pattern: /^(\w+)\.cursor\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdShowCursor", instance: m[1] }) },
      { pattern: /^(\w+)\.noCursor\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoCursor", instance: m[1] }) },
      { pattern: /^(\w+)\.autoscroll\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdAutoscroll", instance: m[1] }) },
      { pattern: /^(\w+)\.noAutoscroll\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdNoAutoscroll", instance: m[1] }) },
      { pattern: /^(\w+)\.leftToRight\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdLeftToRight", instance: m[1] }) },
      { pattern: /^(\w+)\.rightToLeft\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdRightToLeft", instance: m[1] }) },
      { pattern: /^(\w+)\.createChar\s*\(\s*(\d+)\s*,\s*([A-Za-z_]\w*)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdCreateChar", instance: m[1], num: +m[2], varName: m[3] }) },
      { pattern: /^(\w+)\.command\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "lcdCommand", instance: m[1], value: m[2].trim() }) },
    ],
   engineOps: {
      lcdInit: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
      },
      lcdBegin: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.begin(op.cols, op.rows);
      },
      lcdBacklight: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        c.backlight(true);
      },
      lcdNoBacklight: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.backlight(false);
      },
      lcdClear: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        c.clear();
      },
      lcdHome: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        c.home();
      },
     lcdCursor: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        const col = typeof op.col === "number" ? op.col : Math.round(ctx.evaluate(String(op.col)));
        const row = typeof op.row === "number" ? op.row : Math.round(ctx.evaluate(String(op.row)));
        c.setCursor(col, row);
      },
   lcdPrint: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        if (!op.isExpr) { c.print(op.text); return; }
        const raw = op.text ?? "";
        const commaIdx = raw.lastIndexOf(",");
        if (commaIdx !== -1) {
          const maybeDecimals = raw.slice(commaIdx + 1).trim();
          if (/^\d+$/.test(maybeDecimals)) {
            const val      = ctx.evaluate(raw.slice(0, commaIdx).trim());
            const decimals = parseInt(maybeDecimals);
            c.print(val.toFixed(decimals));
            return;
          }
        }
        c.print(String(ctx.evaluate(raw)));
      },
      lcdWrite: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        c.write(ctx.evaluate(op.value));
      },
      lcdScrollLeft: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        c.scrollDisplayLeft();
      },
      lcdScrollRight: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        if (!c.initialized) c.init();
        c.scrollDisplayRight();
      },
      lcdNoDisplay: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.noDisplay();
      },
      lcdDisplay: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.display();
      },
      lcdBlink: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.blink();
      },
      lcdNoBlink: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.noBlink();
      },
      lcdShowCursor: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.cursor();
      },
      lcdNoCursor: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.noCursor();
      },
      lcdLeftToRight: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.leftToRight();
      },
      lcdRightToLeft: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.rightToLeft();
      },
      lcdAutoscroll: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.autoscroll();
      },
      lcdNoAutoscroll: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.noAutoscroll();
      },
      lcdCreateChar: async (op, ctx) => {
        const c   = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        const arr = ctx.vars[op.varName] ?? ctx.registry?.globalVars?.[op.varName] ?? [];
        c.createChar(op.num, arr);
      },
      lcdCommand: async (op, ctx) => {
        const c = ctx.registry.getOrBindComponent("lcd", op.instance)?.instance;
        if (!c) return;
        c.command(ctx.evaluate(op.value));
      },
    },
  },

  AccelStepper: {
    className:   "AccelStepper",
    library:     "AccelStepper.h",
    registryKey: "stepper",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^(\w+)\.setMaxSpeed\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelSetMaxSpeed", instance: m[1], speed: m[2] }) },
      { pattern: /^(\w+)\.setAcceleration\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelSetAccel", instance: m[1], accel: m[2] }) },
      { pattern: /^(\w+)\.setSpeed\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelSetSpeed", instance: m[1], speed: m[2] }) },
      { pattern: /^(\w+)\.moveTo\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelMoveTo", instance: m[1], pos: m[2] }) },
      { pattern: /^(\w+)\.move\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelMove", instance: m[1], steps: m[2] }) },
      { pattern: /^(\w+)\.run\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelRun", instance: m[1] }) },
      { pattern: /^(\w+)\.runSpeed\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelRunSpeed", instance: m[1] }) },
      { pattern: /^(\w+)\.runToPosition\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelRunToPos", instance: m[1] }) },
      { pattern: /^(\w+)\.runToNewPosition\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelRunToNewPos", instance: m[1], pos: m[2] }) },
      { pattern: /^(\w+)\.stop\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelStop", instance: m[1] }) },
      { pattern: /^(\w+)\.setCurrentPosition\s*\(\s*([A-Za-z_\d.]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelSetCurrentPos", instance: m[1], pos: m[2] }) },
      { pattern: /^(\w+)\.enableOutputs\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelEnableOutputs", instance: m[1] }) },
      { pattern: /^(\w+)\.disableOutputs\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelDisableOutputs", instance: m[1] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.currentPosition\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelCurrentPos", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.distanceToGo\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelDistToGo", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.isRunning\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelIsRunning", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.speed\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelGetSpeed", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.maxSpeed\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "accelGetMaxSpeed", variable: m[1], instance: m[2] }) },
      { pattern: /^(\w+)\.setPinsInverted\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelSetPinsInverted", instance: m[1], args: m[2].trim() }) },
      { pattern: /^(\w+)\.setMinPulseWidth\s*\(\s*([^)]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "accelSetMinPulse", instance: m[1], val: m[2].trim() }) },
    ],
    engineOps: {
      accelSetMaxSpeed:    async (op, ctx) => { _accelComp(ctx, op.instance)?.setMaxSpeed?.(ctx.evaluate(op.speed)); },
      accelSetAccel:       async (op, ctx) => { _accelComp(ctx, op.instance)?.setAcceleration?.(ctx.evaluate(op.accel)); },
      accelSetSpeed:       async (op, ctx) => { _accelComp(ctx, op.instance)?.setSpeed?.(ctx.evaluate(op.speed)); },
      accelMoveTo:         async (op, ctx) => { _accelComp(ctx, op.instance)?.moveTo?.(Math.round(ctx.evaluate(op.pos))); },
      accelMove:           async (op, ctx) => { _accelComp(ctx, op.instance)?.move?.(Math.round(ctx.evaluate(op.steps))); },
      accelRun:            async (op, ctx) => { _accelComp(ctx, op.instance)?.run?.(); await ctx.nextFrame(); },
      accelRunSpeed:       async (op, ctx) => { _accelComp(ctx, op.instance)?.runSpeed?.(); await ctx.nextFrame(); },
      accelRunToPos:       async (op, ctx) => { const c = _accelComp(ctx, op.instance); if (c) { while (c.distanceToGo?.() !== 0) { c.run?.(); await ctx.nextFrame(); } } },
      accelRunToNewPos:    async (op, ctx) => { const c = _accelComp(ctx, op.instance); if (c) { c.moveTo?.(Math.round(ctx.evaluate(op.pos))); while (c.distanceToGo?.() !== 0) { c.run?.(); await ctx.nextFrame(); } } },
      accelStop:           async (op, ctx) => { _accelComp(ctx, op.instance)?.stop?.(); },
      accelSetCurrentPos:  async (op, ctx) => { _accelComp(ctx, op.instance)?.setCurrentPosition?.(Math.round(ctx.evaluate(op.pos))); },
      accelEnableOutputs:  async (op, ctx) => { _accelComp(ctx, op.instance)?.enableOutputs?.(); },
      accelDisableOutputs: async (op, ctx) => { _accelComp(ctx, op.instance)?.disableOutputs?.(); },
      accelCurrentPos:     async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _accelComp(ctx, op.instance)?.currentPosition?.() ?? 0; },
      accelDistToGo:       async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _accelComp(ctx, op.instance)?.distanceToGo?.() ?? 0; },
      accelIsRunning:      async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _accelComp(ctx, op.instance)?.isRunning?.() ? 1 : 0; },
      accelGetSpeed:       async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _accelComp(ctx, op.instance)?.speed?.() ?? 0; },
      accelGetMaxSpeed:    async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _accelComp(ctx, op.instance)?.maxSpeed?.() ?? 0; },
      accelSetPinsInverted:async () => {},
      accelSetMinPulse:    async () => {},
    },
  },

  NewPing: {
    className:   "NewPing",
    library:     "NewPing.h",
    registryKey: "hcsr04",
    boards:      ["arduino", "esp32", "esp8266"],
    parserOps: [
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.ping_cm\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "newpingCm", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.ping_in\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "newpingIn", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.ping\s*\(\s*\)\s*;$/i,
        build: (m) => ({ type: "newpingRaw", variable: m[1], instance: m[2] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.ping_median\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "newpingMedian", variable: m[1], instance: m[2], samples: m[3] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.convert_cm\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "newpingConvertCm", variable: m[1], instance: m[2], uS: m[3] }) },
      { pattern: /^([A-Za-z_]\w*)\s*=\s*(\w+)\.convert_in\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i,
        build: (m) => ({ type: "newpingConvertIn", variable: m[1], instance: m[2], uS: m[3] }) },
    ],
    engineOps: {
      newpingCm:        async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _ultrasonicRead(ctx, op.instance, "cm"); },
      newpingIn:        async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _ultrasonicRead(ctx, op.instance, "in"); },
      newpingRaw:       async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _ultrasonicRead(ctx, op.instance, "us"); },
      newpingMedian:    async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = _ultrasonicRead(ctx, op.instance, "us"); },
      newpingConvertCm: async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = ctx.evaluate(op.uS) / 58.2; },
      newpingConvertIn: async (op, ctx) => { if (op.variable) ctx.vars[op.variable] = ctx.evaluate(op.uS) / 148.0; },
    },
  },
};

export const CLASS_LIB_MAP = Object.fromEntries(
  Object.values(COMPONENT_DEFINITIONS)
    .filter(c => c.library)
    .map(c => [c.className, c.library])
);

export const ALL_ENGINE_OPS = Object.values(COMPONENT_DEFINITIONS).reduce((acc, comp) => {
  Object.assign(acc, comp.engineOps ?? {});
  return acc;
}, {});

export const ALL_PARSER_OPS = Object.values(COMPONENT_DEFINITIONS).flatMap(comp =>
  (comp.parserOps ?? []).map(op => ({ ...op, className: comp.className }))
);

export function registerComponent(def) {
  if (!def?.className)   throw new Error("[ComponentDef] registerComponent: className required.");
  if (!def?.registryKey) throw new Error("[ComponentDef] registerComponent: registryKey required.");
  if (!Array.isArray(def.parserOps))                       def.parserOps  = [];
  if (!def.engineOps || typeof def.engineOps !== "object") def.engineOps = {};
  for (const op of def.parserOps) {
    if (!(op.pattern instanceof RegExp)) throw new Error(`[ComponentDef] ${def.className}: parserOp has invalid pattern (must be RegExp).`);
    if (typeof op.build !== "function")  throw new Error(`[ComponentDef] ${def.className}: parserOp missing build() function.`);
  }
  for (const [key, fn] of Object.entries(def.engineOps)) {
    if (typeof fn !== "function") throw new Error(`[ComponentDef] ${def.className}: engineOp '${key}' must be a function.`);
  }
  if (COMPONENT_DEFINITIONS[def.className]) console.warn(`[ComponentDef] Overwriting existing component: ${def.className}`);
  COMPONENT_DEFINITIONS[def.className] = def;
  if (def.library) CLASS_LIB_MAP[def.className] = def.library;
  Object.assign(ALL_ENGINE_OPS, def.engineOps);
  ALL_PARSER_OPS.push(...def.parserOps.map(op => ({ ...op, className: def.className })));
  console.log(`[ComponentDef] Registered: ${def.className} (${def.registryKey})`);
}

export function unregisterComponent(className) {
  if (!COMPONENT_DEFINITIONS[className]) return;
  const def = COMPONENT_DEFINITIONS[className];
  delete COMPONENT_DEFINITIONS[className];
  delete CLASS_LIB_MAP[className];
  for (const key of Object.keys(def.engineOps ?? {})) delete ALL_ENGINE_OPS[key];
  ALL_PARSER_OPS.splice(0, ALL_PARSER_OPS.length, ...ALL_PARSER_OPS.filter(op => op.className !== className));
  console.log(`[ComponentDef] Unregistered: ${className}`);
}