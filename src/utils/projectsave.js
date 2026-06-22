import { getSession } from "./auth.js";
import { saveProjectData, loadProjectData } from "./projectsync.js";

export default class ProjectStorage {
  constructor(registry, wireSys, spawnComponent, getEditorCode, setEditorCode) {
    this.registry       = registry;
    this.wireSys        = wireSys;
    this.spawnComponent = spawnComponent;
    this.getEditorCode  = getEditorCode;
    this.setEditorCode  = setEditorCode;

    const p = new URLSearchParams(window.location.search);
    this.currentProjectId = p.get("project") || null;
  }

  _storageKey() {
    const session = getSession();
    return `all_projects_${session?.uid || "Guest"}`;
  }

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

  _resolveSpawnType(comp) {
    const type  = comp.type  || comp.svg?.dataset?.type  || "";
    const model = comp.model || comp.svg?.dataset?.model || "";
    if (type === "logic-ic" || type === "ic") return model || type;
    if (type === "motor-driver")              return model || type;
    if (type?.startsWith("MQ-"))             return type;
    if (type === "pir" || type === "pir-sensor") return "pir-sensor";
    if (type === "breadboard")               return "breadboard30";
    if (type === "arduino")                  return "ArduinoUno";
    if (type === "coinBattery")              return "coinBattery";
    if (type === "battery")                  return "battery9v";
    if (type === "regulator7805")            return "regulator7805";
    return type;
  }

  _resolveSpawnTypeFromData(c) {
    if (c.spawnType)               return c.spawnType;
    if (c.type === "logic-ic")     return c.model || c.type;
    if (c.type === "motor-driver") return c.model || c.type;
    if (c.type === "pir")          return "pir-sensor";
    if (c.type === "breadboard")   return "breadboard30";
    if (c.type === "arduino")      return "ArduinoUno";
    if (c.type === "coinBattery")  return "coinBattery";
    if (c.type === "battery")      return "battery9v";
    if (c.type === "regulator7805") return "regulator7805";
    return c.type;
  }

  _slugify(name) {
    return (name || "untitled")
      .toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
  }

  _buildSavePayload(name, existingData = {}) {
    const session = getSession();

    const components = this.registry.getAll().map(comp => {
      const pos = this._getPos(comp.svg);
      return {
        id:           comp.id,
        type:         comp.type,
        spawnType:    this._resolveSpawnType(comp),
        model:        comp.model || comp.svg?.dataset?.model || null,
        instanceName: comp.instanceName || null,
        x:            pos.x,
        y:            pos.y,
        useTransform: !!(comp.svg?.getAttribute("transform")),
        mountedOn:    comp.mountedOn || null,
        properties: {
          ohms:   comp.instance?.ohms   ?? null,
          farads: comp.instance?.farads ?? null,
          henrys: comp.instance?.henrys ?? null,
        },
      };
    });

    const wires = (this.wireSys.connections || [])
      .map(conn => {
        const from = this.wireSys.getPinKey(conn.startPin);
        const to   = this.wireSys.getPinKey(conn.endPin);
        if (!from || !to) return null;
        return {
          from,
          to,
          nodes:    JSON.parse(JSON.stringify(conn.wire?.nodes || [])),
          color:    conn.wire?.getAttribute("stroke") || "#e07b39",
          material: conn.wire?.material || "copper",
        };
      })
      .filter(Boolean);

    const arduinoCode = typeof this.getEditorCode === "function"
      ? (this.getEditorCode() || "")
      : "";

    const finalName = existingData.name || name || "Untitled Circuit";
    return {
      name:        finalName,
      slug:        existingData.slug || this._slugify(finalName),
      timestamp:   Date.now(),
      version:     3,
      isPublic:    existingData.isPublic !== undefined ? existingData.isPublic : true,
      author:      session?.displayName || "Guest",
      authorUid:   session?.uid || null,
      arduinoCode,
      components,
      wires,
    };
  }

