export class NetlistBuilder {
  constructor(wires = []) {
    this.wires = wires;
    this.nets = new Map();
    this._parent = new Map();
    this._rank = new Map();
  }

  build() {
    for (const { from, to } of this.wires) {
      if (from && to) {
        this._ensure(from);
        this._ensure(to);
        this._union(from, to);
      }
    }
    this._resolveNets();
    return this;
  }

  _ensure(pin) {
    if (!this._parent.has(pin)) {
      this._parent.set(pin, pin);
      this._rank.set(pin, 0);
    }
  }

  _find(pin) {
    let root = pin;
    while (this._parent.get(root) !== root) root = this._parent.get(root);
    let cur = pin;
    while (cur !== root) {
      const next = this._parent.get(cur);
      this._parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  _union(a, b) {
    const ra = this._find(a);
    const rb = this._find(b);
    if (ra === rb) return;
    const rankA = this._rank.get(ra);
    const rankB = this._rank.get(rb);
    if (rankA < rankB) {
      this._parent.set(ra, rb);
    } else if (rankA > rankB) {
      this._parent.set(rb, ra);
    } else {
      this._parent.set(rb, ra);
      this._rank.set(ra, rankA + 1);
    }
  }

  _resolveNets() {
    const groups = new Map();
    for (const pin of this._parent.keys()) {
      const root = this._find(pin);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root).add(pin);
    }
    let id = 1;
    for (const [, members] of groups) {
      this.nets.set(`NET_${id++}`, members);
    }
  }
}