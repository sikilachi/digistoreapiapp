/* SRD Digistore Checkout — storefront widget (vanilla JS, no dependencies).
 *
 * Flow:
 *  1. Fetch /api/public/config/:handle to learn the option groups.
 *  2. Render selects/inputs + a target-link field + notes.
 *  3. On every change, POST /api/public/price to get a server-calculated price.
 *  4. On "Buy Now", POST /api/public/checkout, then redirect to the returned
 *     Digistore24 checkout URL.
 *
 * No prices or secrets are trusted from the browser — the server recalculates.
 */
(function () {
  var root = document.getElementById("srd-checkout");
  if (!root) return;

  var APP_URL = (root.getAttribute("data-app-url") || "").replace(/\/$/, "");
  var HANDLE = root.getAttribute("data-handle");
  var PRODUCT_ID = root.getAttribute("data-product-id");
  var HIDE_NATIVE = root.getAttribute("data-hide-native") === "true";

  var state = { config: null, options: {}, currency: "EUR", priceTimer: null };

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function maybeHideNativeForm() {
    if (!HIDE_NATIVE) return;
    var selectors = ['form[action*="/cart/add"]', '.shopify-payment-button', 'product-form'];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) {
        if (!root.contains(n)) n.style.display = "none";
      });
    });
  }

  function fetchConfig() {
    return fetch(APP_URL + "/api/public/config/" + encodeURIComponent(HANDLE), {
      headers: { Accept: "application/json" },
    }).then(function (r) { return r.json(); });
  }

  function debouncePrice() {
    if (state.priceTimer) clearTimeout(state.priceTimer);
    state.priceTimer = setTimeout(updatePrice, 250);
  }

  function updatePrice() {
    var priceEl = root.querySelector(".srd-price-value");
    if (!priceEl) return;
    fetch(APP_URL + "/api/public/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: HANDLE, options: state.options }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && typeof res.j.finalPrice === "number") {
          state.currency = res.j.currency || state.currency;
          priceEl.textContent = formatPrice(res.j.finalPrice, state.currency);
          setBuyEnabled(true);
        } else {
          priceEl.textContent = "—";
          setBuyEnabled(false);
        }
      })
      .catch(function () {
        priceEl.textContent = "—";
        setBuyEnabled(false);
      });
  }

  function formatPrice(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency }).format(amount);
    } catch (e) {
      return currency + " " + Number(amount).toFixed(2);
    }
  }

  function setBuyEnabled(enabled) {
    var btn = root.querySelector(".srd-buy");
    if (btn) btn.disabled = !enabled;
  }

  function setMessage(msg, isError) {
    var m = root.querySelector(".srd-msg");
    if (!m) return;
    m.textContent = msg || "";
    m.className = "srd-msg" + (isError ? " err" : "");
  }

  function buyNow() {
    var cfg = state.config;
    setMessage("");
    setBuyEnabled(false);
    var btn = root.querySelector(".srd-buy");
    var prevText = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Creating checkout…";

    var targetLink = (root.querySelector("#srd-link") || {}).value || "";
    var orderNotes = (root.querySelector("#srd-notes") || {}).value || "";
    var email = (root.querySelector("#srd-email") || {}).value || "";

    if (cfg.service.requires_link && !targetLink.trim()) {
      setMessage((cfg.service.link_label || "Target link") + " is required.", true);
      setBuyEnabled(true);
      if (btn) btn.textContent = prevText;
      return;
    }

    fetch(APP_URL + "/api/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: HANDLE,
        options: state.options,
        targetLink: targetLink,
        orderNotes: orderNotes,
        customerEmail: email,
        shopifyProductId: PRODUCT_ID,
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.checkoutUrl) {
          window.location.href = res.j.checkoutUrl;
        } else {
          setMessage("Checkout could not be created. Please contact support.", true);
          setBuyEnabled(true);
          if (btn) btn.textContent = prevText;
        }
      })
      .catch(function () {
        setMessage("Checkout could not be created. Please contact support.", true);
        setBuyEnabled(true);
        if (btn) btn.textContent = prevText;
      });
  }

  function render(cfg) {
    root.innerHTML = "";
    state.config = cfg;
    state.currency = cfg.service.currency || "EUR";

    if (!cfg.enabled) {
      // Checkout disabled for this product — leave native form as-is.
      root.appendChild(el("div", { class: "srd-error", text: "" }));
      return;
    }

    maybeHideNativeForm();

    // Option groups grid.
    var optionsWrap = el("div", { class: "srd-options" });
    (cfg.groups || []).forEach(function (g) {
      var field = el("div", { class: "srd-field" });
      field.appendChild(el("label", { text: g.label, for: "srd-opt-" + g.key }));

      if (g.input_type === "select" || g.input_type === "radio") {
        var sel = el("select", { id: "srd-opt-" + g.key });
        (g.values || []).forEach(function (v) {
          var opt = el("option", { value: v.value, text: v.label });
          if (v.is_default) { opt.selected = true; state.options[g.key] = v.value; }
          sel.appendChild(opt);
        });
        if (!state.options[g.key] && g.values && g.values[0]) {
          state.options[g.key] = g.values[0].value;
        }
        sel.addEventListener("change", function () {
          state.options[g.key] = sel.value;
          debouncePrice();
        });
        field.appendChild(sel);
      } else {
        var inp = el("input", { id: "srd-opt-" + g.key, type: g.input_type === "number" ? "number" : "text" });
        inp.addEventListener("input", function () {
          state.options[g.key] = inp.value;
          debouncePrice();
        });
        field.appendChild(inp);
      }
      optionsWrap.appendChild(field);
    });
    root.appendChild(optionsWrap);

    // Target link.
    if (cfg.service.requires_link) {
      var linkField = el("div", { class: "srd-field" });
      linkField.appendChild(el("label", { text: cfg.service.link_label || "Target link / URL", for: "srd-link" }));
      linkField.appendChild(el("input", { id: "srd-link", type: "text", placeholder: "https://…" }));
      root.appendChild(linkField);
    }

    // Email (optional, pre-fills Digistore).
    var emailField = el("div", { class: "srd-field" });
    emailField.appendChild(el("label", { text: "Email (optional)", for: "srd-email" }));
    emailField.appendChild(el("input", { id: "srd-email", type: "email", placeholder: "you@example.com" }));
    root.appendChild(emailField);

    // Notes.
    if (cfg.service.allow_notes) {
      var notesField = el("div", { class: "srd-field" });
      notesField.appendChild(el("label", { text: "Order notes (optional)", for: "srd-notes" }));
      notesField.appendChild(el("textarea", { id: "srd-notes", rows: "2" }));
      root.appendChild(notesField);
    }

    // Price box.
    var priceBox = el("div", { class: "srd-price-box" }, [
      el("span", { class: "srd-price-label", text: "Total" }),
      el("span", { class: "srd-price-value", text: "—" }),
    ]);
    root.appendChild(priceBox);

    // Buy button.
    var buy = el("button", { class: "srd-buy", type: "button", text: "Buy Now" });
    buy.addEventListener("click", buyNow);
    root.appendChild(buy);

    root.appendChild(el("div", { class: "srd-msg" }));
    root.appendChild(el("div", { class: "srd-note", text: "Secure checkout via Digistore24." }));

    updatePrice();
  }

  fetchConfig()
    .then(function (cfg) {
      if (!cfg || cfg.enabled === false) {
        root.innerHTML = "";
        return;
      }
      render(cfg);
    })
    .catch(function () {
      root.innerHTML = '<div class="srd-error">Service options are temporarily unavailable.</div>';
    });
})();
