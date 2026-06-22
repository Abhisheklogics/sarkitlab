import { db }        from "./auth.js";
import { getSession } from "./auth.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FOLLOWS_COLLECTION = "follows";
const USERS_COLLECTION   = "users";

function followDocId(followerId, followingId) {
  return `${followerId}_${followingId}`;
}

export async function followUser(targetUid) {
  const session = getSession();
  if (!session?.uid) return { error: "not_logged_in" };
  if (session.uid === targetUid) return { error: "cannot_follow_self" };

  const batch  = writeBatch(db);
  const followId = followDocId(session.uid, targetUid);

  batch.set(doc(db, FOLLOWS_COLLECTION, followId), {
    followerId:  session.uid,
    followingId: targetUid,
    createdAt:   serverTimestamp(),
  });

  batch.set(doc(db, USERS_COLLECTION, session.uid), {
    following: increment(1),
  }, { merge: true });

  batch.set(doc(db, USERS_COLLECTION, targetUid), {
    followers: increment(1),
  }, { merge: true });

  try {
    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error("[Follow] followUser failed:", err);
    return { error: err.message };
  }
}

export async function unfollowUser(targetUid) {
  const session = getSession();
  if (!session?.uid) return { error: "not_logged_in" };

  const batch    = writeBatch(db);
  const followId = followDocId(session.uid, targetUid);

  batch.delete(doc(db, FOLLOWS_COLLECTION, followId));

  batch.set(doc(db, USERS_COLLECTION, session.uid), {
    following: increment(-1),
  }, { merge: true });

  batch.set(doc(db, USERS_COLLECTION, targetUid), {
    followers: increment(-1),
  }, { merge: true });

  try {
    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error("[Follow] unfollowUser failed:", err);
    return { error: err.message };
  }
}

export async function isFollowing(targetUid) {
  const session = getSession();
  if (!session?.uid || !targetUid) return false;
  if (session.uid === targetUid) return false;

  try {
    const snap = await getDoc(doc(db, FOLLOWS_COLLECTION, followDocId(session.uid, targetUid)));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function toggleFollow(targetUid) {
  const already = await isFollowing(targetUid);
  if (already) {
    return unfollowUser(targetUid);
  } else {
    return followUser(targetUid);
  }
}

export async function getFollowerCount(uid) {
  if (!uid) return 0;
  try {
    const snap = await getDocs(query(
      collection(db, FOLLOWS_COLLECTION),
      where("followingId", "==", uid)
    ));
    return snap.size;
  } catch {
    return 0;
  }
}

export async function getFollowingCount(uid) {
  if (!uid) return 0;
  try {
    const snap = await getDocs(query(
      collection(db, FOLLOWS_COLLECTION),
      where("followerId", "==", uid)
    ));
    return snap.size;
  } catch {
    return 0;
  }
}

export function listenFollowerCount(uid, callback) {
  if (!uid) return () => {};
  const q = query(collection(db, FOLLOWS_COLLECTION), where("followingId", "==", uid));
  return onSnapshot(q, snap => callback(snap.size), () => {});
}

export function listenFollowingCount(uid, callback) {
  if (!uid) return () => {};
  const q = query(collection(db, FOLLOWS_COLLECTION), where("followerId", "==", uid));
  return onSnapshot(q, snap => callback(snap.size), () => {});
}

export async function getFollowers(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(query(
      collection(db, FOLLOWS_COLLECTION),
      where("followingId", "==", uid)
    ));
    return snap.docs.map(d => d.data().followerId);
  } catch {
    return [];
  }
}

export async function getFollowing(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(query(
      collection(db, FOLLOWS_COLLECTION),
      where("followerId", "==", uid)
    ));
    return snap.docs.map(d => d.data().followingId);
  } catch {
    return [];
  }
}