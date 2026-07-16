const https = require("https");

const DB_HOST = "students-e5183-default-rtdb.firebaseio.com";

// RTDB se kisi field (uid ya prn) ke basis par record dhundo — server-side,
// DB secret se (rules bypass, safe). "students" node bhi try karta hai signup
// ke fauran baad race-condition bachane ke liye nahi, sirf "users" node use hota hai.
function fetchUserByField(field, value) {
  return new Promise((resolve, reject) => {
    const path = `/users.json?orderBy="${field}"&equalTo="${encodeURIComponent(value)}"&auth=${process.env.FIREBASE_DB_SECRET}`;
    const request = https.request({
      hostname: DB_HOST,
      path: path,
      method: "GET"
    }, (r) => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(e); }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function extractFirst(data) {
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) return null;
  const key = Object.keys(data)[0];
  return { key, userData: data[key] || {} };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body = req.method === "GET" ? req.query : (req.body || {});
    const prn  = (body.prn || "").toString().trim();
    const uid  = (body.uid || "").toString().trim();
    const mode = body.mode || "buyer";

    // "login" mode PRN se ya uid se dono se search ho sakta hai (uid tab use hota
    // hai jab user email se login kare — us case me humare paas prn pehle se nahi hota)
    if (mode === "login") {
      if (!prn && !uid) {
        return res.status(400).json({ error: "prn ya uid me se ek dena zaroori hai." });
      }

      const raw = uid
        ? await fetchUserByField("uid", uid)
        : await fetchUserByField("prn", prn);

      const found = extractFirst(raw);
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

    // Baaki sab modes (buyer/admin/receipt) sirf PRN se search hote hain — jaisa pehle tha
    if (!prn || prn.length !== 16) {
      return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
    }

    const raw = await fetchUserByField("prn", prn);
    const found = extractFirst(raw);
    if (!found) return res.status(404).json({ found: false, error: "PRN not found" });

    const userData = found.userData;

    // Sirf jitna zaroori hai utna hi wapas bhejo — email, mobile jaisi sensitive fields kabhi client tak nahi jaayengi
    const safeResponse = {
      found: true,
      uid: userData.uid || found.key,
      name: userData.name || userData.displayName || "Student",
      role: (userData.role || "").toLowerCase(),
      branch: (userData.branch || "").toLowerCase()
    };

    // "admin" mode (admin sheet ke liye) sirf role check karta hai
    if (mode === "admin") {
      return res.status(200).json({ found: true, role: safeResponse.role });
    }

    // "receipt" mode — payment receipt banane ke liye thodi zyada (par phir bhi
    // sirf zaroori, non-sensitive) fields chahiye — email/mobile abhi bhi nahi bhejte
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

  } catch (err) {
    console.error("verify-prn error:", err);
    res.status(500).json({ error: err.message });
  }
};
