const https = require("https");

// RTDB se PRN ke basis par record fetch karo (server-side, DB secret se — rules bypass, safe)
function fetchUserByPRN(prn) {
  return new Promise((resolve, reject) => {
    const path = `/users.json?orderBy="prn"&equalTo="${encodeURIComponent(prn)}"&auth=${process.env.FIREBASE_DB_SECRET}`;
    const req = https.request({
      hostname: "students-e5183-default-rtdb.firebaseio.com",
      path: path,
      method: "GET"
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // GET query se ya POST body se dono se prn le lo (frontend दोनों तरह से call कर सकता है)
    const prn = (req.method === "GET" ? req.query.prn : req.body && req.body.prn) || "";
    const mode = (req.method === "GET" ? req.query.mode : req.body && req.body.mode) || "buyer";

    if (!prn || String(prn).trim().length !== 16) {
      return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
    }

    const data = await fetchUserByPRN(String(prn).trim());

    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      return res.status(404).json({ found: false, error: "PRN not found" });
    }

    // RTDB query object ke roop me aata hai: { "<key>": {...userData} }
    const key = Object.keys(data)[0];
    const userData = data[key] || {};

    // Sirf jitna zaroori hai utna hi wapas bhejo — email, mobile jaisi sensitive fields kabhi client tak nahi jaayengi
    const safeResponse = {
      found: true,
      uid: userData.uid || key,
      name: userData.name || userData.displayName || "Student",
      role: (userData.role || "").toLowerCase(),
      branch: (userData.branch || "").toLowerCase()
    };

    // "admin" mode (admin sheet ke liye) sirf role check karta hai, name/branch ki zaroorat nahi — par bhejne me harm nahi
    if (mode === "admin") {
      return res.status(200).json({ found: true, role: safeResponse.role });
    }

    return res.status(200).json(safeResponse);

  } catch (err) {
    console.error("verify-prn error:", err);
    res.status(500).json({ error: err.message });
  }
};
