// ==========================================================================
// உறவுசுவடி — app.js
// Family-shared data via Firestore: families/{familyId}/people|events|entries
// ==========================================================================
import {
  db, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp,
  auth, signInWithEmailAndPassword
} from "./firebase-config.js";

function $(id) { return document.getElementById(id); }
function show(el) { el && el.classList.remove("hidden"); }
function hide(el) { el && el.classList.add("hidden"); }
function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
// மொய் வாங்கியது -> அவர்கள் செய்தது is the meaningful amount;
// மொய் போட்டது -> நாம் செய்தது is the meaningful amount.
function entryAmount(en) {
  return en.type === "received" ? Number(en.amountOld || 0) : Number(en.amountNew || 0);
}
// Tamil/unicode-safe normalized compare — fixes "typed மு doesn't match
// saved முத்துக்குமார்" issues caused by different Unicode composition
// forms coming from different keyboards/devices.
function norm(s) { return String(s || "").normalize("NFC").toLowerCase(); }

// Custom confirm dialog — returns a Promise<boolean>. Cancel always means
// false/no-action; OK always means true. Replaces native confirm() which
// some mobile browsers/webviews handle inconsistently.
function customConfirm(message, title) {
  return new Promise((resolve) => {
    $("confirmModalTitle").textContent = title || "உறுதிப்படுத்தவும்";
    $("confirmModalMessage").textContent = message;
    show($("confirmModal"));
    const okBtn = $("confirmModalOk");
    const cancelBtn = $("confirmModalCancel");
    function cleanup(result) {
      hide($("confirmModal"));
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

let PEOPLE = [];
let ENTRIES = [];
let unsubs = [];

window.bootApp = function bootApp() {
  unsubs.forEach(u => u());
  unsubs = [];

  $("familyNameLabel").textContent = window.CURRENT_FAMILY?.name || "குடும்ப மொய் பதிவேடு";
  $("settingsUserName").textContent = window.CURRENT_USER?.name || "—";
  $("settingsUserEmail").textContent = window.CURRENT_USER?.email || "—";
  $("settingsFamilyName").textContent = window.CURRENT_FAMILY?.name || "—";
  $("settingsJoinCode").textContent = window.CURRENT_FAMILY?.joinCode || "—";

  const famId = window.CURRENT_FAMILY_ID;

  const peopleQ = query(collection(db, "families", famId, "people"), orderBy("name"));
  unsubs.push(onSnapshot(peopleQ, (snap) => {
    PEOPLE = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPeople();
    renderDashboard();
  }));

  const entriesQ = query(collection(db, "families", famId, "entries"), orderBy("date", "desc"));
  unsubs.push(onSnapshot(entriesQ, (snap) => {
    ENTRIES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshTownFilterOptions();
    renderEntries();
    renderDashboard();
  }));
};

// ==========================================================================
// NAVIGATION
// ==========================================================================
document.addEventListener("click", (e) => {
  const goBtn = e.target.closest("[data-go]");
  if (goBtn) {
    const target = goBtn.getAttribute("data-go");
    document.querySelectorAll(".screen").forEach(s => hide(s));
    show($(target));
    document.querySelectorAll(".nav-btn").forEach(n => n.classList.toggle("active", n.getAttribute("data-go") === target));
  }
});

$("copyJoinCodeBtn").addEventListener("click", () => {
  const code = window.CURRENT_FAMILY?.joinCode || "";
  navigator.clipboard?.writeText(code);
  toast("Code Copy ஆனது — share பண்ணுங்க!", "success");
});

// ==========================================================================
// DASHBOARD
// ==========================================================================
function renderDashboard() {
  const given = ENTRIES.filter(e => e.type === "given").reduce((s, e) => s + entryAmount(e), 0);
  const received = ENTRIES.filter(e => e.type === "received").reduce((s, e) => s + entryAmount(e), 0);
  $("statReceived").textContent = fmt(received);
  $("statGiven").textContent = fmt(given);
  $("statBalance").textContent = fmt(received - given);
  $("statPeople").textContent = PEOPLE.length;
  $("statRecords").textContent = ENTRIES.length;

  const recent = ENTRIES.slice(0, 5);
  $("recentEntries").innerHTML = recent.length ? recent.map(entryCardHtml).join("") :
    `<div class="empty-state"><div class="es-icon">📋</div><p>இன்னும் பதிவுகள் இல்லை</p></div>`;
  bindEntryCardClicks($("recentEntries"));
}

// ==========================================================================
// PEOPLE
// ==========================================================================
function renderPeople() {
  const term = norm($("peopleSearch").value.trim());
  const filtered = PEOPLE.filter(p => !term || norm(p.name).includes(term));
  $("peopleList").innerHTML = filtered.length ? filtered.map(personCardHtml).join("") :
    `<div class="empty-state"><div class="es-icon">👥</div><p>நபர்கள் இல்லை</p></div>`;
  bindPersonCardClicks();
}
$("peopleSearch").addEventListener("input", renderPeople);

function personCardHtml(p) {
  const initial = (p.name || "?").trim()[0]?.toUpperCase() || "?";
  const count = ENTRIES.filter(e => e.personId === p.id).length;
  return `
  <div class="person-card" data-id="${p.id}">
    <div class="avatar">${initial}</div>
    <div class="person-main">
      <div class="p-name">${escapeHtml(p.name)}</div>
      <div class="p-sub">${escapeHtml(p.relation || "")}${p.relation ? " · " : ""}${count} பதிவுகள்</div>
    </div>
    <div class="row-actions">
      <button class="icon-mini edit-person" data-id="${p.id}">✎</button>
      <button class="icon-mini danger del-person" data-id="${p.id}">🗑</button>
    </div>
  </div>`;
}

function bindPersonCardClicks() {
  document.querySelectorAll(".edit-person").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openPersonModal(PEOPLE.find(p => p.id === b.dataset.id));
  });
  document.querySelectorAll(".del-person").forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    const ok = await customConfirm("இந்த நபரை நீக்கவா? இதை மீட்க முடியாது.", "நபரை நீக்க");
    if (!ok) return;
    await deleteDoc(doc(db, "families", window.CURRENT_FAMILY_ID, "people", b.dataset.id));
    toast("நீக்கப்பட்டது", "success");
  });
}

