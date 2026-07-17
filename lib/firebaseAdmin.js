const admin = require("firebase-admin");

// Yeh file sirf ek baar Firebase Admin initialize karti hai (serverless function
// re-use ke case me dobara initialize na ho, isliye admin.apps.length check hai).
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://students-e5183-default-rtdb.firebaseio.com"
  });
}

module.exports = admin;
