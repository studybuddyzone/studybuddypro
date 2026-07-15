module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const body = req.body || {};
  const https = require("https");

  // FY1 Role-based pricing (No branch charge)
  const ROLE_PRICES = { silver: 39, gold: 69, diamond: 129 };
  const role        = (body.role || "silver").toLowerCase();
  const totalAmount = ROLE_PRICES[role] || 39;

  const orderId = "FY1_" + Date.now();

  const orderData = JSON.stringify({
    order_id:       orderId,
    order_amount:   totalAmount,
    order_currency: "INR",
    customer_details: {
      customer_id:    body.prn,
      customer_name:  body.name,
      customer_email: body.prn + "@studybuddypro.com",
      customer_phone: "9999999999",
    },
    order_tags: {
      prn:      body.prn  || "",
      role:     role,
      roleDays: "30"
    },
    order_meta: {
      return_url: `https://studybuddypro-psi.vercel.app/api/verify-payment-fy1?order_id={order_id}&prn=${body.prn}&role=${role}`,
      notify_url: "https://studybuddypro-psi.vercel.app/api/webhook-fy1"
    },
  });

  const options = {
    hostname: "api.cashfree.com",
    path: "/pg/orders",
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-version":   "2023-08-01",
      "x-client-id":     process.env.CASHFREE_APP_ID,
      "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const r = https.request(options, (apiRes) => {
        let data = "";
        apiRes.on("data", (c) => (data += c));
        apiRes.on("end", () => resolve(JSON.parse(data)));
      });
      r.on("error", reject);
      r.write(orderData);
      r.end();
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
