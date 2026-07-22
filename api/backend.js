const { admin, getRoleByPRN, initError } = require("../lib/helpers");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ── Har action ka apna handler function ──────────────────────────────────────

async function handleVerifyPrn(body, res) {
  const prn  = (body.prn || "").toString().trim();
  const uid  = (body.uid || "").toString().trim();
  const mode = body.mode || "buyer";
  const db   = admin.database();

  async function findByField(field, value) {
    const snap = await db.ref("users").orderByChild(field).equalTo(value).once("value");
    const val = snap.val();
    if (!val) return null;
    const key = Object.keys(val)[0];
    return { key, userData: val[key] || {} };
  }

  if (mode === "login") {
    if (!prn && !uid) return res.status(400).json({ error: "prn ya uid me se ek dena zaroori hai." });
    const found = uid ? await findByField("uid", uid) : await findByField("prn", prn);
    if (!found) return res.status(404).json({ found: false, error: "User not found" });
    const u = found.userData;
    return res.status(200).json({
      found: true,
      email: u.email || "",
      uid: u.uid || found.key,
      prn: u.prn || prn || "",
      name: u.name || u.displayName || "Student",
      role: (u.role || "").toLowerCase(),
      year: u.year || u.Year || "1"
    });
  }

  if (!prn || prn.length !== 16) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });

  const found = await findByField("prn", prn);
  if (!found) return res.status(404).json({ found: false, error: "PRN not found" });
  const userData = found.userData;

  const safeResponse = {
    found: true,
    uid: userData.uid || found.key,
    name: userData.name || userData.displayName || "Student",
    role: (userData.role || "").toLowerCase(),
    branch: (userData.branch || "").toLowerCase()
  };

  if (mode === "admin") return res.status(200).json({ found: true, role: safeResponse.role });

  if (mode === "receipt") {
    return res.status(200).json({
      found: true,
      name: safeResponse.name,
      branch: safeResponse.branch,
      role: safeResponse.role,
      year: userData.year || userData.Year || "",
      premiumSince: userData.premiumSince || userData.activatedAt || userData.createdAt || null,
      roleExpires: userData.roleExpires || userData.premiumUntil || userData.expiresAt || null,
      amount: userData.amount || userData.totalPaid || null
    });
  }

  return res.status(200).json(safeResponse);
}

async function handleRegisterUser(body, res) {
  const uid    = (body.uid    || "").toString().trim();
  const name   = (body.name   || "").toString().trim();
  const mobile = (body.mobile || "").toString().trim();
  const prn    = (body.prn    || "").toString().trim();
  const email  = (body.email  || "").toString().trim();
  const year   = (body.year   || "1").toString().trim();
  const confirmPassword = (body.confirmPassword || "").toString();

  if (!uid) return res.status(400).json({ error: "uid missing hai (pehle Firebase Auth account banayein)." });
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: "Mobile number exactly 10 digits ka hona chahiye." });
  if (!/^\d{16}$/.test(prn))    return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  if (!email.includes("@"))    return res.status(400).json({ error: "Valid email zaroori hai." });
  if (!name)                    return res.status(400).json({ error: "Name zaroori hai." });

  const db = admin.database();
  const existingSnap = await db.ref(`users/${prn}`).once("value");
  if (existingSnap.exists()) return res.status(409).json({ error: "Yeh PRN pehle se kisi account se register hai." });

  await db.ref(`users/${prn}`).set({ uid, name, mobile, prn, email, role: "student", year, confirmPassword, createdAt: Date.now() });
  return res.status(200).json({ success: true });
}

async function handleDemoteRole(body, res) {
  const prn = (body.prn || "").toString().trim();
  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  await admin.database().ref(`users/${prn}/role`).set("student");
  return res.status(200).json({ success: true });
}

