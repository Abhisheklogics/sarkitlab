"use strict";

// SW-18010P spring switch behavior:
//   Normal (still):    spring resting  → contact OPEN
//   Vibrating:         spring bouncing → contact CLOSE/OPEN rapidly
//
// With INPUT_PULLUP (most common wiring):
//   Still     → pin HIGH (1)
//   Vibrating → pin LOW  (0) when contact closes
//
// With INPUT (pulldown or direct):
//   Still     → pin LOW  (0)
//   Vibrating → pin HIGH (1) when contact closes to VCC

const R_VIB_LOAD  = 10_000;  // sensor power draw
const R_VIB_ON    = 150;     // contact closed — low resistance path
const R_VIB_FLOAT = 100_000; // contact open   — high resistance (not infinite, spring has some capacitance)
const V_VCC       = 5.0;
const V_MIN_POWER = 2.5;

export default class VibrationSensorModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "OUT"]);

    // Power consumption
    if (nets.VCC && nets.GND) {
      electrical.circuits.push({
        id: `${comp.id}_load`, type: "RESISTOR",
        a: nets.VCC, b: nets.GND,
        ohms: R_VIB_LOAD,
      });
    }

    if (!nets.OUT || !nets.GND) return;

    const isVibrating = comp.instance?.state === 1;
    const pinOUT      = comp.instance?.pinOUT;
    const modeKey     = (pinOUT != null) ? `D${pinOUT}` : null;
    const mode        = modeKey
      ? (solver.simEngine?.pinStates?.[modeKey] ?? "INPUT")
      : "INPUT";

    if (mode === "INPUT_PULLUP") {
      // Pullup mode:
      //   Still     → OUT floating (pulled HIGH by Arduino internally)
      //   Vibrating → OUT shorted to GND through spring contact
      electrical.circuits.push({
        id   : `${comp.id}_out`,
        type : "RESISTOR",
        a    : nets.OUT,
        b    : nets.GND,
        ohms : isVibrating ? R_VIB_ON : R_VIB_FLOAT,
      });
    } else {
      // Normal INPUT mode:
      //   Still     → OUT near GND (floating low)
      //   Vibrating → OUT driven HIGH through contact to VCC side
      if (isVibrating && nets.VCC) {
        electrical.circuits.push({
          id      : `${comp.id}_out`,
          type    : "RESISTOR",
          a       : nets.OUT,
          b       : nets.GND,
          ohms    : R_VIB_ON,
          vOffset : V_VCC,
        });
      } else {
        electrical.circuits.push({
          id  : `${comp.id}_out`,
          type: "RESISTOR",
          a   : nets.OUT,
          b   : nets.GND,
          ohms: R_VIB_FLOAT,
        });
      }
    }

    if (comp.instance) comp.instance._nets = nets;
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;

    const nets = inst._nets;
    if (!nets) return;

    const vcc     = electrical.netVoltage.get(nets.VCC) ?? 0;
    const gnd     = electrical.netVoltage.get(nets.GND) ?? 0;
    const powered = (vcc - gnd) >= V_MIN_POWER;

    inst._powered = powered;

    if (!powered) {
      inst.stopAutoVibrate?.();
      inst._setState?.(0);
      return;
    }

    // Auto-detect Arduino pin connected to OUT
    if ((inst.pinOUT == null) && nets.OUT) {
      VibrationSensorModel._autoDetectPin(inst, nets.OUT, solver);
    }

    const hasArduinoPin = inst.pinOUT != null;

    if (hasArduinoPin) {
      // Wired to Arduino — stop auto-vibrate, let user/sim control
      inst.stopAutoVibrate?.();
    } else {
      // Not wired to Arduino — still vibrates visually when powered
      inst.startAutoVibrate?.();
    }

    // Status LED update
    const led = comp.svg?.querySelector?.("#statusLED");
    if (led) {
      led.setAttribute("fill", inst.state === 1 ? "#ff1744" : "#330000");
    }
  }

  static _autoDetectPin(inst, outNet, solver) {
    const arduino = solver.registry?.getAll?.()
      .find(c => c.type?.toLowerCase().includes("arduino"));
    if (!arduino) return;

    const pins = solver.wireSystem?.lastNetlist?.nets?.get(outNet);
    if (!pins) return;

    for (const ref of pins) {
      if (typeof ref === "string" && ref.startsWith(arduino.id + ":")) {
        const pinStr = ref.split(":")[1];
        inst.setOutputPin?.(isNaN(pinStr) ? pinStr : Number(pinStr));
        break;
      }
    }
  }
}