import express from "express";
import cors from "cors";
import Stripe from "stripe";
import nodemailer from "nodemailer";

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// IMPORTANT for Stripe webhooks later (kept simple for now)
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://sdcbstorev2.onrender.com"
  ],
  credentials: true
}));

app.use(express.json());

// ─────────────────────────────
// EMAIL SETUP
// ─────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────
// STRIPE PAYMENT INTENT
// (IMPORTANT: price should ideally be validated server-side)
// ─────────────────────────────
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { cart } = req.body;

    if (!cart || !Array.isArray(cart)) {
      return res.status(400).json({ error: "Invalid cart" });
    }

    const total = cart.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.qty || 1);
    }, 0);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────
// SHIPPING LABEL (SHIPPO)
// ─────────────────────────────
app.post("/create-shipping-label", async (req, res) => {
  try {
    const { shipping } = req.body;

    if (!shipping) {
      return res.status(400).json({ error: "Missing shipping info" });
    }

    const response = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
      },
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

    const data = await response.json();

    res.json({
      success: true,
      shipment: data,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────
// ORDER AFTER PAYMENT
// ─────────────────────────────
app.post("/create-order-after-payment", async (req, res) => {
  try {
    const { shipping, paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    // Shippo label
    const response = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
      },
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

    const data = await response.json();

    const trackingNumber =
      data?.tracking_number || data?.object_id || "Processing";

    const trackingUrl =
      data?.tracking_url_provider || data?.tracking_url || "";

    // Email
    await transporter.sendMail({
      from: `"SDCB Store" <${process.env.EMAIL_USER}>`,
      to: shipping.email,
      subject: "Your Order Confirmation + Tracking Info",
      html: `
        <h2>Thank you for your order!</h2>
        <p><strong>Name:</strong> ${shipping.name}</p>
        <p><strong>Address:</strong> ${shipping.address}, ${shipping.city}, ${shipping.state} ${shipping.zip}</p>
        <hr />
        <h3>Tracking</h3>
        <p>${trackingNumber}</p>
        <a href="${trackingUrl}">${trackingUrl}</a>
      `,
    });

    res.json({
      success: true,
      shipment: data,
      trackingNumber,
      trackingUrl,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────
// SERVER START (RENDER SAFE)
// ─────────────────────────────
const PORT = process.env.PORT || 4242;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