async function handleRequestWipeout(body, res) {
  const prn = (body.prn || "").toString().trim();
  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  const role = await getRoleByPRN(prn);
  if (!["admin", "moderator", "superadmin"].includes(role)) {
    return res.status(403).json({ error: "Aapke role ko yeh request bhejne ki anumati nahi hai." });
  }
  await admin.firestore().collection("master_requests").add({
    requestedByPRN: prn, role: role.toUpperCase(),
    message: `Request server wipeout triggered by ${role}`,
    status: "pending", timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  return res.status(200).json({ success: true });
}

async function handleResetScores(body, res) {
  const prn = (body.prn || "").toString().trim();
  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  const role = await getRoleByPRN(prn);
  if (role !== "master") return res.status(403).json({ error: "Sirf master role hi scores reset kar sakta hai." });

  const db = admin.firestore();
  const snap = await db.collection("solo_mcq").get();
  const batch = db.batch();
  snap.forEach((doc) => batch.update(doc.ref, { score: 0 }));
  await batch.commit();
  return res.status(200).json({ success: true, count: snap.size });
}

async function handleWipeDatabase(body, res) {
  const prn = (body.prn || "").toString().trim();
  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  const role = await getRoleByPRN(prn);
  if (role !== "master") return res.status(403).json({ error: "Sirf master role hi database cleanse kar sakta hai." });

  const db = admin.firestore();
  const snap = await db.collection("solo_mcq").get();
  const batch = db.batch();
  snap.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return res.status(200).json({ success: true, deletedCount: snap.size });
}

async function handleSubmitScore(body, res) {
  const POINTS_CORRECT = 4, POINTS_WRONG = -1, MAX_Q = 20;
  const prn = (body.prn || "").toString().trim();
  const name = (body.name || "Student").toString().trim();
  const scoreDelta = Number(body.scoreDelta);
  const questionCount = Number(body.questionCount);

  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  if (!Number.isFinite(scoreDelta) || !Number.isFinite(questionCount)) return res.status(400).json({ error: "scoreDelta aur questionCount valid number hone chahiye." });
  if (questionCount < 1 || questionCount > MAX_Q) return res.status(400).json({ error: "questionCount range ke bahar hai." });
  if (scoreDelta > questionCount * POINTS_CORRECT || scoreDelta < questionCount * POINTS_WRONG) {
    return res.status(400).json({ error: "Yeh score is round ke hisaab se possible nahi hai." });
  }

  const db = admin.firestore();
  const snap = await db.collection("solo_mcq").where("prn", "==", prn).get();
  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    const oldScore = snap.docs[0].data().score || 0;
    await docRef.update({ score: oldScore + scoreDelta, name, lastTestedTimestamp: admin.firestore.FieldValue.serverTimestamp() });
  } else {
    await db.collection("solo_mcq").add({ prn, name, score: scoreDelta, lastTestedTimestamp: admin.firestore.FieldValue.serverTimestamp() });
  }
  return res.status(200).json({ success: true });
}

async function handleUploadPhoto(body, res) {
  const uid = (body.uid || "").toString().trim();
  const imageBase64 = (body.image || "").toString();

  if (!uid) return res.status(400).json({ error: "uid zaroori hai." });
  if (!imageBase64.startsWith("data:image/")) {
    return res.status(400).json({ error: "Valid base64 image data URL zaroori hai." });
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(500).json({ error: "Cloudinary env vars set nahi hain (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)." });
  }

  // uid se PRN dhoondo (jaisa resolveAdminIdentity karta hai) — RTDB me users PRN-keyed hain
  const db = admin.database();
  const snap = await db.ref("users").orderByChild("uid").equalTo(uid).once("value");
  const val = snap.val();
  if (!val) return res.status(404).json({ error: "User record not found." });
  const prn = Object.keys(val)[0];

  // Server-side safety cap — client already 500x500 JPEG me resize karke bhejta hai,
  // yeh sirf ek defense-in-depth check hai (base64 me raw bytes ka ~1.37x hota hai)
  const approxBytes = Math.floor(imageBase64.length * 0.75);
  if (approxBytes > 3 * 1024 * 1024) {
    return res.status(400).json({ error: "Image too large (max ~3MB)." });
  }

  // Cloudinary par upload — data URI seedha diya ja sakta hai, koi buffer/stream handling nahi chahiye
  let uploadResult;
  try {
    uploadResult = await cloudinary.uploader.upload(imageBase64, {
      folder: "profile_photos",
      public_id: prn,           // same PRN => purani photo overwrite ho jaati hai, storage saaf rehta hai
      overwrite: true,
      resource_type: "image",
      transformation: [{ width: 500, height: 500, crop: "fill", gravity: "face" }]
    });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    return res.status(502).json({ error: "Cloudinary upload failed." });
  }

  const photoURL = uploadResult.secure_url;

  // Sirf final URL hi Firebase (RTDB) me save hota hai — actual image bytes Cloudinary par rehte hain
  await db.ref(`users/${prn}`).update({ photoURL, photoUpdatedAt: Date.now() });
  return res.status(200).json({ success: true, photoURL });
}

async function handleSubmitProfileRequest(body, res) {
  const prn = (body.prn || "").toString().trim();
  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });

  const newName = (body.newName || "").toString().trim();
  const newEmail = (body.newEmail || "").toString().trim();
  const newPhone = (body.newPhone || "").toString().trim();
  const newDOB = (body.newDOB || "").toString().trim();
  const newYear = (body.newYear || "").toString().trim();
  const newRole = (body.newRole || "").toString().trim();

  if (!newName && !newEmail && !newPhone && !newDOB && !newYear && !newRole) {
    return res.status(400).json({ error: "Kam se kam ek field badalna zaroori hai." });
  }

  const db = admin.database();
  const userSnap = await db.ref(`users/${prn}`).once("value");
  const userData = userSnap.val() || {};

  let finalRoleSetting = newRole || userData.role || "student";
  if (userData.role === "master") finalRoleSetting = "master";

  await db.ref(`profile_requests/${prn}`).set({
    prn, oldName: userData.name || "Not Available", newName: newName || userData.name || "Not Available",
    oldEmail: userData.email || "Not Available", newEmail: newEmail || userData.email || "Not Available",
    oldPhone: userData.mobile || userData.phone || "Not Available", newPhone: newPhone || userData.mobile || userData.phone || "Not Available",
    oldDOB: userData.dob || "Not Set", newDOB: newDOB || userData.dob || "Not Set",
    oldYear: userData.year || "1", newYear: newYear || userData.year || "1",
    oldRole: userData.role || "student", newRole: finalRoleSetting,
    status: "pending", requestedAt: Date.now()
  });

  return res.status(200).json({ success: true, currentRole: userData.role || "student" });
}

