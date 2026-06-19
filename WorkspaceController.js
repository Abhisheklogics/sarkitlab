/**
 * WorkspaceController.js
 * 
 * Fixes:
 * 1. fitToView — moves ALL components in SVG coordinate space so wires
 *    (which are anchored to pin DOM positions) stay attached. No viewBox tricks.
 * 2. centerCircuit — same approach, shift components not viewBox.
 * 3. Workspace pan (drag empty bg) — works correctly with any viewBox.
 * 4. Buttons injected cleanly.
 */

export default class WorkspaceController {

  constructor(workspace, registry, wireSys, options = {}) {
    this.workspace      = workspace;
    this.registry       = registry;
    this.wireSys        = wireSys;
    this.btnContainerId = options.btnContainerId ?? "workspaceBtns";

    this._isDragging    = false;
    this._startX        = 0;
    this._startY        = 0;
    this._compSnapshots = [];

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp   = this._onMouseUp.bind(this);
  }

  mount() {
    this._injectButtons();
    this._attachWorkspaceDrag();
  }

  // ─── PUBLIC ───────────────────────────────────────────────────────────────

  /**
   * Move all components so the circuit bounding box fills the visible viewport
   * with `padding` px of breathing room on each side.
   * We ONLY move components (in SVG-space). Wires are path elements anchored
   * to pin getBoundingClientRect() so after a DOM layout pass they re-attach.
   */
  fitToView(padding = 50) {
    const bounds = this._getCircuitBounds();
    if (!bounds) return;

    const wsRect = this.workspace.getBoundingClientRect();
    if (wsRect.width === 0 || wsRect.height === 0) return;

    // Available screen area (pixels)
    const availW = wsRect.width  - padding * 2;
    const availH = wsRect.height - padding * 2;

    // Current circuit size in SVG units
    const cirW = bounds.width;
    const cirH = bounds.height;
    if (cirW === 0 || cirH === 0) return;

    // Scale factor so circuit fits the viewport (don't zoom > 1 for tiny circuits)
    const scaleX = availW / cirW;
    const scaleY = availH / cirH;
    const scale  = Math.min(scaleX, scaleY, 1.5);

    // Target top-left corner in SVG units so the scaled circuit is centered
    const newCirW = cirW * scale;
    const newCirH = cirH * scale;

    // We set a viewBox that "zooms" to show a region where components fit,
    // then shift components to that region.
    // Strategy: reset viewBox to natural size, then shift all components.

    // 1. Reset viewBox to match pixel size (1:1 mapping)
    const vbW = wsRect.width;
    const vbH = wsRect.height;
    this.workspace.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);

    // 2. Where should the top-left of the circuit be in the new 1:1 SVG space?
    const targetX = padding + (availW - newCirW) / 2;
    const targetY = padding + (availH - newCirH) / 2;

    // 3. How much do we need to move each component?
    const dx = (targetX - bounds.minX * scale);
    const dy = (targetY - bounds.minY * scale);

    // 4. Apply scale + translate to every component
    this._transformAllComponents(scale, dx, dy, bounds);

