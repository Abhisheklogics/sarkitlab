import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import firebaseConfig from "../config/firebase.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const SESSION_KEY         = "sks_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function saveSession(user, profile) {
  const session = {
    uid:         user.uid,
    email:       user.email,
    displayName: profile?.displayName || user.displayName || user.email.split("@")[0],
    photoURL:    profile?.photoURL || user.photoURL || null,
    role:        profile?.role || null,
    institution: profile?.institution || "",
    expiresAt:   Date.now() + SESSION_DURATION_MS,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem("currentUser", session.uid);
  return session;
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.uid || !session?.expiresAt) { clearSession(); return null; }
    if (Date.now() > session.expiresAt) { clearSession(); return null; }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("currentUser");
}

export function refreshSession(updates = {}) {
  const session = getSession();
  if (!session) return null;
  const updated = { ...session, ...updates, expiresAt: Date.now() + SESSION_DURATION_MS };
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
}

export async function registerUser({ email, password, displayName, role, institution, institutionType }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });

  const profileData = {
    uid:             cred.user.uid,
    email,
    displayName,
    role:            role || "other",
    institution:     institution || "",
    institutionType: institutionType || "other",
    photoURL:        null,
    bio:             "",
    createdAt:       serverTimestamp(),
    projectCount:    0,
  };

  await setDoc(doc(db, "users", cred.user.uid), profileData);
  await signOut(auth);
}

export async function loginUser({ email, password }) {
  const cred        = await signInWithEmailAndPassword(auth, email, password);
  const profileSnap = await getDoc(doc(db, "users", cred.user.uid));
  const profile     = profileSnap.exists() ? profileSnap.data() : {};
  return saveSession(cred.user, profile);
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user   = result.user;
  const ref    = doc(db, "users", user.uid);
  const snap   = await getDoc(ref);

  let profile;
  if (!snap.exists()) {
    profile = {
      uid:             user.uid,
      email:           user.email,
      displayName:     user.displayName,
      role:            "other",
      institution:     "",
      institutionType: "other",
      photoURL:        user.photoURL,
      bio:             "",
      createdAt:       serverTimestamp(),
      projectCount:    0,
    };
    await setDoc(ref, profile);
  } else {
    profile = snap.data();
  }

  return saveSession(user, profile);
}

export function waitForAuthReady() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  try { await signOut(auth); } catch {}
  clearSession();
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function updateUserProfile(uid, data) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
  refreshSession(data);
}

export { auth, db, app };