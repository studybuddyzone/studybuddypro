const admin = require("firebase-admin");

// Firebase Admin SDK ek hi baar initialize hota hai. Yahan try/catch isliye hai
// taaki agar FIREBASE_SERVICE_ACCOUNT_KEY missing/malformed ho, toh poora function
// crash (aur non-JSON "server error" page) na de — uski jagah ek saaf JSON error
// message wapas jaaye jisse debug karna aasan ho.
let initError = null;

if (!admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable set nahi hai Vercel par.");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://students-e5183-default-rtdb.firebaseio.com"
    });
  } catch (err) {
    initError = err;
  }
}

// PRN se role RTDB se (Admin SDK — rules bypass, asli source of truth) nikalta hai
async function getRoleByPRN(prn) {
  if (initError) throw initError;
  const snap = await admin.database().ref(`users/${prn}/role`).once("value");
  return (snap.val() || "").toString().toLowerCase();
}

module.exports = { admin, getRoleByPRN, initError };
