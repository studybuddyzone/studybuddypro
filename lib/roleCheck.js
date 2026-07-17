const admin = require("./firebaseAdmin");

// PRN se role RTDB se (Admin SDK — rules bypass, asli source of truth) nikalta hai
async function getRoleByPRN(prn) {
  const snap = await admin.database().ref(`users/${prn}/role`).once("value");
  return (snap.val() || "").toString().toLowerCase();
}

module.exports = { getRoleByPRN };
