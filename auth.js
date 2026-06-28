// ==========================================================================
// உறவுசுவடி — auth.js
// Sign up / Login / Family create / Family join logic
// ==========================================================================
import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail,
  doc, getDoc, setDoc, updateDoc,
  collection, serverTimestamp, arrayUnion
} from "./firebase-config.js";

// ---- small helpers ----
function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function genJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function toast(msg, type = "") {
  let root = $("toastRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "toastRoot";
    root.className = "toast-root";
    document.body.appendChild(root);
  }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
window.toast = toast;

// ---- screen switching ----
const screens = {
  authChoice: $("authChoiceScreen"),
  signup: $("signupScreen"),
  login: $("loginScreen"),
  familyChoice: $("familyChoiceScreen"),
  createFamily: $("createFamilyScreen"),
  joinFamily: $("joinFamilyScreen"),
  app: $("app"),
  loading: $("loadingScreen")
};

function showOnly(key) {
  Object.values(screens).forEach(s => s && hide(s));
  if (screens[key]) show(screens[key]);
}
window.showOnly = showOnly;

// ==========================================================================
// SIGN UP
// ==========================================================================
$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("signupName").value.trim();
  const email = $("signupEmail").value.trim();
  const password = $("signupPassword").value;
  const errEl = $("signupError");
  errEl.textContent = "";

  if (!name || !email || password.length < 6) {
    errEl.textContent = "பெயர், சரியான மின்னஞ்சல், 6+ எழுத்து கடவுச்சொல் கொடுங்கள்.";
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, familyId: null, createdAt: serverTimestamp()
    });
    toast("கணக்கு உருவாக்கப்பட்டது!", "success");
    showOnly("familyChoice");
  } catch (err) {
    errEl.textContent = friendlyError(err);
  }
});

// ==========================================================================
// LOGIN
// ==========================================================================
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const errEl = $("loginError");
  errEl.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will route from here
  } catch (err) {
    errEl.textContent = friendlyError(err);
  }
});

$("forgotPasswordBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  if (!email) { toast("மின்னஞ்சல் முகவரியை மேலே type பண்ணுங்க முதலில்"); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast("Password reset link அனுப்பப்பட்டது — மின்னஞ்சலை பாருங்கள்", "success");
  } catch (err) {
    toast(friendlyError(err), "error");
  }
});

// ==========================================================================
// CREATE FAMILY
// ==========================================================================
$("createFamilyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const famName = $("newFamilyName").value.trim();
  const errEl = $("createFamilyError");
  errEl.textContent = "";
  if (!famName) { errEl.textContent = "குடும்பத்தின் பெயரை கொடுங்கள்."; return; }

  const user = auth.currentUser;
  if (!user) return;

  try {
    const joinCode = genJoinCode();
    const famRef = doc(collection(db, "families"));
    await setDoc(famRef, {
      name: famName,
      joinCode,
      createdBy: user.uid,
      members: [user.uid],
      createdAt: serverTimestamp()
    });
    // public lookup doc so others can resolve code -> familyId without
    // already being a member (required because the family doc itself
    // is only readable by existing members)
    await setDoc(doc(db, "joinCodes", joinCode), { familyId: famRef.id });
    await updateDoc(doc(db, "users", user.uid), { familyId: famRef.id });
    $("createdJoinCode").textContent = joinCode;
    showOnly("createFamily"); // stays on same screen but show success block
    $("createFamilyFormWrap").classList.add("hidden");
    show($("familyCreatedSuccess"));
  } catch (err) {
    errEl.textContent = friendlyError(err);
  }
});

$("goToAppAfterCreateBtn").addEventListener("click", () => {
  window.location.reload();
});

