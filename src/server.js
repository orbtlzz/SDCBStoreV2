import express from "express";
import cors from "cors";
import Stripe from "stripe";

const app = express();

// ⚠️ Stripe secret key comes from Render environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// Health check (useful on Render)
app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const cart = req.body.cart || [];

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
    console.error("Payment Intent Error:", err);
    res.status(500).send({ error: err.message });
  }
});

const PORT = process.env.PORT || 4242;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});r
app.listen(4242, () => {
  console.log("Server running on http://localhost:4242");
});
