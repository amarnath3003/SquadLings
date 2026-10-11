const products = [
  { id: "aurora-lamp", name: "Aurora Lamp", price: 49, category: "Home", icon: "💡", art: "lamp", tag: "Bestseller", description: "A warm little glow for slow evenings. A ceramic base, a linen shade, and just the right light.", largePrice: 69 },
  { id: "nimbus-mug", name: "Nimbus Mug", price: 14, category: "Home", icon: "☕", art: "mug", tag: "Daily ritual", description: "Your morning coffee's new favourite home. A generously sized stoneware mug with a soft matte finish." },
  { id: "fern-notebook", name: "Fern Notebook", price: 9, category: "Desk", icon: "📓", art: "notebook", tag: "Small favourite", description: "Room for your next good idea. 160 dotted pages, a lay-flat binding, and a forest-green cover." },
  { id: "pebble-speaker", name: "Pebble Speaker", price: 59, category: "Audio", icon: "🔊", art: "speaker", tag: "Good company", description: "A compact wireless speaker for your desk, kitchen, or afternoon playlist. Up to 12 hours of listening." },
  { id: "orbit-clock", name: "Orbit Clock", price: 35, category: "Desk", icon: "🕰️", art: "clock", tag: "Take your time", description: "Quiet, simple, and always on time. A silent desk clock with a warm oak finish." },
  { id: "drift-blanket", name: "Drift Blanket", price: 65, category: "Home", icon: "🧶", art: "blanket", tag: "Stay a while", description: "A soft cotton throw for the sofa, the reading chair, and the occasional afternoon nap." },
];
const key = "buggymart-demo-v1";
const cleanState = () => ({ cart: [], coupon: false, order: null });
let state;
try { state = JSON.parse(sessionStorage.getItem(key)) || cleanState(); } catch { state = cleanState(); }
const app = document.querySelector("#app");
const config = await fetch("/config.json").then(response => {
  if (!response.ok) throw new Error("Could not load shop configuration");
  return response.json();
});
const bug = id => config.enabled.includes(id);
const money = value => Number.isNaN(value) ? "$NaN" : `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const productById = id => products.find(product => product.id === id);
const priceFor = item => {
  const product = productById(item.id);
  return item.variant === "Large" ? product.largePrice : product.price;
};
const save = () => { sessionStorage.setItem(key, JSON.stringify(state)); updateCartCount(); };
function updateCartCount() { document.querySelector("#cart-link").textContent = `Cart (${state.cart.reduce((sum, item) => sum + item.quantity, 0)})`; }
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  document.querySelector("#toast").textContent = message;
  toastTimer = setTimeout(() => { document.querySelector("#toast").textContent = ""; }, 3200);
}
function art(product) {
  return `<div class="product-art art-${product.art}"><span class="tag">${product.tag}</span>${product.id === "nimbus-mug" && bug("BM-10") ? '<img src="/images/nimbus-mug-missing.png" alt="Nimbus Mug">' : `<span class="emoji" role="img" aria-label="${product.name}">${product.icon}</span>`}</div>`;
}
function add(id, variant = "Standard") {
  const item = state.cart.find(item => item.id === id && item.variant === variant);
  const quantity = bug("BM-05") ? 2 : 1;
  if (item) item.quantity += quantity;
  else state.cart.push({ id, variant, quantity });
  save();
  toast(`Added 1 ${productById(id).name} to your cart.`);
}
function totals() {
  const subtotal = state.cart.reduce((sum, item) => sum + priceFor(item) * item.quantity, 0);
  const discount = state.coupon ? Math.round(subtotal * .1 * 100) / 100 : 0;
  const shipping = state.cart.length ? 5 : 0;
  const total = subtotal + shipping + (bug("BM-09") ? discount : -discount);
  return { subtotal, discount, shipping, total };
}
function summary(showCoupon = false) {
  const t = totals();
  return `<h2>Order summary</h2><div class="summary-line"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    ${state.coupon ? `<div class="summary-line"><span>SAVE10 · 10% off</span><span>−${money(t.discount)}</span></div>` : ""}
    <div class="summary-line"><span>Shipping</span><span>${money(t.shipping)}</span></div>
    <div class="summary-line total"><span>Total</span><span id="total">${money(t.total)}</span></div>
    ${showCoupon ? `<form id="coupon-form"><label class="label" for="coupon">Promo code</label><div class="coupon"><input id="coupon" name="coupon" placeholder="Enter code" value="${state.coupon ? "SAVE10" : ""}"><button type="submit">Apply</button></div></form>` : ""}
    <p class="fine">USD. Tax included. Flat $5 shipping per order.</p>`;
}
function shop() {
  const params = new URLSearchParams(location.search);
  const query = params.get("q") || "";
  const category = params.get("category") || "All";
  const sort = params.get("sort") || "featured";
  document.title = "Shop · BuggyMart";
  if (bug("BM-08") && /%|\p{Extended_Pictographic}/u.test(query)) {
    app.innerHTML = `<section class="error"><p class="eyebrow">Something went wrong</p><h1>500 — Search failed</h1><p>We couldn't load results for “${escape(query)}”.</p><pre>URIError: URI malformed\n    at decodeURIComponent (&lt;anonymous&gt;)\n    at searchProducts (catalog.js:42:18)</pre><a class="button" href="/">Back to shop</a></section>`;
    return;
  }
  let items = products.filter(product => product.name.toLowerCase().includes(query.toLowerCase()));
  if (category !== "All" && !bug("BM-07")) items = items.filter(product => product.category === category);
  if (sort === "low") items.sort((a, b) => bug("BM-01") ? b.price - a.price : a.price - b.price);
  if (sort === "high") items.sort((a, b) => b.price - a.price);
  app.innerHTML = `<section class="hero"><div><p class="eyebrow">The everyday collection / 01</p><h1>Little things.<br>Better everyday.</h1><p>Thoughtful finds for your home, desk, and everything in between.</p></div><div class="hero-art" aria-hidden="true"><span class="sun"></span><span class="vase"></span><span class="block"></span></div></section>
    <div class="toolbar"><form class="search" action="/search"><label><span class="label">Find your next favourite</span><input type="search" name="q" aria-label="Search products" placeholder="Search products…" value="${escape(query)}"></label><button type="submit">Search</button></form>
    <label><span class="label">Category</span><select id="category" aria-label="Category">${["All", "Home", "Desk", "Audio"].map(value => `<option ${category === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
    <label><span class="label">Sort by</span><select id="sort" aria-label="Sort by">${[["featured", "Featured"], ["low", "Price: low to high"], ["high", "Price: high to low"]].map(([value, label]) => `<option value="${value}" ${value === sort ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>
    <div class="section-line"><h2>${query ? `Results for “${escape(query)}”` : "The collection"}</h2><span>${items.length} products</span></div>
    <div class="grid">${items.map(product => `<article class="product"><a href="/product/${product.id}" aria-label="View ${product.name}">${art(product)}</a><div class="product-info"><p class="category">${product.category}</p><h3><a href="/product/${product.id}">${product.name}</a></h3><div class="product-bottom"><span class="price">${money(product.price)}</span><button data-add="${product.id}" aria-label="Add ${product.name} to cart">Add to cart</button></div></div></article>`).join("")}</div>
    ${items.length ? "" : '<section class="empty"><h2>No products found</h2><p>Try a different name, or browse the full collection.</p><a class="button secondary" href="/">Shop all</a></section>'}`;
  for (const id of ["category", "sort"]) document.getElementById(id).addEventListener("change", event => {
    params.set(id, event.target.value);
    location.assign(`/search?${params}`);
  });
  app.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => add(button.dataset.add, button.dataset.add === "aurora-lamp" ? "Small" : "Standard")));
}
function detail(id) {
  const product = productById(id);
  if (!product) { app.innerHTML = '<h1>Product not found</h1><a href="/">Back to shop</a>'; return; }
  document.title = `${product.name} · BuggyMart`;
  app.innerHTML = `<div class="breadcrumb"><a href="/">Shop</a> / ${product.category} / ${product.name}</div><section class="detail">${art(product)}<div><p class="eyebrow">${product.category} / The everyday collection</p><h1>${product.name}</h1><p id="description" class="muted">${product.description}</p><p id="product-price" class="price">${money(product.price)}</p>${product.largePrice ? '<label class="label" for="size">Size</label><select id="size"><option>Small</option><option>Large</option></select>' : ""}<button id="add-product">Add to cart</button><small>In stock · Ships in 2–3 working days · 30-day returns</small><div class="notice">A little treat: use <strong>SAVE10</strong> for 10% off your order.</div></div></section>`;
  document.querySelector("#size")?.addEventListener("change", event => {
    const large = event.target.value === "Large";
    document.querySelector("#product-price").textContent = money(large ? bug("BM-03") ? NaN : product.largePrice : product.price);
    document.querySelector("#description").textContent = large && bug("BM-03") ? "undefined" : product.description;
  });
  document.querySelector("#add-product").addEventListener("click", () => add(id, document.querySelector("#size")?.value || "Standard"));
}
function cart() {
  document.title = "Your cart · BuggyMart";
  app.innerHTML = `<a class="back" href="/">← Continue shopping</a><h1>Your cart</h1><p class="muted">A few good things, ready to go.</p><div class="two-col"><section class="panel">${state.cart.length ? state.cart.map((item, index) => {
    const product = productById(item.id);
    return `<article class="cart-row"><div class="cart-art" aria-hidden="true">${product.icon}</div><div><h3><a href="/product/${item.id}">${product.name}</a></h3><small>${item.variant} · ${money(priceFor(item))} each</small><button class="text-button" data-remove="${index}" aria-label="Remove ${product.name}">Remove</button></div><label><span class="label">Quantity</span><input type="number" step="1" ${bug("BM-02") ? "" : 'min="1"'} value="${item.quantity}" aria-label="Quantity for ${product.name}" data-quantity="${index}"></label><span class="price">${money(priceFor(item) * item.quantity)}</span></article>`;
  }).join("") : '<div class="empty"><h2>Your cart is empty</h2><p>Find something you’ll love in the collection.</p><a class="button secondary" href="/">Browse products</a></div>'}</section><aside class="panel">${summary(true)}<a class="button full" href="/checkout">Checkout →</a><p class="fine">Simulated checkout. Nothing will be charged.</p></aside></div>`;
  app.querySelectorAll("[data-quantity]").forEach(input => input.addEventListener("change", () => {
    const quantity = Number(input.value);
    if (!Number.isInteger(quantity) || !input.value.trim() || (!bug("BM-02") && quantity < 1)) {
      toast("Quantity must be a whole number of at least 1."); cart(); return;
    }
    state.cart[Number(input.dataset.quantity)].quantity = quantity;
    save(); cart();
  }));
  app.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
    if (!bug("BM-04")) state.cart.splice(Number(button.dataset.remove), 1);
    save(); cart(); toast("Item removed from your cart.");
  }));
  document.querySelector("#coupon-form").addEventListener("submit", event => {
    event.preventDefault();
    const valid = document.querySelector("#coupon").value.trim().toUpperCase() === "SAVE10";
    state.coupon = valid; save(); cart(); toast(valid ? "SAVE10 applied. You saved 10%!" : "That code isn't valid. Try SAVE10.");
  });
}
function checkout() {
  document.title = "Checkout · BuggyMart";
  if (!state.cart.length && !bug("BM-06")) {
    app.innerHTML = '<section class="empty panel"><h1>Your cart is empty</h1><p>Add an item before checking out.</p><a class="button" href="/">Back to shop</a></section>';
    return;
  }
  app.innerHTML = `<a class="back" href="/cart">← Back to cart</a><h1>Checkout</h1><p class="muted">One last step. This is a demo order.</p><div class="two-col"><form id="checkout-form" class="panel"><h2>Shipping details</h2><div class="fields"><label class="span-2">Full name<input name="name" autocomplete="name" required placeholder="Alex Morgan"></label><label class="span-2">Email<input name="email" type="email" autocomplete="email" required placeholder="alex@example.test"></label><label class="span-2">Street address<input name="address" autocomplete="street-address" required placeholder="12 Garden Lane"></label><label>City<input name="city" autocomplete="address-level2" required placeholder="Portland"></label><label>Postal code<input name="postal" autocomplete="postal-code" required placeholder="97201"></label></div><div class="payment"><strong>Demo payment</strong><br>No card needed. Use fictional shipping details.</div><button class="full" type="submit">Place demo order</button></form><aside class="panel">${summary()}<div class="notice">${state.cart.reduce((sum, item) => sum + item.quantity, 0)} items in your order</div></aside></div>`;
  document.querySelector("#checkout-form").addEventListener("submit", event => {
    event.preventDefault();
    state.order = { number: "BM-1001", items: state.cart.reduce((sum, item) => sum + item.quantity, 0), total: totals().total };
    state.cart = []; state.coupon = false; save(); location.assign("/order");
  });
}
function order() {
  document.title = "Order confirmation · BuggyMart";
  if (!state.order) { app.innerHTML = '<h1>No order yet</h1><a href="/">Browse products</a>'; return; }
  app.innerHTML = `<section class="panel success"><div class="check" aria-hidden="true">✓</div><p class="eyebrow">Order ${state.order.number}</p><h1>You're all set.</h1><p class="muted">Your demo order has been placed successfully.</p><div class="summary-line"><span>Items ordered</span><strong>${state.order.items}</strong></div><div class="summary-line total"><span>Order total</span><strong>${money(state.order.total)}</strong></div><p class="fine">This was a simulation. No payment or shipment was created.</p><a class="button full" href="/">Back to shop</a></section>`;
}
document.querySelector("#reset").addEventListener("click", () => { state = cleanState(); save(); location.assign("/"); });
updateCartCount();
const path = location.pathname;
if (path.startsWith("/product/")) detail(path.split("/")[2]);
else if (path === "/cart") cart();
else if (path === "/checkout") checkout();
else if (path === "/order") order();
else shop();
