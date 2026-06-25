module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const body = req.body || {};
  const https = require("https");

  const orderData = JSON.stringify({
    order_id: "SBP_" + Date.now(),
    order_amount: body.amount || 30,
    order_currency: "INR",
    customer_details: {
      customer_id: body.prn || "TEST001",
      customer_name: body.name || "Student",
      customer_email: "student@studybuddypro.com",
      customer_phone: "9999999999",
    },
    order_meta: {
      return_url: "https://studybuddypro-psi.vercel.app/payment-gateway.html?order_id={order_id}&status=paid",
    },
  });

  const options = {
    hostname: "sandbox.cashfree.com",
    path: "/pg/orders",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2023-08-01",
      "x-client-id": process.env.CASHFREE_APP_ID,
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
