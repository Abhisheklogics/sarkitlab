export default class UndoRedoManager {
  constructor(registry, wireSys, spawner, workspace) {
    this.registry        = registry;
    this.wireSys         = wireSys;
    this.spawner         = spawner;
    this.workspace       = workspace;
    this._undo           = [];
    this._redo           = [];
    this._MAX            = 50;
    this._undoBtn        = null;
    this._redoBtn        = null;
    this.suppressRecord  = false;
    this._busy           = false;
    this.onPersist       = null;
  }

  mount() {
    window.addEventListener("keydown", e => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); this.redo(); }
    });
    this._sync();
  }

  pushAction(action) {
    if (this._busy || this.suppressRecord) return;
    this._undo.push(action);
    if (this._undo.length > this._MAX) this._undo.shift();
    this._redo = [];
    this._sync();
    this.onPersist?.();
  }

  async undo() {
    if (!this._undo.length || this._busy) return;
    const action = this._undo.pop();
    this._busy          = true;
    this.suppressRecord = true;
    try { await action.undo(); } catch (e) { console.warn("[UndoRedo] undo error:", e); }
    this._busy          = false;
    this.suppressRecord = false;
    this._redo.push(action);
    if (this._redo.length > this._MAX) this._redo.shift();
    this._sync();
  }

  async redo() {
    if (!this._redo.length || this._busy) return;
    const action = this._redo.pop();
    this._busy          = true;
    this.suppressRecord = true;
    try { await action.redo(); } catch (e) { console.warn("[UndoRedo] redo error:", e); }
    this._busy          = false;
    this.suppressRecord = false;
    this._undo.push(action);
    if (this._undo.length > this._MAX) this._undo.shift();
    this._sync();
  }

  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }

  setButtons(undoBtn, redoBtn) {
    this._undoBtn = undoBtn;
    this._redoBtn = redoBtn;
    this._sync();
  }

  recordSpawn(compType, compId, pos, modelOverride) {
    const spawnKey = modelOverride ?? this._spawnKey({ type: compType, model: modelOverride });
    this.pushAction({
      type: "SPAWN",
      undo: async () => {
        const comp = this.registry.getComponentById(compId);
        if (!comp) return;
        this._removeWires(comp.svg);
        this._unregister(compId);
        comp.svg?.remove();
      },
      redo: async () => {
        await this.spawner.spawnComponent(spawnKey, pos.x, pos.y, compId, true);
      },
    });
  }

  recordDelete(comp) {
    const pos      = this._getPos(comp.svg);
    const id       = comp.id;
    const key      = this._spawnKey(comp);
    const wiresnaps = this._snapWires(comp.svg);
    const props    = {
      ohms:   comp.instance?.ohms   ?? null,
      farads: comp.instance?.farads ?? null,
      henrys: comp.instance?.henrys ?? null,
    };

    this.pushAction({
      type: "DELETE",
      undo: async () => {
        await this.spawner.spawnComponent(key, pos.x, pos.y, id, true);
        await this._raf2();
        const c = this.registry.getComponentById(id);
        if (c?.instance) {
          if (props.ohms   != null && c.instance.setOhms)   c.instance.setOhms(props.ohms);
          if (props.farads != null && c.instance.setFarads) c.instance.setFarads(props.farads);
          if (props.henrys != null && c.instance.setHenrys) c.instance.setHenrys(props.henrys);
        }
        await this._restoreWires(wiresnaps);
      },
      redo: async () => {
        const c = this.registry.getComponentById(id);
        if (!c) return;
        this._removeWires(c.svg);
        this._unregister(id);
        c.svg?.remove();
      },
    });
  }

  recordWireDraw(conn) {
    if (!conn._undoId) conn._undoId = this._uid();
    const snap = this._snapWire(conn);
    this.pushAction({
      type: "WIRE_DRAW",
      undo: async () => {
        const c = this._findConn(snap._undoId, snap.from, snap.to);
        if (c) this.wireSys.removeWire(c.wire);
      },
      redo: async () => { await this._rebuildWire(snap); },
    });
  }

  recordWireDelete(conn) {
    if (!conn._undoId) conn._undoId = this._uid();
    const snap = this._snapWire(conn);
    this.pushAction({
      type: "WIRE_DELETE",
      undo: async () => { await this._rebuildWire(snap); },
      redo: async () => {
        const c = this._findConn(snap._undoId, snap.from, snap.to);
        if (c) this.wireSys.removeWire(c.wire);
      },
    });
  }

  recordMove(compId, oldPos, newPos) {
    if (Math.abs(newPos.x - oldPos.x) < 2 && Math.abs(newPos.y - oldPos.y) < 2) return;
    this.pushAction({
      type: "MOVE",
      undo: async () => { this._applyPos(compId, oldPos); },
      redo: async () => { this._applyPos(compId, newPos); },
    });
  }

  recordPropChange(compId, propName, oldVal, newVal, applier) {
    this.pushAction({
      type: "PROP",
      undo: async () => { try { applier(oldVal); } catch {} },
      redo: async () => { try { applier(newVal); } catch {} },
    });
  }

  _spawnKey(comp) {
    if (!comp) return "unknown";
    const type  = comp.type  || comp.svg?.dataset?.type  || "";
    const model = comp.model || comp.svg?.dataset?.model || "";
    if (type === "logic-ic" || type === "ic")  return model || type;
    if (type === "motor-driver")               return model || type;
    if (type?.startsWith("MQ-"))              return type;
    if (type === "pir" || type === "pir-sensor") return "pir-sensor";
    if (type === "breadboard")                return "breadboard30";
    if (type === "arduino")                   return "ArduinoUno";
    if (type === "battery")                   return "battery9v";
    if (type === "coinBattery")               return "coinBattery";
    return type;
  }

  _snapWire(conn) {
    return {
      _undoId:  conn._undoId,
      from:     this.wireSys.getPinKey(conn.startPin),
      to:       this.wireSys.getPinKey(conn.endPin),
      nodes:    JSON.parse(JSON.stringify(conn.wire?.nodes || [])),
      color:    conn.wire?.getAttribute("stroke") || "#e07b39",
      material: conn.wire?.material || "copper",
    };
  }

  _snapWires(svgEl) {
    if (!svgEl || !this.wireSys?.connections) return [];
    return this.wireSys.connections
      .filter(c => svgEl.contains(c.startPin) || svgEl.contains(c.endPin))
      .map(c => { if (!c._undoId) c._undoId = this._uid(); return this._snapWire(c); });
  }

  _removeWires(svgEl) {
    if (!svgEl || !this.wireSys) return;
    const toRemove = this.wireSys.connections.filter(
      c => svgEl.contains(c.startPin) || svgEl.contains(c.endPin)
    );
    toRemove.forEach(c => this.wireSys.removeWire(c.wire));
  }

  async _restoreWires(snaps) {
    if (!snaps?.length) return;
    await this._raf2();
    for (const s of snaps) await this._rebuildWire(s);
  }

  async _rebuildWire(snap, retries = 8) {
    if (!snap?.from || !snap?.to) return;
    const delays = [30, 60, 100, 150, 250, 400, 600, 800];
    for (let i = 0; i < retries; i++) {
      const s = this._findPin(snap.from);
      const e = this._findPin(snap.to);
      if (s && e) { this._drawWire(s, e, snap); return; }
      await this._sleep(delays[i] ?? 800);
    }
    console.warn(`[UndoRedo] Wire restore failed after ${retries} retries: ${snap.from} → ${snap.to}`);
  }

  _drawWire(startPin, endPin, snap) {
    const saved = this.wireSys._onWireFinished;
    this.wireSys._onWireFinished = null;
    try {
      this.wireSys.isDrawing = true;
      this.wireSys.startWire({ stopPropagation: () => {} }, startPin);
      const wire = this.wireSys.currentWire;
      if (!wire) return;
      wire.nodes   = JSON.parse(JSON.stringify(snap.nodes));
      wire.material = snap.material || "copper";
      wire.setAttribute("stroke", snap.color || "#e07b39");
      this.wireSys.finishWire(endPin);

      const sp = this.wireSys.getPinCenter(startPin);
      const ep = this.wireSys.getPinCenter(endPin);
      if (wire.nodes.length >= 2) {
        wire.nodes[0] = sp;
        wire.nodes[wire.nodes.length - 1] = ep;
        wire.circles?.[0]?.setAttribute("cx", sp.x);
        wire.circles?.[0]?.setAttribute("cy", sp.y);
        const li = (wire.circles?.length || 0) - 1;
        if (li >= 0) {
          wire.circles[li]?.setAttribute("cx", ep.x);
          wire.circles[li]?.setAttribute("cy", ep.y);
        }
        try { this.wireSys._updatePath?.(wire); } catch {}
      }

      const nc = this.wireSys.connections.find(c => c.wire === wire);
      if (nc && snap._undoId) nc._undoId = snap._undoId;
      this.wireSys._deleteSystem?.registerWire?.(wire);
    } finally {
      this.wireSys._onWireFinished = saved;
    }
  }

  _findConn(undoId, from, to) {
    return this.wireSys.connections.find(c =>
      c._undoId === undoId ||
      (this.wireSys.getPinKey(c.startPin) === from && this.wireSys.getPinKey(c.endPin) === to)
    ) || null;
  }

  _findPin(pinKey) {
    if (!pinKey) return null;
    const i = pinKey.lastIndexOf(":");
    if (i === -1) return null;
    const compId = pinKey.slice(0, i);
    const pinId  = pinKey.slice(i + 1);
    return (
      document.querySelector(`[data-id="${compId}"] [data-pin="${pinId}"]`) ||
      document.querySelector(`[data-id="${compId}"] circle[data-pin="${pinId}"]`) ||
      null
    );
  }

  _getPos(svg) {
    if (!svg) return { x: 0, y: 0 };
    const t = svg.getAttribute("transform");
    if (t) {
      const m = t.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
      if (m) return { x: +m[1], y: +m[2] };
    }
    return { x: parseFloat(svg.getAttribute("x")) || 0, y: parseFloat(svg.getAttribute("y")) || 0 };
  }

  _applyPos(compId, pos) {
    const comp = this.registry.getComponentById(compId);
    if (!comp?.svg) return;
    const svg = comp.svg;
    if (svg.getAttribute("transform")?.includes("translate")) {
      svg.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);
    } else {
      svg.setAttribute("x", pos.x);
      svg.setAttribute("y", pos.y);
    }
    this.wireSys.updateWiresForComponent(svg);
  }

  _unregister(id) { try { this.registry.unregisterComponent(id); } catch {} }
  _uid()          { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  _raf2()         { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  _sleep(ms)      { return new Promise(r => setTimeout(r, ms)); }

  _sync() {
    if (this._undoBtn) {
      this._undoBtn.disabled      = !this.canUndo();
      this._undoBtn.style.opacity = this.canUndo() ? "1" : "0.35";
      this._undoBtn.title         = `Undo (${this._undo.length} actions)`;
    }
    if (this._redoBtn) {
      this._redoBtn.disabled      = !this.canRedo();
      this._redoBtn.style.opacity = this.canRedo() ? "1" : "0.35";
      this._redoBtn.title         = `Redo (${this._redo.length} actions)`;
    }
  }

  exportState() {
    return {
      undoStack: this._undo.map(a => ({ type: a.type })),
      redoStack: this._redo.map(a => ({ type: a.type })),
    };
  }
}