    // 5. Update all wires (they track pin DOM positions)
    this._refreshAllWires();
  }

  centerCircuit() {
    const bounds = this._getCircuitBounds();
    if (!bounds) return;

    const wsRect = this.workspace.getBoundingClientRect();
    const vb     = this._getViewBox();

    // Center of viewport in SVG units
    const vpCX = vb.x + vb.w / 2;
    const vpCY = vb.y + vb.h / 2;

    // Center of circuit in SVG units
    const cirCX = bounds.minX + bounds.width  / 2;
    const cirCY = bounds.minY + bounds.height / 2;

    const dx = vpCX - cirCX;
    const dy = vpCY - cirCY;

    this._shiftAllComponents(dx, dy);
    this._refreshAllWires();
  }

  // ─── PRIVATE: Geometry ────────────────────────────────────────────────────

  _getCircuitBounds() {
    const all = this.registry.getAll();
    if (!all.length) return null;

    let minX =  Infinity, minY =  Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    all.forEach(comp => {
      const svg = comp.svg;
      if (!svg) return;
      const pos = this._getPos(svg);
      const w   = parseFloat(svg.getAttribute("width"))  || 120;
      const h   = parseFloat(svg.getAttribute("height")) || 80;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + w);
      maxY = Math.max(maxY, pos.y + h);
    });

    if (!isFinite(minX)) return null;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Scale each component around the circuit's top-left corner, then translate.
   * This is what makes FitView work: every SVG coordinate gets scaled so the
   * wire endpoints (recalculated from pin DOM positions after layout) match.
   */
  _transformAllComponents(scale, dx, dy, bounds) {
    this.registry.getAll().forEach(comp => {
      const svg = comp.svg;
      if (!svg) return;

      const pos    = this._getPos(svg);
      const newX   = (pos.x - bounds.minX) * scale + bounds.minX + dx;
      const newY   = (pos.y - bounds.minY) * scale + bounds.minY + dy;

      // Also scale width/height for non-transform components
      const hasTransform = !!svg.getAttribute("transform")?.includes("translate");
      if (hasTransform) {
        svg.setAttribute("transform", `translate(${newX}, ${newY})`);
      } else {
        svg.setAttribute("x", newX);
        svg.setAttribute("y", newY);

        const w = parseFloat(svg.getAttribute("width"));
        const h = parseFloat(svg.getAttribute("height"));
        if (w && h) {
          svg.setAttribute("width",  w * scale);
          svg.setAttribute("height", h * scale);
        }
      }
    });
  }

  _shiftAllComponents(dx, dy) {
    this.registry.getAll().forEach(comp => {
      const svg = comp.svg;
      if (!svg) return;
      const pos = this._getPos(svg);
      this._setPos(svg, pos.x + dx, pos.y + dy);
    });
  }

  // ─── PRIVATE: Workspace pan ───────────────────────────────────────────────

  _attachWorkspaceDrag() {
    this.workspace.addEventListener("mousedown", e => {
      const tag = e.target.tagName.toLowerCase();
      // Only drag on bare svg background, not on components/pins/wires
      if (tag !== "svg" && !e.target.classList.contains("workspace-bg")) return;
      if (e.target !== this.workspace) return; // must be root svg itself

      this._isDragging     = true;
      this._startX         = e.clientX;
      this._startY         = e.clientY;

      this._compSnapshots  = this.registry.getAll().map(comp => {
        const pos = this._getPos(comp.svg);
        return { svg: comp.svg, startX: pos.x, startY: pos.y };
      });

      e.preventDefault();
      document.addEventListener("mousemove", this._onMouseMove);
      document.addEventListener("mouseup",   this._onMouseUp);
    });
  }

  _onMouseMove(e) {
    if (!this._isDragging) return;

    const wsRect = this.workspace.getBoundingClientRect();
    const vb     = this._getViewBox();
    const sx     = vb.w / wsRect.width;
    const sy     = vb.h / wsRect.height;

    const dx = (e.clientX - this._startX) * sx;
    const dy = (e.clientY - this._startY) * sy;

    this._compSnapshots.forEach(snap => {
      if (!snap.svg) return;
      this._setPos(snap.svg, snap.startX + dx, snap.startY + dy);
    });

    this._refreshAllWires();
  }

  _onMouseUp() {
    this._isDragging    = false;
    this._compSnapshots = [];
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup",   this._onMouseUp);
  }

  // ─── PRIVATE: Button injection ────────────────────────────────────────────

  _injectButtons() {
    let container = document.getElementById(this.btnContainerId);
    if (!container) {
      container = document.createElement("div");
      container.id = this.btnContainerId;
      container.style.cssText = `
        position:absolute; bottom:20px; right:20px; z-index:1000;
        display:flex; flex-direction:column; gap:8px; pointer-events:all;
      `;
      const wrapper = this.workspace.closest(".workspace-wrapper") ?? document.body;
      wrapper.appendChild(container);
    }

    const base = `
      background:#1e1e2e; color:#cdd6f4; border:1px solid #444;
      border-radius:8px; padding:8px 14px; cursor:pointer; font-size:12px;
      font-family:'Segoe UI',sans-serif; letter-spacing:.5px;
      display:flex; align-items:center; gap:6px;
      transition:background .15s, border-color .15s;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    `;

  

    const centerBtn = this._makeBtn(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/>
      </svg> Center`,
      base, "#a6e3a1", () => this.centerCircuit()
    );

   
    container.appendChild(centerBtn);
  }

  _makeBtn(html, baseStyle, hoverBorder, onClick) {
    const btn = document.createElement("button");
    btn.innerHTML = html;
    btn.style.cssText = baseStyle;
    btn.addEventListener("click", onClick);
    btn.addEventListener("mouseenter", () => {
      btn.style.background   = "#313244";
      btn.style.borderColor  = hoverBorder;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background   = "#1e1e2e";
      btn.style.borderColor  = "#444";
    });
    return btn;
  }

  // ─── PRIVATE: Helpers ─────────────────────────────────────────────────────

  _getPos(svg) {
    if (!svg) return { x: 0, y: 0 };
    const t = svg.getAttribute("transform");
    if (t) {
      const m = t.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
      if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    }
    return {
      x: parseFloat(svg.getAttribute("x")) || 0,
      y: parseFloat(svg.getAttribute("y")) || 0,
    };
  }

  _setPos(svg, x, y) {
    if (!svg) return;
    const t = svg.getAttribute("transform");
    if (t?.includes("translate")) {
      svg.setAttribute("transform", `translate(${x}, ${y})`);
    } else {
      svg.setAttribute("x", x);
      svg.setAttribute("y", y);
    }
  }

  _getViewBox() {
    const s = this.workspace.getAttribute("viewBox");
    if (s) {
      const [x, y, w, h] = s.split(/\s+/).map(Number);
      return { x, y, w, h };
    }
    const r = this.workspace.getBoundingClientRect();
    return { x: 0, y: 0, w: r.width, h: r.height };
  }

  _refreshAllWires() {
    // After DOM reflow, re-read pin positions for every wire endpoint
    requestAnimationFrame(() => {
      this.registry.getAll().forEach(comp => {
        if (comp.svg) this.wireSys.updateWiresForComponent(comp.svg);
      });
    });
  }
}