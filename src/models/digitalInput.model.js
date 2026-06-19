export default class DigitalInputModel {
static driveNet({ net, electrical, drive }) {
  if (!net) return;

  if (drive === "POWER") {
    electrical.powerNets.add(net);
    electrical.netState.set(net, "POWER");
    electrical.netVoltage?.set(net, 5);
  }

  if (drive === "GND") {
    electrical.gndNets.add(net);
    electrical.netState.set(net, "GND");
    electrical.netVoltage?.set(net, 0);
  }

  if (drive === "FLOAT") {
    electrical.netState.set(net, "FLOATING");
  }
}


}
