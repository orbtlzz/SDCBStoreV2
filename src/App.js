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
// PRODUCT DATA — now loaded from the backend (/products) at runtime
// ─────────────────────────────────────────────────────────────────────────────

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
// FEATURED CAROUSEL
// Manually-controlled showcase of products marked `featured` in the sheet.
// No auto-rotation — the user drives it.
// ─────────────────────────────────────────────────────────────────────────────
function FeaturedCarousel({ products, onAddToCart, onAnnounce, highContrast }) {
  const [index, setIndex] = useState(0);
  const featured = products.filter(
    (p) => String(p.featured).toLowerCase() === "true"
  );

  if (featured.length === 0) return null;

  const hc   = highContrast;
  const safe = index % featured.length;
  const item = featured[safe];

  const go = (n) => {
    const next = ((n % featured.length) + featured.length) % featured.length;
    setIndex(next);
    onAnnounce(`Featured product ${next + 1} of ${featured.length}: ${featured[next].name}`);
  };

  const navBtn = {
    background: hc ? "#222" : SDCB.white,
    color: hc ? SDCB.hcYellow : SDCB.navy,
    border: hc ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
    borderRadius: 8, padding: "0.45rem 0.9rem", fontWeight: 700,
    fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <section
      aria-label="Featured products"
      style={{
        marginBottom: "1.75rem",
        background: hc ? "#111" : SDCB.white,
        border: hc ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
        borderRadius: 14, padding: "1.25rem 1.4rem",
        boxShadow: hc ? "none" : "0 4px 16px rgba(27,117,187,0.08)",
      }}
    >
      <p style={{ margin: "0 0 0.9rem", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: hc ? SDCB.hcYellow : SDCB.skyMid }}>
        ★ Featured Products
      </p>

      <div
        role="group"
        aria-label={`Featured product ${safe + 1} of ${featured.length}`}
        style={{ display: "flex", gap: "1.4rem", flexWrap: "wrap", alignItems: "center" }}
      >
        {item.image ? (
          <img
            src={item.image}
            alt=""
            aria-hidden="true"
            style={{ width: 200, height: 160, objectFit: "contain", borderRadius: 10, background: hc ? "#000" : SDCB.offWhite, flexShrink: 0 }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{ width: 200, height: 160, borderRadius: 10, background: hc ? "#000" : SDCB.skyLight, display: "flex", alignItems: "center", justifyContent: "center", color: hc ? SDCB.hcYellow : SDCB.skyMid, fontSize: "3rem", fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif", flexShrink: 0 }}
          >
            {item.name ? item.name.charAt(0).toUpperCase() : "?"}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <span
            aria-hidden="true"
            style={{ alignSelf: "flex-start", background: hc ? SDCB.hcYellow : SDCB.skyLight, color: hc ? SDCB.hcBg : SDCB.blue, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: 20, padding: "2px 10px" }}
          >
            {item.category}
          </span>
          <p style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: hc ? SDCB.hcYellow : SDCB.navy, lineHeight: 1.25 }}>
            {item.name}
          </p>
          <p style={{ margin: 0, fontSize: "0.9rem", color: hc ? SDCB.hcText : SDCB.gray, lineHeight: 1.55 }}>
            {item.description}
          </p>
          <p style={{ margin: "0.15rem 0 0", fontSize: "1.3rem", fontWeight: 700, color: hc ? SDCB.hcYellow : SDCB.blue, fontFamily: "'Playfair Display', Georgia, serif" }}>
            ${item.price.toFixed(2)}
          </p>
          <button
            onClick={() => { onAddToCart(item); onAnnounce(`${item.name} added to cart`); }}
            aria-label={`Add ${item.name} to cart, $${item.price.toFixed(2)}`}
            style={{ ...btnStyle(hc, "primary"), width: "auto", alignSelf: "flex-start", padding: "0.55rem 1.4rem", marginTop: "0.2rem" }}
          >
            Add to Cart
          </button>
        </div>
      </div>

      {featured.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginTop: "1.1rem", flexWrap: "wrap" }}>
          <button onClick={() => go(safe - 1)} aria-label="Previous featured product" style={navBtn}>
            ◀ Prev
          </button>

          <div role="group" aria-label="Featured product progress" style={{ display: "flex", gap: 5, flex: 1, minWidth: 120 }}>
            {featured.map((f, i) => (
              <button
                key={f.id}
                onClick={() => go(i)}
                aria-label={`Go to featured product ${i + 1}: ${f.name}`}
                aria-current={i === safe ? "true" : undefined}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0" }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "block", height: 8, borderRadius: 4,
                    background: i === safe
                      ? (hc ? SDCB.hcYellow : SDCB.blue)
                      : (hc ? "#444" : SDCB.lightGray),
                  }}
                />
              </button>
            ))}
          </div>

          <button onClick={() => go(safe + 1)} aria-label="Next featured product" style={navBtn}>
            Next ▶
          </button>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CARD
// ─────────────────────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, onAnnounce, highContrast }) {
  const [aiDesc, setAiDesc] = useState(null);
  const [added, setAdded] = useState(false);
  const addBtnRef = useRef(null);

  const handleAIDesc = useCallback(() => {
    setAiDesc(product.aiDescription);
    onAnnounce(`Showing the detailed description for ${product.name}`);
  }, [product, onAnnounce]);

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
      {product.image ? (
        <img
          src={product.image}
          alt=""
          aria-hidden="true"
          style={{
            width: "100%",
            height: 170,
            objectFit: "contain",
            borderRadius: 8,
            background: highContrast ? "#111" : SDCB.offWhite,
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: "100%",
            height: 170,
            borderRadius: 8,
            background: highContrast ? "#111" : SDCB.skyLight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: highContrast ? SDCB.hcYellow : SDCB.skyMid,
            fontSize: "2.5rem",
            fontWeight: 700,
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          {product.name ? product.name.charAt(0).toUpperCase() : "?"}
        </div>
      )}

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

      {product.aiDescription && (
        aiDesc ? (
          <button
            onClick={() => {
              setAiDesc(null);
              onAnnounce(`Showing the basic description for ${product.name}`);
            }}
            style={btnStyle(highContrast, "secondary")}
            aria-label={`Show the basic description for ${product.name}`}
          >
            ← Basic Description
          </button>
        ) : (
          <button
            onClick={handleAIDesc}
            style={btnStyle(highContrast, "secondary")}
            aria-label={`Show the detailed visual description for ${product.name}`}
          >
            ✦ AI Visual Description
          </button>
        )
      )}

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
function CheckoutForm({ total, taxInfo, onPaymentComplete, onCancel, staffMode, onCashSale, highContrast, onAnnounce }) {
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
      {staffMode && (
        <div
          style={{
            background: highContrast ? "#111" : "#FFF8E6",
            border: highContrast ? `2px solid ${SDCB.hcYellow}` : `1.5px solid #F59E0B`,
            borderRadius: 8, padding: "0.9rem 1rem", marginBottom: 12,
            display: "flex", flexDirection: "column", gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCashSale}
            aria-label={`Record cash sale of $${total.toFixed(2)}`}
            style={{
              background: highContrast ? SDCB.hcYellow : "#F59E0B",
              color:      highContrast ? SDCB.hcBg    : SDCB.white,
              border: "none", borderRadius: 8, padding: "0.7rem 1rem",
              fontWeight: 700, fontSize: "1rem", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            💵 Pay with Cash — Collect ${total.toFixed(2)}
          </button>
          <p style={{ margin: 0, fontSize: "0.8rem", color: highContrast ? SDCB.hcText : SDCB.gray, textAlign: "center" }}>
            Or enter card details below to charge a card instead.
          </p>
        </div>
      )}
        
      <div
        style={{
          background: highContrast ? "#111" : SDCB.skyLight,
          border: highContrast ? `1px solid ${SDCB.hcYellow}` : `1px solid ${SDCB.lightGray}`,
          borderRadius: 8,
          padding: "0.75rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
        }}
      >
        {taxInfo && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: highContrast ? SDCB.hcText : SDCB.gray }}>
              <span>Subtotal</span>
              <span>${taxInfo.subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: highContrast ? SDCB.hcText : SDCB.gray }}>
              <span>Shipping</span>
              <span style={{ fontWeight: taxInfo.shipping > 0 ? 400 : 700, color: taxInfo.shipping > 0 ? "inherit" : (highContrast ? SDCB.hcYellow : "#2A7D4A") }}>
                {taxInfo.shipping > 0 ? `$${taxInfo.shipping.toFixed(2)}` : "FREE"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: highContrast ? SDCB.hcText : SDCB.gray }}>
              <span>Sales tax</span>
              <span>${taxInfo.tax.toFixed(2)}</span>
            </div>
            {taxInfo.processingFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: highContrast ? SDCB.hcText : SDCB.gray }}>
                <span>Processing fee</span>
                <span>${taxInfo.processingFee.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: "1.1rem",
            color: highContrast ? SDCB.hcYellow : SDCB.navy,
            borderTop: taxInfo ? `1px solid ${highContrast ? "#444" : SDCB.lightGray}` : "none",
            paddingTop: taxInfo ? "0.4rem" : 0,
          }}
          aria-label={`Order total: $${total.toFixed(2)}`}
        >
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
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
  taxInfo,
  open,
  onClose,
  onPaymentComplete,
  staffMode,
  onCashSale,
  highContrast,
  onAnnounce,
}) {
  const dialogRef  = useRef(null);
  const total      = taxInfo
    ? taxInfo.total
    : cart.reduce((s, i) => s + i.price * i.qty, 0);

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
            taxInfo={taxInfo}
            onPaymentComplete={onPaymentComplete}
            onCancel={onClose}
            staffMode={staffMode}
            onCashSale={onCashSale}
            highContrast={highContrast}
            onAnnounce={onAnnounce}
          />
        </Elements>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING ADDRESS MODAL
// Opens BEFORE payment. Collects the address, then asks the backend to
// calculate tax + create the PaymentIntent. On success, hands the address and
// payment data up via onReady() so the payment modal can open.
// ─────────────────────────────────────────────────────────────────────────────
function ShippingModal({ open, cart, onReady, onAnnounce, highContrast }) {
  const dialogRef = useRef(null);
  const firstRef  = useRef(null);
  const errorRef  = useRef(null);

  const [shipping, setShipping] = useState({
    name: "", email: "", address: "", city: "", state: "", zip: "",
  });
  const [status,   setStatus]   = useState("idle"); // idle | submitting | error
  const [errorMsg, setErrorMsg] = useState("");
  const [coverFee, setCoverFee] = useState(false);

  useEffect(() => {
    if (open) {
      setShipping({ name: "", email: "", address: "", city: "", state: "", zip: "" });
      setStatus("idle");
      setErrorMsg("");
      setCoverFee(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (status === "error" && errorRef.current) errorRef.current.focus();
  }, [status]);

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

    const required = [
      { key: "name",    label: "full name" },
      { key: "email",   label: "email address" },
      { key: "address", label: "street address" },
      { key: "city",    label: "city" },
      { key: "zip",     label: "ZIP code" },
    ];
    for (const { key, label } of required) {
      if (!shipping[key].trim()) {
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

    setStatus("submitting");
    setErrorMsg("");
    onAnnounce("Calculating tax and preparing payment. Please wait.");

    try {
      const res = await fetch(
        `${process.env.REACT_APP_SERVER_URL}/create-payment-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart, shipping, coverFee }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Server responded ${res.status}`);
      }
      onAnnounce("Address saved. Opening secure payment.");
      onReady(shipping, data);
    } catch (err) {
      console.error("❌ [ShippingModal] create-payment-intent failed:", err);
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
  const reqMark = <span aria-hidden="true" style={{ color: highContrast ? "#f88" : "#C53030" }}>*</span>;

  return (
    <>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500 }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="shipping-modal-title" tabIndex={-1} style={dialogStyle}>
        <p id="shipping-modal-title" style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.navy }}>
          Shipping Information
        </p>
        <p style={{ margin: "0.4rem 0 1.25rem", fontSize: "0.85rem", color: highContrast ? "#aaa" : SDCB.gray }}>
          Enter your shipping address. We'll calculate tax and take you to secure payment next.
        </p>

        {status === "error" && (
          <div ref={errorRef} role="alert" tabIndex={-1} aria-live="assertive"
            style={{ background: highContrast ? "#300" : "#FFF0F0", border: `1.5px solid ${highContrast ? "#f88" : "#E53E3E"}`, borderRadius: 8, padding: "0.7rem 1rem", color: highContrast ? "#faa" : "#C53030", fontSize: "0.9rem", marginBottom: "1rem", outline: "none" }}>
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate aria-label="Shipping information form" style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label htmlFor="ship-name" style={labelStyle}>Full Name {reqMark}</label>
            <input ref={firstRef} id="ship-name" type="text" autoComplete="name" required aria-required="true"
              value={shipping.name} onChange={handleChange("name")} disabled={isSubmitting} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="ship-email" style={labelStyle}>Email Address {reqMark}</label>
            <input id="ship-email" type="email" autoComplete="email" required aria-required="true"
              value={shipping.email} onChange={handleChange("email")} disabled={isSubmitting} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="ship-address" style={labelStyle}>Street Address {reqMark}</label>
            <input id="ship-address" type="text" autoComplete="street-address" required aria-required="true"
              value={shipping.address} onChange={handleChange("address")} disabled={isSubmitting} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.6rem" }}>
            <div>
              <label htmlFor="ship-city" style={labelStyle}>City {reqMark}</label>
              <input id="ship-city" type="text" autoComplete="address-level2" required aria-required="true"
                value={shipping.city} onChange={handleChange("city")} disabled={isSubmitting} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="ship-state" style={labelStyle}>State</label>
              <input id="ship-state" type="text" autoComplete="address-level1" placeholder="CA" maxLength={2}
                aria-label="State (2-letter abbreviation, optional)"
                value={shipping.state} onChange={handleChange("state")} disabled={isSubmitting} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="ship-zip" style={labelStyle}>ZIP {reqMark}</label>
              <input id="ship-zip" type="text" autoComplete="postal-code" inputMode="numeric" required aria-required="true"
                value={shipping.zip} onChange={handleChange("zip")} disabled={isSubmitting} style={inputStyle} />
            </div>
          </div>

          <p style={{ margin: 0, fontSize: "0.75rem", color: highContrast ? "#aaa" : SDCB.gray }}>
            {reqMark} Required fields
          </p>

          <label
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              fontSize: "0.85rem", color: highContrast ? SDCB.hcText : SDCB.gray,
              cursor: "pointer", padding: "0.6rem 0.75rem", borderRadius: 8,
              border: highContrast ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
              background: highContrast ? "#111" : SDCB.skyLight,
            }}
          >
            <input
              type="checkbox"
              checked={coverFee}
              onChange={(e) => setCoverFee(e.target.checked)}
              disabled={isSubmitting}
              style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, cursor: "pointer", accentColor: highContrast ? SDCB.hcYellow : SDCB.blue }}
            />
            <span>
              Add the card processing fee (about 3%) so more of your purchase
              supports the San Diego Center for the Blind.
            </span>
          </label>

          <button type="submit" disabled={isSubmitting} aria-disabled={isSubmitting}
            aria-label={isSubmitting ? "Calculating tax, please wait" : "Continue to payment"}
            style={{ ...btnStyle(highContrast, "primary"), marginTop: 4, opacity: isSubmitting ? 0.65 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}>
            {isSubmitting ? "⏳ Calculating tax…" : "Continue to Payment"}
          </button>
        </form>
      </div>
    </>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// ORDER RESULT MODAL
// Shown AFTER payment succeeds — while the backend creates the shipping label
// and sends the email ("processing"), then the final confirmation ("success").
// ─────────────────────────────────────────────────────────────────────────────
function OrderResultModal({ status, errorMsg, email, saleInfo, onClose, highContrast }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (status !== "idle" && dialogRef.current) dialogRef.current.focus();
  }, [status]);

  if (status === "idle") return null;

  const title = { fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.navy, margin: "0 0 0.5rem" };
  const gray  = { color: highContrast ? SDCB.hcText : SDCB.gray, margin: "0 0 0.5rem", fontSize: "0.95rem" };
  const dialogStyle = {
    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    zIndex: 1600, width: 460, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto",
    background: highContrast ? SDCB.hcBg : SDCB.white,
    border: highContrast ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
    borderRadius: 16, padding: "2rem", boxShadow: "0 20px 60px rgba(13,61,110,0.25)",
    outline: "none", textAlign: "center",
  };

  return (
    <>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500 }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Order status" tabIndex={-1} style={dialogStyle}>
        {status === "processing" && (
          <div role="status" aria-live="polite" style={{ padding: "1.5rem 0" }}>
            <p style={{ fontSize: "2.5rem", margin: "0 0 0.75rem" }}>⏳</p>
            <p style={title}>Finalizing your order…</p>
            <p style={gray}>Your payment went through. We're preparing your shipment — this only takes a moment.</p>
          </div>
        )}

        {status === "success" && saleInfo?.kind === "cash" && (
          <div role="status" aria-live="polite" style={{ padding: "1.5rem 0" }}>
            <p style={{ fontSize: "3rem", margin: "0 0 0.75rem" }}>💵</p>
            <p style={title}>Cash Sale Recorded</p>
            <p style={gray}>Collect from the customer:</p>
            <p style={{ fontSize: "2rem", fontWeight: 800, color: highContrast ? SDCB.hcYellow : "#F59E0B", margin: "0.25rem 0 1rem" }}>
              ${saleInfo.total.toFixed(2)}
            </p>
            <p style={{ ...gray, fontSize: "0.85rem" }}>Invoice #{saleInfo.invoiceNumber}</p>
            {saleInfo.hostedInvoiceUrl && (
              <p style={{ margin: "0.5rem 0 1.25rem" }}>
                <a href={saleInfo.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: highContrast ? SDCB.hcYellow : SDCB.blue, fontWeight: 600 }}>
                  View / print receipt
                </a>
              </p>
            )}
            <button onClick={onClose} aria-label="Start a new sale" style={btnStyle(highContrast, "primary")}>
              New Sale
            </button>
          </div>
        )}

        {status === "success" && saleInfo?.kind === "card_in_person" && (
          <div role="status" aria-live="polite" style={{ padding: "1.5rem 0" }}>
            <p style={{ fontSize: "3rem", margin: "0 0 0.75rem" }}>💳</p>
            <p style={title}>Card Payment Recorded</p>
            <p style={gray}>Charged to the customer's card:</p>
            <p style={{ fontSize: "2rem", fontWeight: 800, color: highContrast ? SDCB.hcYellow : SDCB.blue, margin: "0.25rem 0 1.25rem" }}>
              ${saleInfo.total.toFixed(2)}
            </p>
            <button onClick={onClose} aria-label="Start a new sale" style={btnStyle(highContrast, "primary")}>
              New Sale
            </button>
          </div>
        )}

        {status === "success" && !saleInfo && (
          <div role="status" aria-live="polite" style={{ padding: "1.5rem 0" }}>
            <p style={{ fontSize: "3rem", margin: "0 0 0.75rem" }}>🎉</p>
            <p style={title}>Order Placed!</p>
            <p style={gray}>A confirmation email with tracking info has been sent to</p>
            <p style={{ color: highContrast ? SDCB.hcYellow : SDCB.blue, fontWeight: 700, margin: "0 0 1.25rem" }}>{email}</p>
            <button onClick={onClose} aria-label="Continue shopping" style={btnStyle(highContrast, "primary")}>
              Continue Shopping
            </button>
          </div>
        )}

        {status === "error" && (
          <div role="alert" aria-live="assertive" style={{ padding: "1.5rem 0" }}>
            <p style={{ fontSize: "2.5rem", margin: "0 0 0.75rem" }}>⚠️</p>
            <p style={title}>We Hit a Snag</p>
            <p style={gray}>
              Your payment was successful, but we couldn't finalize the order: {errorMsg}.
              Please contact us and we'll sort it out right away — you will not be charged again.
            </p>
            <p style={{ ...gray, fontWeight: 700 }}>(619) 583-1542</p>
            <button onClick={onClose} aria-label="Close" style={btnStyle(highContrast, "secondary")}>Close</button>
          </div>
        )}
      </div>
    </>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// CART DRAWER
// ─────────────────────────────────────────────────────────────────────────────
function CartDrawer({ cart, open, onClose, onCheckout, updateQty, removeFromCart, checkoutLoading, checkoutError, highContrast, onAnnounce }) {
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
          {cart.map((item) => {
            const dec = () => {
              updateQty(item.id, -1);
              onAnnounce(`Decreased ${item.name} to ${item.qty - 1}`);
            };
            const inc = () => {
              updateQty(item.id, 1);
              onAnnounce(`Increased ${item.name} to ${item.qty + 1}`);
            };
            const remove = () => {
              removeFromCart(item.id);
              onAnnounce(`Removed ${item.name} from cart`);
            };
            const stepBtn = {
              width: 30, height: 30, borderRadius: 6,
              border: highContrast ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
              background: highContrast ? "#222" : SDCB.skyLight,
              color: highContrast ? SDCB.hcYellow : SDCB.navy,
              fontSize: "1.1rem", fontWeight: 700, fontFamily: "inherit", lineHeight: 1,
            };
            return (
              <div
                key={item.id}
                style={{
                  padding: "0.8rem 0",
                  borderBottom: highContrast ? `1px solid ${SDCB.hcYellow}` : `1px solid ${SDCB.lightGray}`,
                  display: "flex", flexDirection: "column", gap: "0.55rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: highContrast ? SDCB.hcText : SDCB.navy, fontSize: "0.92rem", fontWeight: 600, flex: 1 }}>
                    {item.name}
                  </span>
                  <button
                    onClick={remove}
                    aria-label={`Remove ${item.name} from cart`}
                    style={{ background: "none", border: "none", color: highContrast ? "#f88" : "#C53030", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "2px 4px" }}
                  >
                    ✕ Remove
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div role="group" aria-label={`Quantity controls for ${item.name}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={dec}
                      disabled={item.qty <= 1}
                      aria-label={`Decrease quantity of ${item.name}`}
                      style={{ ...stepBtn, opacity: item.qty <= 1 ? 0.4 : 1, cursor: item.qty <= 1 ? "not-allowed" : "pointer" }}
                    >
                      −
                    </button>
                    <span
                      aria-label={`Quantity: ${item.qty}`}
                      style={{ minWidth: 24, textAlign: "center", fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.navy }}
                    >
                      {item.qty}
                    </span>
                    <button
                      onClick={inc}
                      aria-label={`Increase quantity of ${item.name}`}
                      style={{ ...stepBtn, cursor: "pointer" }}
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontWeight: 700, color: highContrast ? SDCB.hcYellow : SDCB.blue }}>
                    ${(item.price * item.qty).toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}

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
// CATEGORY HELPER — a product's category cell may list several categories,
// e.g. "Time, Magnifiers". Split it into a clean array.
// ─────────────────────────────────────────────────────────────────────────────
function catList(product) {
  return (product.category || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF LOGIN MODAL — verifies the shared staff password with the backend
// ─────────────────────────────────────────────────────────────────────────────
function StaffLogin({ open, onClose, onSuccess, highContrast }) {
  const inputRef = useRef(null);
  const [password, setPassword] = useState("");
  const [status,   setStatus]   = useState("idle"); // idle | submitting | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open) {
      setPassword(""); setStatus("idle"); setErrorMsg("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const hc = highContrast;
  const isSubmitting = status === "submitting";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch(`${process.env.REACT_APP_SERVER_URL}/staff-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Login failed.");
      onSuccess(password);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500 }} />
      <div
        role="dialog" aria-modal="true" aria-label="Staff login" tabIndex={-1}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 1600, width: 380, maxWidth: "95vw",
          background: hc ? SDCB.hcBg : SDCB.white,
          border: hc ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
          borderRadius: 16, padding: "2rem", boxShadow: "0 20px 60px rgba(13,61,110,0.25)", outline: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <p style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700, color: hc ? SDCB.hcYellow : SDCB.navy }}>
            Staff Login
          </p>
          <button onClick={onClose} aria-label="Close staff login" style={{ ...btnStyle(hc, "secondary"), padding: "0.3rem 0.7rem", fontSize: "1rem" }}>
            ✕
          </button>
        </div>

        {status === "error" && (
          <div role="alert" aria-live="assertive"
            style={{ background: hc ? "#300" : "#FFF0F0", border: `1.5px solid ${hc ? "#f88" : "#E53E3E"}`, borderRadius: 8, padding: "0.7rem 1rem", color: hc ? "#faa" : "#C53030", fontSize: "0.9rem", marginBottom: "1rem" }}>
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label htmlFor="staff-password" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.85rem", color: hc ? SDCB.hcYellow : SDCB.navy }}>
              Staff Password
            </label>
            <input
              ref={inputRef} id="staff-password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting}
              style={{
                width: "100%", padding: "0.6rem 0.9rem",
                border: hc ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
                borderRadius: 8, fontSize: "1rem",
                background: hc ? "#111" : SDCB.white, color: hc ? SDCB.hcYellow : SDCB.navy,
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="submit" disabled={isSubmitting || !password}
            style={{ ...btnStyle(hc, "primary"), opacity: (isSubmitting || !password) ? 0.65 : 1, cursor: (isSubmitting || !password) ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? "⏳ Checking…" : "Log In"}
          </button>
        </form>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF PAGE — in-person checkout (POS). Placeholder shell for now.
// ─────────────────────────────────────────────────────────────────────────────
function StaffPage({ onLogout, highContrast }) {
  const hc = highContrast;
  return (
    <div style={{ minHeight: "100vh", background: hc ? SDCB.hcBg : SDCB.offWhite, display: "flex", flexDirection: "column" }}>
      <header
        role="banner"
        style={{
          background: hc ? "#111" : SDCB.navy,
          borderBottom: hc ? `2px solid ${SDCB.hcYellow}` : "none",
          padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: hc ? SDCB.hcYellow : SDCB.skyMid, fontWeight: 600 }}>
            Staff Mode
          </p>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(1.2rem, 3vw, 1.7rem)", color: hc ? SDCB.hcYellow : SDCB.white, fontWeight: 700 }}>
            In-Person Checkout
          </h1>
        </div>
        <button
          onClick={onLogout} aria-label="Log out of staff mode"
          style={{ background: hc ? SDCB.hcYellow : SDCB.skyMid, color: hc ? SDCB.hcBg : SDCB.white, border: "none", borderRadius: 8, padding: "0.5rem 1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem" }}
        >
          Log Out
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div>
          <p style={{ fontSize: "2.5rem", margin: "0 0 0.5rem" }}>🛒</p>
          <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: hc ? SDCB.hcYellow : SDCB.navy, margin: "0 0 0.5rem" }}>
            You're logged in as staff
          </p>
          <p style={{ color: hc ? SDCB.hcText : SDCB.gray, fontSize: "0.95rem" }}>
            The in-person checkout tools will go here next.
          </p>
        </div>
      </main>
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
  // ── Products loaded from backend (Google Sheet) ────────────────────────
  const [products,        setProducts]        = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError,   setProductsError]   = useState("");

  useEffect(() => {
    fetch(`${process.env.REACT_APP_SERVER_URL}/products`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setProducts(data);
        setAnnouncement(`${data.length} products loaded.`);
      })
      .catch((err) => {
        console.error("❌ Failed to load products:", err);
        setProductsError("Could not load products. Please refresh the page.");
        setAnnouncement("Could not load products. Please refresh the page.");
      })
      .finally(() => setProductsLoading(false));
  }, []);

  const categories = ["All", ...new Set(products.flatMap(catList))];

  // ── Checkout flow state ─────────────────────────────────────────────────
  const [shipping,     setShipping]     = useState(null);   // address collected up front
  const [shippingOpen, setShippingOpen] = useState(false);  // address modal open?
  const [clientSecret, setClientSecret] = useState(null);
  const [taxInfo,      setTaxInfo]      = useState(null);    // { subtotal, tax, total }
  const [checkoutOpen, setCheckoutOpen] = useState(false);   // payment modal open?
  const [orderStatus,  setOrderStatus]  = useState("idle");  // idle | processing | success | error
  const [orderError,   setOrderError]   = useState("");

  // ── Staff mode ──────────────────────────────────────────────────────────
  const [staffMode,      setStaffMode]      = useState(() => !!sessionStorage.getItem("staffAuth"));
  const [staffLoginOpen, setStaffLoginOpen] = useState(false);
  const [saleInfo,       setSaleInfo]       = useState(null);
  const [locations,      setLocations]      = useState([]);
  const [locationId,     setLocationId]     = useState(() => sessionStorage.getItem("staffLocationId") || "");
  // Load the list of sale locations when staff mode activates
  useEffect(() => {
    if (!staffMode) { setLocations([]); return; }
    fetch(`${process.env.REACT_APP_SERVER_URL}/staff/locations`, {
      headers: { "x-staff-password": sessionStorage.getItem("staffAuth") || "" },
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => {
        setLocations(data);
        if (!sessionStorage.getItem("staffLocationId") && data.length > 0) {
          setLocationId(data[0].id);
          sessionStorage.setItem("staffLocationId", data[0].id);
        }
      })
      .catch(err => console.error("❌ Could not load staff locations:", err));
  }, [staffMode]);
  
  const mainRef   = useRef(null);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      const updatedCart = existing
        ? prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { ...product, qty: 1 }];

      const productCats = catList(product);
      const related = products
        .filter((p) => p.id !== product.id && catList(p).some((c) => productCats.includes(c)))
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
  }, [products]);
  
  const updateQty = useCallback((id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // ── Step 1: open the shipping address modal (or skip it for staff) ──────────
  const handleCheckout = useCallback(async () => {
    if (!staffMode) {
      // Normal customer: collect address first
      setCartOpen(false);
      setShippingOpen(true);
      setAnnouncement("Please enter your shipping address to continue.");
      return;
    }
    // Staff (in-person): no address needed — create PaymentIntent immediately
    setCartOpen(false);
    setAnnouncement("Preparing in-person checkout…");
    try {
      const res = await fetch(`${process.env.REACT_APP_SERVER_URL}/create-payment-intent`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cart, inPerson: true, locationId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Server responded ${res.status}`);
      setShipping(null);
      setClientSecret(data.clientSecret);
      setTaxInfo({
        subtotal:      data.subtotal,
        shipping:      data.shipping,
        tax:           data.tax,
        processingFee: data.processingFee,
        total:         data.total,
      });
      setCheckoutOpen(true);
      setAnnouncement("Payment ready. Choose cash or card.");
    } catch (err) {
      console.error("❌ Staff checkout setup failed:", err);
      setAnnouncement(`Error: ${err.message}`);
    }
  }, [cart, staffMode, locationId]);

  // ── Step 2: address submitted → tax calculated → open payment modal ────
  const handleAddressReady = useCallback((shippingData, paymentData) => {
    setShipping(shippingData);
    setClientSecret(paymentData.clientSecret);
    setTaxInfo({
      subtotal:      paymentData.subtotal,
      shipping:      paymentData.shipping,
      tax:           paymentData.tax,
      processingFee: paymentData.processingFee,
      total:         paymentData.total,
    });
    setShippingOpen(false);
    setCheckoutOpen(true);
    setAnnouncement("Payment form is ready. Please enter your payment details.");
  }, []);

  // ── Step 3: payment confirmed → create the order on the backend ────────
  const handlePaymentComplete = useCallback(
    async (paymentIntentId) => {
      if (!paymentIntentId) {
        console.error("❌ Missing paymentIntentId");
        return;
      }
      setCheckoutOpen(false);
      setClientSecret(null);
      setOrderStatus("processing");
      setAnnouncement("Payment successful. Finalizing your order, please wait.");

      try {
        const res = await fetch(
          `${process.env.REACT_APP_SERVER_URL}/create-order-after-payment`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shipping, paymentIntentId, cart }),
          }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `Server responded ${res.status}`);
        }
        if (data.inPerson) {
          setSaleInfo({ kind: "card_in_person", total: data.total ?? taxInfo?.total ?? 0 });
          setOrderStatus("success");
          setAnnouncement(`Card payment recorded. $${(data.total ?? 0).toFixed(2)} collected.`);
        } else {
          console.log("✅ Order created. Tracking:", data.trackingNumber);
          setOrderStatus("success");
          setAnnouncement(
            `Order confirmed! A confirmation email has been sent to ${shipping?.email || "you"}.`
          );
        }
      } catch (err) {
        console.error("❌ Order creation failed:", err);
        setOrderStatus("error");
        setOrderError(err.message);
        setAnnouncement(`Order error: ${err.message}`);
      }
    },
    [shipping, taxInfo, cart]
  );
  // ── Step 4: user dismisses the confirmation → reset for next order ─────
  const handleOrderDone = useCallback(() => {
    setOrderStatus("idle");
    setOrderError("");
    setShipping(null);
    setTaxInfo(null);
    setSaleInfo(null);
    setCart([]);
    setAnnouncement(staffMode ? "Ready for the next sale." : "Thank you! You can keep browsing the store.");
  }, [staffMode]);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setClientSecret(null);
    setCartOpen(true);
    setAnnouncement("Payment cancelled. Returned to cart.");
  }, []);
  
  const handleStaffSuccess = useCallback((password) => {
    sessionStorage.setItem("staffAuth", password);
    setStaffMode(true);
    setStaffLoginOpen(false);
  }, []);

  const handleStaffLogout = useCallback(() => {
    sessionStorage.removeItem("staffAuth");
    sessionStorage.removeItem("staffLocationId");
    setStaffMode(false);
    setLocationId("");
  }, []);

  // ── Cash sale (staff only) — records a Stripe Invoice paid out-of-band ──
  const handleCashSale = useCallback(async () => {
    const piToCancel = clientSecret ? clientSecret.split("_secret_")[0] : null;
    setCheckoutOpen(false);
    setClientSecret(null);
    setOrderStatus("processing");
    setAnnouncement("Recording cash sale, please wait.");
    try {
      const res = await fetch(`${process.env.REACT_APP_SERVER_URL}/staff/cash-sale`, {
        method:  "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-staff-password": sessionStorage.getItem("staffAuth") || "",
        },
        body: JSON.stringify({ cart, cancelPaymentIntent: piToCancel, locationId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Server responded ${res.status}`);
      setSaleInfo({
        kind:             "cash",
        total:            data.total,
        invoiceNumber:    data.invoiceNumber,
        hostedInvoiceUrl: data.hostedInvoiceUrl,
      });
      setOrderStatus("success");
      setAnnouncement(`Cash sale recorded. Collect $${data.total.toFixed(2)} from the customer.`);
    } catch (err) {
      console.error("❌ Cash sale failed:", err);
      setOrderStatus("error");
      setOrderError(err.message);
      setAnnouncement(`Cash sale error: ${err.message}`);
    }
  }, [cart, clientSecret, locationId]);

  // ── Redirect-based payment return (bank redirect, etc.) ────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const secret = params.get("payment_intent_client_secret");
    const status = params.get("redirect_status");
    const id     = params.get("payment_intent");

    if (!secret) return;

    if (status === "succeeded" && id) {
      // Page reloaded after a redirect — finalize the order. The backend
      // recovers the shipping address from the PaymentIntent metadata.
      handlePaymentComplete(id);
    } else if (status === "requires_payment_method") {
      setAnnouncement("Payment was not completed. Please try again.");
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, [handlePaymentComplete]);

  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "c") { e.preventDefault(); setCartOpen((o) => !o); }
      if (e.altKey && e.key === "h") { e.preventDefault(); setHighContrast((hc) => !hc); }
      if (e.key === "Escape") setCartOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = products.filter((p) => {
    
    // Hide sold-out items (blank quantity = unlimited stock)
    if (p.quantity !== "" && p.quantity !== null && p.quantity !== undefined && Number(p.quantity) <= 0) {
      return false;
    }               
                                   
    const matchCat    = category === "All" || catList(p).includes(category);
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
          {staffMode && locations.length > 0 && (
            <select
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                sessionStorage.setItem("staffLocationId", e.target.value);
                const loc = locations.find(l => l.id === e.target.value);
                if (loc) setAnnouncement(`Sale location set to ${loc.name}`);
              }}
              aria-label="Sale location for in-person checkout"
              style={{
                background: hc ? "#111" : SDCB.white,
                color:      hc ? SDCB.hcYellow : SDCB.navy,
                border:     hc ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.skyMid}`,
                borderRadius: 8, padding: "0.45rem 0.6rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem",
              }}
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>📍 {loc.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => staffMode ? handleStaffLogout() : setStaffLoginOpen(true)}
            aria-label={staffMode ? "Staff mode active — click to log out" : "Staff login"}
            style={{
              background: staffMode ? (hc ? SDCB.hcYellow : "#F59E0B") : "transparent",
              color:      staffMode ? (hc ? SDCB.hcBg : SDCB.white) : (hc ? SDCB.hcYellow : SDCB.white),
              border:     hc ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${staffMode ? "#F59E0B" : SDCB.skyMid}`,
              borderRadius: 8, padding: "0.45rem 0.85rem", fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", fontSize: "0.82rem",
            }}
          >
            {staffMode ? "● Staff Mode — Log Out" : "Staff"}
          </button>
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
                    {item.name}
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
              {categories.map((cat) => (
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
                
        <FeaturedCarousel
          products={products}
          onAddToCart={addToCart}
          onAnnounce={setAnnouncement}
          highContrast={highContrast}
        />
          
        {productsError && (
          <p role="alert" style={{ color: hc ? "#f88" : "#C53030", fontSize: "0.9rem", marginBottom: "1rem", fontWeight: 600 }}>
            {productsError}
          </p>
        )}

        <p aria-live="polite" style={{ color: hc ? "#aaa" : SDCB.gray, fontSize: "0.85rem", marginBottom: "1rem" }}>
          {productsLoading
            ? "Loading products…"
            : `${filtered.length} product${filtered.length !== 1 ? "s" : ""} found`}
        </p>

        <section aria-label="Product listings" className="product-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" }}>
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={addToCart} onAnnounce={setAnnouncement} highContrast={highContrast} />
          ))}
          {!productsLoading && !productsError && filtered.length === 0 && (
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
        updateQty={updateQty}
        removeFromCart={removeFromCart}
        checkoutLoading={false}
        checkoutError=""
        highContrast={highContrast}
        onAnnounce={setAnnouncement}
      />

      {/* Step 2: Shipping address — collects address, calculates tax */}
      <ShippingModal
        open={shippingOpen}
        cart={cart}
        onReady={handleAddressReady}
        onAnnounce={setAnnouncement}
        highContrast={highContrast}
      />

      {/* Step 3: Stripe payment modal — shows the tax-inclusive total */}
      <CheckoutModal
        clientSecret={clientSecret}
        cart={cart}
        taxInfo={taxInfo}
        open={checkoutOpen}
        onClose={handleCheckoutClose}
        onPaymentComplete={handlePaymentComplete}
        staffMode={staffMode}
        onCashSale={handleCashSale}
        highContrast={highContrast}
        onAnnounce={setAnnouncement}
      />

      {/* Step 4: Order result — processing → confirmation */}
      <OrderResultModal
        status={orderStatus}
        errorMsg={orderError}
        email={shipping?.email}
        saleInfo={saleInfo}
        onClose={handleOrderDone}
        highContrast={highContrast}
      />
          
      {/* Staff login */}
      <StaffLogin
        open={staffLoginOpen}
        onClose={() => setStaffLoginOpen(false)}
        onSuccess={handleStaffSuccess}
        highContrast={highContrast}
      />
    </>
  );
}
