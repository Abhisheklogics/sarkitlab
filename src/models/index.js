import DigitalInputModel from "./digitalInput.model.js";
import LEDModel from "./diodes/LEDModel.js";
import RGBLedModel from "./diodes/RGBLedModel.js";
import ResistorModel from "./passive/ResistorModel.js";
import ServoModel from "./actuators/ServoModel.js";
import BuzzerModel from "./actuators/BuzzerModel.js";
import SevenSegmentModel from "./diodes/SevenSegmentModel.js";
import ArduinoModel from "./ArduinoModel.js";
import Battery9VModel from './digital/Battery9VModel.js'
import LogicICModel from "./digital/logicic.js";
import NPNTransistorModel from './diodes/NPNTransistorModel.js'
import DiodeModel from "./diodes/DiodeModel.js";

import BreadboardModel from "./base/BreadboardModel.js";
import { PushButtonModel } from "./digital/PushButtonModel.js";
import { TiltSensorModel } from "./digital/TiltSensorModel.js";
import { TouchSensorModel } from "./digital/TouchSensorModel.js";
import { ToggleSwitchModel } from "./digital/ToggleSwitchModel.js";
import TM1637Model from "./diodes/4-digit.js";
import LCDModel from "./actuators/LCDModel.js";
import OLEDModel   from "./actuators/OLEDMode.js";
import KeypadModel from "./digital/KeypadModel.js";
import DHT11Model  from "./Sensors/DHT11Model.js";
import Regulator7805Model from "./digital/regulator.js";
import MotorDriverModel  from "./actuators/motor.js";
import Battery3VModel from "./digital/Battery3VModel.js";
import PotentiometerModel from "./passive/PotentiometerModel.js";
import GasSensorModel from "./Sensors/gassensors.js";
import InductorModel from "./diodes/InductorModel.js";
import PcapacitorModel from "./diodes/PcapacitorModel.js";
import PirModel from './Sensors/Pirmodel.js'
import VibrationSensorModel from './Sensors/Vibrationsensormodel.js'
import HCSR04Model from "./Sensors/HCSR04Model.js";
import LDRModel    from "./Sensors/LDR.js";

import SoundSensorModel from "./Sensors/SoundSensorModel.js";
import FlameSensorModel from "./Sensors/FlameSensorModel.js";
import ZenerModel from './diodes/ZenerModel.js'
import IRSensorModel from "./Sensors/ir-sensor.js";
import BulbModel from './digital/BulbModel.js'
import GearMotorModel from "./actuators/GearMotorModel.js";
import DCMotorModel from "./actuators/MotorModel.js";
import CapacitorModel from './base/CapacitorModel.js'
export const MODEL_REGISTRY = {
  arduino: ArduinoModel,
  "ultrasonic" : HCSR04Model,
  "keypad" : KeypadModel,
'inductor':InductorModel,
"dht11"  : DHT11Model,
"sound-sensor": SoundSensorModel,
"flame-sensor": FlameSensorModel,
'polorizedcapacitor':PcapacitorModel,
"ldr": LDRModel,
  "7-segment": SevenSegmentModel,
  led: LEDModel,
  "rgb-led": RGBLedModel,
  resistor: ResistorModel,
  servo: ServoModel,
  buzzer: BuzzerModel,
   "battery9v":  Battery9VModel,
  dcmotor: GearMotorModel,
  gearmotor: GearMotorModel,
  "npnTransistor": NPNTransistorModel,
tiltSensor:TiltSensorModel,
"pushbutton":PushButtonModel,
toggleSwitch:ToggleSwitchModel,
touchSensor:TouchSensorModel,
'diode':DiodeModel,
'4-digit-7-segment':TM1637Model,
'lcd-16x2-i2c':LCDModel,
'oled':OLEDModel,
'logic-ic':LogicICModel,
'breadboard':BreadboardModel,
'regulator7805':Regulator7805Model,
"motor-driver":MotorDriverModel,
"coinBattery":Battery3VModel,
"MQ-2":GasSensorModel,
"MQ-3":GasSensorModel,
"MQ-4":GasSensorModel,
"MQ-135":GasSensorModel,
"MQ-5":GasSensorModel,
"MQ-6":GasSensorModel,
"MQ-7":GasSensorModel,
"MQ-8":GasSensorModel,
"MQ-9":GasSensorModel,
"MQ-131":GasSensorModel,
"potentiometer":PotentiometerModel,
"pir-sensor":PirModel,
"vibrationSensor":VibrationSensorModel,
 'capacitor' : CapacitorModel,
    'zener'     : ZenerModel,
    'bulb'      : BulbModel,
    "ir-sensor": IRSensorModel


};
