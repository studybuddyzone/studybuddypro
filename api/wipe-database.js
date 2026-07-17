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

    // Yeh sabse zyada destructive action hai — sirf "master" role hi ise kar sakta hai
    const role = await getRoleByPRN(prn);
    if (role !== "master") {
      return res.status(403).json({ error: "Sirf master role hi database cleanse kar sakta hai." });
    }

    const db = admin.firestore();
    const snap = await db.collection("solo_mcq").get();
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    return res.status(200).json({ success: true, deletedCount: snap.size });

  } catch (err) {
    console.error("wipe-database error:", err);
    res.status(500).json({ error: err.message });
  }
};
