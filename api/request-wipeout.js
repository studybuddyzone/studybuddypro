const admin = require("../lib/firebaseAdmin");
const { getRoleByPRN } = require("../lib/roleCheck");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST hi allowed hai" });

  try {
    const prn = ((req.body && req.body.prn) || "").toString().trim();
    if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });

    // Role client se nahi, RTDB se (asli source of truth) verify hota hai
    const role = await getRoleByPRN(prn);
    if (!["admin", "moderator", "superadmin"].includes(role)) {
      return res.status(403).json({ error: "Aapke role ko yeh request bhejne ki anumati nahi hai." });
    }

    await admin.firestore().collection("master_requests").add({
      requestedByPRN: prn,
      role: role.toUpperCase(),
      message: `Request server wipeout triggered by ${role}`,
      status: "pending",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("request-wipeout error:", err);
    res.status(500).json({ error: err.message });
  }
};