async function handleManageRooms(body, res) {
  const prn = (body.prn || "").toString().trim();
  const action = (body.action || "").toString().trim();
  const roomId = (body.roomId || "").toString().trim();

  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  const role = await getRoleByPRN(prn);
  if (role !== "master") return res.status(403).json({ error: "Sirf master role hi rooms manage kar sakta hai." });

  const db = admin.firestore();

  if (action === "list") {
    const snap = await db.collection("rooms").limit(500).get();
    const rooms = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        subject: d.subject || d.subjectName || d.arena || d.roomName || d.topic || "Unknown",
        timestamp: (d.timestamp && d.timestamp.toMillis) ? d.timestamp.toMillis() : (d.createdAt || null)
      };
    });
    return res.status(200).json({ success: true, rooms });
  }

  if (action === "deleteOne") {
    if (!roomId) return res.status(400).json({ error: "roomId zaroori hai." });
    await db.collection("rooms").doc(roomId).delete();
    return res.status(200).json({ success: true });
  }

  if (action === "deleteAll") {
    const snap = await db.collection("rooms").limit(500).get();
    if (snap.empty) return res.status(200).json({ success: true, deletedCount: 0 });
    const batches = [];
    let batch = db.batch(), count = 0;
    snap.forEach((doc) => { batch.delete(doc.ref); count++; if (count % 400 === 0) { batches.push(batch); batch = db.batch(); } });
    batches.push(batch);
    await Promise.all(batches.map((b) => b.commit()));
    return res.status(200).json({ success: true, deletedCount: snap.size });
  }

  return res.status(400).json({ error: "Unknown room action." });
}

const ROLE_WEIGHT = {
  master: 100, superadmin: 80, admin: 60, moderator: 40,
  diamond: 20, gold: 15, silver: 10, student: 0
};
const ELEVATED_ROLES = ["master", "superadmin", "admin", "moderator"];

// Admin khud kis role ka hai, RTDB se (server-side, asli source of truth) verify karta hai.
// adminUid diya ho to pehle prn resolve karte hain (uid -> prn), phir role nikalte hain.
async function resolveAdminIdentity(body) {
  let adminPrn = (body.adminPrn || "").toString().trim();
  const adminUid = (body.adminUid || "").toString().trim();
  const db = admin.database();

  if (!adminPrn && adminUid) {
    const snap = await db.ref("users").orderByChild("uid").equalTo(adminUid).once("value");
    const val = snap.val();
    if (val) adminPrn = Object.values(val)[0].prn || Object.keys(val)[0];
  }
  if (!adminPrn) return { adminPrn: null, role: null };
  const role = await getRoleByPRN(adminPrn);
  return { adminPrn, role };
}

