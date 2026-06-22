import { db } from "./auth.js";
import { getSession } from "./auth.js";
import {
  doc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MEMBER_COLORS = [
  "#4f46e5", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#db2777", "#ea580c",
];

function assignColor(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

export default class CollabManager {
  constructor(projectId, onMembersChange, onPresenceChange) {
    this.projectId = projectId;
    this.onMembersChange = onMembersChange;
    this.onPresenceChange = onPresenceChange;

    this.session = getSession();
    this.presenceRef = null;
    this.unsubPresence = null;
    this.unsubMembers = null;
    this.presenceThrottle = null;
    this.members = [];
    this.presenceMap = {};
  }

  async join() {
    if (!this.session || !this.projectId) return;

    const uid = this.session.uid;
    const color = assignColor(uid);
    this.presenceRef = doc(db, "project_states", this.projectId, "presence", uid);

    await setDoc(this.presenceRef, {
      uid,
      displayName: this.session.displayName || "User",
      photoURL: this.session.photoURL || null,
      color,
      cursor: { x: 0, y: 0 },
      updatedAt: serverTimestamp(),
      online: true,
    }, { merge: true });

    window.addEventListener("beforeunload", () => this.leave());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.markOffline();
      else this.markOnline();
    });

    this.listenPresence();
    this.listenMembers();
  }

  async leave() {
    if (this.presenceRef) {
      try {
        await setDoc(this.presenceRef, { online: false }, { merge: true });
      } catch {}
    }
    this.unsubPresence?.();
    this.unsubMembers?.();
  }

  async markOnline() {
    if (!this.presenceRef) return;
    await setDoc(this.presenceRef, { online: true, updatedAt: serverTimestamp() }, { merge: true });
  }

  async markOffline() {
    if (!this.presenceRef) return;
    await setDoc(this.presenceRef, { online: false }, { merge: true });
  }

  updateCursor(x, y) {
    if (!this.presenceRef) return;
    clearTimeout(this.presenceThrottle);
    this.presenceThrottle = setTimeout(() => {
      setDoc(this.presenceRef, { cursor: { x, y }, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }, 80);
  }

  listenPresence() {
    const presColRef = collection(db, "project_states", this.projectId, "presence");
    this.unsubPresence = onSnapshot(presColRef, snap => {
      const next = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.uid !== this.session.uid && data.online) next[data.uid] = data;
      });
      this.presenceMap = next;
      this.onPresenceChange?.(next);
    }, () => {});
  }

  listenMembers() {
    const subsRef = query(
      collection(db, "subscriptions"),
      where("projectId", "==", this.projectId),
      where("status", "==", "accepted")
    );
    this.unsubMembers = onSnapshot(subsRef, snap => {
      this.members = snap.docs.map(d => d.data());
      this.onMembersChange?.(this.members);
    }, () => {});
  }

  async getProjectOwner() {
    const snap = await getDoc(doc(db, "projects", this.projectId));
    return snap.exists() ? snap.data().authorUid : null;
  }

  async isCurrentUserOwner() {
    if (!this.session) return false;
    const ownerUid = await this.getProjectOwner();
    return ownerUid === this.session.uid;
  }

  async sendInvite(email) {
    const session = getSession();
    if (!session) return { error: "not_logged_in" };

    const ownerUid = await this.getProjectOwner();
    if (ownerUid !== session.uid) return { error: "not_owner" };

    const usersSnap = await getDocs(
      query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()))
    );

    if (usersSnap.empty) return { error: "user_not_found" };

    const targetUser = usersSnap.docs[0].data();
    const targetUid = usersSnap.docs[0].id;

    if (targetUid === session.uid) return { error: "cannot_invite_self" };

    const subId = `${this.projectId}_${targetUid}`;
    const existingSnap = await getDoc(doc(db, "subscriptions", subId));
    if (existingSnap.exists()) return { error: "already_invited" };

    const projectSnap = await getDoc(doc(db, "projects", this.projectId));
    const projectName = projectSnap.exists() ? projectSnap.data().name : "Circuit";

    const batch = writeBatch(db);

    batch.set(doc(db, "subscriptions", subId), {
      projectId: this.projectId,
      uid: targetUid,
      ownerUid: session.uid,
      displayName: targetUser.displayName || email,
      email: targetUser.email || email,
      photoURL: targetUser.photoURL || null,
      role: "member",
      status: "pending",
      invitedAt: serverTimestamp(),
      acceptedAt: null,
    });

    batch.set(doc(db, "notifications", `${subId}_invite`), {
      toUid: targetUid,
      fromUid: session.uid,
      fromName: session.displayName || "Someone",
      fromPhoto: session.photoURL || null,
      type: "invite",
      projectId: this.projectId,
      projectName,
      read: false,
      createdAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return { success: true, name: targetUser.displayName || email };
    } catch (err) {
      return { error: err.message };
    }
  }

  async acceptInvite(projectId) {
    const session = getSession();
    if (!session) return { error: "not_logged_in" };

    const subId = `${projectId}_${session.uid}`;
    const batch = writeBatch(db);

    batch.update(doc(db, "subscriptions", subId), {
      status: "accepted",
      acceptedAt: serverTimestamp(),
    });

    batch.update(doc(db, "notifications", `${subId}_invite`), { read: true });

    try {
      await batch.commit();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async rejectInvite(projectId) {
    const session = getSession();
    if (!session) return { error: "not_logged_in" };

    const subId = `${projectId}_${session.uid}`;
    try {
      await deleteDoc(doc(db, "subscriptions", subId));
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async removeMember(targetUid) {
    const session = getSession();
    if (!session) return { error: "not_logged_in" };

    const ownerUid = await this.getProjectOwner();
    if (ownerUid !== session.uid) return { error: "not_owner" };

    const subId = `${this.projectId}_${targetUid}`;
    try {
      await deleteDoc(doc(db, "subscriptions", subId));
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async getPendingInvites() {
    const session = getSession();
    if (!session) return [];

    try {
      const snap = await getDocs(
        query(
          collection(db, "subscriptions"),
          where("uid", "==", session.uid),
          where("status", "==", "pending")
        )
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  }

  listenNotifications(callback) {
    const session = getSession();
    if (!session) return () => {};

    const q = query(
      collection(db, "notifications"),
      where("toUid", "==", session.uid),
      where("read", "==", false)
    );

    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
  }
}