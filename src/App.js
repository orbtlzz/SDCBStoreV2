// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ─── Validate frontend env vars at boot ────────────────────────────
const REQUIRED_ENV = {
  REACT_APP_SERVER_URL:           process.env.REACT_APP_SERVER_URL,
  REACT_APP_STRIPE_PUBLISHABLE_KEY: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
};
for (const [key, val] of Object.entries(REQUIRED_ENV)) {
  if (!val) console.error(`❌ Missing env var at build time: ${key}`);
  else      console.log(`✅ ${key} is set (${val.slice(0, 20)}…)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE INIT  ← replace with your real publishable key
// ─────────────────────────────────────────────────────────────────────────────

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// SDCB Brand Colors
// ─────────────────────────────────────────────────────────────────────────────
const SDCB = {
  blue:      "#1B75BB",
  navy:      "#0D3D6E",
  skyLight:  "#E8F3FB",
  skyMid:    "#5AACDF",
  white:     "#FFFFFF",
  offWhite:  "#F5FAFF",
  gray:      "#4A5568",
  lightGray: "#E2EDF7",
  hcBg:      "#000000",
  hcYellow:  "#FFD700",
  hcText:    "#FFFFFF",
};

// ─────────────────────────────────────────────────────────────────────────────
// ARIA LIVE ANNOUNCER  (screen-reader only, no audio)
// ─────────────────────────────────────────────────────────────────────────────
function Announcer({ message }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
      }}
    >
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DATA
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: 1,
    name: "Talking Atomic Clock",
    category: "Time",
    price: 34.99,
    emoji: "🕐",
    description:
      "Announces the time and date aloud at the press of a button. Auto-syncs to atomic time for accuracy. Loud, clear voice with adjustable volume.",
  },
  {
    id: 2,
    name: "Braille Labeler Kit",
    category: "Organization",
    price: 27.5,
    emoji: "🏷️",
    description:
      "Create tactile Braille labels for cans, spice jars, medicine bottles, and more. Comes with 3 label tape rolls and a quick-start guide in large print.",
  },
  {
    id: 3,
    name: "Talking Kitchen Scale",
    category: "Cooking",
    price: 42.0,
    emoji: "⚖️",
    description:
      "Reads weight aloud in grams or ounces. Features a flat, easy-clean surface, large tactile buttons, and clear speech output for confident cooking.",
  },
  {
    id: 4,
    name: "Talking Thermometer",
    category: "Cooking",
    price: 19.99,
    emoji: "🌡️",
    description:
      "Instant-read food thermometer that speaks the temperature in Fahrenheit or Celsius. Long probe, tactile button, and automatic shut-off to save battery.",
  },
  {
    id: 5,
    name: "Portable Screen Magnifier",
    category: "Reading",
    price: 89.0,
    emoji: "🔍",
    description:
      "Handheld electronic magnifier with 4× to 14× zoom and high-contrast color modes. Lightweight and USB-rechargeable for use at home or on the go.",
  },
  {
    id: 6,
    name: "Talking Blood Pressure Monitor",
    category: "Health",
    price: 55.0,
    emoji: "💓",
    description:
      "Reads systolic, diastolic, and pulse values aloud after each measurement. Large arm cuff, simple one-button operation, and memory for 60 readings.",
  },
  {
    id: 7,
    name: "Folding White Cane",
    category: "Mobility",
    price: 24.95,
    emoji: "🦯",
    description:
      "Lightweight aluminum folding cane with a comfortable wrist strap and reflective stripe for night visibility. Folds to 12 inches for easy storage.",
  },
  {
    id: 8,
    name: "Talking Calculator",
    category: "Daily Life",
    price: 18.5,
    emoji: "🔢",
    description:
      "Speaks every key press and result aloud. Large tactile buttons with a raised dot on the 5-key for orientation. Includes earphone jack for private use.",
  },
  {
    id: 9,
    name: "Large-Print Recipe Book",
    category: "Cooking",
    price: 22.0,
    emoji: "📖",
    description:
      "50 simple, healthy recipes printed in 24-point bold font with high-contrast black on cream paper. Lay-flat spiral binding keeps pages open hands-free.",
  },
  {
    id: 10,
    name: "Braille Playing Cards",
    category: "Daily Life",
    price: 12.0,
    emoji: "🃏",
    description:
      "Standard 52-card deck with Braille suit and rank markings alongside printed text. Durable coated cards for long-lasting enjoyment.",
  },
  {
    id: 11,
    name: "Talking Color Identifier",
    category: "Daily Life",
    price: 39.0,
    emoji: "🎨",
    description:
      "Point at any surface and hear its color announced instantly. Identifies 150 colors. Great for matching outfits, checking paint, or sorting laundry.",
  },
  {
    id: 12,
    name: "Audio Descriptive Earbuds",
    category: "Mobility",
    price: 49.0,
    emoji: "🎧",
    description:
      "Bone-conduction earbuds that keep ears open to surrounding sounds while delivering audio descriptions. Comfortable, sweatproof, and rechargeable.",
  },
];

const CATEGORIES = ["All", ...new Set(PRODUCTS.map((p) => p.category))];

// ─────────────────────────────────────────────────────────────────────────────
// AI DESCRIPTION via Claude API
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAIDescription(product) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are an expert at writing vivid, practical product descriptions for blind and visually impaired shoppers. 
Write a 2-sentence audio description for the following product that would be read aloud by a screen reader. 
Focus on tactile qualities, sounds, size, and practical use — not visual appearance.
Product: ${product.name}
Basic description: ${product.description}
Respond with only the 2-sentence description, no extra text.`,
        },
      ],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "Description unavailable.";
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BUTTON STYLE HELPER
// ─────────────────────────────────────────────────────────────────────────────
function btnStyle(highContrast, variant) {
  const base = {
    border: "none",
    borderRadius: 8,
    padding: "0.5rem 0.9rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
    outline: "none",
  };
  if (variant === "primary") {
    return {
      ...base,
      background: highContrast ? SDCB.hcYellow : SDCB.blue,
      color: highContrast ? SDCB.hcBg : SDCB.white,
      width: "100%",
      padding: "0.65rem",
      fontSize: "0.95rem",
    };
  }
  return {
    ...base,
    background: highContrast ? "#222" : SDCB.skyLight,
    color: highContrast ? SDCB.hcYellow : SDCB.navy,
    border: highContrast
      ? `1.5px solid ${SDCB.hcYellow}`
      : `1.5px solid ${SDCB.lightGray}`,
    flex: 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CART BADGE
// ─────────────────────────────────────────────────────────────────────────────
function CartBadge({ count }) {
  return (
    <span
      style={{
        background: "#C8873A",
        color: "#fff",
        borderRadius: "50%",
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        marginLeft: 6,
      }}
      aria-label={`${count} items in cart`}
    >
      {count}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CARD
// ─────────────────────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, onAnnounce, highContrast }) {
  const [aiDesc, setAiDesc] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [added, setAdded] = useState(false);
  const addBtnRef = useRef(null);

  const handleAIDesc = useCallback(async () => {
    if (aiDesc) {
      onAnnounce(`AI description already available for ${product.name}`);
      return;
    }
    setLoadingAI(true);
    onAnnounce(`Generating AI description for ${product.name}`);
    try {
      const desc = await fetchAIDescription(product);
      setAiDesc(desc);
      onAnnounce(`AI description ready for ${product.name}`);
    } catch {
      onAnnounce("Could not load AI description. Please try again.");
    } finally {
      setLoadingAI(false);
    }
  }, [product, aiDesc, onAnnounce]);

  const handleAdd = () => {
    onAddToCart(product);
    setAdded(true);
    onAnnounce(`${product.name} added to cart`);
    setTimeout(() => setAdded(false), 1800);
  };

  const cardStyle = {
    background: highContrast ? SDCB.hcBg : SDCB.white,
    border: highContrast
      ? `2px solid ${SDCB.hcYellow}`
      : `1.5px solid ${SDCB.lightGray}`,
    borderRadius: 12,
    padding: "1.4rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.7rem",
    transition: "box-shadow 0.2s",
    outline: "none",
    boxShadow: highContrast ? "none" : "0 2px 8px rgba(27,117,187,0.07)",
  };

  return (
    <article
      style={cardStyle}
      aria-label={`${product.name}, $${product.price}. ${product.description}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleAdd();
        }
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 40, lineHeight: 1, textAlign: "center" }}>
        {product.emoji}
      </div>

      <span
        aria-hidden="true"
        style={{
          background: highContrast ? SDCB.hcYellow : SDCB.skyLight,
          color: highContrast ? SDCB.hcBg : SDCB.blue,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          borderRadius: 20,
          padding: "2px 10px",
          alignSelf: "flex-start",
          border: highContrast ? "none" : `1px solid ${SDCB.lightGray}`,
        }}
      >
        {product.category}
      </span>

      <p
        aria-hidden="true"
        style={{
          margin: 0,
          fontSize: "1.1rem",
          fontFamily: "'Playfair Display', Georgia, serif",
          color: highContrast ? SDCB.hcYellow : SDCB.navy,
          lineHeight: 1.3,
          fontWeight: 700,
        }}
      >
        {product.name}
      </p>

      <p
        aria-hidden="true"
        style={{
          margin: 0,
          fontSize: "0.88rem",
          color: highContrast ? SDCB.hcText : SDCB.gray,
          lineHeight: 1.6,
          flexGrow: 1,
        }}
      >
        {aiDesc || product.description}
      </p>

      {aiDesc && (
        <p
          aria-hidden="true"
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: highContrast ? SDCB.hcYellow : SDCB.skyMid,
            fontStyle: "italic",
          }}
        >
          ✦ AI-enhanced description
        </p>
      )}

      <p
        aria-hidden="true"
        style={{
          margin: 0,
          fontSize: "1.25rem",
          fontWeight: 700,
          color: highContrast ? SDCB.hcYellow : SDCB.blue,
          fontFamily: "'Playfair Display', Georgia, serif",
        }}
      >
        ${product.price.toFixed(2)}
      </p>

      <button
        onClick={handleAIDesc}
        disabled={loadingAI}
        style={btnStyle(highContrast, "secondary")}
        aria-label={`Get AI description for ${product.name}`}
      >
        {loadingAI ? "⏳ Loading…" : "✦ AI Visual Description"}
      </button>

      <button
        ref={addBtnRef}
        onClick={handleAdd}
        aria-label={`Add ${product.name} to cart, $${product.price}`}
        style={{
          ...btnStyle(highContrast, "primary"),
          background: added
            ? highContrast ? "#007700" : "#2A7D4A"
            : highContrast ? SDCB.hcYellow : SDCB.blue,
          color: added ? SDCB.white : highContrast ? SDCB.hcBg : SDCB.white,
        }}
      >
        {added ? "✓ Added!" : "Add to Cart"}
      </button>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT FORM  (must live inside <Elements>)
// FIX: capture result.paymentIntent.id and hand it to parent via
// onPaymentComplete(id). Parent opens the ShippingModal next.
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutForm({ total, onPaymentComplete, onCancel, highContrast, onAnnounce }) {
  const stripe    = useStripe();
  const elements  = useElements();
  const errorRef  = useRef(null);

  const [status,   setStatus]   = useState("idle"); // idle | submitting | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (status === "error" && errorRef.current) errorRef.current.focus();
  }, [status]);

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    if (!stripe || !elements) {
      console.warn("⚠️ Stripe.js not ready yet");
      return;
    }
  
    console.log("🟡 [CheckoutForm] Starting payment submission");
  
    setStatus("submitting");
    setErrorMsg("");
  
    onAnnounce("Processing your payment. Please wait.");
  
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: "if_required",
      });
  
      console.log("🟡 [CheckoutForm] confirmPayment result:", result);
  
      // ─────────────────────────────
      // STRIPE ERROR
      // ─────────────────────────────
      if (result.error) {
        console.error("❌ Stripe returned error:", result.error);
  
        setStatus("error");
  
        setErrorMsg(
          result.error.message || "Payment failed. Please try again."
        );
  
        onAnnounce(
          `Payment failed: ${
            result.error.message || "Unknown error"
          }`
        );
  
        return;
      }
  
      // ─────────────────────────────
      // PAYMENT INTENT CHECK
      // ─────────────────────────────
      const paymentIntent = result.paymentIntent;
  
      if (!paymentIntent) {
        console.error("❌ No paymentIntent returned");
  
        setStatus("error");
  
        setErrorMsg(
          "Payment confirmation failed. Please refresh and try again."
        );
  
        return;
      }
  
      console.log(
        "🟢 PaymentIntent received:",
        paymentIntent.id
      );
  
      console.log(
        "🟢 PaymentIntent status:",
        paymentIntent.status
      );
  
      // ─────────────────────────────
      // SUCCESS STATES
      // ─────────────────────────────
      if (
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing"
      ) {
        console.log(
          "✅ Payment accepted:",
          paymentIntent.id
        );
  
        onAnnounce(
          "Payment successful! Moving to shipping step."
        );
  
        onPaymentComplete(paymentIntent.id);
  
        return;
      }
  
      // ─────────────────────────────
      // ADDITIONAL AUTH
      // ─────────────────────────────
      if (paymentIntent.status === "requires_action") {
        console.warn(
          "⚠️ Payment requires additional customer action"
        );
  
        return;
      }
  
      // ─────────────────────────────
      // UNKNOWN STATUS
      // ─────────────────────────────
      console.error(
        "❌ Unexpected payment status:",
        paymentIntent.status
      );
  
      setStatus("error");
  
      setErrorMsg(
        `Unexpected payment status: ${paymentIntent.status}`
      );
  
    } catch (err) {
      console.error("❌ confirmPayment crashed:", err);
  
      setStatus("error");
  
      setErrorMsg(
        err.message || "Unexpected payment error"
      );
    }
  };

  const isSubmitting = status === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Payment form"
      style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}
    >
      <div
        style={{
          background: highContrast ? "#111" : SDCB.skyLight,
          border: highContrast ? `1px solid ${SDCB.hcYellow}` : `1px solid ${SDCB.lightGray}`,
          borderRadius: 8,
          padding: "0.75rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        aria-label={`Order total: $${total.toFixed(2)}`}
      >
        <span style={{ color: highContrast ? SDCB.hcText : SDCB.gray, fontSize: "0.9rem" }}>
          Order total
        </span>
        <span style={{ fontWeight: 700, fontSize: "1.1rem", color: highContrast ? SDCB.hcYellow : SDCB.navy }}>
          ${total.toFixed(2)}
        </span>
      </div>

      <PaymentElement id="payment-element" options={{ layout: "tabs" }} />

      {status === "error" && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          aria-live="assertive"
          style={{
            background: highContrast ? "#300" : "#FFF0F0",
            border: `1.5px solid ${highContrast ? "#f88" : "#E53E3E"}`,
            borderRadius: 8,
            padding: "0.7rem 1rem",
            color: highContrast ? "#faa" : "#C53030",
            fontSize: "0.9rem",
            outline: "none",
          }}
        >
          <strong>Payment failed:</strong> {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || isSubmitting}
        aria-disabled={!stripe || !elements || isSubmitting}
        aria-label={isSubmitting ? "Processing payment, please wait" : `Pay $${total.toFixed(2)}`}
        style={{
          ...btnStyle(highContrast, "primary"),
          opacity: (!stripe || !elements || isSubmitting) ? 0.65 : 1,
          cursor: (!stripe || !elements || isSubmitting) ? "not-allowed" : "pointer",
        }}
      >
        {isSubmitting ? "⏳ Processing…" : `Pay $${total.toFixed(2)}`}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        aria-label="Cancel payment and return to cart"
        style={btnStyle(highContrast, "secondary")}
      >
        ← Back to cart
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutModal({
  clientSecret,
  cart,
  open,
  onClose,
  onPaymentComplete,
  highContrast,
  onAnnounce,
}) {
  const dialogRef  = useRef(null);
  const total      = cart.reduce((s, i) => s + i.price * i.qty, 0);

  console.log("🟡 CheckoutModal render:", {
    open,
    clientSecret,
  });

  useEffect(() => {
    if (open && dialogRef.current) dialogRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), iframe'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !clientSecret) return null;

  const appearance = {
    theme: highContrast ? "night" : "stripe",
    variables: {
      colorPrimary:    SDCB.blue,
      colorBackground: highContrast ? "#111" : SDCB.white,
      colorText:       highContrast ? SDCB.hcYellow : SDCB.navy,
      colorDanger:     "#E53E3E",
      fontFamily:      "'Source Serif 4', Georgia, serif",
      borderRadius:    "8px",
      spacingUnit:     "4px",
    },
  };

  const elementsOptions = { clientSecret, appearance, loader: "auto" };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500 }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Secure payment form"
        tabIndex={-1}
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1600,
          width: 480,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: highContrast ? SDCB.hcBg : SDCB.white,
          border: highContrast ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
          borderRadius: 16,
          padding: "2rem",
          boxShadow: "0 20px 60px rgba(13,61,110,0.25)",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <p style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.navy }}>
            Secure Checkout
          </p>
          <button
            onClick={onClose}
            aria-label="Close payment form"
            style={{ ...btnStyle(highContrast, "secondary"), padding: "0.3rem 0.7rem", fontSize: "1rem" }}
          >
            ✕
          </button>
        </div>

        <p
          aria-label="This payment is secured by Stripe"
          style={{ margin: "0 0 1.25rem", fontSize: "0.78rem", color: highContrast ? "#aaa" : SDCB.gray, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span aria-hidden="true">🔒</span>
          Secured by Stripe. Your payment info is never stored on our servers.
        </p>

        <Elements stripe={stripePromise} options={elementsOptions}>
          <CheckoutForm
            total={total}
            onPaymentComplete={onPaymentComplete}
            onCancel={onClose}
            highContrast={highContrast}
            onAnnounce={onAnnounce}
          />
        </Elements>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING MODAL  (NEW)
// Opens AFTER payment succeeds. Collects shipping, POSTs to backend, then
// triggers final success cleanup.
// ─────────────────────────────────────────────────────────────────────────────
function ShippingModal({ open, paymentIntentId, onSuccess, onAnnounce, highContrast }) {
  const dialogRef = useRef(null);
  const firstRef  = useRef(null);
  const errorRef  = useRef(null);

  const [shipping, setShipping] = useState({
    name: "", email: "", address: "", city: "", state: "", zip: "",
  });
  const [status,   setStatus]   = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    console.log("🟣 ShippingModal state:", {
      open,
      paymentIntentId,
    });
  }, [open, paymentIntentId]);

  // Reset form + focus first field on open
  useEffect(() => {
    if (open) {
      setShipping({ name: "", email: "", address: "", city: "", state: "", zip: "" });
      setStatus("idle");
      setErrorMsg("");
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open]);

  // Move focus to error when it appears
  useEffect(() => {
    if (status === "error" && errorRef.current) errorRef.current.focus();
  }, [status]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleChange = (field) => (e) =>
    setShipping((s) => ({ ...s, [field]: e.target.value }));

  const handleSubmit = async (e) => {
  e.preventDefault();

  console.log("🟡 [ShippingModal] submit clicked");
  console.log("🟡 [ShippingModal] paymentIntentId =", paymentIntentId);
  console.log("🟡 [ShippingModal] shipping =", shipping);

  const required = [
    { key: "name",    label: "full name" },
    { key: "email",   label: "email address" },
    { key: "address", label: "street address" },
    { key: "city",    label: "city" },
    { key: "zip",     label: "ZIP code" },
  ];
  for (const { key, label } of required) {
    if (!shipping[key].trim()) {
      console.warn(`⚠️ [ShippingModal] missing field: ${key}`);
      setStatus("error");
      setErrorMsg(`Please enter your ${label}.`);
      onAnnounce(`Error: Please enter your ${label}.`);
      return;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email)) {
    setStatus("error");
    setErrorMsg("Please enter a valid email address.");
    onAnnounce("Error: Please enter a valid email address.");
    return;
  }

  // Guard: paymentIntentId must exist
  if (!paymentIntentId) {
    console.error("❌ [ShippingModal] paymentIntentId is missing — cannot create order");
    setStatus("error");
    setErrorMsg("Payment session lost. Please refresh and try again.");
    onAnnounce("Payment session lost. Please refresh and try again.");
    return;
  }

  setStatus("submitting");
  setErrorMsg("");
  onAnnounce("Submitting your shipping information. Please wait.");

  const url = `${process.env.REACT_APP_SERVER_URL}/create-order-after-payment`;
  console.log("🟡 [ShippingModal] POSTing to:", url);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipping, paymentIntentId }),
    });

    console.log("🟡 [ShippingModal] response status:", res.status, res.statusText);

    const data = await res.json();
    console.log("🟡 [ShippingModal] response body:", data);

    if (!res.ok || data.error) {
      throw new Error(data.error || `Server responded ${res.status}`);
    }

    console.log("✅ [ShippingModal] order created. tracking:", data.trackingNumber);
    setStatus("success");
    onAnnounce(`Order confirmed! A confirmation email has been sent to ${shipping.email}.`);
    setTimeout(onSuccess, 700);
  } catch (err) {
    console.error("❌ [ShippingModal] fetch failed:", err);
    setStatus("error");
    setErrorMsg(err.message);
    onAnnounce(`Error: ${err.message}`);
  }
};

  if (!open) return null;

  const isSubmitting = status === "submitting";

  const inputStyle = {
    width: "100%",
    padding: "0.6rem 0.9rem",
    border: highContrast ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
    borderRadius: 8,
    fontSize: "1rem",
    background: highContrast ? "#111" : SDCB.white,
    color: highContrast ? SDCB.hcYellow : SDCB.navy,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block",
    marginBottom: 4,
    fontWeight: 600,
    fontSize: "0.85rem",
    color: highContrast ? SDCB.hcYellow : SDCB.navy,
  };
  const dialogStyle = {
    position: "fixed",
    top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 1600,
    width: 500,
    maxWidth: "95vw",
    maxHeight: "90vh",
    overflowY: "auto",
    background: highContrast ? SDCB.hcBg : SDCB.white,
    border: highContrast ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
    borderRadius: 16,
    padding: "2rem",
    boxShadow: "0 20px 60px rgba(13,61,110,0.25)",
    outline: "none",
  };

  if (status === "success") {
    return (
      <>
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500 }} />
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Order confirmed" tabIndex={-1} style={dialogStyle}>
          <div role="status" aria-live="polite" style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ fontSize: "3rem", margin: "0 0 0.75rem" }}>🎉</p>
            <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.navy, margin: "0 0 0.5rem" }}>
              Order Placed!
            </p>
            <p style={{ color: highContrast ? SDCB.hcText : SDCB.gray, margin: "0 0 0.25rem", fontSize: "0.95rem" }}>
              A confirmation email with tracking info has been sent to
            </p>
            <p style={{ color: highContrast ? SDCB.hcYellow : SDCB.blue, fontWeight: 700, margin: 0 }}>
              {shipping.email}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500 }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipping-modal-title"
        tabIndex={-1}
        style={dialogStyle}
      >
        <p
          id="shipping-modal-title"
          style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.navy }}
        >
          Shipping Information
        </p>

        <p style={{ margin: "0.4rem 0 1.25rem", fontSize: "0.85rem", color: highContrast ? "#aaa" : SDCB.gray }}>
          Your payment was successful. Enter your shipping details and we'll get your order on its way.
        </p>

        {status === "error" && (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            aria-live="assertive"
            style={{
              background: highContrast ? "#300" : "#FFF0F0",
              border: `1.5px solid ${highContrast ? "#f88" : "#E53E3E"}`,
              borderRadius: 8,
              padding: "0.7rem 1rem",
              color: highContrast ? "#faa" : "#C53030",
              fontSize: "0.9rem",
              marginBottom: "1rem",
              outline: "none",
            }}
          >
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Shipping information form"
          style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
        >
          <div>
            <label htmlFor="ship-name" style={labelStyle}>
              Full Name <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>
            </label>
            <input
              ref={firstRef}
              id="ship-name"
              type="text"
              autoComplete="name"
              required
              aria-required="true"
              value={shipping.name}
              onChange={handleChange("name")}
              disabled={isSubmitting}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="ship-email" style={labelStyle}>
              Email Address <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>
            </label>
            <input
              id="ship-email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={shipping.email}
              onChange={handleChange("email")}
              disabled={isSubmitting}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="ship-address" style={labelStyle}>
              Street Address <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>
            </label>
            <input
              id="ship-address"
              type="text"
              autoComplete="street-address"
              required
              aria-required="true"
              value={shipping.address}
              onChange={handleChange("address")}
              disabled={isSubmitting}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.6rem" }}>
            <div>
              <label htmlFor="ship-city" style={labelStyle}>
                City <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>
              </label>
              <input
                id="ship-city"
                type="text"
                autoComplete="address-level2"
                required
                aria-required="true"
                value={shipping.city}
                onChange={handleChange("city")}
                disabled={isSubmitting}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="ship-state" style={labelStyle}>State</label>
              <input
                id="ship-state"
                type="text"
                autoComplete="address-level1"
                placeholder="CA"
                maxLength={2}
                aria-label="State (2-letter abbreviation, optional)"
                value={shipping.state}
                onChange={handleChange("state")}
                disabled={isSubmitting}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="ship-zip" style={labelStyle}>
                ZIP <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>
              </label>
              <input
                id="ship-zip"
                type="text"
                autoComplete="postal-code"
                inputMode="numeric"
                required
                aria-required="true"
                value={shipping.zip}
                onChange={handleChange("zip")}
                disabled={isSubmitting}
                style={inputStyle}
              />
            </div>
          </div>

          <p style={{ margin: 0, fontSize: "0.75rem", color: highContrast ? "#aaa" : SDCB.gray }}>
            <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>{" "}
            Required fields
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
            aria-label={isSubmitting ? "Placing your order, please wait" : "Submit shipping information and place order"}
            style={{
              ...btnStyle(highContrast, "primary"),
              marginTop: 4,
              opacity: isSubmitting ? 0.65 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "⏳ Placing order…" : "Place Order"}
          </button>
        </form>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CART DRAWER
// ─────────────────────────────────────────────────────────────────────────────
function CartDrawer({ cart, open, onClose, onCheckout, checkoutLoading, checkoutError, highContrast, onAnnounce }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shopping cart"
      style={{
        position: "fixed",
        top: 0,
        right: open ? 0 : "-420px",
        width: 380,
        maxWidth: "92vw",
        height: "100%",
        background: highContrast ? SDCB.hcBg : SDCB.white,
        borderLeft: highContrast ? `2px solid ${SDCB.hcYellow}` : `2px solid ${SDCB.lightGray}`,
        zIndex: 1000,
        transition: "right 0.3s ease",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem",
        gap: "1rem",
        overflowY: "auto",
        boxShadow: "-8px 0 30px rgba(13,61,110,0.15)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", color: highContrast ? SDCB.hcYellow : SDCB.navy, fontSize: "1.4rem", fontWeight: 700 }}>
          Your Cart
        </p>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close cart"
          style={{ ...btnStyle(highContrast, "secondary"), fontSize: "1.1rem", padding: "0.4rem 0.8rem" }}
        >
          ✕ Close
        </button>
      </div>

      {cart.length === 0 ? (
        <p style={{ color: highContrast ? SDCB.hcText : SDCB.gray }}>
          Your cart is empty. Browse the store to add items.
        </p>
      ) : (
        <>
          {cart.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.7rem 0",
                borderBottom: highContrast ? `1px solid ${SDCB.hcYellow}` : `1px solid ${SDCB.lightGray}`,
              }}
            >
              <span style={{ color: highContrast ? SDCB.hcText : SDCB.navy, fontSize: "0.9rem", flex: 1 }}>
                {item.emoji} {item.name}{" "}
                <span style={{ color: highContrast ? SDCB.hcYellow : SDCB.skyMid }}>×{item.qty}</span>
              </span>
              <span style={{ fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.blue, marginLeft: 12 }}>
                ${(item.price * item.qty).toFixed(2)}
              </span>
            </div>
          ))}

          <div
            style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.1rem", color: highContrast ? SDCB.hcYellow : SDCB.navy, paddingTop: "0.5rem" }}
            aria-label={`Total: $${total.toFixed(2)}`}
          >
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>

          {checkoutError && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                background: highContrast ? "#300" : "#FFF0F0",
                border: `1.5px solid ${highContrast ? "#f88" : "#E53E3E"}`,
                borderRadius: 8,
                padding: "0.6rem 0.9rem",
                color: highContrast ? "#faa" : "#C53030",
                fontSize: "0.85rem",
              }}
            >
              <strong>Error:</strong> {checkoutError}
            </div>
          )}

          <button
            style={{
              ...btnStyle(highContrast, "primary"),
              marginTop: 8,
              opacity: checkoutLoading ? 0.65 : 1,
              cursor: checkoutLoading ? "not-allowed" : "pointer",
            }}
            onClick={onCheckout}
            disabled={checkoutLoading}
            aria-disabled={checkoutLoading}
            aria-label={checkoutLoading ? "Loading payment form, please wait" : `Proceed to checkout. Total: $${total.toFixed(2)}`}
          >
            {checkoutLoading ? "⏳ Loading payment…" : `Checkout — $${total.toFixed(2)}`}
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [cart,             setCart]            = useState([]);
  const [category,         setCategory]        = useState("All");
  const [search,           setSearch]          = useState("");
  const [cartOpen,         setCartOpen]        = useState(false);
  const [highContrast,     setHighContrast]    = useState(false);
  const [announcement,     setAnnouncement]    = useState("");
  const [smartPopup,       setSmartPopup]      = useState("");
  const [recommendedItems, setRecommendedItems]= useState([]);

  // ── Checkout state ──────────────────────────────────────────────────────
  const [clientSecret,     setClientSecret]    = useState(null);
  const [checkoutOpen,     setCheckoutOpen]    = useState(false);
  const [checkoutLoading,  setCheckoutLoading] = useState(false);
  const [checkoutError,    setCheckoutError]   = useState("");

  // ── Shipping modal state (NEW) ─────────────────────────────────────────
  const [paymentIntentId,  setPaymentIntentId] = useState(null);
  const [shippingOpen,     setShippingOpen]    = useState(false);

  const mainRef   = useRef(null);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      const updatedCart = existing
        ? prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { ...product, qty: 1 }];

      const related = PRODUCTS
        .filter((p) => p.category === product.category && p.id !== product.id)
        .slice(0, 2);
      setRecommendedItems(related);

      const recommendationText =
        related.length > 0
          ? ` You may also like ${related.map((r) => r.name).join(" and ")}.`
          : "";

      const popupMessage = `${product.name} added to cart.${recommendationText}`;
      setSmartPopup(popupMessage);
      setAnnouncement(popupMessage);
      setTimeout(() => setSmartPopup(""), 3500);

      return updatedCart;
    });
  }, []);

  // ── Step 1: PaymentIntent + Stripe modal ───────────────────────────────
  const handleCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    setCheckoutError("");
    setAnnouncement("Loading secure payment form. Please wait.");

    try {
      const res = await fetch(
        `${process.env.REACT_APP_SERVER_URL}/create-payment-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Server error. Please try again.");

      setClientSecret(data.clientSecret);
      setCartOpen(false);
      setCheckoutOpen(true);
      setAnnouncement("Payment form is ready. Please enter your payment details.");
    } catch (err) {
      setCheckoutError(err.message);
      setAnnouncement(`Could not load payment form: ${err.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  }, [cart]);

  // ── Step 2: Stripe confirmed → store id, open ShippingModal ────────────
  const handlePaymentComplete = useCallback((id) => {
    console.log("🟢 [App] Payment completed:", id);
  
    if (!id) {
      console.error("❌ Missing paymentIntentId");
      return;
    }
  
    // Store payment ID FIRST
    setPaymentIntentId(id);
  
    // Close Stripe modal
    setCheckoutOpen(false);
  
    // Delay next modal slightly
    setTimeout(() => {
      console.log("🟢 Opening shipping modal");
  
      setShippingOpen(true);
  
      setAnnouncement(
        "Payment confirmed! Please enter your shipping details."
      );
  
      // cleanup AFTER modal opens
      setClientSecret(null);
  
    }, 150);
  
  }, []);
  // ── Step 3: Backend order success → reset everything ───────────────────
  const handleShippingSuccess = useCallback(() => {
    setShippingOpen(false);
    setPaymentIntentId(null);
    setCart([]);
    setAnnouncement(
      "Order placed! A confirmation email with tracking info has been sent to you."
    );
  }, []);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setClientSecret(null);
    setCartOpen(true);
    setAnnouncement("Payment cancelled. Returned to cart.");
  }, []);

  // ── Redirect-based payment return (bank redirect, etc.) ────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const secret = params.get("payment_intent_client_secret");
    const status = params.get("redirect_status");
    const id     = params.get("payment_intent");

    if (!secret) return;

    if (status === "succeeded" && id) {
      // Payment returned via redirect — jump straight to shipping
      setPaymentIntentId(id);
      setShippingOpen(true);
      setAnnouncement("Payment confirmed! Please enter your shipping details.");
    } else if (status === "requires_payment_method") {
      setAnnouncement("Payment was not completed. Please try again.");
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "c") { e.preventDefault(); setCartOpen((o) => !o); }
      if (e.altKey && e.key === "h") { e.preventDefault(); setHighContrast((hc) => !hc); }
      if (e.key === "Escape") setCartOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = PRODUCTS.filter((p) => {
    const matchCat    = category === "All" || p.category === category;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const hc = highContrast;
  const bg = hc ? SDCB.hcBg : SDCB.offWhite;
  const fg = hc ? SDCB.hcYellow : SDCB.navy;

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Source+Serif+4:wght@300;400;600&display=swap"
        rel="stylesheet"
      />

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: 'Source Serif 4', Georgia, serif; }
        :focus-visible {
          outline: 3px solid ${hc ? SDCB.hcYellow : SDCB.skyMid} !important;
          outline-offset: 3px;
        }
        button:hover { opacity: 0.88; }
        @media (max-width: 600px) {
          .product-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <Announcer message={announcement} />

      <a
        href="#main-content"
        style={{
          position: "absolute", top: -60, left: 8,
          background: hc ? SDCB.hcYellow : SDCB.blue,
          color: hc ? SDCB.hcBg : SDCB.white,
          padding: "0.5rem 1rem", borderRadius: 6, fontWeight: 700,
          zIndex: 9999, textDecoration: "none", transition: "top 0.2s",
        }}
        onFocus={(e) => (e.currentTarget.style.top = "8px")}
        onBlur={(e)  => (e.currentTarget.style.top = "-60px")}
      >
        Skip to main content
      </a>

      <header
        role="banner"
        style={{
          background: hc ? "#111" : SDCB.navy,
          borderBottom: hc ? `2px solid ${SDCB.hcYellow}` : "none",
          padding: "1rem 2rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "0.75rem", position: "sticky", top: 0, zIndex: 500,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: hc ? SDCB.hcYellow : SDCB.skyMid, fontWeight: 600 }}>
            San Diego Center for the Blind
          </p>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(1.2rem, 3vw, 1.7rem)", color: hc ? SDCB.hcYellow : SDCB.white, fontWeight: 700, lineHeight: 1.2 }}>
            Accessible Living Store
          </h1>
        </div>

        <nav aria-label="Header actions" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setHighContrast((hc) => !hc)}
            aria-pressed={highContrast}
            aria-label={`${highContrast ? "Disable" : "Enable"} high contrast mode (Alt+H)`}
            style={{ background: hc ? SDCB.hcYellow : SDCB.blue, color: hc ? SDCB.hcBg : SDCB.white, border: hc ? "none" : `1.5px solid ${SDCB.skyMid}`, borderRadius: 8, padding: "0.45rem 0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem" }}
          >
            ◑ {highContrast ? "Standard" : "High Contrast"}
          </button>

          <button
            onClick={() => { setCartOpen(true); setAnnouncement("Cart opened"); }}
            aria-label={`Open cart${cartCount > 0 ? `, ${cartCount} items` : ""} (Alt+C)`}
            style={{ background: hc ? SDCB.hcYellow : SDCB.skyMid, color: hc ? SDCB.hcBg : SDCB.white, border: "none", borderRadius: 8, padding: "0.45rem 0.95rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem", display: "flex", alignItems: "center" }}
          >
            🛒 Cart {cartCount > 0 && <CartBadge count={cartCount} />}
          </button>
        </nav>
      </header>

      <div
        role="note"
        aria-label="Keyboard shortcuts"
        style={{ background: hc ? "#111" : SDCB.skyLight, borderBottom: hc ? `1px solid #444` : `1px solid ${SDCB.lightGray}`, padding: "0.4rem 2rem", fontSize: "0.78rem", color: hc ? "#aaa" : SDCB.blue }}
      >
        <span aria-hidden="true">⌨ </span>
        Keyboard shortcuts: <kbd>Alt+C</kbd> Cart · <kbd>Alt+H</kbd> High Contrast ·{" "}
        <kbd>Tab</kbd> Navigate · <kbd>Enter</kbd> Add to Cart · <kbd>Esc</kbd> Close
      </div>

      {smartPopup && (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "fixed", top: 100, right: 20, zIndex: 2000, background: hc ? "#111" : SDCB.white, color: hc ? SDCB.hcYellow : SDCB.navy, border: hc ? `2px solid ${SDCB.hcYellow}` : `2px solid ${SDCB.skyMid}`, borderRadius: 14, padding: "1rem 1.2rem", width: 320, maxWidth: "90vw", boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>✓ {smartPopup}</p>
          {recommendedItems.length > 0 && (
            <div style={{ marginTop: "0.8rem" }}>
              <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", opacity: 0.8, fontWeight: 600 }}>Suggested items:</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {recommendedItems.map((item) => (
                  <button key={item.id} onClick={() => addToCart(item)} style={{ background: hc ? SDCB.hcYellow : SDCB.skyLight, color: hc ? SDCB.hcBg : SDCB.navy, border: "none", borderRadius: 999, padding: "0.4rem 0.7rem", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}>
                    {item.emoji} {item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <main id="main-content" ref={mainRef} style={{ background: bg, minHeight: "100vh", padding: "1.5rem 2rem 4rem" }}>
        <section aria-label="Search and filter products" style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="search" style={{ display: "block", marginBottom: 6, fontWeight: 600, color: fg, fontSize: "0.9rem" }}>
              Search Products
            </label>
            <input
              id="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. cooking, clock, braille…"
              aria-label="Search products"
              style={{ width: "100%", padding: "0.6rem 0.9rem", border: hc ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`, borderRadius: 8, fontSize: "1rem", background: hc ? "#111" : SDCB.white, color: hc ? SDCB.hcYellow : SDCB.navy, fontFamily: "inherit" }}
            />
          </div>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }} aria-label="Filter by category">
            <legend style={{ fontWeight: 600, color: fg, fontSize: "0.9rem", marginBottom: 6 }}>
              Filter by Category
            </legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); setAnnouncement(`Showing ${cat} products`); }}
                  aria-pressed={category === cat}
                  style={{ background: category === cat ? (hc ? SDCB.hcYellow : SDCB.blue) : (hc ? "#222" : SDCB.white), color: category === cat ? (hc ? SDCB.hcBg : SDCB.white) : (hc ? SDCB.hcYellow : SDCB.navy), border: hc ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`, borderRadius: 20, padding: "0.35rem 0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem", transition: "all 0.15s" }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <p aria-live="polite" style={{ color: hc ? "#aaa" : SDCB.gray, fontSize: "0.85rem", marginBottom: "1rem" }}>
          {filtered.length} product{filtered.length !== 1 ? "s" : ""} found
        </p>

        <section aria-label="Product listings" className="product-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" }}>
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={addToCart} onAnnounce={setAnnouncement} highContrast={highContrast} />
          ))}
          {filtered.length === 0 && (
            <p role="status" style={{ color: hc ? SDCB.hcYellow : SDCB.gray, gridColumn: "1/-1", textAlign: "center", padding: "2rem" }}>
              No products match your search. Try a different keyword or category.
            </p>
          )}
        </section>
      </main>

      <footer role="contentinfo" style={{ background: hc ? "#111" : SDCB.navy, color: hc ? SDCB.hcYellow : SDCB.skyMid, padding: "1.5rem 2rem", textAlign: "center", fontSize: "0.85rem", borderTop: hc ? `2px solid ${SDCB.hcYellow}` : "none" }}>
        <p style={{ margin: 0, color: hc ? SDCB.hcYellow : SDCB.white, fontWeight: 600 }}>
          San Diego Center for the Blind — Accessible Living Store
        </p>
        <p style={{ margin: "0.3rem 0 0", fontSize: "0.78rem" }}>
          Changing Vision, Changing Lives · 5922 El Cajon Blvd, San Diego, CA 92115 · (619) 583-1542
        </p>
        <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: hc ? "#aaa" : SDCB.lightGray, opacity: 0.7 }}>
          Built with full keyboard navigation, screen reader support, and AI-powered descriptions.
        </p>
      </footer>

      {cartOpen && (
        <div onClick={() => setCartOpen(false)} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999 }} />
      )}

      {/* Step 1: Cart drawer */}
      <CartDrawer
        cart={cart}
        open={cartOpen}
        onClose={() => { setCartOpen(false); setAnnouncement("Cart closed"); }}
        onCheckout={handleCheckout}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        highContrast={highContrast}
        onAnnounce={setAnnouncement}
      />

      {/* Step 2: Stripe payment modal */}
      <CheckoutModal
        clientSecret={clientSecret}
        cart={cart}
        open={checkoutOpen}
        onClose={handleCheckoutClose}
        onPaymentComplete={handlePaymentComplete}
        highContrast={highContrast}
        onAnnounce={setAnnouncement}
      />

      {/* Step 3: Shipping modal (NEW) — opens after payment */}
      <ShippingModal
        open={shippingOpen}
        paymentIntentId={paymentIntentId}
        onSuccess={handleShippingSuccess}
        onAnnounce={setAnnouncement}
        highContrast={highContrast}
      />
    </>
  );
}
