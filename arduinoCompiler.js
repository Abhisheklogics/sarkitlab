"use strict";

export const BOARD_PROFILES = {
  arduino: {
    name: "Arduino UNO/Mega/Nano", maxPin: 53,
    analogPins: ["A0","A1","A2","A3","A4","A5"],
    pwmPins: [3,5,6,9,10,11],
    i2cSDA: "A4", i2cSCL: "A5",
    dacPins: [], touchPins: [],
    detectHeaders: [],
  },
  esp32: {
    name: "ESP32", maxPin: 39,
    analogPins: [32,33,34,35,36,39],
    pwmPins: [0,2,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33],
    i2cSDA: 21, i2cSCL: 22,
    dacPins: [25,26], touchPins: [4,0,2,15,13,12,14,27,33,32],
    detectHeaders: ["WiFi.h","esp_now.h","Preferences.h","esp32-hal-ledc.h","BLEDevice.h","ESP32Servo.h"],
  },
  esp8266: {
    name: "ESP8266 / NodeMCU", maxPin: 16,
    analogPins: ["A0"],
    pwmPins: [0,1,2,3,4,5,12,13,14,15,16],
    i2cSDA: 4, i2cSCL: 5,
    dacPins: [], touchPins: [],
    detectHeaders: ["ESP8266WiFi.h","ESP8266WebServer.h","ESP8266mDNS.h","ESP8266HTTPClient.h"],
  },
};

export const DATA_TYPES = {
  "int":          { bits:16, signed:true,  min:-32768,      max:32767,      category:"int" },
  "unsigned int": { bits:16, signed:false, min:0,           max:65535,      category:"int" },
  "long":         { bits:32, signed:true,  min:-2147483648, max:2147483647, category:"int" },
  "unsigned long":{ bits:32, signed:false, min:0,           max:4294967295, category:"int" },
  "short":        { bits:16, signed:true,  min:-32768,      max:32767,      category:"int" },
  "byte":         { bits:8,  signed:false, min:0,           max:255,        category:"int" },
  "uint8_t":      { bits:8,  signed:false, min:0,           max:255,        category:"int" },
  "uint16_t":     { bits:16, signed:false, min:0,           max:65535,      category:"int" },
  "uint32_t":     { bits:32, signed:false, min:0,           max:4294967295, category:"int" },
  "uint64_t":     { bits:64, signed:false, min:0,           max:1.8e19,     category:"int" },
  "int8_t":       { bits:8,  signed:true,  min:-128,        max:127,        category:"int" },
  "int16_t":      { bits:16, signed:true,  min:-32768,      max:32767,      category:"int" },
  "int32_t":      { bits:32, signed:true,  min:-2147483648, max:2147483647, category:"int" },
  "int64_t":      { bits:64, signed:true,  min:-9.2e18,     max:9.2e18,     category:"int" },
  "char":         { bits:8,  signed:true,  min:-128,        max:127,        category:"char" },
  "word":         { bits:16, signed:false, min:0,           max:65535,      category:"int" },
  "size_t":       { bits:16, signed:false, min:0,           max:65535,      category:"int" },
  "ptrdiff_t":    { bits:16, signed:true,  min:-32768,      max:32767,      category:"int" },
  "float":        { bits:32, category:"float" },
  "double":       { bits:64, category:"float" },
  "bool":         { bits:1,  category:"bool", values:[0,1] },
  "boolean":      { bits:1,  category:"bool", values:[0,1] },
  "String":       { category:"string" },
  "const char*":  { category:"string" },
  "char*":        { category:"string" },
  "void":         { category:"void" },
  "auto":         { category:"auto" },
};

export const BUILTIN_CONSTANTS = {
  HIGH:1, LOW:0, INPUT:0, OUTPUT:1, INPUT_PULLUP:2, INPUT_PULLDOWN:3,
  CHANGE:1, RISING:2, FALLING:3, BOTH:4,
  LED_BUILTIN:13, BUILTIN_LED:2,
  A0:14, A1:15, A2:16, A3:17, A4:18, A5:19,
  PI:Math.PI, TWO_PI:2*Math.PI, HALF_PI:Math.PI/2, E:Math.E,
  true:true, false:false, TRUE:true, FALSE:false, NULL:0, nullptr:0,
  MSBFIRST:1, LSBFIRST:0,
  WL_CONNECTED:3, WL_DISCONNECTED:6, WL_IDLE_STATUS:0,
  WIFI_STA:1, WIFI_AP:2, WIFI_AP_STA:3,
  WHITE:1, BLACK:0, SSD1306_WHITE:1, SSD1306_BLACK:0, SSD1306_INVERSE:2,
  DECIMAL:0, BIN:2, OCT:8, HEX:16, DEC:10,
  DHT11:11, DHT12:12, DHT21:21, DHT22:22, AM2301:21,
  NEO_GRB:0x52, NEO_RGB:0x56, NEO_KHZ800:0x0000,
  BUILTIN_SDCARD:1,
};

export const BUILTIN_FUNCTIONS = {
  pinMode:              { params:["pin","mode"],                            returns:"void" },
  digitalWrite:         { params:["pin","value"],                           returns:"void" },
  digitalRead:          { params:["pin"],                                   returns:"int" },
  analogWrite:          { params:["pin","value"],                           returns:"void" },
  analogRead:           { params:["pin"],                                   returns:"int" },
  analogReference:      { params:["type"],                                  returns:"void" },
  analogReadResolution: { params:["bits"],                                  returns:"void", esp32Only:true },
  analogSetAttenuation: { params:["atten"],                                 returns:"void", esp32Only:true },
  analogWriteResolution:{ params:["bits"],                                  returns:"void" },
  delay:                { params:["ms"],                                    returns:"void" },
  delayMicroseconds:    { params:["us"],                                    returns:"void" },
  millis:               { params:[],                                        returns:"unsigned long" },
  micros:               { params:[],                                        returns:"unsigned long" },
  tone:                 { params:["pin","frequency","duration?"],           returns:"void" },
  noTone:               { params:["pin"],                                   returns:"void" },
  attachInterrupt:      { params:["interrupt","ISR","mode"],                returns:"void" },
  detachInterrupt:      { params:["interrupt"],                             returns:"void" },
  interrupts:           { params:[],                                        returns:"void" },
  noInterrupts:         { params:[],                                        returns:"void" },
  digitalPinToInterrupt:{ params:["pin"],                                   returns:"int" },
  pulseIn:              { params:["pin","value","timeout?"],                returns:"unsigned long" },
  pulseInLong:          { params:["pin","value","timeout?"],                returns:"unsigned long" },
  shiftIn:              { params:["dataPin","clockPin","bitOrder"],         returns:"byte" },
  shiftOut:             { params:["dataPin","clockPin","bitOrder","value"], returns:"void" },
  abs:                  { params:["x"],                                     returns:"auto" },
  constrain:            { params:["x","a","b"],                            returns:"auto" },
  map:                  { params:["value","fromLow","fromHigh","toLow","toHigh"], returns:"long" },
  max:                  { params:["a","b"],                                 returns:"auto" },
  min:                  { params:["a","b"],                                 returns:"auto" },
  pow:                  { params:["base","exponent"],                       returns:"double" },
  sq:                   { params:["x"],                                     returns:"auto" },
  sqrt:                 { params:["x"],                                     returns:"double" },
  ceil:                 { params:["x"],                                     returns:"double" },
  floor:                { params:["x"],                                     returns:"double" },
  round:                { params:["x"],                                     returns:"long" },
  sin:                  { params:["rad"],                                   returns:"double" },
  cos:                  { params:["rad"],                                   returns:"double" },
  tan:                  { params:["rad"],                                   returns:"double" },
  random:               { params:["max","min?"],                            returns:"long" },
  randomSeed:           { params:["seed"],                                  returns:"void" },
  bit:                  { params:["n"],                                     returns:"int" },
  bitRead:              { params:["value","bit"],                           returns:"int" },
  bitSet:               { params:["value","bit"],                           returns:"int" },
  bitClear:             { params:["value","bit"],                           returns:"int" },
  bitWrite:             { params:["value","bit","bitvalue"],                returns:"int" },
  highByte:             { params:["x"],                                     returns:"byte" },
  lowByte:              { params:["x"],                                     returns:"byte" },
  String:               { params:["val","base?"],                           returns:"String" },
  int:                  { params:["x"],                                     returns:"int" },
  long:                 { params:["x"],                                     returns:"long" },
  float:                { params:["x"],                                     returns:"float" },
  byte:                 { params:["x"],                                     returns:"byte" },
  char:                 { params:["x"],                                     returns:"char" },
  atoi:                 { params:["str"],                                   returns:"int" },
  atof:                 { params:["str"],                                   returns:"float" },
  atol:                 { params:["str"],                                   returns:"long" },
  sprintf:              { params:["str","format","..."],                    returns:"int" },
  snprintf:             { params:["str","size","format","..."],             returns:"int" },
  strlen:               { params:["str"],                                   returns:"int" },
  strcmp:               { params:["s1","s2"],                               returns:"int" },
  strcpy:               { params:["dest","src"],                            returns:"char*" },
  memset:               { params:["ptr","value","num"],                     returns:"void*" },
  memcpy:               { params:["dest","src","n"],                        returns:"void*" },
  malloc:               { params:["size"],                                  returns:"void*" },
  free:                 { params:["ptr"],                                   returns:"void" },
  isnan:                { params:["x"],                                     returns:"bool" },
  yield:                { params:[],                                        returns:"void" },
  dacWrite:             { params:["pin","value"],                           returns:"void", esp32Only:true },
  touchRead:            { params:["pin"],                                   returns:"uint16_t", esp32Only:true },
  hallRead:             { params:[],                                        returns:"int", esp32Only:true },
  ledcSetup:            { params:["channel","freq","resolution"],           returns:"double", esp32Only:true },
  ledcAttachPin:        { params:["pin","channel"],                         returns:"void", esp32Only:true },
  ledcWrite:            { params:["channel","duty"],                        returns:"void", esp32Only:true },
  xTaskCreate:          { params:["fn","name","size","param","prio","handle"], returns:"BaseType_t", esp32Only:true },
  esp_restart:          { params:[],                                        returns:"void", esp32Only:true },
};

