"use strict";

import createPins   from "./src/createPins.js";
import { registry } from "./src/ComponentRegistry.js";
import { MQ_SENSOR_DATA } from "./svg/spawnMQSensor.js";
import VirtualBattery9V       from "./svg/Battery9V.js";
import Capacitor              from "./svg/VirtualCapacitor.js";
import PolorizedCapacitor     from "./svg/capacitor.js";
import VirtualDCMotor         from "./svg/dcmotor.js";
import VirtualCoinBattery     from "./svg/VirtualCoinBattery.js";
import PushButtons            from "./svg/PushButton.js";
import RGBLed                 from "./svg/rgb.js";
import VirtualBulb            from "./svg/VirtualBulb.js";
import VirtualInductor        from "./svg/VirtualInductor.js";
import ZenerDiode             from "./svg/ZenerDiode.js";
import VirtualLDR             from "./svg/VirtualLDR.js";
import VirtualGearMotor       from "./svg/VirtualGearMotor.js";
import VirtualNPNTransistor   from "./svg/VirtualNPNTransistor.js";
import VirtualRegulator7805   from "./svg/regulator.js";
import SevenSegment1          from "./svg/SevenSegment.js";
import FourDigitSevenSegment  from "./svg/FourDigitSevenSegment.js";
import I2CLcd16x2             from "./svg/I2CLcd16x2.js";
import ServoMotor             from "./svg/servo.js";
import VirtualBuzzer          from "./svg/VirtualBuzzer.js";
import SoundSensor            from "./svg/soundSensor.js";
import FlameSensor            from "./svg/flameSensor.js";
import VirtualVibrationSensor from "./svg/VirtualVibrationSensor.js";
import PIRSensor              from "./svg/Pis.js";
import ToggleSwitch           from "./svg/togle.js";
import TouchSensor            from "./svg/touch.js";
import VirtualTiltSensor      from "./svg/tiltsensor.js";
import IRSensor               from "./svg/ir.js";
import Resistor               from "./svg/Resistor.js";
import { Diode }              from "./svg/diode.js";
import Breadboard             from "./svg/breadboard.js";
import PotentiometerIC        from "./svg/Potentiometer.js";
import MQSensorIC             from "./svg/mq.js";
import MotorDriverIC          from "./svg/motordriver.js";
import LogicIC                from "./svg/logicic.js";

const LOGIC_IC_MODELS = new Set([
  "74HC08","74HC32","74HC00","74HC86","74HC02",
  "74HC83","74HC148","74HC153","74HC04","74HC14","74HC266",
]);

const MOTOR_DRIVER_MODELS = new Set(["L293D","L298N"]);

const MQ_SENSOR_MODELS = new Set([
  "MQ-2","MQ-3","MQ-4","MQ-5","MQ-6","MQ-7","MQ-8","MQ-9","MQ-131","MQ-135",
]);

VirtualBattery9V.manifest = {
  id:               "battery9v",
  label:            "Battery 9V",
  group:            "Power",
  imageSrc:         "../images/battery.png",
  cssClasses:       ["battery"],
  physics:          { conductive: true, requiresClosedLoop: true, requiresPolarity: false, allowsSeries: true },
  instanceNameBase: "battery",
  pins: [
    { id: "NEG", x: 65,  y: 28, power: "GND" },
    { id: "POS", x: 135, y: 25, power: "VCC" },
  ],
  factory: () => new VirtualBattery9V(),
};

VirtualCoinBattery.manifest = {
  id:               "coinBattery",
  label:            "Coin Battery",
  group:            "Power",
  imageSrc:         "../images/coin.png",
  cssClasses:       ["coinBattery"],
  physics:          { conductive: true, requiresClosedLoop: true, requiresPolarity: false, allowsSeries: true },
  instanceNameBase: "coinBattery",
  pins: [
    { id: "-", x: 50, y: 85, power: "GND" },
    { id: "+", x: 50, y: 20, power: "VCC" },
  ],
  factory: () => new VirtualCoinBattery(),
};

