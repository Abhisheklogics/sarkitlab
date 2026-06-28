"use strict";

export default class PresenceSystem {
  constructor(svgWorkspace, currentUid) {
    this.svg      = svgWorkspace;
    this.uid      = currentUid;
    this._cursors = {};
    this._overlay = null;
    this._init();
  }

  _init() {
    this._overlay    = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this._overlay.id = "collab-cursors";
    this.svg.appendChild(this._overlay);
  }

  update(users) {
    const activeIds = new Set(Object.keys(users));

    Object.keys(this._cursors).forEach(uid => {
      if (!activeIds.has(uid)) { this._cursors[uid]?.remove(); delete this._cursors[uid]; }
    });

    activeIds.forEach(uid => {
      const u = users[uid];
      if (!this._cursors[uid]) this._cursors[uid] = this._makeCursor(uid, u.color, u.name);
      const el = this._cursors[uid];
      if (u.cursorX != null && u.cursorY != null) {
        el.setAttribute("transform", `translate(${u.cursorX},${u.cursorY})`);
        el.style.display = "";
      }
    });

    this._updateAvatarBar(users);
  }

  _makeCursor(uid, color, name) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.style.pointerEvents = "none";
    g.style.display       = "none";

    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("d", "M0,0 L0,16 L4,12 L7,19 L9,18 L6,11 L11,11 Z");
    arrow.setAttribute("fill", color);
    arrow.setAttribute("stroke", "#fff");
    arrow.setAttribute("stroke-width", "1");

    const label    = (name || "User").slice(0, 12);
    const rectW    = label.length * 6 + 8;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "12"); rect.setAttribute("y", "12");
    rect.setAttribute("rx", "4"); rect.setAttribute("ry", "4");
    rect.setAttribute("width", rectW); rect.setAttribute("height", "16");
    rect.setAttribute("fill", color);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "16"); text.setAttribute("y", "24");
    text.setAttribute("fill", "#fff"); text.setAttribute("font-size", "10");
    text.setAttribute("font-family", "Inter,sans-serif");
    text.setAttribute("font-weight", "600");
    text.textContent = label;

    g.appendChild(arrow); g.appendChild(rect); g.appendChild(text);
    this._overlay.appendChild(g);
    return g;
  }

  _updateAvatarBar(users) {
    let bar = document.getElementById("collab-avatar-bar");
    if (!bar) {
      bar    = document.createElement("div");
      bar.id = "collab-avatar-bar";
      Object.assign(bar.style, {
        position: "fixed", top: "62px", right: "16px",
        display: "flex", gap: "4px", zIndex: "300", alignItems: "center",
      });
      document.body.appendChild(bar);
    }

    bar.innerHTML = "";
    const uids = Object.keys(users);
    if (!uids.length) return;

    uids.forEach(uid => {
      const u  = users[uid];
      const av = document.createElement("div");
      const ini = (u.name || "?").trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
      Object.assign(av.style, {
        width: "28px", height: "28px", borderRadius: "50%",
        background: u.color, color: "#fff", fontSize: "11px", fontWeight: "700",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.2)",
        cursor: "default", fontFamily: "Inter,sans-serif", flexShrink: "0",
      });
      av.title       = `${u.name} (${u.role})`;
      av.textContent = ini;
      bar.appendChild(av);
    });

    const cnt = document.createElement("div");
    Object.assign(cnt.style, {
      fontSize: "11px", color: "#6b7280",
      fontFamily: "Inter,sans-serif", marginLeft: "2px", whiteSpace: "nowrap",
    });
    cnt.textContent = uids.length === 1 ? "1 online" : `${uids.length} online`;
    bar.appendChild(cnt);
  }

  destroy() {
    this._overlay?.remove();
    document.getElementById("collab-avatar-bar")?.remove();
  }
}