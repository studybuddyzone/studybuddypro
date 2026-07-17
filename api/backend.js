const { admin, getRoleByPRN } = require("../lib/helpers");

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

  if (!uid) return res.status(400).json({ error: "uid missing hai (pehle Firebase Auth account banayein)." });
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: "Mobile number exactly 10 digits ka hona chahiye." });
  if (!/^\d{16}$/.test(prn))    return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
  if (!email.includes("@"))    return res.status(400).json({ error: "Valid email zaroori hai." });
  if (!name)                    return res.status(400).json({ error: "Name zaroori hai." });

  const db = admin.database();
  const existingSnap = await db.ref(`users/${prn}`).once("value");
  if (existingSnap.exists()) return res.status(409).json({ error: "Yeh PRN pehle se kisi account se register hai." });

  await db.ref(`users/${prn}`).set({ uid, name, mobile, prn, email, role: "student", year, createdAt: Date.now() });
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

// ── Router ────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = (req.query && req.query.action) || (req.body && req.body.action) || "";
  const body = req.method === "GET" ? (req.query || {}) : (req.body || {});

  try {
    switch (action) {
      case "verify-prn":             return await handleVerifyPrn(body, res);
      case "register-user":          return await handleRegisterUser(body, res);
      case "demote-role":            return await handleDemoteRole(body, res);
      case "request-wipeout":        return await handleRequestWipeout(body, res);
      case "reset-scores":           return await handleResetScores(body, res);
      case "wipe-database":          return await handleWipeDatabase(body, res);
      case "submit-score":           return await handleSubmitScore(body, res);
      case "submit-profile-request": return await handleSubmitProfileRequest(body, res);
      case "manage-rooms":           return await handleManageRooms(body, res);
      default:
        return res.status(400).json({ error: "Unknown or missing action: '" + action + "'" });
    }
  } catch (err) {
    console.error(`backend action=${action} error:`, err);
    res.status(500).json({ error: err.message });
  }
};
