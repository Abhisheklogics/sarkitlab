"use strict";

const R_PWR_LOAD  = 470;
const R_PULLUP    = 4_700;
const R_SIG_LOAD  = 47_000;
const R_OVER_VOLT = 10;

const V_MIN_VCC   = 3.0;
const V_MAX_VCC   = 5.5;

// Arduino Uno  : SDA=A4(18), SCL=A5(19)
// Arduino Mega : SDA=20,     SCL=21
// ESP32 default: SDA=21,     SCL=22
// ESP8266      : SDA=4,      SCL=5
const SDA_PINS = new Set([4, 18, 20, 21]);
const SCL_PINS = new Set([5, 19, 21, 22]);

export default class LCDModel {

  // ─── solve() — circuit branches inject karo ─────────────────────────────
  static solve(comp, electrical, solver) {
    const inst = comp?.instance;
    if (!inst) return;

    const nets = solver.getNets(comp, ["VCC", "GND", "SDA", "SCL"]);
    const { VCC, GND, SDA, SCL } = nets;

    inst._nets  = nets;
    inst.pinVCC = VCC;
    inst.pinGND = GND;
    inst.pinSDA = SDA;
    inst.pinSCL = SCL;

    if (GND) electrical.gndNets.add(GND);

    // ── Pin validation ──────────────────────────────────────────────────────
    const sdaPin = _extractI2CPin(SDA, solver);
    const sclPin = _extractI2CPin(SCL, solver);

    // validated = sabse pehle VCC+GND+SDA+SCL wired hone chahiye
    // SDA/SCL ka exact pin number optional — agar SDA/SCL label mil gaya kafi hai
    const allWired = !!(VCC && GND && SDA && SCL);
    inst.validated  = allWired;
    inst._sdaPinNum = sdaPin;
    inst._sclPinNum = sclPin;

    if (!VCC || !GND) return;

    const vcc = electrical.netVoltage.get(VCC) ?? 0;
    const gnd = electrical.netVoltage.get(GND) ?? 0;
    const Vs  = vcc - gnd;

    // ── Overvoltage — LCD jal jayega ────────────────────────────────────────
    if (Vs > V_MAX_VCC) {
      electrical.circuits.push({
        id: `${comp.id}_overvolt`, type: "LCD_BURNED",
        a: VCC, b: GND, ohms: R_OVER_VOLT,
      });
      inst._overVoltage = true;
      return;
    }

    inst._overVoltage = false;

    // ── Power draw ──────────────────────────────────────────────────────────
    electrical.circuits.push({
      id: `${comp.id}_pwr`, type: "LCD_LOAD",
      a: VCC, b: GND, ohms: R_PWR_LOAD,
    });

    if (!inst.validated) return;

    // ── I2C pull-ups aur signal loads ───────────────────────────────────────
    electrical.circuits.push({ id:`${comp.id}_sda_pu`,   type:"LCD_LOAD", a:VCC, b:SDA, ohms:R_PULLUP   });
    electrical.circuits.push({ id:`${comp.id}_scl_pu`,   type:"LCD_LOAD", a:VCC, b:SCL, ohms:R_PULLUP   });
    electrical.circuits.push({ id:`${comp.id}_sda_load`, type:"LCD_LOAD", a:SDA, b:GND, ohms:R_SIG_LOAD });
    electrical.circuits.push({ id:`${comp.id}_scl_load`, type:"LCD_LOAD", a:SCL, b:GND, ohms:R_SIG_LOAD });
  }

  // ─── update() — visual state update karo ────────────────────────────────
  static update(comp, electrical, solver) {
    const inst = comp?.instance;
    if (!inst) return;

    const nets = inst._nets;
    if (!nets) return;

    const vcc = electrical.netVoltage.get(nets.VCC) ?? 0;
    const gnd = electrical.netVoltage.get(nets.GND) ?? 0;
    const Vs  = vcc - gnd;

    inst._vSupply = Vs;
    inst.powered  = Vs >= V_MIN_VCC && Vs <= V_MAX_VCC;

    // ── Overvoltage ─────────────────────────────────────────────────────────
    if (inst._overVoltage) {
      inst.backlight(false);
      inst._powerWasOff = true;
      if (!inst._burnWarnShown) {
        inst._burnWarnShown = true;
        console.warn(`[LCDModel] ${comp.id}: OVERVOLTAGE ${Vs.toFixed(2)}V — LCD damaged!`);
      }
      return;
    }

    // ── Power off ───────────────────────────────────────────────────────────
    if (Vs < V_MIN_VCC) {
      inst.backlight(false);
      inst._powerWasOff = true;
      inst._burnWarnShown = false;
      return;
    }

    // ── Wiring galat ────────────────────────────────────────────────────────
    if (!inst.validated) {
      inst.backlight(false);
      inst._powerWasOff = true;
      if (!inst._wiringWarnShown) {
        inst._wiringWarnShown = true;
        console.warn(
          `[LCDModel] ${comp.id}: Wiring incomplete.`,
          `VCC=${!!nets.VCC} GND=${!!nets.GND} SDA=${!!nets.SDA} SCL=${!!nets.SCL}`
        );
      }
      return;
    }

    inst._wiringWarnShown = false;

    // ── Power wapas aaya — re-init ──────────────────────────────────────────
    if (inst._powerWasOff) {
      inst._powerWasOff  = false;
      inst.initialized   = false;
      inst._initializing = false;
    }

   if (!inst.initialized && !inst._initializing) {
  inst._initializing = true;
  inst.init();
  inst._initializing = false;
  // return mat karo — same frame mein render hone do
}

    // ── Already initialized — bas backlight on aur render ──────────────────
    if (inst.initialized) {
      inst.backlight(true);
      inst._render();
    }
  }
}

// ─── Helper — net se I2C pin number nikalo ─────────────────────────────────
// Koi bhi board support karta hai: Uno, Mega, ESP32, ESP8266
function _extractI2CPin(netId, solver) {
  if (!netId) return null;

  const net = solver.wireSystem?.lastNetlist?.nets?.get(netId);
  if (!net) return null;

  for (const ref of net) {
    // sirf Arduino/ESP components ke pins check karo
    if (!/^(arduino|esp)/i.test(ref)) continue;

    const pinPart = ref.split(":")[1] ?? "";

    // SDA / SCL label directly
    if (/^SDA$/i.test(pinPart)) return "SDA";
    if (/^SCL$/i.test(pinPart)) return "SCL";

    // A4, A5 style (Uno)
    const aMatch = pinPart.match(/^[Aa](\d+)$/);
    if (aMatch) {
      const n = parseInt(aMatch[1], 10);
      const abs = 14 + n;   // A0=14 ... A5=19
      if (SDA_PINS.has(abs)) return abs;
      if (SCL_PINS.has(abs)) return abs;
    }

    // D4, D5, D18, D19, D20, D21, D22 style
    const dNum = parseInt(pinPart.replace(/^[DdPp]/i, ""), 10);
    if (Number.isFinite(dNum)) {
      if (SDA_PINS.has(dNum)) return dNum;
      if (SCL_PINS.has(dNum)) return dNum;
    }
  }

  return null;
}