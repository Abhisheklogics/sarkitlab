
export default class MultiPinModel {
  static getNet(comp, solver, pin) {
    return solver.findNet(comp.id, pin);
  }
}
