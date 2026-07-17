const admin = require("../lib/firebaseAdmin");
const { getRoleByPRN } = require("../lib/roleCheck");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST hi allowed hai" });

  try {
    const prn    = ((req.body && req.body.prn)    || "").toString().trim();
    const action = ((req.body && req.body.action) || "").toString().trim();
    const roomId = ((req.body && req.body.roomId) || "").toString().trim();

    if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });

    // Sirf "master" role hi rooms manage kar sakta hai — RTDB se (client se nahi) confirm hota hai
    const role = await getRoleByPRN(prn);
    if (role !== "master") {
      return res.status(403).json({ error: "Sirf master role hi rooms manage kar sakta hai." });
    }

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
      let batch = db.batch();
      let count = 0;
      snap.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
        if (count % 400 === 0) { batches.push(batch); batch = db.batch(); }
      });
      batches.push(batch);
      await Promise.all(batches.map((b) => b.commit()));
      return res.status(200).json({ success: true, deletedCount: snap.size });
    }

    return res.status(400).json({ error: "Unknown action." });

  } catch (err) {
    console.error("manage-rooms error:", err);
    res.status(500).json({ error: err.message });
  }
};