async function handleMasterCreateAccount(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) {
    return res.status(403).json({ error: "Aapko account banane ki anumati nahi hai." });
  }

  const prn = (body.prn || "").toString().trim();
  const name = (body.name || "").toString().trim();
  const email = (body.email || "").toString().trim();
  const phone = (body.phone || "").toString().trim();
  const dob = (body.dob || "").toString().trim();
  const year = (body.year || "").toString().trim();
  const password = (body.password || "").toString();
  const targetRole = (body.targetRole || "student").toString().trim();

  if (adminRole !== "master" && ROLE_WEIGHT[adminRole] <= ROLE_WEIGHT[targetRole]) {
    return res.status(403).json({ error: "Aap apne barabar ya usse upar rank ka account nahi bana sakte." });
  }
  if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email aur password zaroori hain." });

  const db = admin.database();
  const existing = await db.ref(`users/${prn}`).once("value");
  if (existing.exists()) return res.status(409).json({ error: "Yeh PRN pehle se registered hai." });

  // Asli Firebase Auth account banaya jaata hai (pehle sirf RTDB me plaintext
  // password store hota tha, jisse student real login kabhi nahi kar paata tha)
  let uid;
  try {
    const authUser = await admin.auth().createUser({ email, password, displayName: name });
    uid = authUser.uid;
  } catch (authErr) {
    return res.status(400).json({ error: "Auth account nahi ban paaya: " + authErr.message });
  }

  await db.ref(`users/${prn}`).set({ uid, name, email, mobile: phone, dob, year, role: targetRole, createdAt: Date.now() });
  return res.status(200).json({ success: true });
}

async function handleMasterListRequests(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) {
    return res.status(403).json({ error: "Access denied." });
  }
  const snap = await admin.database().ref("profile_requests").once("value");
  const all = snap.val() || {};
  const pending = {};
  for (const prn in all) if (all[prn].status === "pending") pending[prn] = all[prn];
  return res.status(200).json({ success: true, requests: pending });
}

async function handleMasterProcessRequest(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });

  const prn = (body.prn || "").toString().trim();
  const action = (body.action || "").toString().trim();
  if (!prn || !["approved", "rejected"].includes(action)) return res.status(400).json({ error: "Invalid request." });

  const db = admin.database();
  const reqSnap = await db.ref(`profile_requests/${prn}`).once("value");
  const reqData = reqSnap.val();
  if (!reqData) return res.status(404).json({ error: "Request not found." });

  const oRole = reqData.oldRole || reqData.role || "student";
  const nRole = reqData.newRole || "student";
  if (adminRole !== "master" && (ROLE_WEIGHT[adminRole] <= ROLE_WEIGHT[oRole] || ROLE_WEIGHT[adminRole] <= ROLE_WEIGHT[nRole])) {
    return res.status(403).json({ error: "Unauthorized action on higher rank parameters." });
  }

  if (action === "approved") {
    const updates = {};
    if (reqData.newName)  updates.name  = reqData.newName;
    if (reqData.newEmail) updates.email = reqData.newEmail;
    if (reqData.newPhone) updates.mobile = reqData.newPhone;
    if (reqData.newDOB)   updates.dob   = reqData.newDOB;
    if (reqData.newYear)  updates.year  = reqData.newYear;
    if (reqData.newRole)  updates.role  = reqData.newRole;
    await db.ref(`users/${prn}`).update(updates);
  }
  await db.ref(`profile_requests/${prn}`).remove();
  return res.status(200).json({ success: true });
}

async function handleMasterListUsers(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });

  const snap = await admin.database().ref("users").once("value");
  const all = snap.val() || {};
  const users = {};
  for (const prn in all) {
    const u = all[prn];
    users[prn] = { name: u.name, year: u.year, role: u.role || "student", password: u.password || null };
  }
  return res.status(200).json({ success: true, users, adminRole });
}

async function handleMasterModifyRole(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });

  const targetPrn = (body.targetPrn || "").toString().trim();
  const newRole = (body.newRole || "").toString().trim();
  const currentTargetRole = (body.currentTargetRole || "").toString().trim();

  if (currentTargetRole === "master") return res.status(403).json({ error: "Master Node is Immortal!" });
  if (currentTargetRole === "superadmin" && adminRole !== "master") return res.status(403).json({ error: "Only Master can demote a Superadmin!" });
  if (adminRole !== "master" && ROLE_WEIGHT[adminRole] <= ROLE_WEIGHT[newRole]) {
    return res.status(403).json({ error: "Aap kisi ko apni rank ya usse upar promote nahi kar sakte!" });
  }

  await admin.database().ref(`users/${targetPrn}`).update({ role: newRole });
  return res.status(200).json({ success: true });
}

