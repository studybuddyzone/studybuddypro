const https = require("https");
const crypto = require("crypto");

// RTDB mein role + premium data update karo
async function updateRTDB(prn, role) {
  const now          = Date.now();
  const premiumUntil = now + (365 * 24 * 60 * 60 * 1000); // 1 year
  const roleExpires  = now + (30  * 24 * 60 * 60 * 1000); // 1 month

  const data = JSON.stringify({
    role:             role,
    premiumSince:     now,
    premiumUntil:     premiumUntil,
    premiumExpiredAt: premiumUntil,
    roleExpires:      roleExpires
  });

  return new Promise((resolve, reject) => {
    const path = `/users/${prn}.json?auth=${process.env.FIREBASE_DB_SECRET}`;
    const req = https.request({
      hostname: "students-e5183-default-rtdb.firebaseio.com",
      path: path,
      method: "PATCH",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(data)
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

// Firestore mein FY1 payment record save karo
async function saveToFirestore(prn, role, orderId, amount) {
  return new Promise((resolve) => {
    const now          = Date.now();
    const premiumUntil = now + (365 * 24 * 60 * 60 * 1000);
    const roleExpires  = now + (30  * 24 * 60 * 60 * 1000);
    const docId        = `cashfree_${orderId}`;

    const body = JSON.stringify({
      fields: {
        prn:           { stringValue:  prn },
        role:          { stringValue:  role },
        orderId:       { stringValue:  orderId },
        amount:        { integerValue: String(Math.round(parseFloat(amount) || 0)) },
        roleDays:      { integerValue: "30" },
        status:        { stringValue:  "approved" },
        paymentMethod: { stringValue:  "cashfree_online" },
        autoApproved:  { booleanValue: true },
        source:        { stringValue:  "webhook" },
        createdAt:     { integerValue: String(now) },
        approvedAt:    { integerValue: String(now) },
        premiumSince:  { integerValue: String(now) },
        premiumUntil:  { integerValue: String(premiumUntil) },
        roleExpires:   { integerValue: String(roleExpires) },
        safeKey:       { stringValue:  prn }
      }
    });

    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/students-e5183/databases/(default)/documents/fy_payment_requests/${docId}`,
      method: "PATCH",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization":  `Bearer ${process.env.FIREBASE_ACCESS_TOKEN || ''}`
      }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", resolve); // error pe bhi continue
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // 1. Cashfree webhook signature verify karo
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const rawBody   = JSON.stringify(req.body);

    if (signature && timestamp && process.env.CASHFREE_WEBHOOK_SECRET) {
      const signedPayload       = timestamp + rawBody;
      const expectedSignature   = crypto
        .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest("base64");

      if (signature !== expectedSignature) {
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const event = req.body;
    console.log("FY1 Webhook event:", JSON.stringify(event));

    // 2. Sirf PAYMENT_SUCCESS event handle karo
    if (event.type !== "PAYMENT_SUCCESS_WEBHOOK") {
      return res.status(200).json({ message: "Event ignored" });
    }

    const orderData = event.data?.order;
    const orderId   = orderData?.order_id || "";

    // 3. Order tags se PRN aur role nikalo
    const orderTags = orderData?.order_tags || {};
    const prn  = orderTags.prn  || event.data?.customer_details?.customer_id;
    const role = (orderTags.role || "silver").toLowerCase();

    if (!prn) {
      console.log("PRN missing in FY1 webhook:", { prn, orderTags });
      return res.status(200).json({ message: "PRN missing" });
    }

    // FY1 order check — sirf FY1_ prefix wale orders handle karo
    if (!orderId.startsWith("FY1_")) {
      return res.status(200).json({ message: "Not a FY1 order, ignored" });
    }

    // 4. RTDB update karo
    await updateRTDB(prn, role);
    console.log("FY1 Webhook: Role updated — PRN:", prn, "Role:", role);

    // 5. Firestore mein record save karo
    const amount = event.data?.payment?.payment_amount || 0;
    await saveToFirestore(prn, role, orderId, amount);
    console.log("FY1 Webhook: Firestore saved — order:", orderId);

    res.status(200).json({ success: true, prn, role });

  } catch (err) {
    console.error("FY1 Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
};
