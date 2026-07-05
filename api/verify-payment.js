const https = require("https");

// Cashfree se order verify karo
async function verifyCashfreeOrder(orderId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.cashfree.com",          // production endpoint
      path: `/pg/orders/${orderId}`,
      method: "GET",
      headers: {
        "x-api-version":   "2023-08-01",
        "x-client-id":     process.env.CASHFREE_APP_ID,
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

// RTDB mein branch + premium + role update karo
// branchOwned=true  -> branch already owned (skipped), branch/premium validity fields untouched
// roleSkipped=true  -> subscription skipped, role/roleExpires fields untouched (existing role stays as-is)
async function updateRTDBPremium(prn, branch, role, branchOwned, roleSkipped) {
  const now          = Date.now();
  const premiumUntil = now + (365 * 24 * 60 * 60 * 1000); // 1 year
  const roleExpires  = now + (30  * 24 * 60 * 60 * 1000); // 1 month

  const updateFields = {};

  if (!branchOwned) {
    updateFields.branch           = branch;
    updateFields.premiumSince     = now;
    updateFields.premiumUntil     = premiumUntil;
    updateFields.premiumExpiredAt = premiumUntil;
  }

  if (!roleSkipped) {
    updateFields.role        = role;
    updateFields.roleExpires = roleExpires;
  }

  // Nothing new to write (both branch and subscription were skipped) — skip the network call
  if (Object.keys(updateFields).length === 0) {
    return { skipped: true };
  }

  const data = JSON.stringify(updateFields);

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

// Firestore mein payment record save karo
async function saveToFirestore(prn, branch, branchName, role, orderId, amount, branchOwned, roleSkipped) {
  return new Promise((resolve) => {
    const now          = Date.now();
    const premiumSince = now;
    const premiumUntil = now + (365 * 24 * 60 * 60 * 1000); // 1 year
    const roleExpires  = now + (30  * 24 * 60 * 60 * 1000); // 1 month
    const docId        = `cashfree_${orderId}`;

    const body = JSON.stringify({
      fields: {
        prn:           { stringValue:  prn },
        branch:        { stringValue:  branch },
        branchName:    { stringValue:  branchName || branch },
        role:          { stringValue:  role },
        orderId:       { stringValue:  orderId },
        amount:        { integerValue: String(Math.round(parseFloat(amount) || 0)) },
        branchOwned:   { booleanValue: !!branchOwned },
        roleSkipped:   { booleanValue: !!roleSkipped },
        branchDays:    { integerValue: "365" },
        roleDays:      { integerValue: "30" },
        status:        { stringValue:  "approved" },
        paymentMethod: { stringValue:  "cashfree_online" },
        autoApproved:  { booleanValue: true },
        createdAt:     { integerValue: String(now) },
        approvedAt:    { integerValue: String(now) },
        premiumSince:  { integerValue: String(premiumSince) },
        premiumUntil:  { integerValue: String(premiumUntil) },
        roleExpires:   { integerValue: String(roleExpires) },
        safeKey:       { stringValue:  prn }
      }
    });

    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/students-e5183/databases/(default)/documents/sy_payment_requests/${docId}`,
      method: "PATCH",
      headers: {
        "Content-Type":    "application/json",
        "Content-Length":  Buffer.byteLength(body),
        "Authorization":   `Bearer ${process.env.FIREBASE_ACCESS_TOKEN || ''}`
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { order_id, prn, branch, branchName, role, branchOwned, roleSkipped } = req.query;

    if (!order_id || !prn || !branch) {
      return res.status(400).json({ error: "Missing order_id, prn or branch" });
    }

    const resolvedRole   = (role || 'silver').toLowerCase();
    const isBranchOwned  = branchOwned  === 'true';
    const isRoleSkipped  = roleSkipped  === 'true';

    // 1. Cashfree se payment verify karo
    const order = await verifyCashfreeOrder(order_id);
    console.log("Cashfree order status:", order.order_status, "PRN:", prn, "Role:", resolvedRole, "branchOwned:", isBranchOwned, "roleSkipped:", isRoleSkipped);

    if (order.order_status !== "PAID") {
      return res.redirect(`/payment-gateway.html?prn=${prn}&branch=${branch}&branchName=${encodeURIComponent(branchName||'')}&error=payment_failed`);
    }

    // 2. RTDB update — branch/premium touched only if not owned; role/roleExpires touched only if not skipped
    await updateRTDBPremium(prn, branch, resolvedRole, isBranchOwned, isRoleSkipped);
    console.log("RTDB updated — PRN:", prn, "branch:", branch, "role:", resolvedRole, "(branchOwned:", isBranchOwned, ", roleSkipped:", isRoleSkipped, ")");

    // 3. Firestore mein record save karo
    await saveToFirestore(prn, branch, branchName, resolvedRole, order_id, order.order_amount, isBranchOwned, isRoleSkipped);
    console.log("Firestore saved — order:", order_id);

    // 4. Success page redirect
    res.redirect(`/payment-success.html?prn=${prn}&branch=${branch}&order_id=${order_id}&role=${resolvedRole}`);

  } catch (err) {
    console.error("verify-payment error:", err);
    res.status(500).json({ error: err.message });
  }
};
