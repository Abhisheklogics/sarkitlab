"use strict";

// SSD1306 OLED 128x64 — I2C Circuit Model
//
// Real datasheet values (Solomon Systech SSD1306):
//   VCC operating range  : 3.0V – 4.2V  (display panel power)
//   VBAT / VDD logic     : 1.65V – 3.5V  (logic supply, breakout boards
//                          internally regulate, so 3.3V–5V input works)
//   Breakout board (5V-ready with onboard LDO): 3.3V–5V input → ~3.3V internal
//   Typical supply current:
//     All pixels ON  (max load)  : ~20mA @ 3.3V
//     Normal text/graphics       : ~8–12mA typical
//     Sleep / display OFF        : ~0.5mA
//   I2C lines: open-drain, need pull-ups on bus (4.7kΩ typ at 100kHz)
//   I2C address: 0x3C (SA0 = GND) or 0x3D (SA0 = VCC)
//
// Circuit model:
//   VCC→GND : resistive load representing display consumption
//     R varies with display state (active ~165Ω, sleep ~6.6kΩ)
//   SCL, SDA : 4.7kΩ pull-up to VCC each (standard I2C)
//     These keep lines from floating and correctly model bus loading.
//
// Solver integration:
//   - solve()  : stamps branches every NR iteration
//   - update() : fires begin()/clearDisplay() on instance based on power state
//   - reset()  : clears all state on sim stop

const V_MIN        = 2.8;     // minimum stable Vcc (after LDO headroom)
const V_MAX        = 5.5;     // absolute max input
const I_ACTIVE     = 0.020;   // 20mA worst case (all pixels on)
const I_SLEEP      = 0.0005;  // 500µA sleep
const R_ACTIVE     = 165;     // 3.3V / 20mA = 165Ω
const R_SLEEP      = 6600;    // 3.3V / 0.5mA = 6.6kΩ
const R_UNPOWERED  = 1e6;     // effectively open circuit
const R_I2C_PULLUP = 4700;    // standard 4.7kΩ I2C pull-up

export default class OLEDModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["VCC", "GND", "SCL", "SDA"]);
    const VCC  = nets["VCC"];
    const GND  = nets["GND"];

    if (!VCC || !GND) return;
    electrical.gndNets.add(GND);

    const vcc     = electrical.netVoltage.get(VCC) ?? 0;
    const powered = vcc >= V_MIN && vcc <= V_MAX;

    // Display is sleeping if instance says so, else active
    const sleeping = comp.instance?.displayOn === false;

    let R;
    if (!powered)     R = R_UNPOWERED;
    else if (sleeping) R = R_SLEEP;
    else               R = Math.max(vcc / I_ACTIVE, R_ACTIVE);

    electrical.circuits.push({
      id:   comp.id,
      type: "OLED",
      a:    VCC,
      b:    GND,
      ohms: R,
    });

    // I2C pull-ups: SCL and SDA pulled to VCC via 4.7kΩ each
    // Only stamp when powered — unpowered OLED shouldn't back-drive bus
    const SCL = nets["SCL"];
    const SDA = nets["SDA"];

    if (powered && SCL) {
      electrical.circuits.push({
        id:   `${comp.id}_scl_pu`,
        type: "RESISTOR",
        a:    VCC,
        b:    SCL,
        ohms: R_I2C_PULLUP,
      });
    }

    if (powered && SDA) {
      electrical.circuits.push({
        id:   `${comp.id}_sda_pu`,
        type: "RESISTOR",
        a:    VCC,
        b:    SDA,
        ohms: R_I2C_PULLUP,
      });
    }

    comp._powered = powered;
    comp._vcc     = vcc;
    comp._sleeping = sleeping;
  }

 static update(comp, electrical, solver) {
  if (!comp.instance) return;

  const powered = comp._powered ?? false;
  const wasOn   = comp._wasOn   ?? false;

  if (powered && !wasOn) {
  comp._wasOn = true;
  if (!comp.instance.initialized) {
    comp.instance.initialized = true;
    comp.instance.cursorX     = 0;
    comp.instance.cursorY     = 0;
    comp.instance.textSize    = 1;
    comp.instance.textColor   = 1;
  }
}

  if (!powered && wasOn) {
    comp._wasOn = false;
    comp.instance.clearDisplay?.();
  }

  const branch = electrical.circuits.find(b => b.id === comp.id);
  const I      = Math.abs(branch?.current ?? 0);

  comp.instance.updatePhysics?.({
    powered,
    vcc:     comp._vcc ?? 0,
    current: I,
  });
}

  static reset(comp) {
    comp._powered  = false;
    comp._wasOn    = false;
    comp._vcc      = 0;
    comp._sleeping = false;
    comp.instance?.reset?.();
  }
}