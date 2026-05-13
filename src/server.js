import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { cart } = req.body;

  if (!cart || cart.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: cart.map((item) => ({
        quantity: item.qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(item.price * 100),
          product_data: {
            name: item.name,
            description: item.description || "",
          },
        },
      })),

      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/cancel",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message });
  }
});

// start server
app.listen(4242, () => {
  console.log("Server running on http://localhost:4242");
});