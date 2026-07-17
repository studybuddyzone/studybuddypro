const admin = require("firebase-admin");

// Firebase Admin SDK ek hi baar initialize hota hai (serverless re-use ke case me
// dobara initialize na ho, isliye admin.apps.length check hai).
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://students-e5183-default-rtdb.firebaseio.com"
  });
}

// PRN se role RTDB se (Admin SDK — rules bypass, asli source of truth) nikalta hai
async function getRoleByPRN(prn) {
  const snap = await admin.database().ref(`users/${prn}/role`).once("value");
  return (snap.val() || "").toString().toLowerCase();
}

module.exports = { admin, getRoleByPRN };