export const LIBRARY_REGISTRY = {
  "TM1637Display.h": {
  classes: {
    TM1637Display: {
      constructor: { params:["clkPin","dioPin"] },
      methods: {
        setBrightness:   { params:["brightness","on?"], returns:"void" },
        showNumberDec:   { params:["num","leading_zero?","length?","pos?"], returns:"void" },
        showNumberDecEx: { params:["num","dots","leading_zero?","length?","pos?"], returns:"void" },
        showNumberHexEx: { params:["num","dots","leading_zero?","length?","pos?"], returns:"void" },
        setSegments:     { params:["segments","length?","pos?"], returns:"void" },
        clear:           { params:[], returns:"void" },
        point:           { params:["state"], returns:"void" },
      },
    },
  },
},
  "Servo.h": {
    classes: {
      Servo: {
        methods: {
          attach:            { params:["pin","min?","max?"],   returns:"uint8_t" },
          detach:            { params:[],                      returns:"void" },
          write:             { params:["angle"],               returns:"void" },
          writeMicroseconds: { params:["us"],                  returns:"void" },
          read:              { params:[],                      returns:"int" },
          attached:          { params:[],                      returns:"bool" },
        },
      },
    },
  },
  "LiquidCrystal_I2C.h": {
    classes: {
      LiquidCrystal_I2C: {
        constructor: { params:["addr","cols","rows"] },
       // NAYA
methods: {
  init:               { params:[],             returns:"void" },
  begin:              { params:["cols","rows"], returns:"void" },
  backlight:          { params:[],             returns:"void" },
  noBacklight:        { params:[],             returns:"void" },
  clear:              { params:[],             returns:"void" },
  home:               { params:[],             returns:"void" },
  setCursor:          { params:["col","row"],  returns:"void" },
  print:              { params:["data"],       returns:"size_t" },
  println:            { params:["data?"],      returns:"size_t" },
  write:              { params:["data"],       returns:"size_t" },
  scrollDisplayLeft:  { params:[],             returns:"void" },
  scrollDisplayRight: { params:[],             returns:"void" },
  noDisplay:          { params:[],             returns:"void" },
  display:            { params:[],             returns:"void" },
  blink:              { params:[],             returns:"void" },
  noBlink:            { params:[],             returns:"void" },
  cursor:             { params:[],             returns:"void" },
  noCursor:           { params:[],             returns:"void" },
  leftToRight:        { params:[],             returns:"void" },
  rightToLeft:        { params:[],             returns:"void" },
  autoscroll:         { params:[],             returns:"void" },
  noAutoscroll:       { params:[],             returns:"void" },
  createChar:         { params:["num","data"], returns:"void" },
  command:            { params:["value"],      returns:"void" },
},
      },
    },
  },
  "Adafruit_SSD1306.h": {
    classes: {
      Adafruit_SSD1306: {
        constructor: { params:["width","height","&wire","reset?"] },
        methods: {
          begin:        { params:["vccstate","i2caddr"],  returns:"bool" },
          clearDisplay: { params:[],                      returns:"void" },
          display:      { params:[],                      returns:"void" },
          setTextSize:  { params:["s"],                   returns:"void" },
          setTextColor: { params:["c","bg?"],             returns:"void" },
          setCursor:    { params:["x","y"],               returns:"void" },
          print:        { params:["data"],                returns:"size_t" },
          println:      { params:["data?"],               returns:"size_t" },
          drawPixel:    { params:["x","y","color"],       returns:"void" },
          fillRect:     { params:["x","y","w","h","color"], returns:"void" },
          drawCircle:   { params:["x","y","r","color"],   returns:"void" },
        },
      },
    },
  },
  "DHT.h": {
    classes: {
      DHT: {
        constructor: { params:["pin","type"] },
        methods: {
          begin:           { params:[],        returns:"void" },
          readTemperature: { params:["S?"],    returns:"float" },
          readHumidity:    { params:[],        returns:"float" },
        },
      },
    },
  },
  "Wire.h": {
    singletons: {
      Wire: {
        methods: {
          begin:             { params:["address?"],           returns:"void" },
          beginTransmission: { params:["address"],            returns:"void" },
          endTransmission:   { params:["stop?"],              returns:"uint8_t" },
          requestFrom:       { params:["address","quantity"], returns:"uint8_t" },
          write:             { params:["data"],               returns:"size_t" },
          available:         { params:[],                     returns:"int" },
          read:              { params:[],                     returns:"int" },
        },
      },
    },
  },
  "WiFi.h": {
    singletons: {
      WiFi: {
        methods: {
          begin:      { params:["ssid","pass?"],  returns:"int" },
          disconnect: { params:[],                returns:"int" },
          status:     { params:[],                returns:"wl_status_t" },
          localIP:    { params:[],                returns:"IPAddress" },
          RSSI:       { params:[],                returns:"int32_t" },
        },
      },
    },
  },
  "EEPROM.h": {
    singletons: {
      EEPROM: {
        methods: {
          begin:  { params:["size"],            returns:"bool" },
          read:   { params:["address"],         returns:"uint8_t" },
          write:  { params:["address","value"], returns:"void" },
          commit: { params:[],                  returns:"bool" },
        },
      },
    },
  },
  "Adafruit_NeoPixel.h": {
    classes: {
      Adafruit_NeoPixel: {
        constructor: { params:["numLEDs","pin","type?"] },
        methods: {
          begin:         { params:[],                            returns:"void" },
          show:          { params:[],                            returns:"void" },
          clear:         { params:[],                            returns:"void" },
          setBrightness: { params:["b"],                         returns:"void" },
          setPixelColor: { params:["n","r_or_c","g?","b?","w?"],returns:"void" },
          Color:         { params:["r","g","b","w?"],            returns:"uint32_t" },
        },
      },
    },
  },
  "SoftwareSerial.h": {
    classes: {
      SoftwareSerial: {
        constructor: { params:["rxPin","txPin"] },
        methods: {
          begin:     { params:["speed"],     returns:"void" },
          available: { params:[],            returns:"int" },
          read:      { params:[],            returns:"int" },
          print:     { params:["data"],      returns:"size_t" },
          println:   { params:["data?"],     returns:"size_t" },
        },
      },
    },
  },
};

export const CLASS_LIB_MAP    = {};
export const SINGLETON_LIB_MAP = {};
export const ALL_CLASSES      = {};
export const ALL_SINGLETONS   = {};

for (const [lib, def] of Object.entries(LIBRARY_REGISTRY)) {
  for (const [cls, info] of Object.entries(def.classes || {})) {
    CLASS_LIB_MAP[cls]  = lib;
    ALL_CLASSES[cls]    = info;
  }
  for (const [name, info] of Object.entries(def.singletons || {})) {
    SINGLETON_LIB_MAP[name] = lib;
    ALL_SINGLETONS[name]    = info;
  }
}