  async saveProject(projectName) {
    const session = getSession();
    if (!session) { alert("Pehle login karein!"); return null; }

    let projectId    = this.currentProjectId;
    let existingData = {};

    if (projectId) {
      const raw = localStorage.getItem(`sks_proj_${projectId}`)
               || localStorage.getItem(`project_${projectId}`);
      if (raw) {
        try { existingData = JSON.parse(raw); } catch {}
      }
    } else {
      const name = prompt("Circuit ka naam daalein:", projectName || "Untitled Circuit");
      if (!name?.trim()) return null;
      projectName           = name.trim();
      projectId             = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.currentProjectId = projectId;
    }

    const data   = this._buildSavePayload(projectName, existingData);
    const result = await saveProjectData(projectId, data);

    if (result.error === "not_logged_in") {
      alert("Session expire ho gaya, pehle login karein!");
      return null;
    }

    const storageKey = this._storageKey();
    let list = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const idx   = list.findIndex(p => p.id === projectId);
    const entry = { id: projectId, name: data.name, slug: data.slug, date: data.timestamp };
    if (idx !== -1) list[idx] = entry;
    else list.push(entry);
    localStorage.setItem(storageKey, JSON.stringify(list));

    this._updateURL(data.slug, projectId);
    this._updatePageTitle(data.name);

    if (result.synced) {
      this._toast("Project saved");
    } else if (result.queued) {
      this._toast("Saved offline — syncs when online", false, true);
    } else {
      this._toast("Saved locally", false, true);
    }

    return projectId;
  }

