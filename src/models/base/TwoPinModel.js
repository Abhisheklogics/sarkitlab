
import BaseModel from "./BaseModel.js";

export default class TwoPinModel extends BaseModel {
  static getNets(comp, solver, p1, p2) {
    return {
      n1: solver.findNet(comp.id, p1),
      n2: solver.findNet(comp.id, p2)
    };
  }
}