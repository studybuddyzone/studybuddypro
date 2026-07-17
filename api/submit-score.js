const admin = require("../lib/firebaseAdmin");

// Har MCQ ke liye max +4 (sahi) ya -1 (galat) milta hai — isi hisaab se ek
// "plausible range" set karte hain taaki koi bilkul random/bada score inject na kar sake.
const POINTS_CORRECT = 4;
const POINTS_WRONG = -1;
const MAX_QUESTIONS_PER_ROUND = 20; // generous upper bound

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST hi allowed hai" });

  try {
    const prn          = ((req.body && req.body.prn) || "").toString().trim();
    const name         = ((req.body && req.body.name) || "Student").toString().trim();
    const scoreDelta   = Number(req.body && req.body.scoreDelta);
    const questionCount = Number(req.body && req.body.questionCount);

    if (!/^\d{16}$/.test(prn)) return res.status(400).json({ error: "PRN exactly 16 digits ka hona chahiye." });
    if (!Number.isFinite(scoreDelta) || !Number.isFinite(questionCount)) {
      return res.status(400).json({ error: "scoreDelta aur questionCount valid number hone chahiye." });
    }
    if (questionCount < 1 || questionCount > MAX_QUESTIONS_PER_ROUND) {
      return res.status(400).json({ error: "questionCount range ke bahar hai." });
    }

    // Plausibility bound — poora anti-cheat nahi hai (answer key abhi bhi client
    // par visible hai), par yeh implausible/bahut bada score inject hone se rokta hai
    const maxPossible = questionCount * POINTS_CORRECT;
    const minPossible  = questionCount * POINTS_WRONG;
    if (scoreDelta > maxPossible || scoreDelta < minPossible) {
      return res.status(400).json({ error: "Yeh score is round ke hisaab se possible nahi hai." });
    }

    const db = admin.firestore();
    const snap = await db.collection("solo_mcq").where("prn", "==", prn).get();

    if (!snap.empty) {
      const docRef = snap.docs[0].ref;
      const oldScore = snap.docs[0].data().score || 0;
      await docRef.update({
        score: oldScore + scoreDelta,
        name: name,
        lastTestedTimestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await db.collection("solo_mcq").add({
        prn: prn,
        name: name,
        score: scoreDelta,
        lastTestedTimestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("submit-score error:", err);
    res.status(500).json({ error: err.message });
  }
};
