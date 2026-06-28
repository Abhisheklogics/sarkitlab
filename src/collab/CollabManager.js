"use strict";

import { db } from "../utils/auth.js";
import {
  collection, doc, setDoc, getDocs, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLAB_COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#e91e63"];

function assignColor(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) & 0xffffffff;
  return COLLAB_COLORS[Math.abs(h) % COLLAB_COLORS.length];
}

export default class CollabManager {
  constructor({ projectId, uid, displayName, role, onRemoteOp, onPresenceUpdate }) {
    this.projectId        = projectId;
    this.uid              = uid;
    this.displayName      = displayName;
    this.role             = role;
    this.color            = assignColor(uid);
    this.onRemoteOp       = onRemoteOp      || (() => {});
    this.onPresenceUpdate = onPresenceUpdate || (() => {});

    this._seenOps        = new Set();
    this._unsubs         = [];
    this._heartbeatTimer = null;
    this._cursorTimer    = null;
    this._pendingCursor  = null;
    this._opQueue        = [];
    this._flushTimer     = null;
    this._active         = false;
  }

  async join() {
    this._active = true;
    await this._writePresence({});
    this._startHeartbeat();
    this._subscribeOps();
    this._subscribePresence();
    window.addEventListener("beforeunload", () => this.leave());
  }

  async leave() {
    if (!this._active) return;
    this._active = false;
    clearInterval(this._heartbeatTimer);
    clearTimeout(this._cursorTimer);
    clearTimeout(this._flushTimer);
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    try { await deleteDoc(doc(db, "collabSessions", this.projectId, "presence", this.uid)); } catch {}
  }

  sendOp(type, payload) {
    if (this.role === "viewer") return;
    this._opQueue.push({ type, payload });
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this._flushOps(), 80);
  }

  sendCursorMove(x, y) {
    this._pendingCursor = { x, y };
    clearTimeout(this._cursorTimer);
    this._cursorTimer = setTimeout(() => {
      if (!this._pendingCursor) return;
      this._writePresence({ cursorX: this._pendingCursor.x, cursorY: this._pendingCursor.y });
      this._pendingCursor = null;
    }, 100);
  }

  async _flushOps() {
    if (!this._opQueue.length || !this._active) return;
    const ops   = this._opQueue.splice(0);
    const batch = writeBatch(db);
    for (const op of ops) {
      const ref = doc(collection(db, "collabOps", this.projectId, "ops"));
      batch.set(ref, {
        uid:     this.uid,
        name:    this.displayName,
        type:    op.type,
        payload: op.payload,
        ts:      serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (e) {
      console.warn("[Collab] flush failed:", e);
      this._opQueue.unshift(...ops);
    }
  }

  _subscribeOps() {
    const q = query(collection(db, "collabOps", this.projectId, "ops"), orderBy("ts", "asc"));
    const unsub = onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== "added") return;
        const opId = change.doc.id;
        if (this._seenOps.has(opId)) return;
        this._seenOps.add(opId);
        const op = change.doc.data();
        if (op.uid === this.uid) return;
        this.onRemoteOp({ id: opId, ...op });
      });
    }, e => console.warn("[Collab] ops error:", e));
    this._unsubs.push(unsub);
  }

  _subscribePresence() {
    const q = collection(db, "collabSessions", this.projectId, "presence");
    const unsub = onSnapshot(q, snap => {
      const users = {};
      snap.forEach(d => {
        if (d.id === this.uid) return;
        const data = d.data();
        const age  = Date.now() - (data.lastSeen?.toMillis?.() || 0);
        if (age < 15000) users[d.id] = { ...data, color: assignColor(d.id) };
      });
      this.onPresenceUpdate(users);
    }, e => console.warn("[Collab] presence error:", e));
    this._unsubs.push(unsub);
  }

  async _writePresence(extra = {}) {
    if (!this._active) return;
    try {
      await setDoc(doc(db, "collabSessions", this.projectId, "presence", this.uid), {
        name: this.displayName, role: this.role, lastSeen: serverTimestamp(), ...extra,
      }, { merge: true });
    } catch {}
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => { if (this._active) this._writePresence({}); }, 8000);
  }

  static async pruneOldOps(projectId) {
    try {
      const cutoff = Date.now() - 30 * 60 * 1000;
      const snap   = await getDocs(query(collection(db, "collabOps", projectId, "ops"), orderBy("ts", "asc")));
      const batch  = writeBatch(db);
      let count    = 0;
      snap.docs.forEach(d => { if ((d.data().ts?.toMillis?.() || 0) < cutoff) { batch.delete(d.ref); count++; } });
      if (count > 0) await batch.commit();
    } catch {}
  }
}