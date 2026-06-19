export default class DeleteSystem {

  constructor(workspace, registry, wireSys, components, undoRedo = null) {
    this.workspace  = workspace;
    this.registry   = registry;
    this.wireSys    = wireSys;
    this.components = components;
    this.undoRedo   = undoRedo;

    this._selectedComponents = new Set();
    this._selectedWire       = null;

    this._initWorkspaceClick();
    this._initDeleteButton();
    this._initKeyboard();
    this._updateDeleteBtn();
  }

  _initWorkspaceClick() {
    this.workspace.addEventListener("mousedown", e => {
      const onComponent = !!e.target.closest("[data-id]");
      const onWire      = e.target.tagName === "path" && e.target.hasAttribute("stroke");
      const onPin       = e.target.classList.contains("connection-point");
      const onCircle    = e.target.tagName === "circle";

      if (onComponent || onWire || onPin || onCircle) return;
      this.clearSelection();
    });
  }

  _initDeleteButton() {
    const btn = document.getElementById("deleteBtn");
    if (!btn) return;
    btn.addEventListener("click", () => this.deleteSelected());
  }

  _initKeyboard() {
    window.addEventListener("keydown", e => {
      const t = e.target;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const hasAnything = this._selectedComponents.size > 0 || this._selectedWire;
        if (hasAnything) {
          e.preventDefault();
          this.deleteSelected();
        }
      }

      if (e.key === "Escape") this.clearSelection();
    });
  }

  registerComponent(svg) {
    if (!svg) return;
    svg.addEventListener("mousedown", e => {
      if (e.target.classList.contains("connection-point")) return;
      e.stopPropagation();
      if (e.shiftKey) {
        this._toggleComponent(svg);
      } else {
        this._selectComponentOnly(svg);
      }
    });
  }

  registerWire(wire) {
    if (!wire) return;

    wire.addEventListener("click", e => {
      e.stopPropagation();
      this._selectWire(wire);
    });
    wire.addEventListener("mouseenter", () => {
      if (this._selectedWire === wire) return;
      wire.setAttribute("stroke-width", "5");
      wire.style.filter = "drop-shadow(0 0 3px rgba(249,115,22,.4))";
    });
    wire.addEventListener("mouseleave", () => {
      if (this._selectedWire === wire) return;
      wire.setAttribute("stroke-width", "3.5");
      wire.style.filter = "";
    });
  }

  _selectComponentOnly(svg) {
    this._clearComponentHighlights();
    this._deselectWire();
    this._selectedComponents.clear();
    this._selectedComponents.add(svg);
    this._applyHighlight(svg, true);
    this._updateDeleteBtn();
  }

  _toggleComponent(svg) {
    if (this._selectedComponents.has(svg)) {
      this._selectedComponents.delete(svg);
      this._applyHighlight(svg, false);
    } else {
      this._deselectWire();
      this._selectedComponents.add(svg);
      this._applyHighlight(svg, true);
    }
    this._updateDeleteBtn();
  }

  _selectWire(wire) {
    this._clearComponentHighlights();
    this._selectedComponents.clear();
    if (this._selectedWire && this._selectedWire !== wire) {
      this._deselectWire();
    }

    this._selectedWire = wire;
    wire.setAttribute("stroke-width", "5.5");
    wire.style.filter = "drop-shadow(0 0 5px rgba(249,115,22,.8))";

    this.wireSys?._showCircles?.(wire);

    if (this.wireSys) this.wireSys.selectedWire = wire;

    this._updateDeleteBtn();
  }

  _deselectWire() {
    if (!this._selectedWire) return;
    this._selectedWire.setAttribute("stroke-width", "3.5");
    this._selectedWire.style.filter = "";
    this.wireSys?._hideCircles?.(this._selectedWire);
    if (this.wireSys) this.wireSys.selectedWire = null;
    this._selectedWire = null;
  }

  _applyHighlight(svg, on) {
    if (on) {
      svg.classList.add("selected");
      svg.style.filter = "drop-shadow(0 0 7px rgba(249,115,22,.9))";
    } else {
      svg.classList.remove("selected");
      svg.style.filter = "";
    }
  }

  _clearComponentHighlights() {
    for (const svg of this._selectedComponents) {
      this._applyHighlight(svg, false);
    }
  }

  deleteSelected() {
    let deleted = false;

    if (this._selectedWire) {
      if (this.undoRedo && !this.undoRedo.suppressRecord) {
        const conn = this.wireSys?.connections?.find(c => c.wire === this._selectedWire);
        if (conn) this.undoRedo.recordWireDelete(conn);
      }
      this._deleteWire(this._selectedWire);
      this._selectedWire = null;
      deleted = true;
    }

    if (this._selectedComponents.size > 0) {
      for (const svg of this._selectedComponents) {
        if (this.undoRedo && !this.undoRedo.suppressRecord) {
          const comp = this.registry.getComponentById(svg.dataset.id);
          if (comp) this.undoRedo.recordDelete(comp);
        }
        this._deleteComponent(svg);
      }
      this._selectedComponents.clear();
      deleted = true;
    }

    if (deleted) this._updateDeleteBtn();
  }

  _deleteComponent(svg) {
    if (!svg) return;
    const compId = svg.dataset.id;

    this._deleteWiresForComponent(svg);

    if (compId && this.registry) {
      try { this.registry.unregisterComponent(compId); }
      catch (err) { console.warn("[DeleteSystem] unregister error:", err); }
    }

    if (this.components) {
      const idx = this.components.indexOf(svg);
      if (idx !== -1) this.components.splice(idx, 1);
    }

    svg.remove();
  }

  _deleteWiresForComponent(componentEl) {
    if (!this.wireSys?.connections) return;

    this.wireSys.connections
      .filter(c => componentEl.contains(c.startPin) || componentEl.contains(c.endPin))
      .forEach(c => this._removeWireFromDOM(c.wire));

    this.wireSys.connections = this.wireSys.connections.filter(
      c => !componentEl.contains(c.startPin) && !componentEl.contains(c.endPin)
    );
  }

  _deleteWire(wire) {
    this._removeWireFromDOM(wire);
    if (this.wireSys?.connections) {
      this.wireSys.connections = this.wireSys.connections.filter(c => c.wire !== wire);
    }
    if (this.wireSys?.wireBranches) {
      this.wireSys.wireBranches = this.wireSys.wireBranches.filter(b => b._connRef?.wire !== wire);
    }
    if (this.wireSys?.selectedWire === wire) {
      this.wireSys.selectedWire = null;
    }
  }

  _removeWireFromDOM(wire) {
    wire?.remove();
    wire?.circles?.forEach(c => c?.remove());
  }

  clearSelection() {
    this._clearComponentHighlights();
    this._selectedComponents.clear();
    this._deselectWire();
    this._updateDeleteBtn();
  }

  _updateDeleteBtn() {
    const btn = document.getElementById("deleteBtn");
    if (!btn) return;
    const has = this._selectedComponents.size > 0 || !!this._selectedWire;
    btn.disabled      = !has;
    btn.style.opacity = has ? "1" : "0.5";
  }

  get selectedComponent() { return [...this._selectedComponents][0] ?? null; }
  set selectedComponent(v){ v ? this._selectComponentOnly(v) : this.clearSelection(); }
  get selectedWire()       { return this._selectedWire; }
  set selectedWire(v)      { v ? this._selectWire(v) : this._deselectWire(); }
}