$("addPersonFab").addEventListener("click", () => openPersonModal(null));

function openPersonModal(person) {
  $("personModalTitle").textContent = person ? "நபரை திருத்து" : "நபரைச் சேர்";
  $("personId").value = person?.id || "";
  $("personName").value = person?.name || "";
  $("personRelation").value = person?.relation || "";
  $("personPhone").value = person?.phone || "";
  show($("personModal"));
}

$("personForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn.disabled) return;
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "சேமிக்கிறது...";
  try {
    const id = $("personId").value;
    const data = {
      name: $("personName").value.trim(),
      relation: $("personRelation").value.trim(),
      phone: $("personPhone").value.trim(),
    };
    const famId = window.CURRENT_FAMILY_ID;
    if (id) {
      await updateDoc(doc(db, "families", famId, "people", id), data);
    } else {
      await addDoc(collection(db, "families", famId, "people"), { ...data, createdAt: serverTimestamp() });
    }
    hide($("personModal"));
    toast("சேமிக்கப்பட்டது", "success");
  } catch (err) {
    toast("Save ஆகவில்லை, மீண்டும் முயற்சிக்கவும்", "error");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

// ==========================================================================
// EVENT TYPE (fixed list, used inside the entry/record form for மொய் போட்டது)
// ==========================================================================
const eventTypeLabel = { marriage: "திருமணம்", housewarming: "வீடு புகு விழா", birthday: "பிறந்தநாள்", earring: "காதணி விழா", moivirundhu: "மொய் விருந்து", other: "மாற்றவை" };

// நிகழ்வு field is only relevant for மொய் போட்டது (given) entries
function updateEventFieldVisibility() {
  const group = $("entryEventGroup");
  if (selectedEntryType === "given") show(group); else hide(group);
}

// ==========================================================================
// RECORDS / ENTRIES  (priority: RECEIVED first, GIVEN second)
// ==========================================================================
let recordsFilterType = "all";
let recordsTownFilter = "";

function renderEntries() {
  const term = norm($("recordsSearch").value.trim());
  let filtered = ENTRIES.filter(e => recordsFilterType === "all" || e.type === recordsFilterType);
  if (recordsTownFilter) filtered = filtered.filter(e => (e.town || "") === recordsTownFilter);
  if (term) {
    filtered = filtered.filter(e =>
      norm(e.personName).includes(term) ||
      norm(eventTypeLabel[e.eventType] || "").includes(term) ||
      norm(e.town).includes(term)
    );
  }
  $("recordsListEl").innerHTML = filtered.length ? filtered.map(entryCardHtml).join("") :
    `<div class="empty-state"><div class="es-icon">📋</div><p>பதிவுகள் இல்லை</p></div>`;
  bindEntryCardClicks($("recordsListEl"));
}
$("recordsSearch").addEventListener("input", renderEntries);
$("recordsTownFilter").addEventListener("change", () => {
  recordsTownFilter = $("recordsTownFilter").value;
  renderEntries();
});
document.querySelectorAll(".tab-btn[data-rtype]").forEach(btn => {
  btn.addEventListener("click", () => {
    recordsFilterType = btn.dataset.rtype;
    document.querySelectorAll(".tab-btn[data-rtype]").forEach(b => b.classList.toggle("active", b === btn));
    renderEntries();
  });
});

// keep the ஊர் filter dropdown in sync with whatever towns exist in the data
function refreshTownFilterOptions() {
  const towns = [...new Set(ENTRIES.map(e => e.town).filter(Boolean))].sort();
  const sel = $("recordsTownFilter");
  const current = sel.value;
  sel.innerHTML = `<option value="">அனைத்து ஊர்களும்</option>` +
    towns.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  if (towns.includes(current)) sel.value = current;
  else recordsTownFilter = "";
}

function entryCardHtml(en) {
  const isReceived = en.type === "received";
  const subParts = [en.town, eventTypeLabel[en.eventType] || "", en.date].filter(Boolean);
  return `
  <div class="entry-card ${isReceived ? "type-received" : "type-given"}" data-id="${en.id}">
    <div class="entry-icon">${isReceived ? "📥" : "📤"}</div>
    <div class="entry-main">
      <div class="en-title">${escapeHtml(en.personName || "")}</div>
      <div class="en-sub">${subParts.map(escapeHtml).join(" · ")}</div>
    </div>
    <div class="entry-amount ${isReceived ? "received" : "given"}">${fmt(entryAmount(en))}</div>
  </div>`;
}

function bindEntryCardClicks(root) {
  root.querySelectorAll(".entry-card").forEach(card => {
    card.onclick = () => openEntryModal(ENTRIES.find(e => e.id === card.dataset.id));
  });
}

$("addRecordFab").addEventListener("click", () => openEntryModal(null));

$("deleteEntryBtn").addEventListener("click", async () => {
  const id = $("entryId").value;
  if (!id) return;
  const ok = await customConfirm("இந்த பதிவை நீக்கவா? இதை மீட்க முடியாது.", "பதிவை நீக்க");
  if (!ok) return;
  await deleteDoc(doc(db, "families", window.CURRENT_FAMILY_ID, "entries", id));
  hide($("entryModal"));
  toast("நீக்கப்பட்டது", "success");
});

let selectedEntryType = "received";

function updateAmountRequirement() {
  const oldInput = $("entryAmountOld"), newInput = $("entryAmountNew");
  const oldLabel = $("amountOldLabel"), newLabel = $("amountNewLabel");
  if (selectedEntryType === "received") {
    oldInput.required = true;
    newInput.required = false;
    oldLabel.textContent = "அவர்கள் செய்தது *";
    newLabel.textContent = "நாம் செய்தது";
  } else {
    newInput.required = true;
    oldInput.required = false;
    newLabel.textContent = "நாம் செய்தது *";
    oldLabel.textContent = "அவர்கள் செய்தது";
  }
}

document.querySelectorAll(".radio-pill[data-entrytype]").forEach(pill => {
  pill.addEventListener("click", () => {
    selectedEntryType = pill.dataset.entrytype;
    $("entryType").value = selectedEntryType;
    document.querySelectorAll(".radio-pill[data-entrytype]").forEach(p => p.classList.toggle("selected", p === pill));
    updateAmountRequirement();
    updateEventFieldVisibility();
  });
});

function openEntryModal(en) {
  $("entryModalTitle").textContent = en ? "பதிவை திருத்து" : "பதிவு சேர் (Add Record)";
  $("entryId").value = en?.id || "";
  $("deleteEntryBtn").classList.toggle("hidden", !en);
  selectedEntryType = en?.type || "received";
  $("entryType").value = selectedEntryType;
  document.querySelectorAll(".radio-pill[data-entrytype]").forEach(p =>
    p.classList.toggle("selected", p.dataset.entrytype === selectedEntryType));
  updateAmountRequirement();
  updateEventFieldVisibility();
  $("entryTownInput").value = en?.town || "";
  $("entryPersonInput").value = en?.personName || "";
  $("entryPersonId").value = en?.personId || "";
  $("entryPhone").value = en?.phone || "";
  $("entryEventType").value = en?.eventType || "marriage";
  $("entryAmountOld").value = en?.amountOld || "";
  $("entryAmountNew").value = en?.amountNew || "";
  $("entryDate").value = en?.date || new Date().toISOString().slice(0, 10);
  $("entryPlace").value = en?.place || "";
  $("entryNotes").value = en?.notes || "";
  $("entryPhotoInput").value = "";
  if (en?.photo) {
    $("entryPhotoData").value = en.photo;
    $("entryPhotoPreview").src = en.photo;
    $("entryPhotoPreviewWrap").classList.remove("hidden");
  } else {
    $("entryPhotoData").value = "";
    $("entryPhotoPreview").src = "";
    $("entryPhotoPreviewWrap").classList.add("hidden");
  }
  show($("entryModal"));
}

// ---- invitation photo: pick, compress client-side, preview, remove, full view ----
function compressImageFile(file, maxDim = 900, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

$("entryPhotoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const label = $("entryPhotoUploadLabel");
  const originalLabel = label.textContent;
  label.textContent = "தயார் செய்யப்படுகிறது...";
  try {
    const dataUrl = await compressImageFile(file);
    $("entryPhotoData").value = dataUrl;
    $("entryPhotoPreview").src = dataUrl;
    $("entryPhotoPreviewWrap").classList.remove("hidden");
  } catch (err) {
    toast("புகைப்படத்தை சேர்க்க முடியவில்லை", "error");
    console.error(err);
  } finally {
    label.textContent = originalLabel;
  }
});

$("entryPhotoRemoveBtn").addEventListener("click", () => {
  $("entryPhotoData").value = "";
  $("entryPhotoInput").value = "";
  $("entryPhotoPreviewWrap").classList.add("hidden");
});

$("entryPhotoPreview").addEventListener("click", () => {
  $("photoLightboxImg").src = $("entryPhotoPreview").src;
  show($("photoLightbox"));
});

$("photoLightboxClose").addEventListener("click", () => hide($("photoLightbox")));
$("photoLightbox").addEventListener("click", (e) => {
  if (e.target.id === "photoLightbox") hide($("photoLightbox"));
});

$("entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn.disabled) return; // already saving — ignore extra taps
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "சேமிக்கிறது...";

  try {
    const id = $("entryId").value;
    const famId = window.CURRENT_FAMILY_ID;
    const entryType = $("entryType").value;
    const data = {
      type: entryType,
      town: $("entryTownInput").value.trim(),
      personId: $("entryPersonId").value || null,
      personName: $("entryPersonInput").value.trim(),
      phone: $("entryPhone").value.trim(),
      eventType: entryType === "given" ? $("entryEventType").value : "",
      amountOld: Number($("entryAmountOld").value || 0),
      amountNew: Number($("entryAmountNew").value || 0),
      date: $("entryDate").value,
      place: $("entryPlace").value.trim(),
      notes: $("entryNotes").value.trim(),
      photo: $("entryPhotoData").value || null,
    };

    // auto-create person if typed a brand-new name
    if (!data.personId && data.personName) {
      const existing = PEOPLE.find(p => norm(p.name) === norm(data.personName));
      if (existing) {
        data.personId = existing.id;
      } else {
        const newPersonRef = await addDoc(collection(db, "families", famId, "people"), {
          name: data.personName, relation: "", phone: "", createdAt: serverTimestamp()
        });
        data.personId = newPersonRef.id;
      }
    }

    if (id) {
      await updateDoc(doc(db, "families", famId, "entries", id), data);
    } else {
      await addDoc(collection(db, "families", famId, "entries"), { ...data, createdAt: serverTimestamp() });
    }
    hide($("entryModal"));
    toast("பதிவு சேமிக்கப்பட்டது", "success");
  } catch (err) {
    toast("Save ஆகவில்லை, மீண்டும் முயற்சிக்கவும்", "error");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

// ---- person name autocomplete (type first letter -> suggestions, tap to fill) ----
const acInput = $("entryPersonInput");
const acList = $("personAutocompleteList");

acInput.addEventListener("input", () => {
  const term = norm(acInput.value.trim());
  $("entryPersonId").value = ""; // typing manually clears the linked id until they pick/confirm
  if (!term) { hide(acList); return; }
  const matches = PEOPLE.filter(p => norm(p.name).includes(term)).slice(0, 8);
  if (!matches.length) {
    acList.innerHTML = `<div class="autocomplete-empty">பொருந்தும் நபர் இல்லை — "${escapeHtml(acInput.value)}" புதிய நபராக சேர்க்கப்படும்</div>`;
  } else {
    acList.innerHTML = matches.map(p => `<div class="autocomplete-item" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-phone="${escapeHtml(p.phone || "")}">${escapeHtml(p.name)}${p.relation ? ` <span class="muted">(${escapeHtml(p.relation)})</span>` : ""}</div>`).join("");
  }
  show(acList);
});

acList.addEventListener("click", (e) => {
  const item = e.target.closest(".autocomplete-item");
  if (!item || !item.dataset.id) return;
  acInput.value = item.dataset.name;
  $("entryPersonId").value = item.dataset.id;
  // auto-fill known phone number for this person
  if (item.dataset.phone && !$("entryPhone").value) {
    $("entryPhone").value = item.dataset.phone;
  }
  // auto-fill their most recent ஊர் (town) from their last record, if any
  if (!$("entryTownInput").value) {
    const lastEntry = ENTRIES.find(en => en.personId === item.dataset.id && en.town);
    if (lastEntry) $("entryTownInput").value = lastEntry.town;
  }
  hide(acList);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap")) { hide(acList); hide(townAcList); }
});

// ---- ஊர் (town) autocomplete — suggests towns already used in past records ----
const townInput = $("entryTownInput");
const townAcList = $("townAutocompleteList");

townInput.addEventListener("input", () => {
  const term = norm(townInput.value.trim());
  if (!term) { hide(townAcList); return; }
  const towns = [...new Set(ENTRIES.map(e => e.town).filter(Boolean))];
  const matches = towns.filter(t => norm(t).includes(term)).slice(0, 8);
  if (!matches.length) { hide(townAcList); return; }
  townAcList.innerHTML = matches.map(t => `<div class="autocomplete-item" data-town="${escapeHtml(t)}">${escapeHtml(t)}</div>`).join("");
  show(townAcList);
});

townAcList.addEventListener("click", (e) => {
  const item = e.target.closest(".autocomplete-item");
  if (!item) return;
  townInput.value = item.dataset.town;
  hide(townAcList);
});

// ==========================================================================
// GLOBAL SEARCH
// ==========================================================================
$("globalSearchBtn").addEventListener("click", () => { show($("searchOverlay")); $("globalSearchInput").focus(); });
$("closeSearchBtn").addEventListener("click", () => hide($("searchOverlay")));
$("globalSearchInput").addEventListener("input", () => {
  const term = $("globalSearchInput").value.trim().toLowerCase();
  const box = $("globalSearchResults");
  if (!term) { box.innerHTML = `<div class="search-empty">தேட ஆரம்பிக்கவும்...</div>`; return; }
  const peopleHits = PEOPLE.filter(p => p.name.toLowerCase().includes(term))
    .map(p => `<div class="search-result-item"><div class="sr-title">${escapeHtml(p.name)}</div><div class="sr-sub">நபர் · ${escapeHtml(p.relation || "")}</div></div>`);
  const entryHits = ENTRIES.filter(e => (e.personName || "").toLowerCase().includes(term) || (eventTypeLabel[e.eventType] || "").toLowerCase().includes(term))
    .map(e => `<div class="search-result-item"><div class="sr-title">${escapeHtml(e.personName)} — ${fmt(entryAmount(e))}</div><div class="sr-sub">${escapeHtml(eventTypeLabel[e.eventType] || "")} · ${e.date || ""}</div></div>`);
  const all = [...peopleHits, ...entryHits];
  box.innerHTML = all.length ? all.join("") : `<div class="search-empty">பொருத்தம் இல்லை</div>`;
});

// ==========================================================================
// MODAL CLOSE buttons
// ==========================================================================
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => hide($(btn.dataset.close)));
});

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ==========================================================================
// DELETE ALL DATA (Danger Zone) — requires password re-confirmation
// ==========================================================================
$("deleteAllDataBtn").addEventListener("click", () => {
  $("deleteAllPassword").value = "";
  $("deleteAllError").textContent = "";
  show($("deleteAllModal"));
});

$("deleteAllForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = $("deleteAllPassword").value;
  const errEl = $("deleteAllError");
  errEl.textContent = "";
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "சரிபார்க்கிறது...";
  try {
    // re-verify the password before allowing this destructive action
    await signInWithEmailAndPassword(auth, window.CURRENT_USER.email, password);

    const famId = window.CURRENT_FAMILY_ID;
    await Promise.all([
      ...ENTRIES.map(en => deleteDoc(doc(db, "families", famId, "entries", en.id))),
      ...PEOPLE.map(p => deleteDoc(doc(db, "families", famId, "people", p.id))),
    ]);

    hide($("deleteAllModal"));
    toast("அனைத்து தரவும் நீக்கப்பட்டது", "success");
  } catch (err) {
    errEl.textContent = err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
      ? "கடவுச்சொல் தவறு."
      : "ஏதோ தவறு நடந்தது, மீண்டும் முயற்சிக்கவும்.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

// ==========================================================================
// EXPORT — Excel (CSV/XLSX) and PDF
// ==========================================================================
function exportRows() {
  const typeLabel = { received: "மொய் வாங்கியது", given: "மொய் போட்டது" };
  return ENTRIES.map(en => ({
    "தேதி": en.date || "",
    "வகை": typeLabel[en.type] || en.type,
    "ஊர்": en.town || "",
    "பெயர்": en.personName || "",
    "நம்பர்": en.phone || "",
    "நிகழ்வு": eventTypeLabel[en.eventType] || "",
    "இடம்": en.place || "",
    "அவர்கள் செய்தது": en.amountOld || 0,
    "நாம் செய்தது": en.amountNew || 0,
    "குறிப்பு": en.notes || "",
  }));
}

$("exportExcelBtn").addEventListener("click", () => {
  if (!ENTRIES.length) { toast("Export பண்ண பதிவுகள் இல்லை", "error"); return; }
  if (typeof XLSX === "undefined") { toast("Excel library load ஆகவில்லை, இணைய இணைப்பை சரிபார்க்கவும்", "error"); return; }
  const ws = XLSX.utils.json_to_sheet(exportRows());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "மொய் பதிவுகள்");
  XLSX.writeFile(wb, `uravu-suvaadi-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast("Excel file download ஆனது", "success");
});

$("exportPdfBtn").addEventListener("click", () => {
  if (!ENTRIES.length) { toast("Export பண்ண பதிவுகள் இல்லை", "error"); return; }
  if (typeof window.jspdf === "undefined") { toast("PDF library load ஆகவில்லை, இணைய இணைப்பை சரிபார்க்கவும்", "error"); return; }
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  const rows = exportRows();
  docPdf.setFontSize(14);
  docPdf.text(window.CURRENT_FAMILY?.name || "Uravu Suvaadi", 14, 16);
  docPdf.setFontSize(9);
  let y = 26;
  const headers = ["தேதி", "வகை", "ஊர்", "பெயர்", "நம்பர்", "நிகழ்வு", "அவர்கள்", "நாம்"];
  docPdf.text(headers.join("  |  "), 14, y);
  y += 6;
  rows.forEach(r => {
    if (y > 280) { docPdf.addPage(); y = 16; }
    const line = `${r["தேதி"]} | ${r["வகை"]} | ${r["ஊர்"]} | ${r["பெயர்"]} | ${r["நம்பர்"]} | ${r["நிகழ்வு"]} | ${r["அவர்கள் செய்தது"]} | ${r["நாம் செய்தது"]}`;
    docPdf.text(line, 14, y);
    y += 6;
  });
  docPdf.save(`uravu-suvaadi-${new Date().toISOString().slice(0, 10)}.pdf`);
  toast("PDF file download ஆனது", "success");
});