export const SERIAL_METHODS = {
  begin:           { params:["speed","config?"],    returns:"void" },
  end:             { params:[],                     returns:"void" },
  available:       { params:[],                     returns:"int" },
  read:            { params:[],                     returns:"int" },
  peek:            { params:[],                     returns:"int" },
  flush:           { params:[],                     returns:"void" },
  print:           { params:["data","base?"],       returns:"size_t" },
  println:         { params:["data?"],              returns:"size_t" },
  write:           { params:["val","n?"],           returns:"size_t" },
  parseInt:        { params:[],                     returns:"long" },
  parseFloat:      { params:[],                     returns:"float" },
  readString:      { params:[],                     returns:"String" },
  readStringUntil: { params:["terminator"],         returns:"String" },
  setTimeout:      { params:["ms"],                 returns:"void" },
  printf:          { params:["format","..."],       returns:"size_t" },
};

export const STRING_METHODS = {
  length:          { params:[],                          returns:"unsigned int" },
  charAt:          { params:["index"],                   returns:"char" },
  indexOf:         { params:["val","from?"],             returns:"int" },
  substring:       { params:["from","to?"],              returns:"String" },
  toUpperCase:     { params:[],                          returns:"void" },
  toLowerCase:     { params:[],                          returns:"void" },
  trim:            { params:[],                          returns:"void" },
  replace:         { params:["substring1","substring2"], returns:"void" },
  startsWith:      { params:["prefix"],                  returns:"bool" },
  endsWith:        { params:["suffix"],                  returns:"bool" },
  toInt:           { params:[],                          returns:"long" },
  toFloat:         { params:[],                          returns:"float" },
  equals:          { params:["s"],                       returns:"bool" },
  c_str:           { params:[],                          returns:"const char*" },
  isEmpty:         { params:[],                          returns:"bool" },
};

export function registerLibrary(headerFile, definition) {
  if (!headerFile || typeof headerFile !== "string") throw new Error("[LibRegistry] headerFile must be a string");
  if (!definition || typeof definition !== "object")  throw new Error("[LibRegistry] definition must be an object");
  LIBRARY_REGISTRY[headerFile] = definition;
  for (const [cls, info] of Object.entries(definition.classes || {})) {
    CLASS_LIB_MAP[cls]  = headerFile;
    ALL_CLASSES[cls]    = info;
  }
  for (const [name, info] of Object.entries(definition.singletons || {})) {
    SINGLETON_LIB_MAP[name] = headerFile;
    ALL_SINGLETONS[name]    = info;
  }
}

export class Diagnostic {
  constructor(message, { line=null, col=null, endLine=null, endCol=null, severity="error", code="E000", fix=null, raw=null, context=null } = {}) {
    this.message  = message;
    this.line     = line;
    this.col      = col;
    this.endLine  = endLine ?? line;
    this.endCol   = endCol ?? (col != null ? col + (raw?.length ?? 1) : null);
    this.severity = severity;
    this.code     = code;
    this.fix      = fix;
    this.raw      = raw;
    this.context  = context;
  }
}

