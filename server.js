import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());


// ─────────────────────────────────────────────
// STRIPE PAYMENT ROUTE
// ─────────────────────────────────────────────
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { cart } = req.body;

    const total = cart.reduce((sum, item) => {
      return sum + item.price * item.qty;
    }, 0);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "usd",
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// STEP 3: SHIPPING LABEL ROUTE (THIS IS WHERE IT GOES)
// ─────────────────────────────────────────────
app.post("/create-shipping-label", async (req, res) => {
  try {
    const { shipping } = req.body;

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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/create-order-after-payment", async (req, res) => {
  try {
    const { shipping, paymentIntentId } = req.body;

    // 1. VERIFY PAYMENT WITH STRIPE
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    // 2. CREATE SHIPPING LABEL WITH SHIPPO
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

    return res.json({
      success: true,
      shipment: data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 4242;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

