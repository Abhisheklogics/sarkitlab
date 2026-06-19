

const R_POT_MIN     = 100;     // min segment R — short circuit se bachao (Ω)
const R_POT_DEFAULT = 10_000;  // default total track resistance (Ω)

function netV(voltageMap, netId) {
  if (!netId) return 0;
  return voltageMap.get(netId) ?? 0;
}

function pushBranch(electrical, branch) {
  if (branch.a == null && branch.b == null) return;
  electrical.circuits.push(branch);
}

export default class PotentiometerModel {

  static solve(comp, electrical, solver) {
    const nets = solver.getNets(comp, ["T1", "W", "T2"]);

    // T1 aur T2 dono connected hone chahiye minimum
    if (!nets.T1 || !nets.T2) return;
    // W (wiper) optional nahi — isko bhi hona chahiye
    if (!nets.W) return;

    const inst = comp.instance ?? {};

    const maxRes = Number(inst.maxRes);
    const track  = Number.isFinite(maxRes) && maxRes > 0 ? maxRes : R_POT_DEFAULT;

    let pos = Number(inst.position);
    if (!Number.isFinite(pos)) pos = 0.5;
    pos = Math.max(0, Math.min(1, pos));   // clamp [0,1]

    const r1 = Math.max(R_POT_MIN, track * pos);
    const r2 = Math.max(R_POT_MIN, track * (1 - pos));

    // Cache nets on instance for update()
    inst._nets = nets;

    pushBranch(electrical, {
      id  : `${comp.id}_R1`,
      type: "RESISTOR",
      a   : nets.T1,
      b   : nets.W,
      ohms: r1,
    });

    pushBranch(electrical, {
      id  : `${comp.id}_R2`,
      type: "RESISTOR",
      a   : nets.W,
      b   : nets.T2,
      ohms: r2,
    });
  }

  static update(comp, electrical) {
    const nets = comp.instance?._nets;
    if (!nets?.W) return;

    // Store wiper voltage for analogRead / display
    comp.instance.lastWiperVoltage = netV(electrical.netVoltage, nets.W);

    // Update SVG text if instance has it
    const textEl = comp.svg?.querySelector("#pot-value");
    if (textEl) {
      const pos = Number(comp.instance?.position ?? 0.5);
      textEl.textContent = Math.round(pos * 100) + "%";
    }
  }
}