// ArduinoParserEngine class se bahar — ya class ke andar static method ke roop mein
function _splitArgs(raw) {
  if (!raw) return [];
  const args  = [];
  let depth   = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(" || ch === "[" || ch === "{") { depth++; current += ch; }
    else if (ch === ")" || ch === "]" || ch === "}") { depth--; current += ch; }
    else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}
export default class ArduinoParserEngine {
  static MAX_LINES     = 10000;
  static MAX_RECURSION = 128;

  constructor() { this._reset(); }

  _reset() {
    this._recursionDepth = 0;
    this._diagnostics    = [];
    this.variableTable   = {};
    this.instanceTable   = {};
    this.functionTable   = {};
    this.scopeStack      = [];
    this.board           = "arduino";
    this._hasFatalErrors = false;
  }

  _emit(message, opts = {})    { this._diagnostics.push(new Diagnostic(message, opts)); }
  _error(message, opts = {})   { this._emit(message, { ...opts, severity:"error"   }); this._hasFatalErrors = true; }
  _warning(message, opts = {}) { this._emit(message, { ...opts, severity:"warning" }); }
  _info(message, opts = {})    { this._emit(message, { ...opts, severity:"info"    }); }
  _hint(message, opts = {})    { this._emit(message, { ...opts, severity:"hint"    }); }

  detectBoard(includes = []) {
    for (const [key, profile] of Object.entries(BOARD_PROFILES)) {
      if (key === "arduino") continue;
      if (profile.detectHeaders.some(h => includes.includes(h))) return key;
    }
    return "arduino";
  }

  _stripComments(code) {
    let r = code.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
    r = r.split("\n").map(line => {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"' && line[i-1] !== '\\') inStr = !inStr;
        if (!inStr && line[i] === '/' && line[i+1] === '/') return line.slice(0, i);
      }
      return line;
    }).join("\n");
    return r;
  }

  _buildLineMap(code) {
    return code.split("\n").map((content, i) => ({ line: i+1, content }));
  }

  tokenizeLine(lineStr) {
    const tokens = [];
    const re = /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?[uUlLfF]*)|([A-Za-z_]\w*)|([+\-*\/%&|^~<>!=]+|[(){}[\],;:?.])/g;
    let m;
    while ((m = re.exec(lineStr)) !== null) {
      if      (m[1]) tokens.push({ type:"string", value:m[1], col:m.index });
      else if (m[2]) tokens.push({ type:"char",   value:m[2], col:m.index });
      else if (m[3]) tokens.push({ type:"number", value:m[3], col:m.index });
      else if (m[4]) tokens.push({ type:"ident",  value:m[4], col:m.index });
      else if (m[5]) tokens.push({ type:"op",     value:m[5], col:m.index });
    }
    return tokens;
  }

  fullValidate(code, lineOffset = 0) {
    this._checkBalance(code);
    if (this._hasFatalErrors) return;

    const lines = this._buildLineMap(code);
    this._checkStrings(lines, lineOffset);
    this._checkSemicolons(lines, lineOffset);
    this._checkSetupLoopPresence(code);
    this._checkReturnTypes(code);
    this._checkPinModeUsage(code);
    this._checkAnalogWriteRange(code, lines, lineOffset);
    this._checkDivisionByZero(code, lines, lineOffset);
    this._checkArrayBounds(code, lines, lineOffset);
    this._checkTypeOverflow(code, lines, lineOffset);
    this._checkFloatEquality(code, lines, lineOffset);
    this._checkEsp32Only(code, lines, lineOffset);
    this._checkFunctionSignatures(code, lines, lineOffset);
    this._checkScopeViolations(code, lines, lineOffset);
  }

  _checkSetupLoopPresence(code) {
    if (!/void\s+setup\s*\(/.test(code))
      this._error("Missing void setup() function — required in every Arduino sketch", { code:"E006", fix:"Add: void setup() { }" });
    if (!/void\s+loop\s*\(/.test(code))
      this._error("Missing void loop() function — required in every Arduino sketch", { code:"E007", fix:"Add: void loop() { }" });
  }

  _checkBalance(code) {
    const stack   = [];
    let inStr     = false;
    let inChar    = false;
    let inLineCmt = false;
    let inBlkCmt  = false;
    let lineNum   = 1;

    for (let i = 0; i < code.length; i++) {
      const ch   = code[i];
      const next = code[i+1];

      if (ch === "\n") {
        lineNum++;
        inLineCmt = false;
        continue;
      }
      if (inLineCmt)  continue;
      if (inBlkCmt)   { if (ch === "*" && next === "/") { inBlkCmt = false; i++; } continue; }
      if (ch === "/" && next === "/")  { inLineCmt = true;  continue; }
      if (ch === "/" && next === "*")  { inBlkCmt  = true;  continue; }
      if (!inChar && ch === '"' && code[i-1] !== '\\') { inStr  = !inStr;  continue; }
      if (!inStr  && ch === "'" && code[i-1] !== '\\') { inChar = !inChar; continue; }
      if (inStr || inChar) continue;

      const col = i - (code.lastIndexOf("\n", i-1) + 1);

      if (ch === "{" || ch === "(" || ch === "[") {
        stack.push({ ch, line:lineNum, col });
      } else if (ch === "}" || ch === ")" || ch === "]") {
        const matchOf = { "}":"{", ")":"(", "]":"[" }[ch];
        const top     = stack[stack.length - 1];
        if (!top || top.ch !== matchOf) {
          this._error(`Unexpected '${ch}' — no matching '${matchOf}'`, {
            line: lineNum, col,
            code: "E002",
            fix:  `Check for extra '${ch}' or missing '${matchOf}'`,
          });
        } else {
          stack.pop();
        }
      }
    }

    for (const { ch, line, col } of stack) {
      const close = { "{":"}", "(":")", "[":"]" }[ch];
      this._error(`Unclosed '${ch}' — missing closing '${close}'`, {
        line, col,
        code: "E005",
        fix:  `Add closing '${close}' to match '${ch}' at line ${line}`,
      });
    }
  }

  _checkStrings(lines) {
    lines.forEach(({ line, content }) => {
      let q = 0, inC = false;
      for (let i = 0; i < content.length; i++) {
        if (content[i] === "'" && content[i-1] !== '\\') inC = !inC;
        if (!inC && content[i] === '"' && content[i-1] !== '\\') q++;
      }
      if (q % 2 !== 0)
        this._error("Unterminated string literal", { line, col:content.length, code:"E001", fix:`Check for missing closing '"'` });
    });
  }

  _checkSemicolons(lines) {
    const FLOW      = /^\s*(if|else|for|while|do|switch)\b/;
    const FUNC_DEF  = /^\s*(?:void|int|float|double|long|char|bool|byte|String|unsigned|uint\w+|int\w+)\s+\w+\s*\([^)]*\)\s*\{?\s*$/;
    const PREPROC   = /^\s*#/;
    const CLASS_DEF = /^\s*(class|struct|enum|namespace)\s/;
    const BLOCK_OPEN  = /\{\s*$/;
    const BLOCK_CLOSE = /^\s*\}/;
    const LABEL   = /^\s*(case\s+.+|default)\s*:/;
    const COMMENT = /^\s*(\/\/|\/\*)/;

    lines.forEach(({ line, content }) => {
      const t = content.trim();
      if (!t || FLOW.test(t) || FUNC_DEF.test(t) || PREPROC.test(t) ||
          CLASS_DEF.test(t) || BLOCK_OPEN.test(t) || BLOCK_CLOSE.test(t) ||
          LABEL.test(t) || COMMENT.test(t)) return;
      if (t === "{" || t === "}" || t === "") return;
      if (/[;{}]$/.test(t)) return;
      if (/^(\/\/|\/\*)/.test(t)) return;
      if (/[,]$/.test(t)) return;
      if (/^(case\s|default\s*:)/.test(t)) return;
      if (/^(public:|private:|protected:)/.test(t)) return;
      const isConstructorDecl = /^[A-Za-z_]\w*\s+\w+\s*\(/.test(t);
const isFuncDef = /^(?:void|int|float|double|long|char|bool|byte|String|unsigned\s+\w+)\s+\w+\s*\([^)]*\)\s*$/.test(t);
if (
  /^[A-Za-z_\*]/.test(t) &&
  /[A-Za-z_\d\]"')]$/.test(t) &&
  !isConstructorDecl &&
  !isFuncDef
) {
  this._error(`Missing semicolon`, { line, col: t.length, code: "E003", fix: `Add ';' at end of line ${line}` });
}
      if (/^[A-Za-z_\*]/.test(t) && /[A-Za-z_\d\]"')]$/.test(t)) {
        this._error(`Missing semicolon`, { line, col:t.length, code:"E003", fix:`Add ';' at end of line ${line}` });
      }
    });
  }

  _checkReturnTypes(code) {
    const funcRe = /\b(int|float|double|long|char|bool|byte|String|uint\w+|int\w+)\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g;
    let m;
    while ((m = funcRe.exec(code)) !== null) {
      const retType = m[1], name = m[2];
      if (name === "setup" || name === "loop") continue;
      const start = m.index + m[0].length - 1;
      const block = this._extractBlock(code, start);
      if (!block.body) continue;
      if (retType !== "void" && !/\breturn\b/.test(block.body)) {
        const line = code.slice(0, m.index).split("\n").length;
        this._warning(`Function '${name}' returns '${retType}' but has no return statement`, { line, code:"W003", fix:`Add: return <value>;` });
      }
    }
  }

_checkPinModeUsage(code) {
  const pinUsage = {};
  const pmRe     = /pinMode\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g;
  let m;
  while ((m = pmRe.exec(code)) !== null)
    pinUsage[m[1]] = { mode: m[2], line: code.slice(0, m.index).split("\n").length };

  const INPUT_MODES  = new Set(["INPUT", "INPUT_PULLUP", "INPUT_PULLDOWN", "0", "2", "3"]);
  const OUTPUT_MODES = new Set(["OUTPUT", "1"]);

  const writeRe = /\b(digitalWrite|analogWrite|tone)\s*\(\s*(\w+)/g;
  while ((m = writeRe.exec(code)) !== null) {
    const fn = m[1], pin = m[2];
    const mode = pinUsage[pin]?.mode;
    // Sirf pure INPUT pe error — INPUT_PULLUP/PULLDOWN se write allowed nahi
    if (mode === "INPUT" || mode === "0") {
      const line = code.slice(0, m.index).split("\n").length;
      this._error(`Pin '${pin}' is INPUT but '${fn}()' requires OUTPUT`, {
        line, code: "E020", fix: `Change to: pinMode(${pin}, OUTPUT)`
      });
    }
  }

  const readRe = /\b(digitalRead|analogRead)\s*\(\s*(\w+)/g;
  while ((m = readRe.exec(code)) !== null) {
    const fn = m[1], pin = m[2];
    const mode = pinUsage[pin]?.mode;
    if (OUTPUT_MODES.has(mode)) {
      const line = code.slice(0, m.index).split("\n").length;
      this._error(`Pin '${pin}' is OUTPUT but '${fn}()' requires INPUT`, {
        line, code: "E021", fix: `Change to: pinMode(${pin}, INPUT)`
      });
    }
  }
}

  _checkAnalogWriteRange(code) {
    const re = /analogWrite\s*\(\s*[^,]+,\s*(-?\d+\.?\d*)\s*\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const v = parseFloat(m[1]);
      if (v < 0 || v > 255) {
        const line = code.slice(0, m.index).split("\n").length;
        this._error(`analogWrite value ${v} is out of range 0-255`, { line, code:"E030", fix:"Use a value between 0 and 255" });
      }
    }
  }

  _checkDivisionByZero(code) {
    const re = /\/\s*0\b(?!\s*x)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const line = code.slice(0, m.index).split("\n").length;
      this._error("Division by zero detected", { line, code:"E031", fix:"Check denominator is not zero before dividing" });
    }
  }

  _checkArrayBounds(code) {
    const arrRe = /\b(?:int|float|double|long|char|byte|uint\w+|int\w+)\s+(\w+)\s*\[(\d+)\]\s*=\s*\{([^}]*)\}/g;
    let m;
    while ((m = arrRe.exec(code)) !== null) {
      const name = m[1], size = parseInt(m[2]);
      const vals = m[3].split(",").filter(v => v.trim());
      if (vals.length > size) {
        const line = code.slice(0, m.index).split("\n").length;
        this._error(`Array '${name}[${size}]' initialized with ${vals.length} values — overflow`, { line, code:"E040", fix:`Increase size to [${vals.length}] or remove extra elements` });
      }
    }
    const accessRe = /(\w+)\s*\[\s*(-\d+)\s*\]/g;
    while ((m = accessRe.exec(code)) !== null) {
      const line = code.slice(0, m.index).split("\n").length;
      this._error(`Negative array index [${m[2]}] on '${m[1]}'`, { line, code:"E041", fix:"Array indices must be >= 0" });
    }
  }

  _checkTypeOverflow(code) {
    const re = /\bint\s+\w+\s*=\s*(\d{6,})/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const v = parseInt(m[1]);
      if (v > 32767) {
        const line = code.slice(0, m.index).split("\n").length;
        this._warning(`Value ${v} may overflow int (max 32767 on AVR) — use long`, { line, code:"W040", fix:"Replace int with long" });
      }
    }
    const floatRe = /\bint\s+(\w+)\s*=\s*(\d+\.\d+)/g;
    while ((m = floatRe.exec(code)) !== null) {
      const line = code.slice(0, m.index).split("\n").length;
      this._warning(`Float literal assigned to int '${m[1]}' — fractional part lost`, { line, code:"W041", fix:"Use float instead of int" });
    }
  }

  _checkFloatEquality(code) {
    const re = /\b(float|double)\s+\w+[^;]+==\s*[0-9.]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const line = code.slice(0, m.index).split("\n").length;
      this._warning("Float equality comparison is unreliable", { line, code:"W050", fix:"Use: fabs(a - b) < 0.0001 instead of ==" });
    }
  }

  _checkEsp32Only(code) {
    if (this.board !== "arduino") return;
    const ESP32_ONLY = [
      "dacWrite","touchRead","hallRead","ledcSetup","ledcAttachPin",
      "ledcWrite","ledcWriteTone","ledcDetachPin","ledcRead",
      "analogReadResolution","analogSetAttenuation",
      "xTaskCreate","xTaskCreatePinnedToCore","vTaskDelay","vTaskDelete",
    ];
    for (const fn of ESP32_ONLY) {
      const re = new RegExp(`\\b${fn}\\s*\\(`, "g");
      let m;
      while ((m = re.exec(code)) !== null) {
        const line = code.slice(0, m.index).split("\n").length;
        this._error(`'${fn}()' is ESP32-only — not available on Arduino UNO/Mega/Nano`, { line, code:"E010", fix:"Change board to ESP32 in board settings" });
      }
    }
  }

  _checkFunctionSignatures(code) {
    const callRe = /\b([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/g;
    let m;
    while ((m = callRe.exec(code)) !== null) {
      const name    = m[1];
      const argsRaw = m[2].trim();
      const args    = argsRaw ? argsRaw.split(",").filter(a => a.trim()) : [];
      if (!(name in BUILTIN_FUNCTIONS)) continue;
      const def      = BUILTIN_FUNCTIONS[name];
      const required = def.params.filter(p => !p.endsWith("?")).length;
      const total    = def.params.length;
      if (args.length < required || args.length > total) {
        const line     = code.slice(0, m.index).split("\n").length;
        const expected = required === total ? `${required}` : `${required}–${total}`;
        this._error(`'${name}()' expects ${expected} argument(s), got ${args.length}`, { line, code:"E050", fix:`${name}(${def.params.join(", ")})` });
      }
    }
  }

  _checkScopeViolations(code) {
    const COMP_CLASSES = Object.keys(CLASS_LIB_MAP).join("|");
    if (!COMP_CLASSES) return;
    const funcBodyRe = /\b(?:void|int|float|double|long|char|bool|byte|String|uint\w+)\s+[A-Za-z_]\w*\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;
    let m;
    while ((m = funcBodyRe.exec(code)) !== null) {
      const body      = m[1];
      const instRe    = new RegExp(`\\b(${COMP_CLASSES})\\b\\s+\\w+\\s*(?:\\([^)]*\\))?\\s*;`, "g");
      const bodyStart = m.index + m[0].indexOf("{") + 1;
      let im;
      while ((im = instRe.exec(body)) !== null) {
        const line = code.slice(0, bodyStart + im.index).split("\n").length;
        this._error(`Object of class '${im[1]}' must be declared at global scope, not inside a function`, { line, code:"E101", fix:`Move '${im[1]}' declaration to global scope` });
      }
    }
  }

  parseIncludes(code) {
    const re = /#\s*include\s*[<"]([^>"]+)[>"]/g, result = [];
    let m;
    while ((m = re.exec(code)) !== null) result.push(m[1].trim());
    return [...new Set(result)];
  }

 parseDefines(code) {
  const result = {};
  
  // Pehle empty defines pakdo — ye error hain
  const emptyRe = /#\s*define\s+([A-Za-z_]\w*)\s*$/gm;
  let em;
  while ((em = emptyRe.exec(code)) !== null) {
    result[em[1].trim()] = undefined; // explicitly undefined mark karo
  }
  
  // Phir normal defines
  const re = /#\s*define\s+([A-Za-z_]\w*)\s+([^\r\n]+)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    result[m[1].trim()] = m[2].trim();
  }
  
  return result;
}

  parseVariables(code, defines = {}) {
    const vars = { ...defines };
    const TYPE_PAT = /\b(?:const\s+|static\s+|volatile\s+|unsigned\s+|signed\s+)*(?:int|byte|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|long|short|char|float|double|bool|boolean|String|word|size_t)\b/;

    const arr2DRe = new RegExp(TYPE_PAT.source + /\s+([A-Za-z_]\w*)\s*\[\s*\d*\s*\]\s*\[\s*\d*\s*\]\s*=\s*\{([\s\S]*?)\}\s*;/.source, "g");
    let m;
    while ((m = arr2DRe.exec(code)) !== null) {
      const name    = m[1];
      const initRaw = m[2] ?? "";
      const flat    = [];
      const innerRe = /\{([^}]*)\}/g;
      let im2;
      while ((im2 = innerRe.exec(initRaw)) !== null) {
        im2[1].split(",").forEach(v => {
          const t = v.trim();
          if (t === "" || t === "''" ) { flat.push('\0'); return; }
          const cm = t.match(/^'(.)'$/);
          if (cm) { flat.push(cm[1]); return; }
          const n = Number(t);
          flat.push(isNaN(n) ? t : n);
        });
      }
      vars[name] = { _type: "array", value: flat, size: flat.length };
    }

    const arrRe = new RegExp(TYPE_PAT.source + /\s+([A-Za-z_]\w*)\s*\[\s*(\d*)\s*\]\s*(?:=\s*\{([^}]*)\})?\s*;/.source, "g");
    while ((m = arrRe.exec(code)) !== null) {
      const [, name, size, initRaw] = [m[0], m[1], m[2], m[3]];
      const init = initRaw ? initRaw.split(",").map(v => {
        const t = v.trim();
        if (t === "" || t === "''") return '\0';
        const cm = t.match(/^'(.)'$/);
        if (cm) return cm[1];
        const n = Number(t);
        return isNaN(n) ? t : n;
      }) : [];
      vars[name] = { _type:"array", value:init, size:size || init.length };
    }

    const scalarRe = new RegExp(TYPE_PAT.source + /\s+([A-Za-z_]\w*)\s*(?:=\s*([^;{]+))?\s*;/.source, "g");
    while ((m = scalarRe.exec(code)) !== null) {
      const name   = m[1], rawVal = m[2]?.trim() ?? null;
      if (name in vars) continue;
      const num    = Number(rawVal);
      vars[name]   = rawVal === null ? 0 : !isNaN(num) ? num : rawVal;
    }
    return vars;
  }

buildInstanceTable(code, includes, defines = {}) {
  const table = {};
  const CLS_LIST = Object.keys(CLASS_LIB_MAP).join("|");
  if (!CLS_LIST) return table;

  const classRe = new RegExp(`\\b(${CLS_LIST})\\b\\s+([A-Za-z_]\\w*)\\s*(?=\\(|;)`, "g");
  let m;
  while ((m = classRe.exec(code)) !== null) {
    const className    = m[1];
    const instanceName = m[2];
    const lib          = CLASS_LIB_MAP[className];
    const lineNum      = code.slice(0, m.index).split("\n").length;

    if (!lib) {
      this._error(`Unknown class '${className}'`, { line: lineNum, code: "E010" });
      continue;
    }

    if (table[instanceName] && table[instanceName].class !== className) {
      this._error(
        `'${instanceName}' already declared as '${table[instanceName].class}'`,
        { line: lineNum, code: "E011" }
      );
      continue;
    }

    const hasInclude = includes.some(i =>
      i === lib || i.toLowerCase() === lib.toLowerCase()
    );
    if (!hasInclude) {
      this._error(
        `Missing #include <${lib}>`,
        { line: lineNum, code: "E012", fix: `Add: #include <${lib}>` }
      );
    }

    // Constructor args extract karo
    let rawArgs = "";
    const afterMatch = code.slice(m.index + m[0].length);
    const trimmed    = afterMatch.trimStart();
    if (trimmed.startsWith("(")) {
      let depth = 0, start = afterMatch.indexOf("("), end = -1;
      for (let ci = start; ci < afterMatch.length; ci++) {
        if      (afterMatch[ci] === "(") depth++;
        else if (afterMatch[ci] === ")") { depth--; if (depth === 0) { end = ci; break; } }
      }
      if (end > start) rawArgs = afterMatch.slice(start + 1, end);
    }

    // ── NAYA: Har arg check karo ──
  const resolvedArgs = rawArgs.split(",").map(arg => {
      const t = arg.trim();
      if (t === "") return t;

      // makeKeymap(), &Wire, pointer args — as-is pass karo
      if (/^makeKeymap\s*\(/.test(t)) return t;
      if (/^&/.test(t)) return t;
      if (/^-?\d+$/.test(t)) return t;

      if (t in defines) {
        const val = defines[t];
        if (val === undefined || val === null || val === "") {
          this._error(
            `'#define ${t}' has no value`,
            { line: lineNum, code: "E015",
              fix: `#define ${t} <pin_number>` }
          );
          return "0";
        }
        return val;
      }

      // Known constants — error mat do
      const SKIP = new Set([
        "HIGH","LOW","INPUT","OUTPUT","INPUT_PULLUP","INPUT_PULLDOWN",
        "LED_BUILTIN","A0","A1","A2","A3","A4","A5",
        "SSD1306_SWITCHCAPVCC","SSD1306_EXTERNALVCC",
        "DHT11","DHT22","DHT21","AM2301",
        "NEO_GRB","NEO_RGB","NEO_KHZ800",
      ]);
      if (SKIP.has(t)) return t;

      // Array variable names — rowPins, colPins etc
      if (/^\w+Pins$/.test(t) || /^\w+pins$/.test(t)) return t;
      if (/^[A-Z_]+$/.test(t) && t.length > 1) return t; // ALL_CAPS constants

      return t;
    }).join(", ");

    table[instanceName] = {
      class:           className,
      library:         lib,
      line:            lineNum,
      constructorArgs: resolvedArgs,
    };
  }
  return table;
}

_validateInstanceUsage(code, instanceTable) {
  // Har method call ke liye check: obj.method() — obj declare hua hai kya?
  const methodCallRe = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g;
  
  // Known singletons jo declare nahi hote
  const KNOWN_SINGLETONS = new Set([
    "Serial","Serial1","Serial2","Wire","SPI","EEPROM",
    "WiFi","Bluetooth","SD","Keyboard","Mouse","HID",
  ]);
  
  // Known built-in objects
  const SKIP_PREFIXES = new Set(["this","std","Serial"]);
  
  let m;
  while ((m = methodCallRe.exec(code)) !== null) {
    const objName  = m[1];
    const methName = m[2];
    const lineNum  = code.slice(0, m.index).split("\n").length;
    
    if (KNOWN_SINGLETONS.has(objName)) continue;
    if (SKIP_PREFIXES.has(objName))    continue;
    if (objName in instanceTable)      continue;
    
    // Check karo: kya ye kisi declared variable/type ka naam hai?
    // Agar code mein koi bhi class-instance ke jaisa lag raha hai par declared nahi
    const isLibraryClass = Object.keys(CLASS_LIB_MAP).some(cls =>
      code.match(new RegExp(`\\b${cls}\\b\\s+${objName}\\b`))
    );
    
    if (isLibraryClass) {
      // Declare hua tha par table mein nahi — matlab library missing error already hai
      continue;
    }
    
    // Agar lagta hai ye ek component object hai (common library method names)
    const COMPONENT_METHODS = new Set([
      "init","begin","backlight","clear","setCursor","print","println",
      "write","attach","detach","read","readTemperature","readHumidity",
      "setSpeed","moveTo","show","setBrightness","setPixelColor",
      "getKey","ping_cm","showNumberDec","clearDisplay","display",
    ]);
    
    if (COMPONENT_METHODS.has(methName)) {
      this._error(
        `'${objName}' is not declared — declare it at global scope before using '${objName}.${methName}()'`,
        {
          line: lineNum,
          code: "E013",
          fix:  `Declare the object at top of code, e.g.: LibraryClass ${objName}(...);`
        }
      );
    }
  }
}
  _extractBlock(code, openIndex) {
    let depth = 0, start = -1;
    for (let i = openIndex; i < code.length; i++) {
      if      (code[i] === "{") { if (depth === 0) start = i + 1; depth++; }
      else if (code[i] === "}") { depth--; if (depth === 0) return { body:code.slice(start, i), end:i }; }
    }
    return { body:code.slice(start === -1 ? openIndex : start), end:code.length - 1 };
  }

  extractBlocks(code) {
    const res = { setup:"", loop:"", functions:{}, meta:{ hasSetup:false, hasLoop:false } };
    const FUNC_RE = /(?:void|int|float|double|long|char|bool|byte|String|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|unsigned\s+(?:int|long)|signed\s+(?:int|long))\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
    let m;
    while ((m = FUNC_RE.exec(code)) !== null) {
      const name   = m[1], params = m[2].trim();
      const { body } = this._extractBlock(code, m.index + m[0].length - 1);
      if      (name === "setup") { res.setup = body.trim(); res.meta.hasSetup = true; }
      else if (name === "loop")  { res.loop  = body.trim(); res.meta.hasLoop  = true; }
      else res.functions[name] = { body:body.trim(), params:this._parseParams(params) };
    }
    return res;
  }

  _parseParams(str) {
    if (!str.trim()) return [];
    return str.split(",").map(p => {
      const parts = p.trim().split(/\s+/);
      return { type:parts.slice(0,-1).join(" ") || "auto", name:parts[parts.length-1].replace(/[*&[\]]/g,"") };
    }).filter(p => p.name && p.name !== "...");
  }

 parseStatements(src, localVars = {}, functions = {}, lineBase = 1) {
  this._recursionDepth++;
  if (this._recursionDepth > ArduinoParserEngine.MAX_RECURSION) {
    this._recursionDepth--;
    this._error("Maximum nesting depth exceeded", { code:"E100", fix:"Reduce nesting depth" });
    return [];
  }

  src = typeof src === "string" ? src : (src || []).join("\n");
  src = src.replace(/\}\s*else\s*if\s*\(/g, "}\nelse if (").replace(/\}\s*else\s*\{/g, "}\nelse {");

  const rawLines = this._buildLineMap(this._stripComments(src));
  const res = [];
  let i = 0;

  const collectBlock = (startIdx) => {
    let k = startIdx;
    while (k < rawLines.length && !rawLines[k].content.includes("{")) k++;
    let depth = 0, inner = [], started = false;
    for (; k < rawLines.length; k++) {
      const ln     = rawLines[k].content;
      const opens  = (ln.match(/{/g) || []).length;
      const closes = (ln.match(/}/g) || []).length;
      if (!started && opens > 0) started = true;
      if (started) {
        depth += opens - closes;
        inner.push(rawLines[k]);
        if (depth <= 0) return { inner: inner.slice(1, inner.length - 1).map(r => r.content), endIdx: k, lineBase: (inner[0]?.line ?? lineBase) };
      }
    }
    return { inner: [], endIdx: rawLines.length - 1, lineBase };
  };

  while (i < rawLines.length) {
    const { line: lineNum, content } = rawLines[i];
    const absLine = lineBase + lineNum - 1;
    const l = content.trim();

    if (!l || /^\s*#/.test(l) || l === "}" || (/^\s*else\b/.test(l) && !/else\s+if/i.test(l))) { i++; continue; }

    // ── Library class instance inside function → error ──
    const COMP_CLASSES = Object.keys(CLASS_LIB_MAP).join("|");
    if (COMP_CLASSES && new RegExp(`\\b(${COMP_CLASSES})\\b\\s+\\w+`).test(l)) {
      this._error(`Object instance declared inside function body`, {
        line: absLine, col: 0, code: "E101", raw: l,
        fix: "Move object declarations to global scope"
      });
      i++; continue;
    }

    const TYPE_RE = /^(?:const\s+|static\s+|volatile\s+|unsigned\s+|signed\s+)*(?:int|byte|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|long|short|char|float|double|bool|boolean|String|word|size_t|auto)\s+/;
// ── Typed var = obj.method() — e.g. float t = dht.readTemperature(); ──
const typedMethodM = l.match(
  /^(?:const\s+|static\s+|volatile\s+|unsigned\s+)?(?:int|byte|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|long|short|char|float|double|bool|boolean|String|word)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;$/
);
if (typedMethodM) {
  const [, varName, obj, method, argsRaw] = typedMethodM;
  const args = _splitArgs(argsRaw.trim());
  localVars[varName] = 0;
  res.push({ type: "varDeclaration", name: varName, value: 0, line: absLine });
  res.push({
    type:     "methodCall",
    object:   obj,
    method:   method,
    args:     args,
    variable: varName,
    line:     absLine,
    _assignToVar: true,
  });
  i++; continue;
}

// ── Typed var = builtinFn() — e.g. int val = analogRead(A0); ──
const typedFuncM = l.match(
  /^(?:const\s+|static\s+|volatile\s+|unsigned\s+)?(?:int|byte|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|long|short|char|float|double|bool|boolean|String|word)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;$/
);
if (typedFuncM) {
  const [, varName, fnName, argsRaw] = typedFuncM;
  const args = argsRaw.trim() ? argsRaw.split(",").map(a => a.trim()) : [];
  localVars[varName] = 0;
  res.push({ type: "varDeclaration", name: varName, value: 0, line: absLine });
  res.push({ type: "functionCall",   name: fnName, args, variable: varName, line: absLine });
  i++; continue;
}
    // ── Array declaration ──
  const arr2DDecl = l.match(/^(?:const\s+|static\s+|volatile\s+)?(?:unsigned\s+)?(?:int|byte|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|long|char|float|double|bool)\s+([A-Za-z_]\w*)\s*\[\s*(\d*)\s*\]\s*\[\s*(\d*)\s*\]\s*=\s*\{([\s\S]*?)\}\s*;$/i);
    if (arr2DDecl) {
      const [, name, , , initRaw] = arr2DDecl;
      const innerArrays = [];
      const innerRe = /\{([^}]*)\}/g;
      let im;
      while ((im = innerRe.exec(initRaw)) !== null) {
        const row = im[1].split(",").map(v => {
          const t = v.trim();
          if (t === "" || t === "''" || t === "'\\''" ) return '\0';
          const charM = t.match(/^'(.)'$/);
          if (charM) return charM[1];
          const num = Number(t);
          return isNaN(num) ? t : num;
        });
        innerArrays.push(...row);
      }
      localVars[name] = { _type: "array", value: innerArrays };
      res.push({ type: "varDeclaration", varType: "array", name, value: innerArrays, line: absLine });
      i++; continue;
    }

    const arrDecl = l.match(/^(?:const\s+|static\s+|volatile\s+)?(?:unsigned\s+)?(?:int|byte|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|long|char|float|double|bool)\s+([A-Za-z_]\w*)\s*\[\s*(\d*)\s*\]\s*(?:=\s*\{([^}]*)\})?\s*;$/i);
    if (arrDecl) {
      const [, name, size, initRaw] = arrDecl;
      const initVals = initRaw
        ? initRaw.split(",").map(v => {
            const t = v.trim();
            if (t === "" || t === "''" || t === "'\\''" ) return '\0';
            const charM = t.match(/^'(.)'$/);
            if (charM) return charM[1];
            const num = Number(t);
            return isNaN(num) ? t : num;
          })
        : [];
      localVars[name] = { _type: "array", value: initVals };
      res.push({ type: "varDeclaration", varType: "array", name, value: initVals, line: absLine });
      i++; continue;
    }

    // ── Compound assign (++, --, +=, etc.) ──
    const caM = l.match(/^([A-Za-z_]\w*(?:\[[^\]]*\])?)\s*(\+\+|--|[+\-*\/%&|^<>]=|<<=|>>=)\s*([^;]*)?\s*;$/);
    if (caM) { res.push({ type: "compoundAssign", left: caM[1], op: caM[2], right: caM[3]?.trim() || "", line: absLine }); i++; continue; }

    // ── Simple assign ──
    const asgM = l.match(/^([A-Za-z_]\w*(?:\[[^\]]*\])?)\s*=\s*([^;]+);$/);
    if (asgM && !/^(if|for|while|switch|else|do)\b/.test(l)) {
      res.push({ type: "assign", left: asgM[1], right: asgM[2].trim(), line: absLine });
      i++; continue;
    }

    // ── if ──
    if (/^\s*if\s*\(/.test(l)) {
      let depth2 = 0, condEnd = 0, start = l.indexOf("(");
      for (let ci = start; ci < l.length; ci++) {
        if (l[ci] === "(") depth2++;
        else if (l[ci] === ")") { depth2--; if (depth2 === 0) { condEnd = ci; break; } }
      }
      const condition = l.slice(start + 1, condEnd);
      const { inner: thenBlock, endIdx: te, lineBase: tlb } = collectBlock(i);
      i = te + 1;
      let elseStmts = [];
      if (i < rawLines.length && /^\s*else\b/.test(rawLines[i].content)) {
        if (/else\s+if\s*\(/i.test(rawLines[i].content)) {
          elseStmts = this.parseStatements([rawLines[i].content], localVars, functions, rawLines[i].line + lineBase - 1);
          i++;
        } else {
          const { inner: eb, endIdx: ee } = collectBlock(i);
          elseStmts = this.parseStatements(eb.join("\n"), localVars, functions, tlb);
          i = ee + 1;
        }
      }
      res.push({ type: "if", condition, then: this.parseStatements(thenBlock.join("\n"), localVars, functions, tlb), else: elseStmts, line: absLine });
      continue;
    }

    // ── for ──
    if (/^\s*for\s*\(/.test(l)) {
      const forM   = l.match(/for\s*\(([\s\S]*?)\)\s*(?:\{|$)/);
      const header = forM?.[1]?.trim() ?? "";
      const parts  = header.split(";").map(s => s.trim());
      const { inner: body, endIdx, lineBase: blb } = collectBlock(i);
      res.push({ type: "for", init: parts[0], condition: parts[1], update: parts[2], body: this.parseStatements(body.join("\n"), { ...localVars }, functions, blb), line: absLine });
      i = endIdx + 1; continue;
    }

    // ── while ──
    if (/^\s*while\s*\(/.test(l)) {
      const cond = l.match(/while\s*\(([\s\S]*?)\)/)?.[1]?.trim() ?? "";
      const { inner: body, endIdx, lineBase: blb } = collectBlock(i);
      res.push({ type: "while", condition: cond, body: this.parseStatements(body.join("\n"), { ...localVars }, functions, blb), line: absLine });
      i = endIdx + 1; continue;
    }

    // ── do-while ──
    if (/^\s*do\s*\{/.test(l)) {
      const { inner: body, endIdx, lineBase: blb } = collectBlock(i);
      const whileLn = rawLines[endIdx]?.content ?? "";
      const cond    = whileLn.match(/while\s*\(([\s\S]*?)\)/)?.[1]?.trim() ?? "true";
      res.push({ type: "doWhile", condition: cond, body: this.parseStatements(body.join("\n"), { ...localVars }, functions, blb), line: absLine });
      i = endIdx + 1; continue;
    }

    // ── switch ──
    if (/^\s*switch\s*\(/.test(l)) {
      const expr = l.match(/switch\s*\(([\s\S]*?)\)/)?.[1]?.trim() ?? "";
      const { inner: body, endIdx } = collectBlock(i);
      res.push({ type: "switch", expr, cases: this._parseSwitchCases(body.join("\n"), localVars, functions), line: absLine });
      i = endIdx + 1; continue;
    }

    // ── return / break / continue ──
    { const m = l.match(/^\s*return\b(.*)?;$/); if (m) { res.push({ type: "return", value: (m[1] || "").trim(), line: absLine }); i++; continue; } }
    if (/^\s*break\s*;$/.test(l))    { res.push({ type: "break",    line: absLine }); i++; continue; }
    if (/^\s*continue\s*;$/.test(l)) { res.push({ type: "continue", line: absLine }); i++; continue; }

    // ── Arduino builtins ──
    { const m = l.match(/^\s*pinMode\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i);          if (m) { res.push({ type: "pinMode",      pin: m[1], mode: m[2],  line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*digitalWrite\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i);     if (m) { res.push({ type: "digitalWrite", pin: m[1], state: m[2], line: absLine }); i++; continue; } }
    { const m = l.match(/^([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i);          if (m) { res.push({ type: "digitalRead",  variable: m[1], pin: m[2], line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*analogWrite\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i);      if (m) { res.push({ type: "analogWrite",  pin: m[1], value: m[2], line: absLine }); i++; continue; } }
    { const m = l.match(/^([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i);           if (m) { res.push({ type: "analogRead",   variable: m[1], pin: m[2], line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*dacWrite\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)\s*\)\s*;$/i);         if (m) { res.push({ type: "dacWrite",     pin: m[1], value: m[2], line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*delay(?:Microseconds)?\s*\(\s*([^)]+)\s*\)\s*;$/i);                         if (m) { res.push({ type: /Microseconds/i.test(l) ? "delayMicroseconds" : "delay", time: m[1].trim(), line: absLine }); i++; continue; } }
    { const m = l.match(/^([A-Za-z_]\w*)\s*=\s*(millis|micros)\s*\(\s*\)\s*;$/i);                       if (m) { res.push({ type: m[2].toLowerCase(), variable: m[1], line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*tone\s*\(\s*([A-Za-z_\d]+)\s*,\s*([A-Za-z_\d]+)(?:\s*,\s*([A-Za-z_\d]+))?\s*\)\s*;$/i); if (m) { res.push({ type: "tone", pin: m[1], frequency: m[2], duration: m[3] || null, line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*noTone\s*\(\s*([A-Za-z_\d]+)\s*\)\s*;$/i);                                 if (m) { res.push({ type: "noTone", pin: m[1], line: absLine }); i++; continue; } }
    { const m = l.match(/^Serial\d*\.begin\s*\(\s*(\d+)\s*(?:,\s*[A-Za-z_\d]+)?\s*\)\s*;$/i);           if (m) { res.push({ type: "serialBegin", baud: parseInt(m[1], 10), line: absLine }); i++; continue; } }

    // ── Serial print/println ──
    {
      const m = l.match(/^Serial\d*\.print(?:ln)?\s*\(\s*([\s\S]*?)\s*\)\s*;$/i);
      if (m) {
        const isLn  = /println/i.test(l), raw = m[1].trim();
        const isStr = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
        res.push({ type: isLn ? "serialPrintln" : "serialPrint", text: isStr ? raw.slice(1, -1) : null, expr: isStr ? null : raw, line: absLine });
        i++; continue;
      }
    }

    { const m = l.match(/^([A-Za-z_]\w*)\s*=\s*Serial\d*\.read\s*\(\s*\)\s*;$/i);      if (m) { res.push({ type: "serialRead",      variable: m[1], line: absLine }); i++; continue; } }
    { const m = l.match(/^([A-Za-z_]\w*)\s*=\s*Serial\d*\.available\s*\(\s*\)\s*;$/i); if (m) { res.push({ type: "serialAvailable", variable: m[1], line: absLine }); i++; continue; } }
    { const m = l.match(/^\s*attachInterrupt\s*\(\s*([^)]+)\s*\)\s*;$/i);               if (m) { const args = m[1].split(",").map(a => a.trim()); res.push({ type: "attachInterrupt", interrupt: args[0], isr: args[1], mode: args[2] || "CHANGE", line: absLine }); i++; continue; } }

    // ── obj.method(...) — methodCall ──
    {
      const objM = l.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*;$/);
      if (objM) {
        const [, obj, method, argsRaw] = objM;
        const args = _splitArgs(argsRaw.trim());
        const isSerial         = /^Serial\d*$/.test(obj);
        const isKnownSingleton = obj in ALL_SINGLETONS || isSerial;
        const isInstance       = obj in this.instanceTable;

        // ── PEHLE knownMethods resolve karo ──
        let knownMethods = null;
        if (isSerial) {
          knownMethods = SERIAL_METHODS;
        } else if (obj in ALL_SINGLETONS) {
          knownMethods = ALL_SINGLETONS[obj].methods;
        } else if (isInstance) {
          const cls = this.instanceTable[obj].class;
          knownMethods = ALL_CLASSES[cls]?.methods ?? null;
        }

        // ── Undeclared object check ──
        if (!isSerial && !isKnownSingleton && !isInstance) {
          const likelyClass = Object.entries(CLASS_LIB_MAP).find(([cls]) =>
            src?.toLowerCase().includes(cls.toLowerCase())
          );
          const fixMsg = likelyClass
            ? `Declare '${obj}' at global scope: ${likelyClass[0]} ${obj}(...); and add #include <${likelyClass[1]}>`
            : `Declare '${obj}' at global scope or add the required #include`;
          this._error(
            `'${obj}' is not declared — '${obj}.${method}()' cannot be called on an undeclared object`,
            { line: absLine, code: "E013", raw: l, fix: fixMsg }
          );
          i++; continue;
        }

        // ── Unknown method check ──
        if (knownMethods && !(method in knownMethods)) {
          if (isInstance) {
            this._error(
              `'${method}' is not a valid method of '${this.instanceTable[obj]?.class || obj}'`,
              { line: absLine, code: "E014", raw: l, fix: `Valid methods: ${Object.keys(knownMethods).slice(0, 5).join(", ")}...` }
            );
          } else {
            this._warning(
              `'${method}' is not a known method of '${obj}'`,
              { line: absLine, code: "W031", raw: l, fix: `Check the library documentation for '${obj}'` }
            );
          }
        }

        res.push({ type: "methodCall", object: obj, method, args, line: absLine });
        i++; continue;
      }
    }

    // ── var = obj.method(...) — methodCallAssign ──
    {
      const assignM = l.match(/^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;$/);
      if (assignM) {
        const [, varName, obj, method, argsRaw] = assignM;
        const args = _splitArgs(argsRaw.trim());
        res.push({ type: "methodCallAssign", variable: varName, object: obj, method, args, line: absLine });
        i++; continue;
      }
    }

    // ── Plain function call ──
    {
      const fcM = l.match(/^([A-Za-z_]\w*)\s*\(([^;]*)\)\s*;$/);
      if (fcM) {
        const [, fnName, argsRaw] = fcM;
        const args = argsRaw.trim() ? argsRaw.split(",").map(a => a.trim()) : [];
        if (!(fnName in BUILTIN_FUNCTIONS) && !(fnName in functions)) {
          this._warning(`Function '${fnName}' is not defined`, { line: absLine, code: "W040", raw: l, fix: `Define '${fnName}()' or add the required #include` });
        }
        if (fnName in BUILTIN_FUNCTIONS) {
          const def      = BUILTIN_FUNCTIONS[fnName];
          const required = def.params.filter(p => !p.endsWith("?")).length;
          const total    = def.params.length;
          if (args.length < required || args.length > total) {
            this._error(`'${fnName}' expects ${required === total ? required : `${required}–${total}`} arg(s), got ${args.length}`, { line: absLine, code: "E050", raw: l, fix: `${fnName}(${def.params.join(", ")})` });
          }
        }
        res.push({ type: "functionCall", name: fnName, args, line: absLine });
        i++; continue;
      }
    }

    // ── Unrecognized ──
    if (l && l !== "}" && !l.startsWith("//") && !l.startsWith("#")) {
      this._warning(`Unrecognized statement`, { line: absLine, code: "W099", raw: l, fix: "Check syntax — this line could not be parsed" });
      res.push({ type: "unknown", raw: l, line: absLine });
    }
    i++;
  }

  this._recursionDepth--;
  return res;
}

  _parseSwitchCases(body, vars, functions) {
    const cases  = [];
    const caseRe = /\bcase\s+([^:]+):\s*([\s\S]*?)(?=\bcase\b|\bdefault\b|$)/g;
    const defRe  = /\bdefault\s*:\s*([\s\S]*?)(?=\bcase\b|$)/;
    let m;
    while ((m = caseRe.exec(body)) !== null)
      cases.push({ value:m[1].trim(), body:this.parseStatements(m[2].trim(), vars, functions) });
    const def = body.match(defRe);
    if (def) cases.push({ value:"default", body:this.parseStatements(def[1].trim(), vars, functions) });
    return cases;
  }

  arduinoToJSON(code) {
    this._reset();

    if (!code || typeof code !== "string") {
      this._error("Empty or invalid input", { code:"E000" });
      return { errors:this._diagnostics, warnings:[], board:"arduino", canRun:false };
    }

    const cleanCode = this._stripComments(code);
    const includes  = this.parseIncludes(code);
    const board     = this.detectBoard(includes);
    this.board      = board;
    const defines   = this.parseDefines(code);
 

for (const [name, val] of Object.entries(defines)) {
  if (val === undefined || val === "") {
    this._error(
      `'#define ${name}' is empty — value required`,
      { code: "E004", fix: `Change to: #define ${name} <value>` }
    );
  }
}
const earlyErrors = this._diagnostics.filter(d => d.severity === "error");
if (earlyErrors.length > 0) {
  return {
    includes: [], defines, variables: {},
    instances: {}, setup: [], loop: [], functions: {},
    board: "arduino", errors: earlyErrors, warnings: [], canRun: false,
  };
}

    const vars      = this.parseVariables(cleanCode, defines);
    this.variableTable = vars;

    this.fullValidate(cleanCode);

    const errors = this._diagnostics.filter(d => d.severity === "error");
    if (errors.length > 0) {
      return {
        includes, defines, variables:vars,
        instances:    {},
        setup:        [],
        loop:         [],
        functions:    {},
        board,
        boardName:    BOARD_PROFILES[board]?.name ?? "Unknown",
        errors,
        warnings:     this._diagnostics.filter(d => d.severity === "warning"),
        infos:        this._diagnostics.filter(d => d.severity === "info"),
        allDiagnostics: [...this._diagnostics],
        canRun:       false,
      };
    }

    this.instanceTable = this.buildInstanceTable(cleanCode, includes);
    const blocks       = this.extractBlocks(cleanCode);

    const parsedFunctions = {};
    for (const [name, fn] of Object.entries(blocks.functions || {})) {
      const localVars = { ...vars };
      (fn.params || []).forEach(p => { localVars[p.name] = 0; });
      try {
        parsedFunctions[name] = { params:fn.params || [], body:this.parseStatements(fn.body, localVars, {}) };
      } catch (e) {
        this._error(`Function '${name}': ${e.message}`, { code:"E200" });
        parsedFunctions[name] = { params:fn.params || [], body:[] };
      }
    }

    let parsedSetup = [], parsedLoop = [];
    try { parsedSetup = this.parseStatements(blocks.setup, { ...vars }, parsedFunctions); }
    catch (e) { this._error(`setup(): ${e.message}`, { code:"E201" }); }
    try { parsedLoop  = this.parseStatements(blocks.loop,  { ...vars }, parsedFunctions); }
    catch (e) { this._error(`loop(): ${e.message}`,  { code:"E202" }); }

    const finalErrors = this._diagnostics.filter(d => d.severity === "error");

    return {
      includes, defines, variables:vars,
      instances:    this.instanceTable,
      setup:        parsedSetup,
      loop:         parsedLoop,
      functions:    parsedFunctions,
      board,
      boardName:    BOARD_PROFILES[board]?.name ?? "Unknown",
      errors:       finalErrors,
      warnings:     this._diagnostics.filter(d => d.severity === "warning"),
      infos:        this._diagnostics.filter(d => d.severity === "info"),
      allDiagnostics: [...this._diagnostics],
      canRun:       finalErrors.length === 0,
    };
  }
}