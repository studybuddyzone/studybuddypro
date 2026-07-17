const https = require("https");

const DB_HOST = "students-e5183-default-rtdb.firebaseio.com";

function rtdbPutRole(prn, value) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(value);
    const req = https.request({
      hostname: DB_HOST,
      path: `/users/${prn}/role.json?auth=${process.env.FIREBASE_DB_SECRET}`,
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

// Premium expiry hone par role ko 'student' par wapas karne ke liye —
// yeh sirf role field ko 'student' set karta hai, kuch aur nahi chhedta.
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST hi allowed hai" });

  try {
    const prn = ((req.body && req.body.prn) || "").toString().trim();
    if (!/^\d{16}$/.test(prn)) {
      return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
    }

    await rtdbPutRole(prn, "student");
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("demote-role error:", err);
    res.status(500).json({ error: err.message });
  }
};
