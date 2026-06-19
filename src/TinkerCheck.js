
export class TinkerCheck {
  constructor(workspace, wireSystem,rgbLeds,registry) {
    this.workspace = workspace;
  
    this.rgbLeds=rgbLeds
    this.registry=registry
this.wireSystem=wireSystem
    this.ARDUINO = {
      PWM: [3, 5, 6, 9, 10, 11],
      DIGITAL: [...Array(14).keys()],
      ANALOG: ["A0","A1","A2","A3","A4","A5"],
      POWER: ["5V","3.3V","Vin"],
      GND: ["GND"]
    };
  }

checkAllConnections = () => {
  const netlist = this.wireSystem.buildNetlist();
this.lastNetlist = netlist;
console.log('ye deko',this.lastNetlist)
  console.log("NETS:");
  for (const [netName, pins] of netlist.nets) {
    console.log(netName, [...pins]);
  }
};



}