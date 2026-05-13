import { useState, useEffect, useRef, useCallback } from "react";

// ── SDCB Brand Colors ─────────────────────────────────────────────────────
// Pulled from sdcb.org: royal blue primary, navy dark, sky accent, white
const SDCB = {
  blue:      "#1B75BB", // primary royal blue
  navy:      "#0D3D6E", // dark header/footer
  skyLight:  "#E8F3FB", // light blue background tint
  skyMid:    "#5AACDF", // accent/hover blue
  white:     "#FFFFFF",
  offWhite:  "#F5FAFF",
  gray:      "#4A5568",
  lightGray: "#E2EDF7",
  // High-contrast overrides
  hcBg:      "#000000",
  hcYellow:  "#FFD700",
  hcText:    "#FFFFFF",
};

// ── Announce to screen readers via aria-live ──────────────────────────────
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

// ── Product data ──────────────────────────────────────────────────────────
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

// ── AI description via Claude API ────────────────────────────────────────
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

// ── Cart icon badge ───────────────────────────────────────────────────────
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

// ── Product Card ──────────────────────────────────────────────────────────
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
      <div
        aria-hidden="true"
        style={{ fontSize: 40, lineHeight: 1, textAlign: "center" }}
      >
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

      {/* Changed from h2 to p to prevent "heading level 2" announcements —
          the article's aria-label already provides full context to screen readers */}
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

      {/* AI Description Button ONLY */}
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
            ? highContrast
              ? "#007700"
              : "#2A7D4A"
            : highContrast
            ? SDCB.hcYellow
            : SDCB.blue,
          color: added
            ? SDCB.white
            : highContrast
            ? SDCB.hcBg
            : SDCB.white,
        }}
      >
        {added ? "✓ Added!" : "Add to Cart"}
      </button>
    </article>
  );
}
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
    border: highContrast ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
    flex: 1,
  };
}
function Success() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Payment successful 🎉</h1>
      <p>Thank you for your order.</p>
    </div>
  );
}

