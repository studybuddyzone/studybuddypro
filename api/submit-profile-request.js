const https = require("https");

const DB_HOST = "students-e5183-default-rtdb.firebaseio.com";

function rtdbGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: DB_HOST,
      path: `${path}.json?auth=${process.env.FIREBASE_DB_SECRET}`,
      method: "GET"
    }, (r) => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.end();
  });
}

function rtdbPut(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: DB_HOST,
      path: `${path}.json?auth=${process.env.FIREBASE_DB_SECRET}`,
      method: "PUT",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    }, (r) => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Student apna (ya kisi PRN ka) profile-change request submit karta hai — yeh
// request "pending" status me RTDB me save hoti hai, admin baad me review karta hai.
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST hi allowed hai" });

  try {
    const b = req.body || {};
    const prn = (b.prn || "").toString().trim();
    if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });

    const newName  = (b.newName  || "").toString().trim();
    const newEmail = (b.newEmail || "").toString().trim();
    const newPhone = (b.newPhone || "").toString().trim();
    const newDOB   = (b.newDOB   || "").toString().trim();
    const newYear  = (b.newYear  || "").toString().trim();
    const newRole  = (b.newRole  || "").toString().trim();

    if (!newName && !newEmail && !newPhone && !newDOB && !newYear && !newRole) {
      return res.status(400).json({ error: "Kam se kam ek field badalna zaroori hai." });
    }

    const userData = (await rtdbGet(`/users/${prn}`)) || {};

    // Role-protection — client ke bataye role par bharosa nahi, RTDB ke asli
    // (current) role ke hisaab se hi decide hota hai
    let finalRoleSetting = newRole || userData.role || "student";
    if (userData.role === "master") {
      finalRoleSetting = "master";
    }

    await rtdbPut(`/profile_requests/${prn}`, {
      prn: prn,
      oldName: userData.name || "Not Available",
      newName: newName || userData.name || "Not Available",
      oldEmail: userData.email || "Not Available",
      newEmail: newEmail || userData.email || "Not Available",
      oldPhone: userData.mobile || userData.phone || "Not Available",
      newPhone: newPhone || userData.mobile || userData.phone || "Not Available",
      oldDOB: userData.dob || "Not Set",
      newDOB: newDOB || userData.dob || "Not Set",
      oldYear: userData.year || "1",
      newYear: newYear || userData.year || "1",
      oldRole: userData.role || "student",
      newRole: finalRoleSetting,
      status: "pending",
      requestedAt: Date.now()
    });

    return res.status(200).json({ success: true, currentRole: userData.role || "student" });

  } catch (err) {
    console.error("submit-profile-request error:", err);
    res.status(500).json({ error: err.message });
  }
};
