# மொய் நோட் — Setup & Deploy Guide (Tanglish)

இது worldwide-ஆ யாரும் use பண்ணக்கூடிய app. Backend server எழுத தேவையில்ல —
**Firebase** (Google-ன் free service) Login + Database இரண்டையும் handle பண்ணும்.
நீங்க பண்ண வேண்டியது 2 பகுதிகள் மட்டும்: (A) Firebase setup, (B) files-ஐ upload பண்ணி link எடுக்கறது.

---

## பகுதி A — Firebase Project Setup (ஒரு முறை மட்டும்)

1. **console.firebase.google.com**-க்கு போங்க (Google account login வேண்டும், free).
2. **"Add project"** click பண்ணி பெயர் கொடுங்க (எ.கா. `uravu-suvaadi`). Google Analytics கேட்டா "Skip/Off" வச்சா போதும்.
3. Project திறந்ததும் left side menu-ல **Build > Authentication**-க்கு போங்க.
   - **Get started** click பண்ணுங்க.
   - **Sign-in method** tab-ல **Email/Password**-ஐ தேர்ந்து **Enable** பண்ணி Save பண்ணுங்க.
4. **Build > Firestore Database**-க்கு போங்க.
   - **Create database** click பண்ணுங்க.
   - Location-ஐ உங்க பகுதிக்கு அருகில் இருக்கிற ஒன்றை தேர்ந்துக்கோங்க (எ.கா. `asia-south1` — Mumbai).
   - **Start in production mode**-ஐ தேர்ந்துக்கோங்க (security rules கீழே நாம வேற paste பண்ணுவோம்).
5. Firestore-ல **Rules** tab-க்கு போங்க, அங்க இருக்கிற default text-ஐ முழுசா delete பண்ணி, இந்த project-ல கொடுத்திருக்கிற **`firestore.rules`** file-ன் content-ஐ paste பண்ணி **Publish** பண்ணுங்க.
6. **Project Settings** (⚙️ icon, top-left) > **General** tab-க்கு போங்க. கீழ வரை scroll பண்ணி **"Your apps"**-ல `</>` (Web) icon click பண்ணுங்க.
   - App nickname கொடுத்து **Register app**.
   - இப்போ ஒரு `firebaseConfig = {...}` object காட்டும். அந்த 6 மதிப்புகளையும் (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) copy பண்ணுங்க.
7. இந்த project-ல இருக்கிற **`firebase-config.js`** file-ஐ open பண்ணி, மேல பகுதியில இருக்கிற `YOUR_API_KEY` போன்ற placeholder values-ஐ உங்க real values-ஆல replace பண்ணுங்க. Save பண்ணுங்க.

✅ Firebase setup முடிந்தது.

---

## பகுதி B — Files-ஐ Upload பண்ணி Public Link எடுக்கறது

**எளிய வழி — Netlify (Drag & Drop, account கூட தேவையில்ல):**

1. **app.netlify.com/drop**-க்கு போங்க.
2. `uravu-suvaadi` folder (இதில் index.html, style.css, app.js, auth.js, firebase-config.js எல்லாம் இருக்கணும்) -ஐ அந்த page-ல drag பண்ணி drop பண்ணுங்க.
3. சில நிமிடத்தில் ஒரு public URL (எ.கா. `https://random-name-123.netlify.app`) கிடைக்கும். அதுதான் உங்க app-ன் world-wide link!

4. **முக்கியம்:** Firebase Console-க்கு திரும்பி போங்க → **Authentication > Settings > Authorized domains** → **Add domain** → மேல கிடைச்ச Netlify URL-ஐ (எ.கா. `random-name-123.netlify.app`) சேருங்க. இது இல்லாம Login வேலை செய்யாது.

5. அந்த link-ஐ யார் கிட்டயும் share பண்ணலாம் — அவங்க browser-ல open பண்ணி Sign Up பண்ணலாம்.

**Netlify account create பண்ணினா (free):** மேலே upload பண்ண URL-ஐ permanent-ஆ வச்சுக்கலாம், பின்னாடி file மாத்தினா "Deploys" tab-ல திரும்ப drag-drop பண்ணி update பண்ணலாம்.

---

## எப்படி வேலை செய்யுது

- ஒருவர் **Sign Up** பண்ணி, **"புதிய Family உருவாக்கு"** தேர்ந்தா ஒரு **6-எழுத்து Join Code** கிடைக்கும்.
- அந்த Code-ஐ family members-க்கு (WhatsApp etc.) share பண்ணுங்க.
- அவங்க Sign Up பண்ணி **"Family Code-உடன் இணைய"** தேர்ந்து அந்த code type பண்ணா, அதே குடும்ப மொய் பதிவேட்டில் இணைந்துவிடுவார்கள் — எல்லாரும் ஒரே data-ஐ real-time-ஆ பார்க்கலாம்/edit பண்ணலாம்.
- வேற குடும்பத்தினர் வேற Family create பண்ணா, அவங்க data முற்றிலும் தனியா இருக்கும் — ஒருவரும் இன்னொரு family-ன் data-ஐ பார்க்க முடியாது.
- Password-ஐ Chrome/browser தானா "Save password?" கேட்கும் — அதை Save பண்ணினா, அந்த person-ஓட Google account-ல sync ஆகி, வேற device-லயும் Chrome login செஞ்சா autofill suggestion-ல வரும்.

---

## கவனிக்க வேண்டியவை (Limits)

- Firebase free plan ("Spark") — ஒரு குடும்ப app-க்கு போதுமான அளவு free quota இருக்கு (மாசத்துக்கு 50,000 reads, 20,000 writes போல). பெருசா scale ஆகாதவரை bill வராது.
- இது ஒரு **basic version** — People, Events, Records (Received/Given priority order), Dashboard stats, Search, Family sharing எல்லாம் வேலை செய்யும். Reports/PDF export/Charts போன்ற advanced features அடுத்த கட்டத்தில் சேர்க்கலாம்.
