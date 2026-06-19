const BULB_TYPES = {
  toy:           { R_hot: 60,   V_rated: 5.0,  tau_heat: 0.4, tau_cool: 1.0 },
  flashlight:    { R_hot: 15,   V_rated: 3.0,  tau_heat: 0.3, tau_cool: 0.8 },
  household_40w: { R_hot: 968,  V_rated: 220,  tau_heat: 0.5, tau_cool: 1.2 },
  household_60w: { R_hot: 807,  V_rated: 220,  tau_heat: 0.5, tau_cool: 1.2 },
  household_100w:{ R_hot: 484,  V_rated: 220,  tau_heat: 0.4, tau_cool: 1.0 },
  car_12v:       { R_hot: 14.4, V_rated: 12,   tau_heat: 0.3, tau_cool: 0.8 },
};
 
const R_COLD_RATIO = 0.08;
const R_MIN        = 0.1;
 
export default class BulbModel {
 
  static solve(comp, electrical, solver) {
    const anode   = solver.findNet(comp.id, "Anode")
                 ?? solver.findNet(comp.id, "A")
                 ?? solver.findNet(comp.id, "+");
    const cathode = solver.findNet(comp.id, "Cathode")
                 ?? solver.findNet(comp.id, "K")
                 ?? solver.findNet(comp.id, "-");
    if (!anode || !cathode) return;
 
    const inst    = comp.instance;
    const btype   = BULB_TYPES[inst?.bulbType ?? "toy"];
    const R_hot   = Math.max(inst?.resistance ?? btype.R_hot, R_MIN);
    const R_cold  = Math.max(R_hot * R_COLD_RATIO, R_MIN);
    const temp    = Math.max(0, Math.min(1, inst?._tempNorm ?? 0));
    const R_actual = R_cold + (R_hot - R_cold) * temp;
 
    const branch = {
      id:   `${comp.id}_bulb`,
      type: "RESISTOR",
      a:    anode,
      b:    cathode,
      ohms: Math.max(R_actual, R_MIN),
    };
    electrical.circuits.push(branch);
 
    if (inst) {
      inst._nets   = { A: anode, K: cathode };
      inst._branch = branch;
    }
  }
 
  static update(comp, electrical, solver) {
    const inst = comp.instance;
    if (!inst?._nets) return;
 
    const branch = inst._branch;
    if (!branch) return;
 
    const Va      = electrical.netVoltage.get(branch.a) ?? 0;
    const Vb      = electrical.netVoltage.get(branch.b) ?? 0;
    const V       = Math.abs(Va - Vb);
    const current = Math.abs(branch.current ?? 0);
    const P       = V * current;
    const dt      = Math.max(1e-9, solver._dt ?? 1e-4);
 
    const btype   = BULB_TYPES[inst.bulbType ?? "toy"];
    const R_hot   = Math.max(inst.resistance ?? btype.R_hot, R_MIN);
    const V_rated = inst.ratedVoltage ?? btype.V_rated;
    const P_rated = (V_rated * V_rated) / R_hot;
 
    const tau_heat = btype.tau_heat;
    const tau_cool = btype.tau_cool;
 
    const loadNorm = P_rated > 0 ? Math.min(P / P_rated, 3.0) : 0;
    const prevTemp = inst._tempNorm ?? 0;
    const tau      = loadNorm > prevTemp ? tau_heat : tau_cool;
    const alpha    = 1 - Math.exp(-dt / tau);
    const nextTemp = Math.max(0, Math.min(1, prevTemp + (Math.min(loadNorm, 1) - prevTemp) * alpha));
 
    inst._tempNorm = nextTemp;
    inst.voltage   = V;
    inst.current   = current;
    inst.power     = P;
 
    const brightness = Math.pow(nextTemp, 2.2);
 
    if (current > 0.0001 || nextTemp > 0.01) {
      inst.setOn?.(brightness);
    } else {
      inst.setOff?.();
    }
  }
}
 