const Ir_Load = 1000;
export default class IRSensorModel {
    static solve(comp, electrical, solver) {
        const nets = solver.getNets(comp, ["VCC", "GND", "OUT"]);


        if (nets.VCC && nets.GND) {
            electrical.circuits.push({
                id: `${comp.id}_load`,
                type: "RESISTOR",
                a: nets.VCC,
                b: nets.GND,
                ohms: Ir_Load,
            });
        }

        if (nets.OUT && nets.VCC && nets.GND) {
            const isHigh = comp.instance?.state === 1;
            electrical.circuits.push({
                id: `${comp.id}_out`,
                type: "RESISTOR",
                a: nets.OUT,
                b: isHigh ? nets.VCC : nets.GND,
                ohms: 200,
            });
        }

        if (comp.instance) comp.instance._nets = nets;
    }

    static update(comp, electrical, solver) {
        const inst = comp.instance;
        if (!inst) return;

        const nets = inst._nets;
        if (!nets) return;

        const vcc = electrical.netVoltage.get(nets.VCC) ?? 0;
        const gnd = electrical.netVoltage.get(nets.GND) ?? 0;
        const powered = (vcc - gnd) >= 3.0;
        if (!powered) {
            return
        }



    }

}

