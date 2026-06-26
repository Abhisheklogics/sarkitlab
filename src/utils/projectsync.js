import { db }        from "./auth.js";
import { getSession } from "./auth.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOCAL_QUEUE_KEY     = "sks_sync_queue";
const PROJECTS_COLLECTION = "projects";
const STATS_COLLECTION    = "projectStats";

function getQueue() {
  try { return JSON.parse(localStorage.getItem(LOCAL_QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function addToQueue(item) {
  const q   = getQueue();
  const idx = q.findIndex(i => i.projectId === item.projectId);
  if (idx !== -1) q[idx] = item;
  else q.push(item);
  try { localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

function removeFromQueue(projectId) {
  const q = getQueue().filter(i => i.projectId !== projectId);
  try { localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

function localKey(projectId) {
  return `sks_proj_${projectId}`;
}

function saveLocal(projectId, data) {
  try { localStorage.setItem(localKey(projectId), JSON.stringify(data)); }
  catch (err) { console.warn("[Sync] localStorage save failed:", err.message); }
}

function loadLocal(projectId) {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem(`project_${projectId}`);
    if (legacy) return JSON.parse(legacy);
    return null;
  } catch { return null; }
}

function tsFromFirestore(ts) {
  if (!ts) return null;
  if (typeof ts === "number") return ts;
  if (typeof ts === "object" && "toMillis" in ts) return ts.toMillis();
  if (typeof ts === "object" && "toDate"   in ts) return ts.toDate().getTime();
  return null;
}

function sanitizeForStorage(data) {
  const out = { ...data };
  if (out.updatedAt && typeof out.updatedAt === "object") {
    out.updatedAt = tsFromFirestore(out.updatedAt) ?? Date.now();
  }
  if (out.createdAt && typeof out.createdAt === "object") {
    out.createdAt = tsFromFirestore(out.createdAt) ?? Date.now();
  }
  return out;
}

export async function saveProjectData(projectId, data) {
  const session = getSession();
  if (!session?.uid) return { synced: false, queued: false, error: "not_logged_in" };

  const enriched = {
    ...data,
    authorUid:      session.uid,
    author:         session.displayName || session.email || "Anonymous",
    localUpdatedAt: Date.now(),
  };

  saveLocal(projectId, enriched);
  _updateLocalList(session.uid, projectId, enriched.name, enriched.slug, enriched.timestamp);

  if (!navigator.onLine) {
    addToQueue({ projectId, data: enriched, queuedAt: Date.now() });
    return { synced: false, queued: true };
  }

  try {
    const docData = {
      name:        enriched.name        || "Untitled Circuit",
      slug:        enriched.slug        || "",
      version:     enriched.version     || 3,
      isPublic:    enriched.isPublic    ?? true,
      author:      enriched.author,
      authorUid:   enriched.authorUid,
      timestamp:   enriched.timestamp   || Date.now(),
      components:  enriched.components  || [],
      wires:       enriched.wires       || [],
      arduinoCode: enriched.arduinoCode || "",
      updatedAt:   serverTimestamp(),
    };

    await setDoc(doc(db, PROJECTS_COLLECTION, projectId), docData, { merge: true });

    const withSync = { ...enriched, syncedAt: Date.now() };
    saveLocal(projectId, withSync);
    removeFromQueue(projectId);

    _updateLocalList(session.uid, projectId, enriched.name, enriched.slug, enriched.timestamp);
    return { synced: true };

  } catch (err) {
    console.error("[Sync] Firestore save failed:", err.code, err.message);
    addToQueue({ projectId, data: enriched, queuedAt: Date.now() });
    return { synced: false, queued: true, error: err.message };
  }
}

function _updateLocalList(uid, projectId, name, slug, timestamp) {
  const listKey = `all_projects_${uid}`;
  try {
    let list = JSON.parse(localStorage.getItem(listKey) || "[]");
    const idx = list.findIndex(p => p.id === projectId);
    const entry = { id: projectId, name: name || "Untitled", slug: slug || "", date: timestamp || Date.now() };
    if (idx !== -1) list[idx] = entry;
    else list.push(entry);
    localStorage.setItem(listKey, JSON.stringify(list));
  } catch {}
}

export async function syncPendingProjects() {
  if (!navigator.onLine) return;
  const session = getSession();
  if (!session?.uid) return;

  const queue = getQueue();
  if (!queue.length) return;

  for (const item of queue) {
    try {
      const d = item.data;
      await setDoc(doc(db, PROJECTS_COLLECTION, item.projectId), {
        name:        d.name        || "Untitled Circuit",
        slug:        d.slug        || "",
        version:     d.version     || 3,
        isPublic:    d.isPublic    ?? true,
        author:      d.author      || session.displayName || "Anonymous",
        authorUid:   session.uid,
        timestamp:   d.timestamp   || Date.now(),
        components:  d.components  || [],
        wires:       d.wires       || [],
        arduinoCode: d.arduinoCode || "",
        updatedAt:   serverTimestamp(),
      }, { merge: true });

      const local = loadLocal(item.projectId);
      if (local) saveLocal(item.projectId, { ...local, syncedAt: Date.now() });
      removeFromQueue(item.projectId);
      console.info("[Sync] Synced queued project:", item.projectId);
    } catch (err) {
      console.warn("[Sync] Failed to sync queued project:", item.projectId, err.code, err.message);
    }
  }
}

export async function getUserProjects(uid) {
  if (!uid) return [];

  if (navigator.onLine) {
    try {
      const q    = query(
        collection(db, PROJECTS_COLLECTION),
        where("authorUid", "==", uid),
        orderBy("updatedAt", "desc")
      );
      const snap = await getDocs(q);
      const projects = snap.docs.map(d => ({
        id: d.id,
        ...sanitizeForStorage(d.data()),
        source: "cloud",
      }));
      return projects;
    } catch (err) {
      console.warn("[Sync] Firestore getUserProjects failed:", err.code, err.message);
    }
  }

  return _getLocalProjects(uid);
}

function _getLocalProjects(uid) {
  const listKey   = `all_projects_${uid}`;
  const localList = JSON.parse(localStorage.getItem(listKey) || "[]");
  const projects  = [];
  for (const p of localList) {
    const d = loadLocal(p.id);
    if (d) projects.push({ id: p.id, ...d, source: "local" });
  }
  projects.sort((a, b) => (b.localUpdatedAt || b.timestamp || 0) - (a.localUpdatedAt || a.timestamp || 0));
  return projects;
}

export async function loadProjectData(projectId) {
  if (!projectId) return null;

  if (navigator.onLine) {
    try {
      const snap = await getDoc(doc(db, PROJECTS_COLLECTION, projectId));
      if (snap.exists()) {
        const d = sanitizeForStorage(snap.data());
        saveLocal(projectId, d);
        return { ...d, source: "cloud" };
      }
    } catch (err) {
      console.warn("[Sync] Firestore load failed:", err.code, err.message);
    }
  }

  const local = loadLocal(projectId);
  if (local) return { ...local, source: "local" };
  return null;
}

export async function deleteProjectData(projectId) {
  const session = getSession();
  try { localStorage.removeItem(localKey(projectId)); } catch {}
  try { localStorage.removeItem(`sks_stats_${projectId}`); } catch {}
  try { localStorage.removeItem(`project_${projectId}`); } catch {}
  removeFromQueue(projectId);

  if (session?.uid) {
    const listKey = `all_projects_${session.uid}`;
    try {
      const list = JSON.parse(localStorage.getItem(listKey) || "[]").filter(p => p.id !== projectId);
      localStorage.setItem(listKey, JSON.stringify(list));
    } catch {}
  }

  if (navigator.onLine) {
    try { await deleteDoc(doc(db, PROJECTS_COLLECTION, projectId)); }
    catch (err) { console.warn("[Sync] Firestore delete failed:", err.message); }
  }
}

export async function toggleLikeProject(projectId) {
  const session = getSession();
  if (!session?.uid) return null;

  const statsKey = `sks_stats_${projectId}`;
  let stats = {};
  try { stats = JSON.parse(localStorage.getItem(statsKey) || "{}"); } catch {}

  stats.likedByMe = !stats.likedByMe;
  stats.likes     = Math.max(0, (stats.likes || 0) + (stats.likedByMe ? 1 : -1));
  try { localStorage.setItem(statsKey, JSON.stringify(stats)); } catch {}

  if (navigator.onLine) {
    try {
      await setDoc(doc(db, STATS_COLLECTION, projectId), {
        likes:                          increment(stats.likedByMe ? 1 : -1),
        [`likedBy.${session.uid}`]:     stats.likedByMe,
      }, { merge: true });
    } catch (err) { console.warn("[Sync] Like sync failed:", err.message); }
  }
  return stats;
}

export async function recordProjectView(projectId, viewerUid) {
  const session = getSession();

  const seenKey = `sks_viewed_${viewerUid || "anon"}_${projectId}`;
  if (sessionStorage.getItem(seenKey)) return;

  const localData = loadLocal(projectId);
  if (session?.uid && localData?.authorUid && session.uid === localData.authorUid) return;

  if (navigator.onLine && session?.uid) {
    try {
      const snap = await getDoc(doc(db, "projects", projectId));
      if (snap.exists() && snap.data().authorUid === session.uid) return;
    } catch {}
  }

  sessionStorage.setItem(seenKey, "1");

  const statsKey = `sks_stats_${projectId}`;
  let stats = {};
  try { stats = JSON.parse(localStorage.getItem(statsKey) || "{}"); } catch {}
  stats.views = (stats.views || 0) + 1;
  try { localStorage.setItem(statsKey, JSON.stringify(stats)); } catch {}

  if (navigator.onLine) {
    try {
      await setDoc(doc(db, STATS_COLLECTION, projectId), { views: increment(1) }, { merge: true });
    } catch (err) {
      console.warn("[Sync] View sync failed:", err.message);
    }
  }
}

export async function getProjectStats(projectId) {
  const session  = getSession();
  const statsKey = `sks_stats_${projectId}`;
  let stats = {};
  try { stats = JSON.parse(localStorage.getItem(statsKey) || "{}"); } catch {}

  if (navigator.onLine) {
    try {
      const snap = await getDoc(doc(db, STATS_COLLECTION, projectId));
      if (snap.exists()) {
        const d = snap.data();
        stats = {
          ...stats,
          likes:     d.likes    || 0,
          views:     d.views    || 0,
          likedByMe: session?.uid ? !!(d.likedBy?.[session.uid]) : false,
        };
        try { localStorage.setItem(statsKey, JSON.stringify(stats)); } catch {}
      }
    } catch (err) { console.warn("[Sync] Stats fetch failed:", err.message); }
  }
  return stats;
}

window.addEventListener("online", () => {
  console.info("[Sync] Back online — syncing pending projects...");
  syncPendingProjects();
});