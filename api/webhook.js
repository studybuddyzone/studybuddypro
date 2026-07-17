const https = require("https");
const crypto = require("crypto");

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
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // 1. Cashfree webhook signature verify karo
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const rawBody = JSON.stringify(req.body);

    if (signature && timestamp && process.env.CASHFREE_WEBHOOK_SECRET) {
      const signedPayload = timestamp + rawBody;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest("base64");

      if (signature !== expectedSignature) {
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const event = req.body;
    console.log("Webhook event:", JSON.stringify(event));

    // 2. Sirf PAYMENT_SUCCESS event handle karo
    if (event.type !== "PAYMENT_SUCCESS_WEBHOOK") {
      return res.status(200).json({ message: "Event ignored" });
    }

    const orderData = event.data?.order;
    const orderId = orderData?.order_id || "";

    // 3. Order ID se PRN aur branch nikalo
    // return_url mein hum PRN aur branch daalte hain
    // Cashfree order tags se bhi le sakte hain
    const orderTags = orderData?.order_tags || {};
    const prn = orderTags.prn || event.data?.customer_details?.customer_id;
    const branch = orderTags.branch;

    if (!prn || !branch) {
      console.log("PRN or branch missing in webhook:", { prn, branch, orderTags });
      return res.status(200).json({ message: "PRN or branch missing" });
    }

    // 4. Firebase RTDB update karo
    await updateRTDB(prn, branch);
    console.log("Webhook: Branch updated for PRN:", prn, "->", branch);

    res.status(200).json({ success: true, prn, branch });

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
};
