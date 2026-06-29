"use strict";

import { db }        from "./auth.js";
import { getSession } from "./auth.js";
import {
  collection, doc, setDoc, getDoc, getDocs,
  deleteDoc, query, where, orderBy,
  serverTimestamp, increment, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOCAL_QUEUE_KEY     = "sks_sync_queue";
const PROJECTS_COLLECTION = "projects";

function getQueue() {
  try { return JSON.parse(localStorage.getItem(LOCAL_QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function addToQueue(item) {
  const q   = getQueue();
  const idx = q.findIndex(i => i.projectId === item.projectId);
  if (idx !== -1) q[idx] = item; else q.push(item);
  try { localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

function removeFromQueue(projectId) {
  const q = getQueue().filter(i => i.projectId !== projectId);
  try { localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

function localKey(projectId) { return `sks_proj_${projectId}`; }

function saveLocal(projectId, data) {
  try { localStorage.setItem(localKey(projectId), JSON.stringify(data)); }
  catch (e) { console.warn("[Sync] localStorage save failed:", e.message); }
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
  if (out.updatedAt && typeof out.updatedAt === "object") out.updatedAt = tsFromFirestore(out.updatedAt) ?? Date.now();
  if (out.createdAt && typeof out.createdAt === "object") out.createdAt = tsFromFirestore(out.createdAt) ?? Date.now();
  return out;
}

function _updateLocalList(uid, projectId, name, slug, timestamp) {
  const listKey = `all_projects_${uid}`;
  try {
    let list = JSON.parse(localStorage.getItem(listKey) || "[]");
    const idx = list.findIndex(p => p.id === projectId);
    const entry = { id: projectId, name: name || "Untitled", slug: slug || "", date: timestamp || Date.now() };
    if (idx !== -1) list[idx] = entry; else list.push(entry);
    localStorage.setItem(listKey, JSON.stringify(list));
  } catch {}
}

export async function saveProjectData(projectId, data) {
  const session = getSession();
  if (!session?.uid) return { synced: false, queued: false, error: "not_logged_in" };

  const enriched = {
    ...data,
    authorUid:      session.uid,
    author:         session.displayName || session.email || "Anonymous",
    localUpdatedAt: Date.now(),
    _needsSync:     true,
  };

  saveLocal(projectId, enriched);
  _updateLocalList(session.uid, projectId, enriched.name, enriched.slug, enriched.timestamp);

  if (!navigator.onLine) {
    addToQueue({ projectId, data: enriched, queuedAt: Date.now() });
    return { synced: false, queued: true };
  }

  try {
    await setDoc(doc(db, PROJECTS_COLLECTION, projectId), {
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
    }, { merge: true });

    const withSync = { ...enriched, _needsSync: false, syncedAt: Date.now() };
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
      if (local) saveLocal(item.projectId, { ...local, _needsSync: false, syncedAt: Date.now() });
      removeFromQueue(item.projectId);
    } catch (err) {
      console.warn("[Sync] Failed to sync queued project:", item.projectId, err.code, err.message);
    }
  }
}

export async function getUserProjects(uid) {
  if (!uid) return [];
  if (navigator.onLine) {
    try {
      const snap = await getDocs(query(
        collection(db, PROJECTS_COLLECTION),
        where("authorUid", "==", uid),
        orderBy("updatedAt", "desc")
      ));
      return snap.docs.map(d => ({ id: d.id, ...sanitizeForStorage(d.data()), source: "cloud" }));
    } catch (err) {
      console.warn("[Sync] getUserProjects failed:", err.code, err.message);
    }
  }
  return _getLocalProjects(uid);
}

function _getLocalProjects(uid) {
  const list = JSON.parse(localStorage.getItem(`all_projects_${uid}`) || "[]");
  const out  = [];
  for (const p of list) {
    const d = loadLocal(p.id);
    if (d) out.push({ id: p.id, ...d, source: "local" });
  }
  out.sort((a, b) => (b.localUpdatedAt || b.timestamp || 0) - (a.localUpdatedAt || a.timestamp || 0));
  return out;
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
  try { localStorage.removeItem(localKey(projectId)); }     catch {}
  try { localStorage.removeItem(`project_${projectId}`); }  catch {}
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

export async function toggleLike(projectId) {
  const session = getSession();
  if (!session?.uid) return null;

  const ref  = doc(db, "projectStats", projectId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};

  // Firestore se actual liked state lo — localStorage pe trust mat karo
  const alreadyLiked = data.likedBy?.[session.uid] === true;
  const newState     = !alreadyLiked;

  await setDoc(ref, {
    likes:                      increment(newState ? 1 : -1),
    [`likedBy.${session.uid}`]: newState ? true : null,
  }, { merge: true });

  const newCount = Math.max(0, (data.likes || 0) + (newState ? 1 : -1));
  return { liked: newState, likes: newCount };
}

export async function getLikeStatus(projectId) {
  const session = getSession();
  if (!session?.uid || !projectId) return { liked: false, likes: 0 };
  try {
    const snap = await getDoc(doc(db, "projectStats", projectId));
    if (!snap.exists()) return { liked: false, likes: 0 };
    const data = snap.data();
    return {
      liked: data.likedBy?.[session.uid] === true,
      likes: data.likes || 0,
    };
  } catch { return { liked: false, likes: 0 }; }
}

export async function recordView(projectId) {
  const session = getSession();

  // Session-scoped deduplication — tab band hone pe reset hoti hai
  const viewerKey = `sks_viewed_${projectId}`;
  if (sessionStorage.getItem(viewerKey)) return;

  // Author apne khud ke views count nahi karein
  if (session?.uid) {
    try {
      const snap = await getDoc(doc(db, PROJECTS_COLLECTION, projectId));
      if (snap.exists() && snap.data().authorUid === session.uid) return;
    } catch {}
  }

  // localStorage mein bhi check karo — 24 ghante mein ek baar
  const localViewKey = `sks_lview_${session?.uid || "anon"}_${projectId}`;
  const lastViewed   = localStorage.getItem(localViewKey);
  const DAY_MS       = 24 * 60 * 60 * 1000;
  if (lastViewed && Date.now() - parseInt(lastViewed) < DAY_MS) return;

  // Dono jagah mark karo
  sessionStorage.setItem(viewerKey, "1");
  try { localStorage.setItem(localViewKey, String(Date.now())); } catch {}

  if (navigator.onLine) {
    try {
      await setDoc(doc(db, "projectStats", projectId), { views: increment(1) }, { merge: true });
    } catch (e) { console.warn("[Sync] View record failed:", e); }
  }
}

export async function getProjectStats(projectId) {
  const session = getSession();
  try {
    const snap = await getDoc(doc(db, "projectStats", projectId));
    if (!snap.exists()) return { likes: 0, views: 0, liked: false };
    const data = snap.data();
    return {
      likes: data.likes || 0,
      views: data.views || 0,
      liked: session?.uid ? data.likedBy?.[session.uid] === true : false,
    };
  } catch { return { likes: 0, views: 0, liked: false }; }
}

window.addEventListener("online", () => { syncPendingProjects(); });