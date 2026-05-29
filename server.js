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
// SALE LOCATIONS — used as the tax address for in-person staff sales.
// The first entry is the default. Edit this list to add/remove venues.
// ─────────────────────────────────────────────────────
const LOCATIONS = [
  {
    id:   "main",
    name: "San Diego Store",
    address: {
      line1:       "5922 El Cajon Blvd",
      city:        "San Diego",
      state:       "CA",
      postal_code: "92115",
      country:     "US",
    },
  },
  {
    id:   "vista",
    name: "Vista Pop-up",
    address: {
      line1:       "PLACEHOLDER STREET",
      city:        "Vista",
      state:       "CA",
      postal_code: "92084",
      country:     "US",
    },
  },
  // Add more locations here as needed — each needs a unique id, a display name,
  // and a full address (line1, city, state, postal_code, country).
];

// Look up a location by id; falls back to the first entry if not found.
function getLocation(locationId) {
  return LOCATIONS.find(l => l.id === locationId) || LOCATIONS[0];
}

// Stripe processing fee — only applied when the customer opts in at checkout
const STRIPE_PCT  = 0.029;
const STRIPE_FLAT = 0.30;

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

// Gate for staff-only routes. The frontend sends the password from sessionStorage
// in the x-staff-password header.
function requireStaff(req, res, next) {
  const pw = req.headers["x-staff-password"];
  if (!process.env.STAFF_PASSWORD || pw !== process.env.STAFF_PASSWORD) {
    return res.status(401).json({ error: "Staff authentication required." });
  }
  next();
}

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
// STOCK MANAGEMENT
// ─────────────────────────────────────────────────────

// Verify the cart against current stock; throws if anything would oversell.
// Items with a blank quantity are treated as unlimited.
async function checkStock(cart) {
  const products = await getProducts();
  for (const item of cart) {
    const product = products.find(p => String(p.id) === String(item.id));
    if (!product) throw new Error(`Product not found: ${item.name || item.id}`);
    const stock = product.quantity;
    if (stock === "" || stock === null || stock === undefined) continue;
    const available = Number(stock);
    const wanted    = Number(item.qty) || 1;
    if (wanted > available) {
      throw new Error(
        available <= 0
          ? `${product.name} is out of stock.`
          : `Only ${available} of ${product.name} available (you have ${wanted} in your cart).`
      );
    }
  }
}

async function logSale(sale) {
  try {
    const res = await fetch(SHEET_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'logSale',
        secret: process.env.STOCK_SECRET,
        sale,
      }),
    });
    console.log('📊 Sale logged:', await res.text());
  } catch (err) {
    // Logging must never block a customer's checkout
    console.error('⚠️ Could not log sale (non-fatal):', err.message);
  }
}

// Decrement quantities in the sheet after a successful sale.
async function decrementStock(cart) {
  if (!process.env.STOCK_SECRET) {
    console.warn("⚠️ STOCK_SECRET not set — skipping stock update");
    return;
  }
  try {
    const items = cart.map(item => ({ id: item.id, qty: item.qty || 1 }));
    const res = await fetch(SHEET_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ secret: process.env.STOCK_SECRET, items }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    console.log("📦 Stock decremented:", data.updates);
    // Invalidate the product cache so the next read pulls fresh quantities
    productCache = { data: null, fetchedAt: 0 };
  } catch (err) {
    console.error("⚠️ Could not decrement stock (non-fatal):", err.message);
  }
}

// ─────────────────────────────────────────────────────
// STAFF LOGIN — verifies the shared staff password
// ─────────────────────────────────────────────────────
app.post("/staff-login", (req, res) => {
  if (!process.env.STAFF_PASSWORD) {
    console.error("❌ STAFF_PASSWORD env var is not set");
    return res.status(500).json({ error: "Staff login is not configured yet." });
  }
  const { password } = req.body;
  if (password && password === process.env.STAFF_PASSWORD) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Incorrect staff password." });
});

// ─────────────────────────────────────────────────────
// STAFF LOCATIONS — list of sale venues (id + name only)
// ─────────────────────────────────────────────────────
app.get("/staff/locations", requireStaff, (_req, res) => {
  res.json(LOCATIONS.map(l => ({ id: l.id, name: l.name })));
});