// ==========================================================================
// JOIN FAMILY (by code)
// ==========================================================================
$("joinFamilyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("joinFamilyCode").value.trim().toUpperCase();
  const errEl = $("joinFamilyError");
  errEl.textContent = "";
  if (code.length < 4) { errEl.textContent = "சரியான Family Code-ஐ கொடுங்கள்."; return; }

  const user = auth.currentUser;
  if (!user) return;

  try {
    const lookupSnap = await getDoc(doc(db, "joinCodes", code));
    if (!lookupSnap.exists()) {
      errEl.textContent = "இந்த Code-உடன் எந்த Family-உம் கிடைக்கவில்லை. சரிபார்த்து மீண்டும் முயற்சிக்கவும்.";
      return;
    }
    const familyId = lookupSnap.data().familyId;
    const famRef = doc(db, "families", familyId);
    await updateDoc(famRef, {
      members: arrayUnion(user.uid)
    });
    await updateDoc(doc(db, "users", user.uid), { familyId });
    toast(`Family-ல் இணைந்தீர்கள்!`, "success");
    window.location.reload();
  } catch (err) {
    errEl.textContent = friendlyError(err);
  }
});

// ==========================================================================
// AUTH STATE — main router
// ==========================================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showOnly("authChoice");
    return;
  }
  showOnly("loading");
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      // edge case: auth account exists but no profile doc — create one
      await setDoc(doc(db, "users", user.uid), {
        name: user.displayName || "உறவினர்", email: user.email, familyId: null, createdAt: serverTimestamp()
      });
      showOnly("familyChoice");
      return;
    }
    const userData = userSnap.data();
    if (!userData.familyId) {
      showOnly("familyChoice");
      return;
    }
    // user has a family -> boot the main app
    window.CURRENT_USER = { uid: user.uid, name: userData.name, email: userData.email };
    window.CURRENT_FAMILY_ID = userData.familyId;
    const famSnap = await getDoc(doc(db, "families", userData.familyId));
    window.CURRENT_FAMILY = famSnap.exists() ? famSnap.data() : { name: "" };
    showOnly("app");
    if (window.bootApp) window.bootApp();
  } catch (err) {
    console.error(err);
    toast("ஏதோ தவறு நடந்தது, மீண்டும் முயற்சிக்கவும்.", "error");
    showOnly("authChoice");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.reload();
});

// ---- nav buttons between auth screens ----
$("goSignupBtn").addEventListener("click", () => showOnly("signup"));
$("goLoginBtn").addEventListener("click", () => showOnly("login"));
$("backToChoiceFromSignup").addEventListener("click", () => showOnly("authChoice"));
$("backToChoiceFromLogin").addEventListener("click", () => showOnly("authChoice"));
$("goCreateFamilyBtn").addEventListener("click", () => showOnly("createFamily"));
$("goJoinFamilyBtn").addEventListener("click", () => showOnly("joinFamily"));
$("backToFamilyChoiceFromCreate").addEventListener("click", () => showOnly("familyChoice"));
$("backToFamilyChoiceFromJoin").addEventListener("click", () => showOnly("familyChoice"));

function friendlyError(err) {
  const code = err.code || "";
  const map = {
    "auth/email-already-in-use": "இந்த மின்னஞ்சல் ஏற்கனவே பயன்பாட்டில் உள்ளது. Login பண்ணுங்க.",
    "auth/invalid-email": "மின்னஞ்சல் முகவரி தவறாக உள்ளது.",
    "auth/weak-password": "கடவுச்சொல் மிகவும் எளிமையானது (6+ எழுத்துகள் தேவை).",
    "auth/user-not-found": "இந்த மின்னஞ்சலுக்கு கணக்கு இல்லை.",
    "auth/wrong-password": "கடவுச்சொல் தவறு.",
    "auth/invalid-credential": "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறு.",
    "auth/too-many-requests": "பல தோல்வி முயற்சிகள் — சிறிது நேரம் கழித்து முயற்சிக்கவும்."
  };
  return map[code] || (err.message || "ஏதோ தவறு நடந்தது.");
}
