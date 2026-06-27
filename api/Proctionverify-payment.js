const https = require("https");

// Cashfree se order verify karo
async function verifyCashfreeOrder(orderId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.cashfree.com",
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
    const dbSecret = process.env.FIREBASE_DB_SECRET;
    const path = `/users/${prn}/branch.json?auth=${dbSecret}`;

    const req = https.request({
      hostname: "students-e5183-default-rtdb.firebaseio.com",
      path: path,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        console.log("RTDB update response:", d);
        resolve(JSON.parse(d));
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { order_id, prn, branch, branchName } = req.query;

    if (!order_id || !prn || !branch) {
      return res.status(400).json({ error: "Missing order_id, prn or branch" });
    }

    // 1. Cashfree se payment verify karo
    const order = await verifyCashfreeOrder(order_id);
    console.log("Cashfree order status:", order.order_status);

    if (order.order_status !== "PAID") {
      return res.redirect(`/payment-gateway.html?prn=${prn}&branch=${branch}&error=payment_failed`);
    }

    // 2. Firebase RTDB mein branch overwrite karo
    await updateRTDB(prn, branch);
    console.log("RTDB updated for PRN:", prn, "branch:", branch);

    // 3. Success page pe redirect karo
    res.redirect(`/payment-success.html?prn=${prn}&branch=${branch}&order_id=${order_id}`);

  } catch (err) {
    console.error("verify-payment error:", err);
    res.status(500).json({ error: err.message });
  }
};
