export default class BaseComponent {
  constructor(id, pins) {
    this.id = id;
    this.pins = pins; // ["A", "B"] or ["C","B","E"]
  }

  validate(netlist) {
    return true; // default
  }

  behavior(netlist, dt) {
    // override in child
  }
}
