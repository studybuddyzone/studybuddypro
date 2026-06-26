const https = require("https");

// Firebase Admin SDK - Manual JWT approach (no npm needed)
const FIREBASE_CONFIG = {
  projectId: "students-e5183",
  databaseURL: "https://students-e5183-default-rtdb.firebaseio.com",
  clientEmail: "firebase-adminsdk-fbsvc@students-e5183.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDDUwrXOagjgQjc\nD0b6ZAWp+hiqJl9T6vEmUufbfu39KrPKv+VRxwSNjQNInZrqc/H4p9E6q3mVXdCd\nFRW6mk290iEfLff96g7cmYJo6KYgO4X80E8RTZRs+A/gASJj/TPk7nxYDzah7Yw2\nV0xQ6rvDjuLhoiwYdlQz1P3zdzGE2n4jnBtS0DSyORx952tLDjcRvL843Qo6k4Wq\nTg8Ld+/p9skCL9BNIcxf9Hhp+S9PQWlxGLgBu74uktf4twvJ7z8beiPVj+EyrOE/\nBjPFOy0PaWF2UdjmbSo7Tfwx8e/akSdlozcVKy3CX9UzmIwLBodLVrhl3oFFHboo\nJ31/bH9NAgMBAAECggEAP5tlZl1SUe2NUwxuks/LwGS/b3l7hbp2uYI6GxKksdMc\nJaSEKzNiWi5XqWgZsMv9Onp7+l0pBOk+LElXgCMLugsZ2iuAHOIB4PjkrQFGSCza\nH1A+z2WyNiI6GTqFVoZ4Rc8cExkxM15GUNPw+FDYwIBhhhTnwzeViCOOZ6CjMZ3b\nwhL9EBvMhUgH8wAXANOB4DSiUld1gi1/Yo03YpOrTTfq8Hb/XF48UCCv8laMTtCL\nZAy1q3665oXyXUkS2vRFAwEZGmFiRJNSy/wcvyymg5TOI+bl8wuJR56+HFx3kAbd\n4TjbNd771d3nTD9/XFZRK37TBzIjC4JshEZkKRpUyQKBgQDobRbqlFmdEPJeM+WU\n3x8h4AniCAUxOs13qv3vXb8gPWItgRUFaKzC9tE1XK85hbcXtS5udSOFdludZIF6\nQLFyzooRBNpeLNRi91Y+l/8tM7vaEBFl18brSGsBICuTEwZ9nTcNyBFP8eWDbPCi\nxlhMBeCy8d2TnjvYfqsl66ypbwKBgQDXIpyE78bhUKmXpwRVIIzn//wZligYyyal\nChPQISBayHFKuXuF+dx/oVvgxokkhyYoUdpil7KCmDPcCuVRxQkdqQLVJIBLLIv+\n8rP0j77euYxB/LTHq+lkBhpB7GQfjOeBsbHlU/vh1aOLcl5cnYtbCWO14JHNdhGM\nwI2ujEItAwKBgBBFctFBSXTBdvY5U900MY3BjW+ReCuWHkQ+aECVo4eyRGlDHCGg\nzldnyAWgU3QHdGXofTOmZ7I0Mv21x4qzdLjA1NGUMWVeZg/3mMYRBgA4GvKNJWqn\nzHk0PKl7gxFsx4uLsgr48p1SJespeT8r+4p27uAYJpbrAO2LEJg7A39pAoGBAKTy\nXJ9wWEQY3G7yF1hNhLu8gUX84vFfkVmoyFgjjfMNDBAG9rZaRL12skM89ZmUJaV0\nXMSLGssWd2yWzgxLzhl3pDxXqCX7Gbt3ypIQRH/wM6HEZ7dQD7opE6jH3lxyZG4E\nGCmEovMcIjCgl8ja4iYCpPimHiQyCnKoj/jsgTCRAoGBAKskMeIB63FskUjSa3H8\nYM/XfyBmVIYlui03NZz78tgYq5ZoiXlghKdTQBAjoaMdEulsAnScQ8sth3tsSmCY\newDxiwTkGL9j22WRG3piFMDwPA0dF1uvIchYdgAVNF7v9wWxqXIsHlzjs7gR3Xhk\njsYKrKet9/3LYBggKGY9u6zs\n-----END PRIVATE KEY-----\n"
};

// Get Firebase access token
async function getFirebaseToken() {
  const crypto = require("crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: FIREBASE_CONFIG.clientEmail,
    sub: FIREBASE_CONFIG.clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/datastore"
  })).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(FIREBASE_CONFIG.privateKey, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req = https.request({
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        const json = JSON.parse(data);
        if (json.access_token) resolve(json.access_token);
        else reject(new Error("Token error: " + data));
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// Update Firebase Realtime Database
async function updateRTDB(token, prn, branch) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(branch);
    const req = https.request({
      hostname: "students-e5183-default-rtdb.firebaseio.com",
      path: `/users/${prn}/branch.json`,
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Add to Firestore sy_payment_requests as approved
async function addFirestoreRequest(token, prn, branch, branchName, orderId, amount) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const docId = `cashfree_${orderId}`;
    const body = JSON.stringify({
      fields: {
        prn: { stringValue: prn },
        branch: { stringValue: branch },
        branchName: { stringValue: branchName || branch },
        orderId: { stringValue: orderId },
        amount: { integerValue: String(amount || 30) },
        status: { stringValue: "approved" },
        paymentMethod: { stringValue: "cashfree_online" },
        createdAt: { integerValue: String(now) },
        approvedAt: { integerValue: String(now) },
        autoApproved: { booleanValue: true }
      }
    });

    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/students-e5183/databases/(default)/documents/sy_payment_requests/${docId}`,
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Verify payment with Cashfree
async function verifyCashfreeOrder(orderId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "sandbox.cashfree.com",
      path: `/pg/orders/${orderId}`,
      method: "GET",
      headers: {
        "x-api-version": "2023-08-01",
        "x-client-id": process.env.CASHFREE_APP_ID,
        "x-client-secret": process.env.CASHFREE_SECRET_KEY
      }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
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
    const { order_id, prn, branch, branchName } = req.query;

    if (!order_id || !prn || !branch) {
      return res.status(400).json({ error: "Missing order_id, prn or branch" });
    }

    // 1. Cashfree se payment verify karo
    const order = await verifyCashfreeOrder(order_id);

    if (order.order_status !== "PAID") {
      return res.redirect(`/payment-gateway.html?prn=${prn}&branch=${branch}&error=payment_failed`);
    }

    // 2. Firebase token lo
    const token = await getFirebaseToken();

    // 3. RTDB mein branch update karo
    await updateRTDB(token, prn, branch);

    // 4. Firestore mein approved record daalo
    await addFirestoreRequest(token, prn, branch, branchName, order_id, order.order_amount);

    // 5. Success page pe redirect karo
    res.redirect(`/payment-success.html?prn=${prn}&branch=${branch}&order_id=${order_id}`);

  } catch (err) {
    console.error("verify-payment error:", err);
    res.status(500).json({ error: err.message });
  }
};
