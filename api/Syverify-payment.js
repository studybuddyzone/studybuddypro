const https = require("https");
const crypto = require("crypto");

// Cashfree se order verify karo
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

// Firebase RTDB mein branch overwrite karo
async function updateRTDB(prn, branch) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(branch);
    const path = `/users/${prn}/branch.json?auth=${process.env.FIREBASE_DB_SECRET}`;
    const req = https.request({
      hostname: "students-e5183-default-rtdb.firebaseio.com",
      path: path,
      method: "PUT",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
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

// Firestore mein Cashfree payment record save karo
async function saveToFirestore(prn, branch, branchName, orderId, amount, orderData) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const docId = `cashfree_${orderId}`;

    // premiumSince aur premiumUntil calculate karo (1 saal)
    const premiumSince = now;
    const premiumUntil = now + (365 * 24 * 60 * 60 * 1000);

    const body = JSON.stringify({
      fields: {
        prn:          { stringValue: prn },
        branch:       { stringValue: branch },
        branchName:   { stringValue: branchName || branch },
        orderId:      { stringValue: orderId },
        amount:       { integerValue: String(Math.round(parseFloat(amount) || 30)) },
        status:       { stringValue: "approved" },
        paymentMethod:{ stringValue: "cashfree_online" },
        autoApproved: { booleanValue: true },
        createdAt:    { integerValue: String(now) },
        approvedAt:   { integerValue: String(now) },
        premiumSince: { integerValue: String(premiumSince) },
        premiumUntil: { integerValue: String(premiumUntil) },
        safeKey:      { stringValue: prn }
      }
    });

    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/students-e5183/databases/(default)/documents/sy_payment_requests/${docId}`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${process.env.FIREBASE_ACCESS_TOKEN || ''}`
      }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", resolve); // error hone pe bhi continue karo
    req.write(body);
    req.end();
  });
}

// RTDB mein premium dates bhi update karo
async function updateRTDBPremium(prn, branch) {
  const now = Date.now();
  const premiumUntil = now + (365 * 24 * 60 * 60 * 1000);

  const data = JSON.stringify({
    branch: branch,
    premiumSince: now,
    premiumUntil: premiumUntil,
    premiumExpiredAt: premiumUntil
  });

  return new Promise((resolve, reject) => {
    const path = `/users/${prn}.json?auth=${process.env.FIREBASE_DB_SECRET}`;
    const req = https.request({
      hostname: "students-e5183-default-rtdb.firebaseio.com",
      path: path,
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
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
    console.log("Cashfree order status:", order.order_status, "for PRN:", prn);

    if (order.order_status !== "PAID") {
      return res.redirect(`/payment-gateway.html?prn=${prn}&branch=${branch}&error=payment_failed`);
    }

    // 2. RTDB mein branch + premium dates update karo
    await updateRTDBPremium(prn, branch);
    console.log("RTDB updated for PRN:", prn, "branch:", branch);

    // 3. Firestore mein cashfree payment record save karo
    await saveToFirestore(prn, branch, branchName, order_id, order.order_amount, order);
    console.log("Firestore record saved for order:", order_id);

    // 4. Success page pe redirect
    res.redirect(`/payment-success.html?prn=${prn}&branch=${branch}&order_id=${order_id}`);

  } catch (err) {
    console.error("verify-payment error:", err);
    res.status(500).json({ error: err.message });
  }
};