// ─────────────────────────────────────────────────────
// STAFF CASH SALE — records an in-person cash sale as a Stripe Invoice
// marked paid out-of-band. No card is charged. Tax is calculated and
// recorded the same way as the online card flow.
// ─────────────────────────────────────────────────────
app.post("/staff/cash-sale", requireStaff, async (req, res) => {
  console.log("💵 /staff/cash-sale called");
  try {
    const { cart, cancelPaymentIntent, locationId } = req.body;
    const location = getLocation(locationId);
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Invalid or empty cart" });
    }
    // Block overselling
    try {
      await checkStock(cart);
    } catch (stockErr) {
      return res.status(400).json({ error: stockErr.message });
    }

    // Same line-item shape as /create-payment-intent
    const lineItems = cart.map((item) => {
      const line = {
        amount:    Math.round((item.price || 0) * (item.qty || 1) * 100),
        reference: String(item.id),
        quantity:  item.qty || 1,
      };
      if (item.taxCode) line.tax_code = String(item.taxCode).trim();
      return line;
    });

    // Calculate tax at the store's location
    const calculation = await stripe.tax.calculations.create({
      currency:   "usd",
      line_items: lineItems,
      customer_details: { address: location.address, address_source: "shipping" },
    });
    const tax        = calculation.tax_amount_exclusive; // cents
    const totalCents = calculation.amount_total;         // cents (items + tax)

    // Create a fresh customer for this sale
    const customer = await stripe.customers.create({
      name:     `In-person cash sale — ${location.name}`,
      address:  location.address,
      metadata: { channel: "in_person", payment_method: "cash", location: location.name },
    });

    // Create the invoice. charge_automatically skips the customer-email
    // requirement that send_invoice has; we never actually charge anything
    // because auto_advance is off and we mark it paid out-of-band below.
    const invoice = await stripe.invoices.create({
      customer:          customer.id,
      collection_method: "charge_automatically",
      auto_advance:      false,
      description:       "In-person cash sale",
      metadata: {
        channel:         "in_person",
        payment_method:  "cash",
        tax_calculation: calculation.id,
        location:        location.name,
      },
    });

    // Add each cart item as an invoice item
    for (const item of cart) {
      await stripe.invoiceItems.create({
        customer:    customer.id,
        invoice:     invoice.id,
        description: item.name,
        quantity:    item.qty || 1,
        unit_amount: Math.round((item.price || 0) * 100),
        currency:    "usd",
      });
    }

    // Single "Sales tax" line for the calculated tax
    if (tax > 0) {
      await stripe.invoiceItems.create({
        customer:    customer.id,
        invoice:     invoice.id,
        description: "Sales tax",
        amount:      tax,
        currency:    "usd",
      });
    }

    // Finalize and mark paid out-of-band (cash collected outside Stripe)
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    const paid      = await stripe.invoices.pay(finalized.id, { paid_out_of_band: true });

    // Record the tax transaction so it shows in Stripe Tax reports
    try {
      await stripe.tax.transactions.createFromCalculation({
        calculation: calculation.id,
        reference:   paid.number || paid.id,
      });
      console.log("🧾 Tax transaction recorded for cash sale");
    } catch (taxErr) {
      console.error("❌ Tax transaction failed (non-fatal):", taxErr.message);
    }
    
    await decrementStock(cart);
    console.log(`✅ Cash sale recorded: ${paid.number} — $${(totalCents/100).toFixed(2)}`);

    await logSale({
      orderId:       paid.number || paid.id,
      site:          location.name,
      paymentMethod: 'cash',
      cart:          cart.map(it => ({ id: it.id, name: it.name, qty: it.qty, price: it.price })),
      subtotal:      (totalCents - tax) / 100,
      tax:           tax / 100,
      total:         totalCents / 100,
      timestamp:     new Date().toISOString(),
    });

    res.json({
      ok:               true,
      invoiceNumber:    paid.number,
      subtotal:         (totalCents - tax) / 100,
      tax:              tax / 100,
      total:            totalCents / 100,
      hostedInvoiceUrl: paid.hosted_invoice_url,
    });
  } catch (err) {
    console.error("❌ /staff/cash-sale error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
// CREATE PAYMENT INTENT
// ─────────────────────────────────────────────────────
app.post("/create-payment-intent", async (req, res) => {
  console.log("📥 /create-payment-intent called");
  try {
    const { cart, shipping, coverFee, donate, inPerson } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Invalid or empty cart" });
    }
    
    // Block overselling
    try {
      await checkStock(cart);
    } catch (stockErr) {
      return res.status(400).json({ error: stockErr.message });
    }

    // In-person staff sales use the store address for tax and have no shipping.
    // Online customers still need a shipping address.
    let taxAddress, shippingCents;
    let inPersonLocation = null;
    if (inPerson) {
      inPersonLocation = getLocation(req.body.locationId);
      taxAddress       = inPersonLocation.address;
      shippingCents    = 0;
    } else {
      if (!shipping?.address || !shipping?.zip) {
        return res.status(400).json({ error: "Shipping address required for tax" });
      }
      taxAddress = {
        line1:       shipping.address,
        city:        shipping.city,
        state:       shipping.state || "CA",
        postal_code: shipping.zip,
        country:     "US",
      };
      shippingCents = Math.round(SHIPPING_FEE * 100);
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
      shipping_cost: { amount: shippingCents },
      customer_details: {
        address: taxAddress,
        address_source: "shipping",
      },
    });

    const tax         = calculation.tax_amount_exclusive;             // cents
    const shippingAmt = calculation.shipping_cost.amount;             // cents
    const itemsAmt    = calculation.amount_total - tax - shippingAmt; // cents
    const preFeeTotal = calculation.amount_total;                     // cents

    // If the customer opted in, gross up so they cover Stripe's 2.9% + $0.30 fee.
    let chargeTotal   = preFeeTotal;
    let processingFee = 0;
    if (coverFee) {
      chargeTotal   = Math.round((preFeeTotal + STRIPE_FLAT * 100) / (1 - STRIPE_PCT));
      processingFee = chargeTotal - preFeeTotal;
    }
    
    // Round-up donation: bumps the charge total to the next whole dollar
    // (or adds $1 if the customer's total is already on a dollar)
    let donationCents = 0;
    if (donate) {
      const remainder = chargeTotal % 100;
      donationCents   = remainder === 0 ? 100 : (100 - remainder);
      chargeTotal    += donationCents;
    }

    console.log(
      `🧾 items $${(itemsAmt/100).toFixed(2)} | ship $${(shippingAmt/100).toFixed(2)} | ` +
      `tax $${(tax/100).toFixed(2)} | fee $${(processingFee/100).toFixed(2)} | ` +
      `donation $${(donationCents/100).toFixed(2)} | charge $${(chargeTotal/100).toFixed(2)}`
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeTotal,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        tax_calculation: calculation.id,
        tax_cents: String(calculation.tax_amount_exclusive),
        cart: JSON.stringify(cart.map(i => ({ id: i.id, qty: i.qty }))),
        ...(donationCents > 0 ? { donation_cents: String(donationCents) } : {}),
        ...(inPerson
          ? { inPerson: "true", location: inPersonLocation.name }
          : { shipping: JSON.stringify(shipping) }),
      },
    });

    console.log("✅ PaymentIntent created:", paymentIntent.id);
    res.json({
      clientSecret:  paymentIntent.client_secret,
      subtotal:      itemsAmt / 100,
      shipping:      shippingAmt / 100,
      tax:           tax / 100,
      processingFee: processingFee / 100,
      donation:      donationCents / 100,
      total:         chargeTotal / 100,
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
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    console.log("💳 Retrieving PaymentIntent:", paymentIntentId);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log("✅ Stripe status:", paymentIntent.status);

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        error: `Payment not completed. Status: ${paymentIntent.status}`,
      });
    }

    const isInPerson    = paymentIntent.metadata?.inPerson === "true";
    const taxCents      = Number(paymentIntent.metadata?.tax_cents || 0);
    const totalCents    = paymentIntent.amount;
    const subtotalCents = totalCents - taxCents;

    // Record tax transaction (both flows)
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

    // Resolve cart (body first, PI metadata as fallback)
    let cart = req.body.cart;
    if (!cart && paymentIntent.metadata?.cart) {
      try { cart = JSON.parse(paymentIntent.metadata.cart); } catch {}
    }
    if (Array.isArray(cart) && cart.length > 0) {
      await decrementStock(cart);
    }

    const safeCart = Array.isArray(cart)
      ? cart.map(it => ({ id: it.id, name: it.name, qty: it.qty, price: it.price }))
      : [];

    // ── In-person staff card sale: skip shipping/Shippo/email ──
    if (isInPerson) {
      console.log("✅ In-person card sale finalized");
      await logSale({
        orderId:       paymentIntent.id,
        site:          paymentIntent.metadata.location || "In-person",
        paymentMethod: "card",
        cart:          safeCart,
        subtotal:      subtotalCents / 100,
        tax:           taxCents / 100,
        total:         totalCents / 100,
        timestamp:     new Date().toISOString(),
      });
      return res.json({ ok: true, inPerson: true, total: totalCents / 100 });
    }

    // ── Online flow: needs shipping address ──
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

    // Create Shippo label
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

    // Send confirmation email
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

    await logSale({
      orderId:       paymentIntent.id,
      site:          "Online",
      paymentMethod: "card",
      cart:          safeCart,
      subtotal:      subtotalCents / 100,
      tax:           taxCents / 100,
      total:         totalCents / 100,
      timestamp:     new Date().toISOString(),
    });

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
