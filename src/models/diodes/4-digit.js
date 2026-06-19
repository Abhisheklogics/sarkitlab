/**
 * TM1637Model.js
 * TM1637 4-digit 7-segment display — Circuit Solver MNA model
 *
 * MNA stamp strategy:
 *  ┌─ VCC ──[R_pwr=680Ω]── GND   (power draw: segments + IC ~7 mA at 5 V)
 *  ├─ CLK ──[R_pull=10kΩ]── VCC  (open-drain pull-up)
 *  └─ DIO ──[R_pull=10kΩ]── VCC  (open-drain pull-up)
 *
 * Pin resolution:
 *   wireCLK / wireDIO  — actual Arduino pin numbers from the netlist
 *   codeCLK / codeDIO  — pin numbers from user's sketch (set by setCodePins)
 *   validated          — true only when both match
 *
 * update() is called once after NR converges — safe for SVG/display writes.
 */

const R_PWR_LOAD  = 680;    // Ω — TM1637 + segment power model (~7 mA at 5 V)
const R_PULLUP    = 10_000; // Ω — CLK/DIO open-drain pull-up to VCC
const V_MIN_VCC   = 3.0;    // V — minimum supply voltage
const V_HIGH      = 2.0;    // V — threshold: net is logic HIGH above this
const V_LOW       = 0.8;    // V — threshold: net is logic LOW below this

export default class TM1637Model {

  // ── solve() — called every NR iteration ──────────────────────────────────

  static solve(comp, electrical, solver) {
    const inst = comp?.instance;
    if (!inst) return;

    // Resolve all pins to net IDs
    const nets = solver.getNets(comp, ["VCC", "GND", "clk", "dio"]);
    const { VCC, GND, clk, dio } = nets;

    // ── Branch 1: IC power draw  VCC → GND ──────────────────────────────
    // TM1637 draws ~50 mA typical (segments at max brightness).
    // We model this as a fixed resistive load so Ohm's law flows correctly.
    if (VCC && GND) {
      electrical.circuits.push({
        id   : `${comp.id}_pwr`,
        type : "IC_POWER",
        a    : VCC,
        b    : GND,
        ohms : R_PWR_LOAD,
      });
    }

    // ── Branch 2: CLK pull-up  CLK → VCC ────────────────────────────────
    // TM1637 CLK/DIO are open-drain — external 10 kΩ pull-up to VCC.
    if (clk && VCC) {
      electrical.circuits.push({
        id   : `${comp.id}_clk_pu`,
        type : "IC_POWER",
        a    : VCC,
        b    : clk,
        ohms : R_PULLUP,
      });
    }

    // ── Branch 3: DIO pull-up  DIO → VCC ────────────────────────────────
    if (dio && VCC) {
      electrical.circuits.push({
        id   : `${comp.id}_dio_pu`,
        type : "IC_POWER",
        a    : VCC,
        b    : dio,
        ohms : R_PULLUP,
      });
    }

    // ── Pin resolution (netlist → Arduino pin number) ────────────────────
    // Do this once here so update() always has fresh wiring info.
   inst._nets    = nets;
    inst.wireCLK  = _extractArduinoPin(clk, solver);
    inst.wireDIO  = _extractArduinoPin(dio, solver);
    inst.wiringPinsValid = (inst.wireCLK !== null && inst.wireDIO !== null);

    if (inst.wiringPinsValid && !inst.codePinsValid) {
      inst.setCodePins?.(inst.wireCLK, inst.wireDIO);
      inst.codePinsValid = true;
    }

    // validated = VCC+GND wired hain aur CLK+DIO dono connected hain
    inst.validated = !!(VCC && GND && clk && dio);

  }

  // ── update() — called once after NR converges ────────────────────────────

  static update(comp, electrical, solver) {
    const inst = comp?.instance;
    if (!inst) return;

    const nets = inst._nets;
    if (!nets?.VCC || !nets?.GND) return;

    // Read solved voltages
    const vcc  = electrical.netVoltage.get(nets.VCC) ?? 0;
    const gnd  = electrical.netVoltage.get(nets.GND) ?? 0;
    const vClk = electrical.netVoltage.get(nets.clk) ?? 0;
    const vDio = electrical.netVoltage.get(nets.dio) ?? 0;

    const Vsupply = vcc - gnd;
    const powered = Vsupply >= V_MIN_VCC;

   if (!powered) {
      inst.clear?.();
      return;
    }
    if (!inst.validated) return;

    // Convert solved node voltages to logic levels
    const clkLevel = vClk >= V_HIGH ? 1 : vClk <= V_LOW ? 0 : inst.clkLevel ?? 1;
    const dioLevel = vDio >= V_HIGH ? 1 : vDio <= V_LOW ? 0 : inst.dioLevel ?? 1;

    // Feed logic levels into the TM1637 instance state machine
    if (typeof inst.updatePin === "function") {
      inst.updatePin(inst.wireCLK, clkLevel);
      inst.updatePin(inst.wireDIO, dioLevel);
    }

    // Expose live voltages (useful for waveform viewers / debug)
    inst._vClk    = vClk;
    inst._vDio    = vDio;
    inst._vSupply = Vsupply;

    // Apply brightness proportional to supply voltage
    // At 5 V → brightness 7; at 3 V → brightness 3 (linear mapping)
if (!inst._userBrightnessSet) {
      const bri = Math.round(Math.max(0, Math.min(7, (Vsupply - V_MIN_VCC) / (5 - V_MIN_VCC) * 7)));
      inst.setBrightness?.(bri);
    }
  }
}

// ── Module-private helpers ─────────────────────────────────────────────────

/**
 * Walk the net's pin-ref set and return the first Arduino digital pin number.
 * Pin refs are formatted as  "arduino_1:13"  or  "arduino:D13"  etc.
 *
 * @param {string|null} netId
 * @param {object}      solver
 * @returns {number|null}
 */
function _extractArduinoPin(netId, solver) {
  if (!netId) return null;

  const net = solver.wireSystem?.lastNetlist?.nets?.get(netId);
  if (!net) return null;

  for (const ref of net) {
    // Match component IDs that start with "arduino" (case-insensitive)
    if (/^arduino/i.test(ref)) {
      const pinPart = ref.split(":")[1] ?? "";
      // Strip leading D/d/P/p, then parse integer
      const num = parseInt(pinPart.replace(/^[DdPp]/, ""), 10);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

/**
 * Returns true when wire-resolved pins match sketch-declared pins.
 * Handles null safety so callers don't have to.
 */
function _pinsMatch(inst) {
  if (!inst.codePinsValid || !inst.wiringPinsValid) return false;
  return inst.codeCLK === inst.wireCLK && inst.codeDIO === inst.wireDIO;
}