function Cancel() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Payment canceled</h1>
      <p>You were not charged.</p>
    </div>
  );
}
// ── Cart Drawer ───────────────────────────────────────────────────────────
function CartDrawer({ cart, open, onClose, highContrast, onAnnounce }) {
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
        <p
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            color: highContrast ? SDCB.hcYellow : SDCB.navy,
            fontSize: "1.4rem",
            fontWeight: 700,
          }}
        >
          Your Cart
        </p>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close cart"
          style={{
            ...btnStyle(highContrast, "secondary"),
            fontSize: "1.1rem",
            padding: "0.4rem 0.8rem",
          }}
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
              <span
                style={{ color: highContrast ? SDCB.hcText : SDCB.navy, fontSize: "0.9rem", flex: 1 }}
              >
                {item.emoji} {item.name}{" "}
                <span style={{ color: highContrast ? SDCB.hcYellow : SDCB.skyMid }}>×{item.qty}</span>
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: highContrast ? SDCB.hcYellow : SDCB.blue,
                  marginLeft: 12,
                }}
              >
                ${(item.price * item.qty).toFixed(2)}
              </span>
            </div>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: highContrast ? SDCB.hcYellow : SDCB.navy,
              paddingTop: "0.5rem",
            }}
            aria-label={`Total: $${total.toFixed(2)}`}
          >
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>

          <button
            style={{ ...btnStyle(highContrast, "primary"), marginTop: 8 }}
            onClick={() => checkout(cart)}
            aria-label={`Proceed to checkout. Total: $${total.toFixed(2)}`}
          >
            Checkout — ${total.toFixed(2)}
          </button>
        </>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [smartPopup, setSmartPopup] = useState("");
  const [recommendedItems, setRecommendedItems] = useState([]);
  const mainRef = useRef(null);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
  
      let updatedCart;
  
      if (existing) {
        updatedCart = prev.map((i) =>
          i.id === product.id
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      } else {
        updatedCart = [...prev, { ...product, qty: 1 }];
      }
  
      // ── SMART RECOMMENDATIONS ─────────────────────────────
      const related = PRODUCTS.filter(
        (p) =>
          p.category === product.category &&
          p.id !== product.id
      ).slice(0, 2);
  
      setRecommendedItems(related);
  
      let recommendationText = "";
  
      if (related.length > 0) {
        recommendationText =
          ` You may also like ${related
            .map((r) => r.name)
            .join(" and ")}.`;
      }
  
      // ── ACCESSIBLE POPUP ──────────────────────────────────
      const popupMessage =
        `${product.name} added to cart.${recommendationText}`;
  
      setSmartPopup(popupMessage);
      setAnnouncement(popupMessage);
  
      setTimeout(() => {
        setSmartPopup("");
      }, 3500);
  
      return updatedCart;
    });
  }, []);

  async function checkout(cart) {
    const res = await fetch("http://localhost:4242/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cart }),
    });
  
    const data = await res.json();
  
    if (data.url) {
      window.location.href = data.url;
    }
  }

  const filtered = PRODUCTS.filter((p) => {
    const matchCat = category === "All" || p.category === category;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Keyboard shortcut: Alt+C = open cart, Alt+H = toggle high contrast
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "c") { e.preventDefault(); setCartOpen((o) => !o); }
      if (e.altKey && e.key === "h") { e.preventDefault(); setHighContrast((hc) => !hc); }
      if (e.key === "Escape") setCartOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hc = highContrast;
  const bg = hc ? SDCB.hcBg : SDCB.offWhite;
  const fg = hc ? SDCB.hcYellow : SDCB.navy;

  return (
    <>
      {/* Google Fonts */}
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

      {/* Skip to main content */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          top: -60,
          left: 8,
          background: hc ? SDCB.hcYellow : SDCB.blue,
          color: hc ? SDCB.hcBg : SDCB.white,
          padding: "0.5rem 1rem",
          borderRadius: 6,
          fontWeight: 700,
          zIndex: 9999,
          textDecoration: "none",
          transition: "top 0.2s",
        }}
        onFocus={(e) => (e.currentTarget.style.top = "8px")}
        onBlur={(e) => (e.currentTarget.style.top = "-60px")}
      >
        Skip to main content
      </a>

      {/* Header */}
      <header
        style={{
          background: hc ? "#111" : SDCB.navy,
          borderBottom: hc ? `2px solid ${SDCB.hcYellow}` : "none",
          padding: "1rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          position: "sticky",
          top: 0,
          zIndex: 500,
        }}
        role="banner"
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: hc ? SDCB.hcYellow : SDCB.skyMid,
              fontWeight: 600,
            }}
          >
            San Diego Center for the Blind
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(1.2rem, 3vw, 1.7rem)",
              color: hc ? SDCB.hcYellow : SDCB.white,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            Accessible Living Store
          </h1>
        </div>

        <nav aria-label="Header actions" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setHighContrast((hc) => !hc)}
            aria-pressed={highContrast}
            aria-label={`${highContrast ? "Disable" : "Enable"} high contrast mode (Alt+H)`}
            style={{
              background: hc ? SDCB.hcYellow : SDCB.blue,
              color: hc ? SDCB.hcBg : SDCB.white,
              border: hc ? "none" : `1.5px solid ${SDCB.skyMid}`,
              borderRadius: 8,
              padding: "0.45rem 0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.82rem",
            }}
          >
            ◑ {highContrast ? "Standard" : "High Contrast"}
          </button>

          <button
            onClick={() => { setCartOpen(true); setAnnouncement("Cart opened"); }}
            aria-label={`Open cart${cartCount > 0 ? `, ${cartCount} items` : ""} (Alt+C)`}
            style={{
              background: hc ? SDCB.hcYellow : SDCB.skyMid,
              color: hc ? SDCB.hcBg : SDCB.white,
              border: "none",
              borderRadius: 8,
              padding: "0.45rem 0.95rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            🛒 Cart {cartCount > 0 && <CartBadge count={cartCount} />}
          </button>
        </nav>
      </header>

      {/* Keyboard shortcuts info banner */}
      <div
        role="note"
        aria-label="Keyboard shortcuts"
        style={{
          background: hc ? "#111" : SDCB.skyLight,
          borderBottom: hc ? `1px solid #444` : `1px solid ${SDCB.lightGray}`,
          padding: "0.4rem 2rem",
          fontSize: "0.78rem",
          color: hc ? "#aaa" : SDCB.blue,
        }}
      >
        <span aria-hidden="true">⌨ </span>
        Keyboard shortcuts: <kbd>Alt+C</kbd> Cart · <kbd>Alt+H</kbd> High Contrast · <kbd>Tab</kbd> Navigate · <kbd>Enter</kbd> Add to Cart · <kbd>Esc</kbd> Close
      </div>

      {/* ── SMART CART POPUP ───────────────────────────── */}
{smartPopup && (
  <div
    role="status"
    key={smartPopup}
    aria-live="polite"
    style={{
      position: "fixed",
      top: 100,
      right: 20,
      zIndex: 2000,
      background: hc ? "#111" : SDCB.white,
      color: hc ? SDCB.hcYellow : SDCB.navy,
      border: hc
        ? `2px solid ${SDCB.hcYellow}`
        : `2px solid ${SDCB.skyMid}`,
      borderRadius: 14,
      padding: "1rem 1.2rem",
      width: 320,
      maxWidth: "90vw",
      boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
      animation: "slideInRight 0.35s ease",
    }}
  >
    <p
      style={{
        margin: 0,
        fontWeight: 700,
        fontSize: "0.95rem",
      }}
    >
      ✓ {smartPopup}
    </p>

    {recommendedItems.length > 0 && (
      <div style={{ marginTop: "0.8rem" }}>
        <p
          style={{
            margin: "0 0 0.45rem",
            fontSize: "0.8rem",
            opacity: 0.8,
            fontWeight: 600,
          }}
        >
          Suggested items:
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {recommendedItems.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              style={{
                background: hc
                  ? SDCB.hcYellow
                  : SDCB.skyLight,
                color: hc
                  ? SDCB.hcBg
                  : SDCB.navy,
                border: "none",
                borderRadius: 999,
                padding: "0.4rem 0.7rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {item.emoji} {item.name}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
)}

      <main id="main-content" ref={mainRef} style={{ background: bg, minHeight: "100vh", padding: "1.5rem 2rem 4rem" }}>
        {/* Search + Filter */}
        <section aria-label="Search and filter products" style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label
              htmlFor="search"
              style={{ display: "block", marginBottom: 6, fontWeight: 600, color: fg, fontSize: "0.9rem" }}
            >
              Search Products
            </label>
            {/* Changed from type="search" to type="text" — search inputs are announced
                as "combobox" or "search edit" by many screen readers, causing phantom
                widget confusion. The label and aria-label already convey the purpose. */}
            <input
              id="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. cooking, clock, braille…"
              aria-label="Search products"
              style={{
                width: "100%",
                padding: "0.6rem 0.9rem",
                border: hc ? `2px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
                borderRadius: 8,
                fontSize: "1rem",
                background: hc ? "#111" : SDCB.white,
                color: hc ? SDCB.hcYellow : SDCB.navy,
                fontFamily: "inherit",
              }}
            />
          </div>

          <fieldset
            style={{ border: "none", padding: 0, margin: 0 }}
            aria-label="Filter by category"
          >
            <legend style={{ fontWeight: 600, color: fg, fontSize: "0.9rem", marginBottom: 6 }}>
              Filter by Category
            </legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    setAnnouncement(`Showing ${cat} products`);
                  }}
                  aria-pressed={category === cat}
                  style={{
                    background:
                      category === cat
                        ? hc ? SDCB.hcYellow : SDCB.blue
                        : hc ? "#222" : SDCB.white,
                    color:
                      category === cat
                        ? hc ? SDCB.hcBg : SDCB.white
                        : hc ? SDCB.hcYellow : SDCB.navy,
                    border: hc ? `1.5px solid ${SDCB.hcYellow}` : `1.5px solid ${SDCB.lightGray}`,
                    borderRadius: 20,
                    padding: "0.35rem 0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.82rem",
                    transition: "all 0.15s",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        {/* Results count */}
        <p
          aria-live="polite"
          style={{ color: hc ? "#aaa" : SDCB.gray, fontSize: "0.85rem", marginBottom: "1rem" }}
        >
          {filtered.length} product{filtered.length !== 1 ? "s" : ""} found
        </p>

        {/* Product Grid */}
        <section
          aria-label="Product listings"
          className="product-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={addToCart}
              onAnnounce={setAnnouncement}
              highContrast={highContrast}
            />
          ))}
          {filtered.length === 0 && (
            <p
              role="status"
              style={{ color: hc ? SDCB.hcYellow : SDCB.gray, gridColumn: "1/-1", textAlign: "center", padding: "2rem" }}
            >
              No products match your search. Try a different keyword or category.
            </p>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer
        role="contentinfo"
        style={{
          background: hc ? "#111" : SDCB.navy,
          color: hc ? SDCB.hcYellow : SDCB.skyMid,
          padding: "1.5rem 2rem",
          textAlign: "center",
          fontSize: "0.85rem",
          borderTop: hc ? `2px solid ${SDCB.hcYellow}` : "none",
        }}
      >
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

      {/* Cart Overlay */}
      {cartOpen && (
        <div
          onClick={() => setCartOpen(false)}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 999,
          }}
        />
      )}

      <CartDrawer
        cart={cart}
        open={cartOpen}
        onClose={() => { setCartOpen(false); setAnnouncement("Cart closed"); }}
        highContrast={highContrast}
        onAnnounce={setAnnouncement}
      />
    </>
  );
}