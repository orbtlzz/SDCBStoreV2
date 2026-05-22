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

// flat shipping fee charged to the customer (USD)
const SHIPPING_FEE = 9.00;

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
// PRODUCTS — pulled from Google Sheet via Apps Script
// ─────────────────────────────────────────────────────
const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbynLLqzibougdNher86Qe4fLBkfqW9L2Ou26I0DI6TUQFQH9Y-V5bjPLB5XL7N20YoyPA/exec";

let productCache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getProducts() {
  if (productCache.data && Date.now() - productCache.fetchedAt < CACHE_TTL) {
    return productCache.data;
  }
  const response = await fetch(SHEET_URL);
  if (!response.ok) throw new Error("Sheet fetch failed: " + response.status);
  const data = await response.json();
  productCache = { data, fetchedAt: Date.now() };
  return data;
}

app.get("/products", async (_req, res) => {
  try {
    res.json(await getProducts());
  } catch (err) {
    console.error("❌ /products error:", err.message);
    if (productCache.data) return res.json(productCache.data);
    res.status(500).json({ error: "Could not load products" });
  }
});

// ─────────────────────────────────────────────────────
// CREATE PAYMENT INTENT
// ─────────────────────────────────────────────────────
app.post("/create-payment-intent", async (req, res) => {
  console.log("📥 /create-payment-intent called");
  try {
    const { cart, shipping } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Invalid or empty cart" });
    }
    if (!shipping?.address || !shipping?.zip) {
      return res.status(400).json({ error: "Shipping address required for tax" });
    }

    // Line items — amounts in cents; reference must be unique per line
    const lineItems = cart.map((item) => {
      const line = {
        amount: Math.round((item.price || 0) * (item.qty || 1) * 100),
        reference: String(item.id),
        quantity: item.qty || 1,
      };
      if (item.taxCode) line.tax_code = String(item.taxCode).trim();
      return line;
    });

    // Calculate tax from the shipping address
    const calculation = await stripe.tax.calculations.create({
      currency: "usd",
      line_items: lineItems,
      shipping_cost: { amount: Math.round(SHIPPING_FEE * 100) },
      customer_details: {
        address: {
          line1: shipping.address,
          city: shipping.city,
          state: shipping.state || "CA",
          postal_code: shipping.zip,
          country: "US",
        },
        address_source: "shipping",
      },
    });

    const tax         = calculation.tax_amount_exclusive;             // cents (items + shipping tax)
    const shippingAmt = calculation.shipping_cost.amount;             // cents
    const itemsAmt    = calculation.amount_total - tax - shippingAmt; // cents

    console.log(
      `🧾 items $${(itemsAmt/100).toFixed(2)} | ship $${(shippingAmt/100).toFixed(2)} | ` +
      `tax $${(tax/100).toFixed(2)} | total $${(calculation.amount_total/100).toFixed(2)}`
    );

    // amount_total already includes items + shipping + tax — charge that
    const paymentIntent = await stripe.paymentIntents.create({
      amount: calculation.amount_total,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { tax_calculation: calculation.id, shipping: JSON.stringify(shipping) },
    });

    console.log("✅ PaymentIntent created:", paymentIntent.id);
    res.json({
      clientSecret: paymentIntent.client_secret,
      subtotal:     itemsAmt / 100,
      shipping:     shippingAmt / 100,
      tax:          tax / 100,
      total:        calculation.amount_total / 100,
    });
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
          email: "ageorge@sdcb.org",
          phone: "+16195831542",
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

  console.log("📊 All rates:", JSON.stringify(rates.map(r => ({
    provider: r.provider,
    amount: r.amount,
    object_state: r.object_state,
    attributes: r.attributes
  })), null, 2));
  console.log("📊 Shippo messages:", shipmentData.messages);

  const cheapestRate = rates
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
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      console.error("❌ Missing paymentIntentId");
      return res.status(400).json({ error: "Missing paymentIntentId" });
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

    // Resolve the shipping address: prefer the request body, but fall back
    // to the PaymentIntent metadata (covers redirect-based payments where
    // the page reloaded and lost the in-memory address).
    let shipping = req.body.shipping;
    if (!shipping && paymentIntent.metadata?.shipping) {
      try {
        shipping = JSON.parse(paymentIntent.metadata.shipping);
      } catch {
        console.error("❌ Could not parse shipping from PaymentIntent metadata");
      }
    }

    const requiredShippingFields = ["name", "email", "address", "city", "zip"];
    for (const field of requiredShippingFields) {
      if (!shipping?.[field]) {
        console.error(`❌ Missing shipping field: ${field}`);
        return res.status(400).json({ error: `Missing shipping field: ${field}` });
      }
    }

    // Record the tax transaction for reporting
    const taxCalcId = paymentIntent.metadata?.tax_calculation;
    if (taxCalcId) {
      try {
        await stripe.tax.transactions.createFromCalculation({
          calculation: taxCalcId,
          reference: paymentIntentId,
        });
        console.log("🧾 Tax transaction recorded");
      } catch (taxErr) {
        console.error("❌ Tax transaction failed (non-fatal):", taxErr.message);
      }
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