  async renameProject(newName) {
    const session   = getSession();
    const projectId = this.currentProjectId;
    if (!projectId || !newName?.trim()) return;

    const slug = this._slugify(newName);

    const rawKey = `sks_proj_${projectId}`;
    const raw    = localStorage.getItem(rawKey);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        d.name = newName;
        d.slug = slug;
        localStorage.setItem(rawKey, JSON.stringify(d));
      } catch {}
    }

    if (session) {
      const lk   = `all_projects_${session.uid}`;
      const list = JSON.parse(localStorage.getItem(lk) || "[]");
      const idx  = list.findIndex(p => p.id === projectId);
      if (idx !== -1) { list[idx].name = newName; list[idx].slug = slug; }
      localStorage.setItem(lk, JSON.stringify(list));
    }

    if (navigator.onLine && session) {
      try {
        const { getFirestore, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const { app } = await import("./auth.js");
        await updateDoc(doc(getFirestore(app), "projects", projectId), { name: newName, slug });
      } catch (err) {
        console.warn("[ProjectStorage] Rename Firestore update failed:", err);
      }
    }

    this._updateURL(slug, projectId);
    this._updatePageTitle(newName);
  }

  _updateURL(slug, projectId) {
    try {
      const url = new URL(window.location.href);
      if (projectId) url.searchParams.set("project", projectId);
      if (slug)      url.searchParams.set("name", slug);
      window.history.replaceState({}, "", url.toString());

      const displayEl = document.getElementById("projectUrlDisplay");
      if (displayEl) {
        const shown = `${window.location.origin}/circuit/${slug || projectId}`;
        displayEl.textContent = shown;
      }
    } catch {}
  }

  async loadProject(projectId) {
    if (!projectId) return;
    const data = await loadProjectData(projectId);
    if (!data) {
      console.warn(`[Storage] Project not found: ${projectId}`);
      this._toast("Project not found", true);
      return;
    }

    this.currentProjectId = projectId;
    this._updatePageTitle(data.name || "Untitled");
    this._updateURL(data.slug || this._slugify(data.name || "untitled"), projectId);

    const components  = data.components || [];
    const breadboards = components.filter(c => c.spawnType === "breadboard30" || c.type === "breadboard");
    const others      = components.filter(c => c.spawnType !== "breadboard30" && c.type !== "breadboard");

    for (const c of [...breadboards, ...others]) {
      try {
        const spawnType = this._resolveSpawnTypeFromData(c);
        await this.spawnComponent(spawnType, c.x ?? 100, c.y ?? 100, c.id);
        await this._raf();
        const comp = this.registry.getComponentById(c.id);
        if (!comp) continue;
        if (c.properties?.ohms   != null && comp.instance?.setOhms)   comp.instance.setOhms(c.properties.ohms);
        if (c.properties?.farads != null && comp.instance?.setFarads) comp.instance.setFarads(c.properties.farads);
        if (c.properties?.henrys != null && comp.instance?.setHenrys) comp.instance.setHenrys(c.properties.henrys);
        if (c.mountedOn) comp.mountedOn = c.mountedOn;
      } catch (err) {
        console.error(`[Storage] Failed to spawn "${c.type}" (${c.id}):`, err);
      }
    }

    await this._raf();
    await this._raf();

    for (const w of (data.wires || [])) {
      if (!w.from || !w.to) continue;
      await this._reconstructWireWithRetry(w);
    }

    if (data.arduinoCode && typeof this.setEditorCode === "function") {
      await this._raf();
      this.setEditorCode(data.arduinoCode);
    }
  }

  async _reconstructWireWithRetry(w, retries = 10) {
    const delays = [20, 40, 80, 120, 180, 250, 350, 500, 700, 1000];
    for (let i = 0; i < retries; i++) {
      const p1 = this._splitPinKey(w.from);
      const p2 = this._splitPinKey(w.to);
      if (!p1 || !p2) return;
      const startEl = this._findPinEl(p1.compId, p1.pinId);
      const endEl   = this._findPinEl(p2.compId, p2.pinId);
      if (startEl && endEl) { this._drawWire(startEl, endEl, w); return; }
      await this._sleep(delays[i] ?? 1000);
    }
    console.warn(`[Storage] Wire restore failed: ${w.from} → ${w.to}`);
  }

  _splitPinKey(key) {
    if (!key) return null;
    const i = key.lastIndexOf(":");
    if (i === -1) return null;
    return { compId: key.slice(0, i), pinId: key.slice(i + 1) };
  }

  _findPinEl(compId, pinId) {
    return (
      document.querySelector(`[data-id="${compId}"] [data-pin="${pinId}"]`) ||
      document.querySelector(`[data-id="${compId}"] circle[data-pin="${pinId}"]`) ||
      null
    );
  }

  _drawWire(startPin, endPin, w) {
    this.wireSys.isDrawing = true;
    this.wireSys.startWire({ stopPropagation: () => {} }, startPin);
    const wire = this.wireSys.currentWire;
    if (!wire) return;
    wire.nodes    = JSON.parse(JSON.stringify(w.nodes || []));
    wire.material = w.material || "copper";
    wire.setAttribute("stroke", w.color || "#e07b39");
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
  }

  exportJSON() {
    const components = this.registry.getAll().map(comp => {
      const pos = this._getPos(comp.svg);
      return {
        id:        comp.id,
        type:      comp.type,
        spawnType: this._resolveSpawnType(comp),
        model:     comp.model || null,
        x:         pos.x,
        y:         pos.y,
        properties: {
          ohms:   comp.instance?.ohms   ?? null,
          farads: comp.instance?.farads ?? null,
        },
      };
    });

    const wires = (this.wireSys.connections || []).map(conn => {
      const from = this.wireSys.getPinKey(conn.startPin);
      const to   = this.wireSys.getPinKey(conn.endPin);
      if (!from || !to) return null;
      return {
        from, to,
        nodes: JSON.parse(JSON.stringify(conn.wire?.nodes || [])),
        color: conn.wire?.getAttribute("stroke") || "#e07b39",
      };
    }).filter(Boolean);

    const arduinoCode = typeof this.getEditorCode === "function" ? this.getEditorCode() : "";
    const name        = document.getElementById("projectNameDisplay")?.textContent || "circuit";

    const blob = new Blob(
      [JSON.stringify({ name, version: 3, arduinoCode, components, wires }, null, 2)],
      { type: "application/json" }
    );
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _updatePageTitle(name) {
    const el = document.getElementById("projectNameDisplay");
    if (el) el.textContent = name;
    document.title = `${name} — SarkitLab`;
  }

  _raf()     { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _toast(msg, isError = false, isWarning = false) {
    let t = document.getElementById("_storage_toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "_storage_toast";
      Object.assign(t.style, {
        position:      "fixed",
        bottom:        "24px",
        right:         "24px",
        zIndex:        "99999",
        borderRadius:  "10px",
        padding:       "10px 20px",
        fontSize:      "13px",
        fontFamily:    "'DM Sans', sans-serif",
        boxShadow:     "0 4px 20px rgba(0,0,0,0.15)",
        transition:    "opacity .3s",
        opacity:       "0",
        pointerEvents: "none",
      });
      document.body.appendChild(t);
    }
    t.textContent      = msg;
    t.style.background = isError ? "#fef2f2" : isWarning ? "#fffbeb" : "#f0fdf4";
    t.style.color      = isError ? "#dc2626" : isWarning ? "#b45309" : "#15803d";
    t.style.border     = isError ? "1px solid #fecaca" : isWarning ? "1px solid #fde68a" : "1px solid #86efac";
    t.style.opacity    = "1";
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.style.opacity = "0"; }, 3000);
  }
}