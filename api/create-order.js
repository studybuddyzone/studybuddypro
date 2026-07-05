module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const body = req.body || {};
  const https = require("https");

  // Role-based pricing
  const BRANCH_PRICE  = 39;
  const ROLE_PRICES   = { silver: 49, gold: 89, diamond: 162 };
  const SKIP_PRICE    = 5; // Charged when branch or subscription is skipped (already owned)

  const role          = (body.role || 'silver').toLowerCase();
  const branchOwned   = body.branchOwned  === true || body.branchOwned  === 'true';
  const roleSkipped   = body.roleSkipped  === true || body.roleSkipped  === 'true';

  const branchCharge  = branchOwned ? SKIP_PRICE : BRANCH_PRICE;
  const rolePrice     = roleSkipped ? SKIP_PRICE : (ROLE_PRICES[role] || BRANCH_PRICE);
  const totalAmount   = body.amount !== undefined ? Number(body.amount) : (branchCharge + rolePrice); // frontend sends pre-calculated amount; fallback here

  const orderId = "SBP_" + Date.now();

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
      prn:          body.prn        || "",
      branch:       body.branch     || "",
      branchName:   body.branchName || "",
      role:         role,
      branchOwned:  String(branchOwned),
      roleSkipped:  String(roleSkipped),
      branchDays:   "365",
      roleDays:     "30"
    },
    order_meta: {
      return_url: `https://studybuddypro-psi.vercel.app/api/verify-payment?order_id={order_id}&prn=${body.prn}&branch=${body.branch}&branchName=${encodeURIComponent(body.branchName || body.branch || "")}&role=${role}&branchOwned=${branchOwned}&roleSkipped=${roleSkipped}`,
      notify_url: "https://studybuddypro-psi.vercel.app/api/webhook"
    },
  });

  const options = {
    hostname: "api.cashfree.com",
    path: "/pg/orders",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2023-08-01",
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
