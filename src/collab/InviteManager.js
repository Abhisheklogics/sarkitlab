"use strict";

import { db }        from "../utils/auth.js";
import { getSession } from "../utils/auth.js";
import {
  doc, setDoc, getDoc, updateDoc, collection,
  serverTimestamp, query, where, getDocs,
  onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export default class InviteManager {
  constructor() {}

  async createInvite(projectId, projectName, role = "editor") {
    const session = getSession();
    if (!session?.uid) return null;
    const token = crypto.randomUUID();
    await setDoc(doc(db, "invites", token), {
      projectId,
      projectName,
      role,
      createdBy:     session.uid,
      createdByName: session.displayName || "Someone",
      expiresAt:     Date.now() + 7 * 24 * 60 * 60 * 1000,
      usedBy:        [],
    });
    return `${window.location.origin}/join?token=${token}`;
  }

  async acceptInvite(token) {
    const session = getSession();
    if (!session?.uid) return { error: "not_logged_in" };

    // Step 1: Invite fetch karo
    const invSnap = await getDoc(doc(db, "invites", token));
    if (!invSnap.exists())                 return { error: "invalid_token" };
    const inv = invSnap.data();
    if (inv.expiresAt < Date.now())        return { error: "expired" };
    if (inv.usedBy?.includes(session.uid)) return { error: "already_joined" };

    const projectId   = inv.projectId;
    const projectName = inv.projectName || "Untitled Circuit";
    const ownerUid    = inv.createdBy;
    if (!projectId) return { error: "project_not_found" };

    try {
      // updateDoc use karo — hamesha 'update' rule trigger hoga, 'create' nahi
      // Yeh tab bhi kaam karta hai jab collaborators field pehle exist nahi karti
      await updateDoc(doc(db, "projects", projectId), {
        [`collaborators.${session.uid}`]: {
          role:    inv.role,
          name:    session.displayName || "User",
          addedAt: Date.now(),
        },
      });

      // Invite ka usedBy update karo
      await updateDoc(doc(db, "invites", token), {
        usedBy: [...(inv.usedBy || []), session.uid],
      });

      // Owner ko notification
      await this.sendNotification({
        toUid:       ownerUid,
        type:        "collab_joined",
        fromUid:     session.uid,
        fromName:    session.displayName || "Someone",
        projectId,
        projectName,
      });

      return { success: true, projectId, projectName, role: inv.role };

    } catch (err) {
      console.error("[InviteManager] acceptInvite failed:", err.code, err.message);
      return { error: err.code || "unknown" };
    }
  }

  async sendNotification({ toUid, type, fromUid, fromName, projectId, projectName }) {
    if (!toUid || toUid === fromUid) return;
    try {
      await setDoc(doc(collection(db, "notifications", toUid, "items")), {
        type, fromUid, fromName, projectId,
        projectName: projectName || "",
        read:        false,
        ts:          serverTimestamp(),
      });
    } catch (e) {
      console.warn("[InviteManager] sendNotification failed:", e);
    }
  }

  listenNotifications(uid, callback) {
    if (!uid) return () => {};
    const q = query(
      collection(db, "notifications", uid, "items"),
      where("read", "==", false)
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.ts?.toMillis?.() || 0) - (a.ts?.toMillis?.() || 0));
      callback(items);
    }, () => {});
  }

  async markRead(uid, notifId) {
    try {
      await updateDoc(doc(db, "notifications", uid, "items", notifId), { read: true });
    } catch {}
  }

  async markAllRead(uid) {
    try {
      const snap = await getDocs(
        query(collection(db, "notifications", uid, "items"), where("read", "==", false))
      );
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { read: true }));
      await batch.commit();
    } catch {}
  }

  async getCollaborators(projectId) {
    try {
      const snap = await getDoc(doc(db, "projects", projectId));
      if (!snap.exists()) return {};
      return snap.data().collaborators || {};
    } catch { return {}; }
  }

  async removeCollaborator(projectId, targetUid) {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        [`collaborators.${targetUid}`]: null,
      });
    } catch (e) {
      console.warn("[InviteManager] removeCollaborator failed:", e);
    }
  }

  async changeRole(projectId, targetUid, newRole) {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        [`collaborators.${targetUid}.role`]: newRole,
      });
    } catch (e) {
      console.warn("[InviteManager] changeRole failed:", e);
    }
  }
}