import express from "express";
import cors from "cors";
import Stripe from "stripe";
import Shippo from "shippo";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const shippo = Shippo(process.env.SHIPPO_API_KEY);

const app = express();

app.use(cors());
app.use(express.json());

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

app.listen(4242, () => {
  console.log("Server running on port 4242");
});
