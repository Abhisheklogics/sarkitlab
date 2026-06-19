export default class FlameSensorModel {

  static solve(comp, electrical, solver) {
    const { VCC, GND, DOUT, AOUT } =
      solver.getNets(comp, ["VCC", "GND", "DOUT", "AOUT"]);

    if (GND) electrical.gndNets.add(GND);

    // Power consumption ~5mA
    if (VCC && GND) {
      electrical.circuits.push({
        id:   comp.id + "_pwr",
        type: "RESISTOR",
        a:    VCC, b: GND,
        ohms: 1000,
      });
    }

    const inst = comp.instance;
    if (!inst) return;

    // DOUT — Active LOW (flame detected = LOW)
    // No flame: DOUT HIGH (pulled to VCC via 10k)
    // Flame:    DOUT LOW  (comparator pulls down)
    if (DOUT && GND) {
      electrical.circuits.push({
        id:   comp.id + "_dout",
        type: "SWITCH",
        a:    DOUT, b: GND,
        ohms: inst.isTriggered ? 10 : 1e9,
      });
    }
    if (DOUT && VCC) {
      electrical.circuits.push({
        id:   comp.id + "_pullup",
        type: "RESISTOR",
        a:    VCC, b: DOUT,
        ohms: 10000,
      });
    }

    // AOUT — analog voltage: no flame=low V, flame=high V
    // Real IR sensor: more IR light → lower resistance → higher voltage
    if (AOUT && GND && VCC) {
      const Vvcc = solver.getNetVoltage(VCC, electrical) || 5;
      const Vout = Vvcc * (inst.analogValue / 1023);
      electrical.circuits.push({
        id:      comp.id + "_aout",
        type:    "VOLTAGE_SOURCE",
        a:       AOUT, b: GND,
        ohms:    100,
        vOffset: Vout,
      });
    }
  }

  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst) return;
    // Push digital state to sim engine
    if (inst.pinDOUT != null && inst.digitalInputs) {
      inst.digitalInputs[inst.pinDOUT] = inst.state;
    }
  }
}