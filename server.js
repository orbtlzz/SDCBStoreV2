import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import nodemailer from "nodemailer";

const app = express();

// ─────────────────────────────────────────────────────
// STRIPE
// ─────────────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─────────────────────────────────────────────────────
// CORS  (registered BEFORE routes and express.json)
// ─────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://sdcbstorev2.onrender.com",
    ],
    credentials: true,
  })
);

app.use(express.json());

// ─────────────────────────────────────────────────────
// NODEMAILER — Gmail App Password setup
// 1. Enable 2-Step Verification on your Google account
// 2. Google Account → Security → App Passwords
// 3. Generate a 16-char password for "Mail"
// 4. Set EMAIL_PASS=<that 16-char password> in Render env vars
// 5. EMAIL_USER=your.address@gmail.com
// ─────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  connectionTimeout: 30000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// ─────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ─────────────────────────────────────────────────────
// CREATE PAYMENT INTENT
// ─────────────────────────────────────────────────────
app.post("/create-payment-intent", async (req, res) => {
  console.log("📥 /create-payment-intent called");
  try {
    const { cart } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Invalid or empty cart" });
    }

    const total = cart.reduce(
      (sum, item) => sum + (item.price || 0) * (item.qty || 1),
      0
    );

    console.log(`💰 Creating PaymentIntent for $${total.toFixed(2)}`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    console.log("✅ PaymentIntent created:", paymentIntent.id);
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("❌ /create-payment-intent error:", err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
// HELPER — Shippo: create shipment and purchase label
//   1. POST /shipments/  (async:false → rates included in response)
//   2. Pick cheapest valid rate
//   3. POST /transactions/ with rate.object_id → tracking number lives HERE
// ─────────────────────────────────────────────────────
async function createShippoLabel(shipping) {
  const shippoHeaders = {
    "Content-Type": "application/json",
    Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
  };

  // ── Step 1: Create shipment ──────────────────────────────────────────
  console.log("🚚 Creating Shippo shipment...");
  const shipmentRes = await fetch("https://api.goshippo.com/shipments/", {
    method: "POST",
    headers: shippoHeaders,
    body: JSON.stringify({
      address_from: {
        name: "San Diego Center for the Blind",
        street1: "5922 El Cajon Blvd",
        city: "San Diego",
        state: "CA",
        zip: "92115",
        country: "US",
      },
      address_to: {
        name: shipping.name,
        // FIX: frontend sends `address`, not `address1`
        street1: shipping.address,
        city: shipping.city,
        state: shipping.state || "CA",
        zip: shipping.zip,
        country: "US",
      },
      parcels: [
        {
          length: "10",
          width: "5",
          height: "5",
          distance_unit: "in",
          weight: "1",
          mass_unit: "lb",
        },
      ],
      async: false,
    }),
  });

  const shipmentData = await shipmentRes.json();
  console.log("📦 Shipment created:", shipmentData.object_id);

  if (!shipmentRes.ok) {
    throw new Error(
      `Shippo shipment failed: ${JSON.stringify(shipmentData.messages || shipmentData)}`
    );
  }

  const rates = shipmentData.rates || [];
  if (rates.length === 0) {
    throw new Error(
      "Shippo returned zero rates. Check the destination address and parcel dimensions."
    );
  }

  const cheapestRate = rates
    .filter((r) => r.object_state === "VALID")
    .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))[0];

  if (!cheapestRate) {
    throw new Error("No valid Shippo rates available for this shipment.");
  }

  console.log(
    `📮 Cheapest rate: ${cheapestRate.provider} ${cheapestRate.servicelevel?.name} — $${cheapestRate.amount}`
  );

  // ── Step 2: Purchase label (transaction) ─────────────────────────────
  console.log("🏷️  Purchasing Shippo label...");
  const txRes = await fetch("https://api.goshippo.com/transactions/", {
    method: "POST",
    headers: shippoHeaders,
    body: JSON.stringify({
      rate: cheapestRate.object_id,
      label_file_type: "PDF",
      async: false,
    }),
  });

  const txData = await txRes.json();
  console.log("🏷️  Transaction response:", txData.object_id, txData.status);

  if (!txRes.ok || txData.status === "ERROR") {
    throw new Error(
      `Shippo transaction failed: ${JSON.stringify(txData.messages || txData)}`
    );
  }

  console.log("📦 FINAL SHIPPO RESULT:", {
    trackingNumber: txData.tracking_number,
    trackingUrl:    txData.tracking_url_provider,
    labelUrl:       txData.label_url,
    carrier:        txData.tracking_carrier,
    status:         txData.status,
  });

  return {
    trackingNumber: txData.tracking_number || "Processing",
    trackingUrl:    txData.tracking_url_provider || "",
    labelUrl:       txData.label_url || "",
    carrier:        txData.tracking_carrier || cheapestRate.provider,
  };
}

// ─────────────────────────────────────────────────────
// CREATE ORDER AFTER PAYMENT
// Called by frontend AFTER stripe.confirmPayment() succeeds.
// Expects: { paymentIntentId, shipping: { name, email, address, city, state, zip } }
// ─────────────────────────────────────────────────────
app.post("/create-order-after-payment", async (req, res) => {
  console.log("🔥 /create-order-after-payment called");
  console.log("📦 Body received:", JSON.stringify(req.body, null, 2));

  try {
    const { shipping, paymentIntentId } = req.body;

    if (!paymentIntentId) {
      console.error("❌ Missing paymentIntentId");
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    // FIX: validate `address` (matches frontend), not `address1`
    const requiredShippingFields = ["name", "email", "address", "city", "zip"];
    for (const field of requiredShippingFields) {
      if (!shipping?.[field]) {
        console.error(`❌ Missing shipping field: ${field}`);
        return res.status(400).json({ error: `Missing shipping field: ${field}` });
      }
    }

    // ── Verify payment with Stripe ───────────────────────────────────
    console.log("💳 Retrieving PaymentIntent:", paymentIntentId);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log("✅ Stripe status:", paymentIntent.status);

    if (paymentIntent.status !== "succeeded") {
      return res
        .status(400)
        .json({ error: `Payment not completed. Status: ${paymentIntent.status}` });
    }

    // ── Create Shippo label ──────────────────────────────────────────
    let shippoResult;
    try {
      shippoResult = await createShippoLabel(shipping);
      console.log("✅ Shippo tracking:", shippoResult.trackingNumber);
    } catch (shippoErr) {
      console.error("❌ Shippo error (non-fatal):", shippoErr.message);
      shippoResult = {
        trackingNumber: "Pending — contact store for tracking",
        trackingUrl:    "",
        labelUrl:       "",
        carrier:        "",
      };
    }

    // ── Send confirmation email (RESTORED) ───────────────────────────
    console.log("📧 Sending confirmation email to:", shipping.email);
    try {
      await transporter.sendMail({
        from:    `"SDCB Store" <${process.env.EMAIL_USER}>`,
        to:      shipping.email,
        subject: "Your Order Confirmation + Tracking Info — SDCB Store",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0D3D6E;">Thank you for your order!</h2>
            <p>We appreciate your support of the San Diego Center for the Blind.</p>

            <h3>Shipping To</h3>
            <p>
              ${shipping.name}<br/>
              ${shipping.address}<br/>
              ${shipping.city}, ${shipping.state || "CA"} ${shipping.zip}
            </p>

            <h3>Tracking</h3>
            <p><strong>Carrier:</strong> ${shippoResult.carrier || "TBD"}</p>
            <p><strong>Tracking Number:</strong> ${shippoResult.trackingNumber}</p>
            ${
              shippoResult.trackingUrl
                ? `<p><a href="${shippoResult.trackingUrl}" style="color: #1B75BB;">Track your package</a></p>`
                : ""
            }

            <hr/>
            <p style="font-size: 0.85rem; color: #666;">
              San Diego Center for the Blind · 5922 El Cajon Blvd, San Diego, CA 92115 · (619) 583-1542
            </p>
          </div>
        `,
      });
      console.log("✅ Email sent to:", shipping.email);
    } catch (mailErr) {
      console.error("❌ Email send failed (non-fatal):", mailErr.message);
    }

    return res.json({
      success:        true,
      trackingNumber: shippoResult.trackingNumber,
      trackingUrl:    shippoResult.trackingUrl,
      labelUrl:       shippoResult.labelUrl,
    });
  } catch (err) {
    console.error("❌ /create-order-after-payment fatal error:", err.stack);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
// STANDALONE SHIPPING LABEL ROUTE
// ─────────────────────────────────────────────────────
app.post("/create-shipping-label", async (req, res) => {
  console.log("📥 /create-shipping-label called");
  try {
    const { shipping } = req.body;
    const result = await createShippoLabel(shipping);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("❌ /create-shipping-label error:", err.stack);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 4242;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);

  const required = [
    "STRIPE_SECRET_KEY",
    "SHIPPO_API_KEY",
    "EMAIL_USER",
    "EMAIL_PASS",
  ];
  let missing = false;
  for (const key of required) {
    if (process.env[key]) {
      console.log(`   ✅ ${key} is set`);
    } else {
      console.error(`   ❌ MISSING: ${key}`);
      missing = true;
    }
  }
  if (missing) {
    console.error("⚠️  One or more env vars are missing. Routes that need them will fail.");
  }
});