VirtualRegulator7805.manifest = {
  id:               "regulator7805",
  label:            "5V Regulator",
  group:            "Power",
  imageSrc:         "../images/voltageReg.png",
  cssClasses:       ["regulator"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "regulator7805",
  pins: [
    { id: "IN",  x: 20, y: 105, power: "VCC" },
    { id: "GND", x: 35, y: 105, power: "GND" },
    { id: "OUT", x:50, y: 105, power: "VCC" },
  ],
  factory: () => new VirtualRegulator7805(),
};

Capacitor.manifest = {
  id:               "capacitor",
  label:            "Capacitor",
  group:            "Basic",
  imageSrc:         "../images/capacitor.png",
  cssClasses:       ["capacitor"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: true },
  instanceNameBase: "cap",
  pins: [
    { id: "T1", x: 21, y: 105, conductive: true },
    { id: "T2", x: 50, y: 105, conductive: true },
  ],
  factory: () => new Capacitor(),
};

PolorizedCapacitor.manifest = {
  id:               "polorizedcapacitor",
  label:            "Pol. Capacitor",
  group:            "Basic",
  imageSrc:         "../images/pcapacitor.png",
  cssClasses:       ["polorized-capacitor"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: true, allowsSeries: true },
  instanceNameBase: "pcap",
  pins: [
    { id: "P", x: 20, y: 123, power: "VCC" },
    { id: "N", x: 40, y: 120, power: "GND" },
  ],
  factory: () => new PolorizedCapacitor(),
};

VirtualInductor.manifest = {
  id:               "inductor",
  label:            "Inductor",
  group:            "Basic",
  imageSrc:         "../images/inductor.png",
  cssClasses:       ["inductor"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: true },
  instanceNameBase: "ind",
  pins: [
    { id: "A", x: -3, y: 35, conductive: true },
    { id: "B", x: 205, y: 35, conductive: true },
  ],
  factory: () => new VirtualInductor(),
};

VirtualBulb.manifest = {
  id:               "bulb",
  label:            "Bulb",
  group:            "Basic",
  imageSrc:         "../images/bulb.png",
  cssClasses:       ["bulb"],
  physics:          { conductive: false, requiresClosedLoop: true, requiresPolarity: false, allowsSeries: true },
  pins: [
    { id: "Anode", x: 30, y: 120, conductive: true },
    { id: "Cathode", x: 50, y: 120, conductive: true },
  ],
  factory: () => new VirtualBulb(),
};

ZenerDiode.manifest = {
  id:               "zener",
  label:            "Zener Diode",
  group:            "Basic",
  imageSrc:         "../images/zener.png",
  cssClasses:       ["zener-diode"],
  physics:          { conductive: true, requiresClosedLoop: true, requiresPolarity: true, allowsSeries: true },
  pins: [
    { id: "A", x: 20, y: -3, conductive: true },
    { id: "K", x: 20, y: 120, conductive: true },
  ],
  factory: () => new ZenerDiode(),
};

VirtualLDR.manifest = {
  id:               "ldr",
  label:            "Photoresistor",
  group:            "Basic",
  imageSrc:         "../images/ldr.png",
  cssClasses:       ["ldr"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: true },
  pins: [
    { id: "A", x: 45, y: 160, conductive: true },
    { id: "B", x: 80, y: 160, conductive: true },
  ],
  factory: () => new VirtualLDR(),
};

RGBLed.manifest = {
  id:               "rgb-led",
  label:            "RGB LED",
  group:            "Basic",
  imageSrc:         "../images/rgb.png",
  cssClasses:       ["rgb-led"],
  
  physics:          { conductive: false, requiresClosedLoop: true, requiresPolarity: true, allowsSeries: false },
  pins: [
    { id: "R",   x: 30, y: 260, conductive: true },
    { id: "G",   x: 60, y: 260, conductive: true },
    { id: "B",   x: 130, y: 260, conductive: true },
    { id: "GND", x: 160, y: 260, power: "GND" },
  ],
  factory: () => new RGBLed(),
};

VirtualBuzzer.manifest = {
  id:               "buzzer",
  label:            "Buzzer",
  group:            "Basic",
  imageSrc:         "../images/buuzer.png",
  cssClasses:       ["buzzer"],
  physics:          { conductive: false, requiresClosedLoop: true, requiresPolarity: true, allowsSeries: false },
  pins: [
    { id: "Anode", x: 45, y: 5, power: "VCC" },
    { id: "Cathode", x: 45, y: 83, power: "GND" },
  ],
  factory: () => new VirtualBuzzer(),
};

VirtualDCMotor.manifest = {
  id:               "dcmotor",
  label:            "DC Motor",
  group:            "Output",
  imageSrc:         "../images/dcmotor.png",
  cssClasses:       ["dcmotor"],
  physics:          { conductive: false, requiresClosedLoop: true, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "motor",
  pins: [
    { id: "VCC", x: 60, y: 45, conductive: true },
    { id: "GND", x: 150, y: 45, conductive: true },
  ],
  factory: () => new VirtualDCMotor(),
};

VirtualGearMotor.manifest = {
  id:               "gearmotor",
  label:            "Gear Motor",
  group:            "Output",
  imageSrc:         "../images/gear.png",
  cssClasses:       ["gear-motor"],
  physics:          { conductive: false, requiresClosedLoop: true, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "gearmotor",
 pins: [
    { id: "VCC", x: 60, y: 25, conductive: true },
    { id: "GND", x: 140, y: 25, conductive: true },
  ],
  factory: () => new VirtualGearMotor(),
};

ServoMotor.manifest = {
  id:               "servo",
  label:            "Servo",
  group:            "Output",
  imageSrc:         "../images/servo.png",
  cssClasses:       ["servo"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "servo",
  pins: [
    { id: "VCC", x: 243, y: 60, power: "VCC" },
    { id: "GND", x: 223, y: 60, power: "GND" },
    { id: "SIG", x: 263, y: 60, signal: true },
  ],
  factory: (ctx) => new ServoMotor(ctx?.digitalOutputs ?? {}),
};

SevenSegment1.manifest = {
  id:               "7-segment",
  label:            "7-Segment",
  group:            "Output",
  imageSrc:         "../images/7-segment.png",
  cssClasses:       ["seven-segment"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "seg7",
  pins: [
    { id: "A",   x: 20,  y: 10, conductive: true },
    { id: "B",   x: 40,  y: 10, conductive: true },
    { id: "C",   x: 60,  y: 10, conductive: true },
    { id: "D",   x: 80,  y: 10, conductive: true },
    { id: "E",   x: 100, y: 10, conductive: true },
    { id: "F",   x: 120, y: 10, conductive: true },
    { id: "G",   x: 140, y: 10, conductive: true },
    { id: "COM", x: 80,  y: 90, power: "GND" },
  ],
  factory: () => new SevenSegment1(),
};

FourDigitSevenSegment.manifest = {
  id:               "4-digit-7-segment",
  label:            "Digital Clock",
  group:            "Output",
  imageSrc:         "../images/digitalclock.png",
  cssClasses:       ["four-digit-seg"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "seg4",
  pins: [
    { id: "CLK", x: 110, y: 123, signal: true },
    { id: "DIO", x: 130, y: 123, signal: true },
    { id: "VCC", x: 150, y: 123, power: "VCC" },
    { id: "GND", x: 170, y: 123, power: "GND" },
  ],
  factory: () => new FourDigitSevenSegment(),
};

I2CLcd16x2.manifest = {
  id:               "lcd",
  label:            "LCD",
  group:            "Output",
  imageSrc:         "../images/lcd.png",
  cssClasses:       ["lcd-16x2"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "lcd",
  pins: [
    { id: "VCC", x: 20,  y: 10, power: "VCC" },
    { id: "GND", x: 50,  y: 10, power: "GND" },
    { id: "SDA", x: 80,  y: 10, signal: true },
    { id: "SCL", x: 110, y: 10, signal: true },
  ],
  factory: () => new I2CLcd16x2(),
};

PushButtons.manifest = {
  id:               "pushbutton",
  label:            "Push Button",
  group:            "Sensors & Input",
  imageSrc:         "../images/push.png",
  cssClasses:       ["pushbutton"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
pins: [
  { id: "A1", x: 28, y: 110 },  // class se match
  { id: "A2", x: 28, y: 20  },
  { id: "B1", x: 92, y: 110 },  // 80 → 92
  { id: "B2", x: 92, y: 20  },
],
  factory: (ctx) => new PushButtons(ctx?.digitalInputs ?? {}),
};

ToggleSwitch.manifest = {
  id         : "toggleSwitch",
  label      : "Toggle Switch",
  group      : "Sensors & Input",
  imageSrc   : "../images/togle.png",
  cssClasses : ["toggleSwitch"],
  physics    : {
    conductive         : true,
    requiresClosedLoop : false,
    requiresPolarity   : false,
    allowsSeries       : false,
  },
  pins: [
    { id: "T1",  x: 25, y: 130, conductive: true },
    { id: "COM", x: 50, y: 130, conductive: true },
    { id: "T2",  x: 75, y: 130, conductive: true },
  ],
  factory: (ctx) => new ToggleSwitch(ctx ?? {}),
};

VirtualTiltSensor.manifest = {
  id:               "tiltSensor",
  label:            "Tilt Sensor",
  group:            "Sensors & Input",
  imageSrc:         "../images/tilt.png",
  cssClasses:       ["tiltSensor"],
  physics:          { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  pins: [
    { id: "OUT", x: 40, y: 65, conductive: true },
    { id: "GND", x: 110, y: 65, conductive: true },
  ],
  factory: (ctx) => new VirtualTiltSensor(ctx?.digitalInputs ?? {}),
};

TouchSensor.manifest = {
  id:               "touchSensor",
  label:            "Touch Sensor",
  group:            "Sensors & Input",
  imageSrc:         "../images/touch.jpg",
  cssClasses:       ["touchSensor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  pins: [
    { id: "VCC", x: 30, y: 110, power: "VCC" },
    { id: "GND", x: 65, y: 110, power: "GND" },
    { id: "SIG", x: 100, y: 110, signal: true },
  ],
  factory: (ctx) => new TouchSensor(ctx?.digitalInputs ?? {}),
};

PIRSensor.manifest = {
  id:               "pir-sensor",
  label:            "PIR Sensor",
  group:            "Sensors & Input",
  imageSrc:         "../images/pir.png",
  cssClasses:       ["pir-sensor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  pins: [
    { id: "VCC", x: 20, y: 10, power: "VCC" },
    { id: "GND", x: 50, y: 10, power: "GND" },
    { id: "OUT", x: 80, y: 10, signal: true },
  ],
  factory: (ctx) => new PIRSensor(ctx?.digitalInputs ?? {}),
};

SoundSensor.manifest = {
  id:               "sound-sensor",
  label:            "Sound Sensor",
  group:            "Sensors & Input",
  imageSrc:         "../images/soundsensor.png",
  cssClasses:       ["sound-sensor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  pins: [
    { id: "VCC",  x: 16, y: 220, power: "VCC" },
    { id: "GND",  x: 30, y: 220, power: "GND" },
    { id: "DOUT", x: 43, y: 220, signal: true },
    { id: "AOUT", x: 55, y: 220, signal: true },
  ],
  factory: (ctx) => new SoundSensor(ctx?.digitalInputs ?? {}),
};

FlameSensor.manifest = {
  id:               "flame-sensor",
  label:            "Flame Sensor",
  group:            "Sensors & Input",
  imageSrc:         "../images/flame.png",
  cssClasses:       ["flame-sensor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
pins: [
    { id: "VCC",  x: 16, y: 220, power: "VCC" },
    { id: "GND",  x: 30, y: 220, power: "GND" },
    { id: "DOUT", x: 43, y: 220, signal: true },
    { id: "AOUT", x: 55, y: 220, signal: true },
  ],
  factory: (ctx) => new FlameSensor(ctx?.digitalInputs ?? {}),
};

VirtualVibrationSensor.manifest = {
  id:               "vibrationSensor",
  label:            "Vibration Sensor",
  group:            "Sensors & Input",
  imageSrc:         "../images/vibration.png",
  cssClasses:       ["vibration-sensor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  pins: [
    { id: "VCC", x: 20, y: 10, power: "VCC" },
    { id: "GND", x: 50, y: 10, power: "GND" },
    { id: "OUT", x: 80, y: 10, signal: true },
  ],
  factory: (ctx) => new VirtualVibrationSensor(ctx?.digitalInputs ?? {}),
};

IRSensor.manifest = {
  id:               "ir-sensor",
  label:            "IR Sensor",
  group:            "Sensors & Input",
  imageSrc:         "images/ir.png",
  cssClasses:       ["ir-sensor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  pins: [
    { id: "VCC", x: 20, y: 10, power: "VCC" },
    { id: "GND", x: 50, y: 10, power: "GND" },
    { id: "OUT", x: 80, y: 10, signal: true },
  ],
  factory: () => new IRSensor(),
};

VirtualNPNTransistor.manifest = {
  id:               "npnTransistor",
  label:            "NPN BJT",
  group:            "Misc",
  imageSrc:         "../images/npn.png",
  cssClasses:       ["npn-transistor"],
  physics:          { conductive: false, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: false },
  instanceNameBase: "npnTransistor",
  pins: [
    { id: "B", x: 20, y: 50, signal: true },
    { id: "C", x: 60, y: 10, conductive: true },
    { id: "E", x: 60, y: 90, conductive: true },
  ],
  factory: () => new VirtualNPNTransistor(),
};

const ALL = [
  VirtualBattery9V,
  VirtualCoinBattery,
  VirtualRegulator7805,
  Capacitor,
  PolorizedCapacitor,
  VirtualInductor,
  VirtualBulb,
  ZenerDiode,
  VirtualLDR,
  RGBLed,
  VirtualBuzzer,
  VirtualDCMotor,
  VirtualGearMotor,
  ServoMotor,
  SevenSegment1,
  FourDigitSevenSegment,
  I2CLcd16x2,
  PushButtons,
  ToggleSwitch,
  VirtualTiltSensor,
  TouchSensor,
  PIRSensor,
  SoundSensor,
  FlameSensor,
  VirtualVibrationSensor,
  IRSensor,
  VirtualNPNTransistor,
];

const TYPE_MAP = Object.create(null);
for (const C of ALL) {
  if (C?.manifest?.id) TYPE_MAP[C.manifest.id] = C;
}

export const LOADER_IDS = new Set(Object.keys(TYPE_MAP));

LOADER_IDS.add("resistor");
LOADER_IDS.add("diode");
LOADER_IDS.add("breadboard30");
LOADER_IDS.add("potentiometer");
for (const m of LOGIC_IC_MODELS)      LOADER_IDS.add(m);
for (const m of MOTOR_DRIVER_MODELS)  LOADER_IDS.add(m);
for (const m of MQ_SENSOR_MODELS)     LOADER_IDS.add(m);

export function buildSidebar() {
  const grid = document.querySelector(".components-grid");
  if (!grid) return;

  const groups = Object.create(null);
  for (const C of ALL) {
    const m = C.manifest;
    const g = m.group ?? "Misc";
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  }

  for (const [groupName, items] of Object.entries(groups)) {
    let header = [...grid.querySelectorAll(".comp-group")]
      .find(el => el.textContent.trim() === groupName);

    if (!header) {
      header = document.createElement("div");
      header.className   = "comp-group";
      header.textContent = groupName;
      grid.appendChild(header);
    }

    for (const m of items) {
      if (grid.querySelector(`[id="${m.id}"]`)) continue;
      const card     = document.createElement("div");
      card.className = "component-card";
      card.innerHTML = `
        <img id="${m.id}" class="comp-img" src="${m.imageSrc ?? ""}" alt="${m.label}" draggable="false" />
        <div class="component-label">${m.label}</div>
      `;
      grid.appendChild(card);
    }
  }
}

export function makeLoaderSpawner(
  workspace,
  wireSys,
  pinsArray,
  deleteSystem,
  startDragFn,
  openResistorEditor,
  digitalInputs,
  digitalOutputs
) {
  const ctx = { digitalInputs, digitalOutputs };

  return async function spawnLoaded(type, x = 0, y = 0, forcedId = null, skipUndo = false) {

    if (LOGIC_IC_MODELS.has(type)) {
      return spawnLogicIC(type, x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn);
    }

    if (MOTOR_DRIVER_MODELS.has(type)) {
      return spawnMotorDriver(type, x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn);
    }

    if (MQ_SENSOR_MODELS.has(type)) {
      return await spawnMQSensor(type, x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn);
    }

    if (type === "resistor") {
      return spawnResistor(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn, openResistorEditor);
    }

    if (type === "diode") {
      return spawnDiode(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn);
    }

    if (type === "breadboard30") {
      return spawnBreadboard(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn);
    }

    if (type === "potentiometer") {
      return await spawnPotentiometer(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn, ctx);
    }

    const C = TYPE_MAP[type];
    if (!C) return false;

    const m      = C.manifest;
    const compId = registry.generateId(m.id, forcedId);

    let instance;
    try {
      instance = m.factory ? m.factory(ctx) : new C();
    } catch (err) {
      console.error(`[ComponentLoader] factory() failed for "${type}":`, err);
      return false;
    }

    const svg = instance.getElement?.();
    if (!svg) {
      console.error(`[ComponentLoader] getElement() returned nothing for "${type}"`);
      return false;
    }

    if (svg.hasAttribute("transform")) {
      svg.setAttribute("transform", `translate(${x}, ${y})`);
    } else {
      svg.setAttribute("x", x);
      svg.setAttribute("y", y);
    }

    svg.classList.add("draggable", ...(m.cssClasses ?? []));
    svg.dataset.type = m.id;
    svg.dataset.id   = compId;
    svg.__instance   = instance;

    if (m.pins?.length) {
      const Pins = new createPins(svg, wireSys, pinsArray);
      for (const p of m.pins) {
        Pins.createPin(svg, p.x, p.y, p.size ?? 10, p.size ?? 10, p.id);
      }
    }

    svg.addEventListener("mousedown", startDragFn);
    workspace.appendChild(svg);

    let instanceName;
    if (m.instanceNameBase) {
      const existing = registry.getAll().filter(c => c.type === m.id);
      instanceName   = existing.length === 0
        ? m.instanceNameBase
        : `${m.instanceNameBase}-${existing.length + 1}`;
      if (Object.prototype.hasOwnProperty.call(instance, "instanceName")) {
        instance.instanceName = instanceName;
      }
    }

    const pins = (m.pins ?? []).map(p => ({
      id:         p.id,
      conductive: p.conductive ?? !(p.power || p.signal),
      power:      p.power  ?? null,
      signal:     p.signal ?? null,
      pinKey:     `${compId}:${p.id}`,
    }));

    const payload = {
      id:      compId,
      type:    m.id,
      instance,
      svg,
      pins,
      physics: m.physics ?? {},
    };

    if (m.model)      payload.model        = m.model;
    if (instanceName) payload.instanceName = instanceName;

    registry.registerComponent(payload);
    deleteSystem.registerComponent(svg);

    return true;
  };
}

function spawnResistor(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn, openResistorEditor) {
  const id       = registry.generateId("resistor", forcedId);
  const resistor = new Resistor("1kΩ", {}, id, null, openResistorEditor);
  const svg      = resistor.getElement();

  svg.id           = id;
  svg.dataset.id   = id;
  svg.dataset.type = "resistor";
  svg.classList.add("draggable");
  svg.setAttribute("x", x);
  svg.setAttribute("y", y);
  svg.__instance   = resistor;

  resistor.pinA = "T1";
  resistor.pinB = "T2";

  const Pins = new createPins(svg, wireSys, pinsArray);
  Pins.createPin(svg, 30,  2, 15, 15, "T1");
  Pins.createPin(svg, 30, 164, 15, 15, "T2");

  registry.registerComponent({
    id,
    type:     "resistor",
    instance: resistor,
    svg,
    pins:    [{ id: "T1", conductive: true }, { id: "T2", conductive: true }],
    physics: { conductive: true, requiresClosedLoop: false, requiresPolarity: false, allowsSeries: true },
  });

  svg.addEventListener("mousedown", startDragFn);
  workspace.appendChild(svg);
  deleteSystem.registerComponent(svg);
  return true;
}

function spawnDiode(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn) {
  const id    = registry.generateId("diode", forcedId);
  const diode = new Diode({}, null, id);
  const svg   = diode.getElement();

  svg.id = svg.dataset.id = id;
  svg.dataset.type = "diode";
  svg.classList.add("draggable");
  svg.setAttribute("x", x);
  svg.setAttribute("y", y);
  svg.__instance = diode;

  const Pins = new createPins(svg, wireSys, pinsArray);
  Pins.createPin(svg, 10,  64, 10, 10, "A");
  Pins.createPin(svg, 119, 64, 10, 10, "K");

  registry.registerComponent({
    id, type: "diode", instance: diode, svg,
    pins:    [{ id: "A", conductive: true }, { id: "K", conductive: true }],
    physics: { conductive: true, requiresClosedLoop: true, requiresPolarity: true, allowsSeries: true, blocksReverse: true },
  });

  svg.addEventListener("mousedown", startDragFn);
  workspace.appendChild(svg);
  deleteSystem.registerComponent(svg);
  return true;
}

function spawnBreadboard(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn) {
  const compId     = registry.generateId("breadboard", forcedId);
  const breadboard = new Breadboard(compId, wireSys, pinsArray);
  const svg        = breadboard.getElement();

  svg.classList.add("breadboard", "draggable");
  svg.dataset.type = "breadboard";
  svg.dataset.id   = compId;
  svg.__instance   = breadboard;
  svg.style.willChange = "transform";
  svg.setAttribute("transform", `translate(${x}, ${y})`);

  svg.addEventListener("mousedown", startDragFn);
  workspace.prepend(svg);
  registry.registerComponent({ id: compId, type: "breadboard", instance: breadboard, svg, pins: [] });
  deleteSystem.registerComponent(svg);
  return true;
}

async function spawnPotentiometer(x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn, ctx) {
  const compId = registry.generateId("potentiometer", forcedId);

  let data;
  try {
    const res = await fetch("/components/potentiometer.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("[ComponentLoader] potentiometer.json load failed:", err);
    return false;
  }

  const instance = new PotentiometerIC(compId, data);
  const svg      = instance.getElement ? instance.getElement() : instance.svg;

  svg.classList.add("potentiometer", "draggable");
  svg.dataset.type = "potentiometer";
  svg.dataset.id   = compId;
  svg.__instance   = instance;
  svg.setAttribute("x", x);
  svg.setAttribute("y", y);

  const existing    = registry.getAll().filter(c => c.type === "potentiometer");
  const instanceName = existing.length === 0 ? "pot" : `pot-${existing.length + 1}`;
  if (Object.prototype.hasOwnProperty.call(instance, "instanceName")) {
    instance.instanceName = instanceName;
  }

  const Pins = new createPins(svg, wireSys, pinsArray);
  const pinSource = data.pins ?? data.visual?.pins ?? [];
  pinSource.forEach(pin => Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id));

  svg.addEventListener("mousedown", startDragFn);
  workspace.appendChild(svg);

  const pins = pinSource.map(p => ({
    id:     p.id,
    number: p.connectedTo?.pinNumber ?? null,
  }));

  registry.registerComponent({
    id: compId, type: "potentiometer", instance, svg, pins, instanceName,
  });
  deleteSystem.registerComponent(svg);
  return true;
}

function spawnLogicIC(modelName, x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn) {
  const compId     = registry.generateId(`ic-${modelName}`, forcedId);
  const icInstance = new LogicIC(compId, modelName, wireSys, pinsArray);
  const svg        = icInstance.getElement();

  svg.classList.add("logic-ic", "draggable");
  svg.dataset.type  = "logic-ic";
  svg.dataset.id    = compId;
  svg.dataset.model = modelName;
  svg.__instance    = icInstance;
  svg.style.willChange = "transform";
  svg.setAttribute("transform", `translate(${x}, ${y})`);

  svg.addEventListener("mousedown", startDragFn);
  workspace.appendChild(svg);

  registry.registerComponent({
    id: compId, type: "logic-ic", model: modelName, instance: icInstance, svg,
    pins: icInstance.pins.map(p => ({ id: p.id, element: p.element })),
  });
  deleteSystem.registerComponent(svg);
  return true;
}

function spawnMotorDriver(modelName, x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn) {
  const compId     = registry.generateId(`ic-${modelName}`, forcedId);
  const icInstance = new MotorDriverIC(compId, modelName, wireSys, pinsArray);
  const svg        = icInstance.getElement();

  svg.classList.add("motor-driver-ic", "draggable");
  svg.dataset.id    = compId;
  svg.dataset.type  = "motor-driver";
  svg.dataset.model = modelName;
  svg.__instance    = icInstance;
  svg.style.willChange = "transform";
  svg.setAttribute("transform", `translate(${x}, ${y})`);

  svg.addEventListener("mousedown", startDragFn);
  workspace.appendChild(svg);

  registry.registerComponent({
    id: compId, type: "motor-driver", model: modelName, instance: icInstance, svg,
    pins: icInstance.pins.map(p => ({ id: p.id, element: p.element })),
  });
  deleteSystem.registerComponent(svg);
  return true;
}

function spawnMQSensor(type, x, y, forcedId, workspace, wireSys, pinsArray, deleteSystem, startDragFn) {
 
  const data = MQ_SENSOR_DATA[type];
  if (!data) {
    console.error(`[ComponentLoader] MQ sensor "${type}" not found in inline data.`);
    return false;
  }
 console.log(data)
  const compId   = registry.generateId(data.name.toLowerCase(), forcedId);
  const mqSensor = new MQSensorIC(compId, data);
  const svg      = mqSensor.getElement();
 
  svg.__instance   = mqSensor;
  svg.classList.add("mq-sensor", "draggable");
  svg.dataset.type  = data.name;
  svg.dataset.id    = compId;
  svg.dataset.model = data.name;
 
  svg.addEventListener("mousedown", e => {
    if (e.target.closest("#mq-pot-knob")) return;
    startDragFn(e);
    const onMove = () => mqSensor.positionSmokeBox?.();
    const onUp   = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  });
 
  const Pins    = new createPins(svg, wireSys, pinsArray);
  const pinDefs = mqSensor.getPinDefs();
  for (const pin of pinDefs) {
    Pins.createPin(svg, pin.x, pin.y, 10, 10, pin.id);
  }
 
  svg.setAttribute("x", x);
  svg.setAttribute("y", y);
  workspace.appendChild(svg);
 
  registry.registerComponent({
    id:       compId,
    type:     data.name,
    model:    data.name,
    instance: mqSensor,
    svg,
    pins: pinDefs.map(p => ({ id: p.id, pinKey: `${compId}:${p.id}` })),
  });
  deleteSystem.registerComponent(svg);
  return true;
}