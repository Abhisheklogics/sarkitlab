"use strict";

export default class CreatePins {
  constructor(svg, wireSys, pinsArray, componentInstance) {
    this.svg = svg;
    this.wireSys = wireSys;
    this.pinsArray = pinsArray;
    this.componentInstance = componentInstance;
  }

  _getOrCreateTooltip() {
    const host = document.getElementById("pin-tooltip-host");
    if (host) return host;

    const div = document.createElement("div");
    div.id = "pin-tooltip-host";
    div.style.cssText = `
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      display: none;
      background: #1a1a2e;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      font-family: 'Segoe UI', monospace, sans-serif;
      color: #7dd3fc;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      transform: translateX(-50%);
    `;
    document.body.appendChild(div);
    return div;
  }

  _showTooltip(pin, pinId) {
    const tooltip = this._getOrCreateTooltip();
    tooltip.textContent = pinId;
    tooltip.style.display = "block";

    const rect = pin.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const top = rect.top - 28;

    const tooltipWidth = 100;
    const safeLeft = Math.min(
      Math.max(cx, tooltipWidth / 2),
      window.innerWidth - tooltipWidth / 2
    );

    tooltip.style.left = `${safeLeft}px`;
    tooltip.style.top  = `${Math.max(top, 5)}px`;
  }

  _hideTooltip() {
    const tooltip = document.getElementById("pin-tooltip-host");
    if (tooltip) tooltip.style.display = "none";
  }

  createPin(svg, x, y, width = 10, height = 10, pinId = "") {
    const pinGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    pinGroup.setAttribute("class", "pin-group");

    // Real-breadboard-style hole: a small dark square that is ALWAYS
    // visible at its natural size — no growing socket halo on hover,
    // no opacity-0 default. Matches the reference photo's look.
    const pin = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    pin.setAttribute("x", x);
    pin.setAttribute("y", y);
    pin.setAttribute("width", width);
    pin.setAttribute("height", height);
    pin.setAttribute("fill", "#2a2a2a");
    pin.setAttribute("stroke", "#1a1a1a");
    pin.setAttribute("stroke-width", "0.5");
    pin.setAttribute("rx", "1");
    pin.setAttribute("class", "connection-point");
    pin.setAttribute("id", "pin-" + pinId);
    pin.setAttribute("data-pin", pinId);
    pin.dataset.id = pinId;
    pin.dataset.number = pinId;
    pin.style.cursor = "crosshair";
    pin.style.pointerEvents = "all";
    pin.style.transition = "fill 0.1s ease, stroke 0.1s ease";

    let tooltipTimer = null;

    // Per-pin hover — ONLY this hole changes color. Size never changes,
    // matching the requirement that the highlighted hole stays the same
    // size as a normal hole (just a different color).
    pin.addEventListener("mouseenter", () => {
      pin.setAttribute("fill", "#5a5a8a");
      pin.setAttribute("stroke", "#88aaff");
      pin.setAttribute("stroke-width", "1.5");
      tooltipTimer = setTimeout(() => this._showTooltip(pin, pinId), 80);
    });

    pin.addEventListener("mouseleave", () => {
      clearTimeout(tooltipTimer);
      this._hideTooltip();

      if (this.wireSys.isDrawing) return; // keep highlighted while drawing a wire from it

      pin.setAttribute("fill", "#2a2a2a");
      pin.setAttribute("stroke", "#1a1a1a");
      pin.setAttribute("stroke-width", "0.5");
    });

    pin.addEventListener("mousedown", e => {
      clearTimeout(tooltipTimer);
      this._hideTooltip();

      if (this.wireSys.isDrawing && this.wireSys.currentWire) {
        return;
      }

      e.stopPropagation();
      e.preventDefault();
      this.wireSys.startWire(e, pin);
    });

    pinGroup.appendChild(pin);
    svg.appendChild(pinGroup);

    this.pinsArray.push({ pinId, element: pin, componentInstance: this.componentInstance });

    if (this.componentInstance?.addPin) {
      this.componentInstance.addPin(pinId);
    }

    return pin;
  }
}