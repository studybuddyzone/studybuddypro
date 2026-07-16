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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST hi allowed hai" });

  try {
    const body = req.body || {};
    const uid    = (body.uid    || "").toString().trim();
    const name   = (body.name   || "").toString().trim();
    const mobile = (body.mobile || "").toString().trim();
    const prn    = (body.prn    || "").toString().trim();
    const email  = (body.email  || "").toString().trim();
    const year   = (body.year   || "1").toString().trim();

    // Server-side validation — client-side validation par bharosa nahi karte
    if (!uid) return res.status(400).json({ error: "uid missing hai (pehle Firebase Auth account banayein)." });
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: "Mobile number exactly 10 digits ka hona chahiye." });
    if (!/^\d{16}$/.test(prn))    return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
    if (!email.includes("@"))    return res.status(400).json({ error: "Valid email zaroori hai." });
    if (!name)                    return res.status(400).json({ error: "Name zaroori hai." });

    // Duplicate PRN check — kisi aur account ne pehle se yeh PRN use to nahi kiya
    const existing = await rtdbGet(`/users/${prn}`);
    if (existing) {
      return res.status(409).json({ error: "Yeh PRN pehle se kisi account se register hai." });
    }

    const coreUserData = {
      uid, name, mobile, prn, email,
      role: "student",
      year,
      createdAt: Date.now()
    };

    await rtdbPut(`/users/${prn}`, coreUserData);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("register-user error:", err);
    res.status(500).json({ error: err.message });
  }
};