async function handleMasterTerminateAccount(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });

  const targetPrn = (body.targetPrn || "").toString().trim();
  const targetRole = (body.targetRole || "").toString().trim();
  if (targetRole === "master") return res.status(403).json({ error: "Master Engine cannot be deleted!" });
  if (targetRole === "superadmin" && adminRole !== "master") return res.status(403).json({ error: "Only Master can wipe a Superadmin!" });

  const db = admin.database();
  const userSnap = await db.ref(`users/${targetPrn}`).once("value");
  const userData = userSnap.val();
  if (userData && userData.uid) {
    try { await admin.auth().deleteUser(userData.uid); } catch (e) { /* auth account shayad pehle se na ho, ignore */ }
  }
  await db.ref(`users/${targetPrn}`).remove();
  await db.ref(`profile_requests/${targetPrn}`).remove();
  return res.status(200).json({ success: true });
}

async function handleMasterUpdateNotification(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });
  const text = (body.text || "").toString().trim();
  if (!text) return res.status(400).json({ error: "Notification text khaali hai." });
  await admin.database().ref("site_config/notification").set(text);
  return res.status(200).json({ success: true });
}

async function handleMasterClearNotification(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });
  await admin.database().ref("site_config/notification").remove();
  return res.status(200).json({ success: true });
}

async function handleMasterToggleMaintenance(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });
  const yearKey = (body.yearKey || "").toString().trim();
  if (!["fy", "sy", "ty", "ffy"].includes(yearKey)) return res.status(400).json({ error: "Invalid year key." });
  await admin.database().ref(`site_config/maintenance/${yearKey}`).set(!!body.isOn);
  return res.status(200).json({ success: true });
}

async function handleMasterVerifySelf(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) {
    return res.status(403).json({ authorized: false, error: "Access denied." });
  }
  return res.status(200).json({ authorized: true, role: adminRole });
}

async function handleMasterGetSiteConfig(body, res) {
  const { role: adminRole } = await resolveAdminIdentity(body);
  if (!adminRole || !ELEVATED_ROLES.includes(adminRole)) return res.status(403).json({ error: "Access denied." });

  const snap = await admin.database().ref("site_config").once("value");
  const cfg = snap.val() || {};
  return res.status(200).json({
    success: true,
    notification: cfg.notification || null,
    maintenance: cfg.maintenance || {}
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = (req.query && req.query.action) || (req.body && req.body.action) || "";
  const body = req.method === "GET" ? (req.query || {}) : (req.body || {});

  if (initError) {
    console.error("Firebase Admin init failed:", initError.message);
    return res.status(500).json({ error: "Server setup error: " + initError.message });
  }

  try {
    switch (action) {
      case "verify-prn":                  return await handleVerifyPrn(body, res);
      case "register-user":               return await handleRegisterUser(body, res);
      case "demote-role":                 return await handleDemoteRole(body, res);
      case "request-wipeout":             return await handleRequestWipeout(body, res);
      case "reset-scores":                return await handleResetScores(body, res);
      case "wipe-database":               return await handleWipeDatabase(body, res);
      case "submit-score":                return await handleSubmitScore(body, res);
      case "upload-photo":                return await handleUploadPhoto(body, res);
      case "submit-profile-request":      return await handleSubmitProfileRequest(body, res);
      case "manage-rooms":                return await handleManageRooms(body, res);
      case "master-create-account":       return await handleMasterCreateAccount(body, res);
      case "master-list-requests":        return await handleMasterListRequests(body, res);
      case "master-process-request":      return await handleMasterProcessRequest(body, res);
      case "master-list-users":           return await handleMasterListUsers(body, res);
      case "master-modify-role":          return await handleMasterModifyRole(body, res);
      case "master-terminate-account":    return await handleMasterTerminateAccount(body, res);
      case "master-update-notification":  return await handleMasterUpdateNotification(body, res);
      case "master-clear-notification":   return await handleMasterClearNotification(body, res);
      case "master-toggle-maintenance":   return await handleMasterToggleMaintenance(body, res);
      case "master-verify-self":          return await handleMasterVerifySelf(body, res);
      case "master-get-site-config":      return await handleMasterGetSiteConfig(body, res);
      default:
        return res.status(400).json({ error: "Unknown or missing action: '" + action + "'" });
    }
  } catch (err) {
    console.error(`backend action=${action} error:`, err);
    res.status(500).json({ error: err.message });
  }
};
