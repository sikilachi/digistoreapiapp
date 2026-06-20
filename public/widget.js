/* SRD Digistore Checkout — standalone storefront widget.
 *
 * Drop-in usage on a Shopify product template (no app/CLI needed):
 *
 *   <div id="srd-checkout"
 *        data-handle="{{ product.handle }}"
 *        data-product-id="{{ product.id }}"
 *        data-hide-native="true"></div>
 *   <script src="https://digistoreapiapp.vercel.app/widget.js" defer></script>
 *
 * The script derives the bridge API base from its own <script src>, fetches the
 * product's option config, renders the form + live (server-calculated) price,
 * hides the theme's native cart/buy buttons, and on "Buy Now" redirects to a
 * dynamically created Digistore24 checkout URL. No API keys touch the browser.
 */
(function () {
  // --- resolve API base from this script's own URL --------------------------
  var thisScript =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();
  var APP_URL = "";
  try {
    APP_URL = new URL(thisScript.src).origin;
  } catch (e) {
    APP_URL = "";
  }

  // --- inject styles once ---------------------------------------------------
  if (!document.getElementById("srd-checkout-styles")) {
    var css =
      ".srd-checkout{--g:#059669;--gd:#047857;--bd:#e2e8f0;--ink:#0f172a;--mut:#64748b;font-family:inherit;color:var(--ink);max-width:560px}" +
      ".srd-checkout *{box-sizing:border-box}" +
      ".srd-loading,.srd-error{color:var(--mut);font-size:14px;padding:12px 0}.srd-error{color:#b91c1c}" +
      ".srd-field{margin-bottom:16px}" +
      ".srd-field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}" +
      ".srd-field select,.srd-field input,.srd-field textarea{width:100%;border:1px solid var(--bd);border-radius:12px;padding:10px 12px;font-size:14px;background:#fff;outline:none}" +
      ".srd-field select:focus,.srd-field input:focus,.srd-field textarea:focus{border-color:#34d399;box-shadow:0 0 0 3px #d1fae5}" +
      ".srd-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:480px){.srd-options{grid-template-columns:1fr}}" +
      ".srd-price-box{display:flex;align-items:baseline;justify-content:space-between;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:14px 16px;margin:8px 0 16px}" +
      ".srd-price-label{font-size:13px;color:var(--mut)}.srd-price-value{font-size:24px;font-weight:700;color:var(--gd)}" +
      ".srd-buy{width:100%;background:var(--g);color:#fff;border:none;border-radius:999px;padding:14px 20px;font-size:16px;font-weight:600;cursor:pointer;transition:background .15s}" +
      ".srd-buy:hover{background:var(--gd)}.srd-buy:disabled{opacity:.6;cursor:not-allowed}" +
      ".srd-note{font-size:12px;color:var(--mut);margin-top:10px;text-align:center}" +
      ".srd-msg{font-size:13px;margin-top:10px}.srd-msg.err{color:#b91c1c}";
    var style = document.createElement("style");
    style.id = "srd-checkout-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- find / resolve mount + product handle --------------------------------
  var root = document.getElementById("srd-checkout");
  if (!root) return;

  function meta() {
    try {
      return window.ShopifyAnalytics && window.ShopifyAnalytics.meta
        ? window.ShopifyAnalytics.meta
        : null;
    } catch (e) {
      return null;
    }
  }
  var HANDLE = root.getAttribute("data-handle") || "";
  var PRODUCT_ID = root.getAttribute("data-product-id") || "";
  if (!HANDLE) {
    // Fallback: derive handle from the URL /products/<handle>
    var m = /\/products\/([^/?#]+)/.exec(window.location.pathname);
    if (m) HANDLE = m[1];
  }
  if (!PRODUCT_ID) {
    var mt = meta();
    if (mt && mt.product && mt.product.id) PRODUCT_ID = String(mt.product.id);
  }
  var HIDE_NATIVE = (root.getAttribute("data-hide-native") || "true") !== "false";

  var state = { config: null, options: {}, currency: "EUR", priceTimer: null };

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs)
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    (children || []).forEach(function (c) {
      e.appendChild(c);
    });
    return e;
  }

  function hideNative() {
    if (!HIDE_NATIVE) return;
    ['form[action*="/cart/add"]', ".shopify-payment-button", "product-form", ".product-form__buttons"].forEach(
      function (sel) {
        document.querySelectorAll(sel).forEach(function (n) {
          if (!root.contains(n)) n.style.display = "none";
        });
      },
    );
  }

  function api(path, opts) {
    return fetch(APP_URL + path, opts).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, j: j };
      });
    });
  }

  function formatPrice(a, c) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(a);
    } catch (e) {
      return c + " " + Number(a).toFixed(2);
    }
  }

  function setBuy(enabled) {
    var b = root.querySelector(".srd-buy");
    if (b) b.disabled = !enabled;
  }
  function setMsg(t, err) {
    var m = root.querySelector(".srd-msg");
    if (m) {
      m.textContent = t || "";
      m.className = "srd-msg" + (err ? " err" : "");
    }
  }

  function debouncePrice() {
    if (state.priceTimer) clearTimeout(state.priceTimer);
    state.priceTimer = setTimeout(updatePrice, 250);
  }

  function updatePrice() {
    var pe = root.querySelector(".srd-price-value");
    if (!pe) return;
    api("/api/public/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: HANDLE, options: state.options }),
    })
      .then(function (res) {
        if (res.ok && typeof res.j.finalPrice === "number") {
          state.currency = res.j.currency || state.currency;
          pe.textContent = formatPrice(res.j.finalPrice, state.currency);
          setBuy(true);
        } else {
          pe.textContent = "—";
          setBuy(false);
        }
      })
      .catch(function () {
        pe.textContent = "—";
        setBuy(false);
      });
  }

  function buyNow() {
    var cfg = state.config;
    setMsg("");
    setBuy(false);
    var btn = root.querySelector(".srd-buy");
    var prev = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Creating checkout…";

    var link = (root.querySelector("#srd-link") || {}).value || "";
    var notes = (root.querySelector("#srd-notes") || {}).value || "";
    var email = (root.querySelector("#srd-email") || {}).value || "";

    if (cfg.service.requires_link && !link.trim()) {
      setMsg((cfg.service.link_label || "Target link") + " is required.", true);
      setBuy(true);
      if (btn) btn.textContent = prev;
      return;
    }

    api("/api/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: HANDLE,
        options: state.options,
        targetLink: link,
        orderNotes: notes,
        customerEmail: email,
        shopifyProductId: PRODUCT_ID,
      }),
    })
      .then(function (res) {
        if (res.ok && res.j.checkoutUrl) {
          window.location.href = res.j.checkoutUrl;
        } else {
          setMsg("Checkout could not be created. Please contact support.", true);
          setBuy(true);
          if (btn) btn.textContent = prev;
        }
      })
      .catch(function () {
        setMsg("Checkout could not be created. Please contact support.", true);
        setBuy(true);
        if (btn) btn.textContent = prev;
      });
  }

  function render(cfg) {
    root.innerHTML = "";
    root.className = "srd-checkout";
    state.config = cfg;
    state.currency = cfg.service.currency || "EUR";
    hideNative();

    var wrap = el("div", { class: "srd-options" });
    (cfg.groups || []).forEach(function (g) {
      var f = el("div", { class: "srd-field" });
      f.appendChild(el("label", { text: g.label }));
      if (g.input_type === "select" || g.input_type === "radio") {
        var sel = el("select", {});
        (g.values || []).forEach(function (v) {
          var o = el("option", { value: v.value, text: v.label });
          if (v.is_default) {
            o.selected = true;
            state.options[g.key] = v.value;
          }
          sel.appendChild(o);
        });
        if (!state.options[g.key] && g.values && g.values[0]) state.options[g.key] = g.values[0].value;
        sel.addEventListener("change", function () {
          state.options[g.key] = sel.value;
          debouncePrice();
        });
        f.appendChild(sel);
      } else {
        var inp = el("input", { type: g.input_type === "number" ? "number" : "text" });
        inp.addEventListener("input", function () {
          state.options[g.key] = inp.value;
          debouncePrice();
        });
        f.appendChild(inp);
      }
      wrap.appendChild(f);
    });
    root.appendChild(wrap);

    if (cfg.service.requires_link) {
      var lf = el("div", { class: "srd-field" });
      lf.appendChild(el("label", { text: cfg.service.link_label || "Target link / URL" }));
      lf.appendChild(el("input", { id: "srd-link", type: "text", placeholder: "https://…" }));
      root.appendChild(lf);
    }

    var ef = el("div", { class: "srd-field" });
    ef.appendChild(el("label", { text: "Email" }));
    ef.appendChild(el("input", { id: "srd-email", type: "email", placeholder: "you@example.com" }));
    root.appendChild(ef);

    if (cfg.service.allow_notes) {
      var nf = el("div", { class: "srd-field" });
      nf.appendChild(el("label", { text: "Order notes (optional)" }));
      nf.appendChild(el("textarea", { id: "srd-notes", rows: "2" }));
      root.appendChild(nf);
    }

    root.appendChild(
      el("div", { class: "srd-price-box" }, [
        el("span", { class: "srd-price-label", text: "Total" }),
        el("span", { class: "srd-price-value", text: "—" }),
      ]),
    );

    var buy = el("button", { class: "srd-buy", type: "button", text: "Buy Now" });
    buy.addEventListener("click", buyNow);
    root.appendChild(buy);
    root.appendChild(el("div", { class: "srd-msg" }));
    root.appendChild(el("div", { class: "srd-note", text: "Secure checkout via Digistore24." }));

    updatePrice();
  }

  function start() {
    if (!HANDLE) {
      root.innerHTML = '<div class="srd-error"></div>';
      return;
    }
    root.innerHTML = '<div class="srd-loading">Loading options…</div>';
    api("/api/public/config/" + encodeURIComponent(HANDLE), { headers: { Accept: "application/json" } })
      .then(function (res) {
        var cfg = res.j;
        if (!cfg || cfg.enabled === false) {
          // Not configured for this product — leave the native form visible.
          root.innerHTML = "";
          return;
        }
        render(cfg);
      })
      .catch(function () {
        root.innerHTML = '<div class="srd-error">Service options are temporarily unavailable.</div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
