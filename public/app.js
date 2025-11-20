// app.js — Durger King style (full lottie grid, add -> - + inline)
// Put in /public/app.js

const API_BASE = ""; // leave empty to use current origin

// Small set of friendly lottie JSONs (public)
const LOTTIE_FALLBACKS = [
  "https://assets10.lottiefiles.com/packages/lf20_x62chJ.json", // burger
  "https://assets3.lottiefiles.com/packages/lf20_jzqkng7v.json", // fries
  "https://assets10.lottiefiles.com/packages/lf20_p8bfn5to.json", // hotdog-ish
  "https://assets1.lottiefiles.com/packages/lf20_e3tfju2v.json", // taco-ish
  "https://assets2.lottiefiles.com/packages/lf20_tfb3estd.json", // pizza
  "https://assets2.lottiefiles.com/packages/lf20_0yfsb3a1.json", // donut
  "https://assets2.lottiefiles.com/packages/lf20_x62chJ.json", // repeat
];

// helpers
function money(cents) {
  if (typeof cents === "number") return `$${(cents/100).toFixed(2)}`;
  // accept either cents or already decimal
  return typeof cents === "string" && cents.includes(".") ? `$${Number(cents).toFixed(2)}` : `$${Number(cents/100).toFixed(2)}`;
}

let products = [];
let cart = [];

// load cart from localstorage
function loadCart() {
  try {
    const raw = localStorage.getItem("dk_cart_v2");
    cart = raw ? JSON.parse(raw) : [];
  } catch (e) {
    cart = [];
  }
}

function saveCart() {
  localStorage.setItem("dk_cart_v2", JSON.stringify(cart));
  updateUI();
}

function quantityFor(productId) {
  const it = cart.find(i => i.product_id == productId);
  return it ? it.qty : 0;
}

function addOne(product) {
  const it = cart.find(i => i.product_id == product.id);
  if (it) it.qty++;
  else cart.push({ product_id: product.id, name: product.name, price_cents: product.price_cents, qty: 1 });
  saveCart();
}

function decOne(product) {
  const it = cart.find(i => i.product_id == product.id);
  if (!it) return;
  it.qty--;
  if (it.qty <= 0) cart = cart.filter(x => x.product_id != product.id);
  saveCart();
}

function setQty(product, qty) {
  const it = cart.find(i => i.product_id == product.id);
  if (it) it.qty = qty;
  else cart.push({ product_id: product.id, name: product.name, price_cents: product.price_cents, qty });
  if (qty <= 0) cart = cart.filter(x => x.product_id != product.id);
  saveCart();
}

function totalAmount() {
  return cart.reduce((s,i) => s + i.qty * i.price_cents, 0);
}

function updateUI() {
  // top badge
  const totalQty = cart.reduce((s,i) => s + i.qty, 0);
  const topBadge = document.getElementById("top-badge");
  if (totalQty > 0) { topBadge.innerText = totalQty; topBadge.classList.remove("hidden"); }
  else topBadge.classList.add("hidden");

  // view order bar
  const viewBar = document.getElementById("view-order-bar");
  if (totalQty > 0) viewBar.classList.remove("hidden"); else viewBar.classList.add("hidden");

  // update per-card controls
  document.querySelectorAll("[data-product-id]").forEach(el => {
    const pid = el.getAttribute("data-product-id");
    const qty = quantityFor(pid);
    const addBtn = el.querySelector(".btn-add");
    const qtyWrap = el.querySelector(".qty-wrap");
    const bubble = el.querySelector(".qty-bubble");
    if (qty > 0) {
      addBtn?.classList.add("hidden");
      qtyWrap?.classList.remove("hidden");
      if (bubble) { bubble.innerText = qty; bubble.classList.remove("hidden"); }
    } else {
      addBtn?.classList.remove("hidden");
      qtyWrap?.classList.add("hidden");
      if (bubble) bubble.classList.add("hidden");
    }
  });

  // update order modal content if open
  const orderTotalEl = document.getElementById("order-total");
  if (orderTotalEl) orderTotalEl.innerText = money(totalAmount());

  // update order-items list
  renderOrderItems();
}

// render products
function renderProducts(list) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  list.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-product-id", p.id);

    // wrapper with badge
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";

    // lottie or image
    const lottieSrc = getLottieForProduct(p, idx);
    const player = document.createElement("lottie-player");
    player.setAttribute("src", lottieSrc);
    player.setAttribute("background", "transparent");
    player.setAttribute("speed", "1");
    player.setAttribute("loop", "");
    player.setAttribute("autoplay", "");
    player.className = "product-lottie";

    wrapper.appendChild(player);

    // qty bubble
    const bubble = document.createElement("div");
    bubble.className = "qty-bubble hidden";
    wrapper.appendChild(bubble);

    // name and price
    const name = document.createElement("div");
    name.className = "prod-name";
    name.innerText = p.name;
    const price = document.createElement("div");
    price.className = "prod-price";
    price.innerText = money(p.price_cents);

    // controls container
    const controls = document.createElement("div");
    controls.className = "mt-2 w-full flex items-center justify-center gap-2";

    // add button
    const addBtn = document.createElement("button");
    addBtn.className = "btn-add";
    addBtn.innerText = "ADD";
    addBtn.onclick = () => { addOne(p); };

    // qty wrap (hidden by default)
    const qtyWrap = document.createElement("div");
    qtyWrap.className = "qty-wrap hidden flex items-center gap-2";

    const decBtn = document.createElement("button");
    decBtn.className = "btn-dec";
    decBtn.innerText = "-";
    decBtn.onclick = () => { decOne(p); };

    const plusBtn = document.createElement("button");
    plusBtn.className = "btn-add";
    plusBtn.style.minWidth = "40px";
    plusBtn.innerText = "+";
    plusBtn.onclick = () => { addOne(p); };

    qtyWrap.appendChild(decBtn);
    qtyWrap.appendChild(plusBtn);

    controls.appendChild(addBtn);
    controls.appendChild(qtyWrap);

    card.appendChild(wrapper);
    card.appendChild(name);
    card.appendChild(price);
    card.appendChild(controls);

    container.appendChild(card);
  });

  updateUI();
}

function getLottieForProduct(p, idx) {
  // prefer explicit image_url if provided and looks like json/lottie
  if (p.image_url && (p.image_url.endsWith(".json") || p.image_url.includes("lottie") || p.image_url.endsWith(".lottie"))) {
    return p.image_url;
  }
  // else fallback rotating list
  return LOTTIE_FALLBACKS[idx % LOTTIE_FALLBACKS.length];
}

// ORDER modal
function renderOrderItems(){
  const el = document.getElementById("order-items");
  if (!el) return;
  el.innerHTML = "";

  if (!cart.length) {
    el.innerHTML = `<div class="py-6 text-center text-gray-400">Your cart is empty</div>`;
    return;
  }

  cart.forEach(i => {
    const row = document.createElement("div");
    row.className = "item-row";
    const thumb = document.createElement("div");
    thumb.style.width="46px"; thumb.style.height="46px";
    thumb.innerHTML = `<lottie-player src="${getLottieForProduct({image_url: null},0)}" background="transparent" speed="1" style="width:46px;height:46px;" loop autoplay></lottie-player>`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="name">${i.name} <span style="color:#ffd166;font-weight:800"> ${i.qty}x</span></div>
                      <div class="qty">${money(i.price_cents)} each</div>`;
    const price = document.createElement("div");
    price.innerText = money(i.qty * i.price_cents);
    row.appendChild(thumb);
    row.appendChild(meta);
    row.appendChild(price);
    el.appendChild(row);
  });
}

// fetch categories/products
async function fetchProductsFromApi() {
  try {
    const res = await fetch(`${API_BASE}/api/products?establishment_id=1`);
    if (!res.ok) throw new Error("fetch error");
    const json = await res.json();
    // ensure product objects have id, name, price_cents, image_url
    products = json.map(p => ({
      id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      image_url: p.image_url || null
    }));
    renderProducts(products);
  } catch (e) {
    // fallback: build demo products (if API unavailable)
    console.warn("API products failed, using demo list", e);
    products = demoProducts();
    renderProducts(products);
  }
}

function demoProducts(){
  return [
    { id: 1, name: "Burger", price_cents: 499, image_url: null },
    { id: 2, name: "Fries", price_cents: 149, image_url: null },
    { id: 3, name: "Hotdog", price_cents: 349, image_url: null },
    { id: 4, name: "Taco", price_cents: 399, image_url: null },
    { id: 5, name: "Pizza", price_cents: 799, image_url: null },
    { id: 6, name: "Donut", price_cents: 149, image_url: null },
    { id: 7, name: "Popcorn", price_cents: 199, image_url: null },
    { id: 8, name: "Coke", price_cents: 149, image_url: null },
    { id: 9, name: "Icecream", price_cents: 599, image_url: null },
  ];
}

// events
function initEvents() {
  document.getElementById("open-cart-btn").onclick = () => openOrder();
  document.getElementById("open-order").onclick = () => openOrder();
  document.getElementById("close-order").onclick = () => closeOrder();
  document.getElementById("pay-btn").onclick = () => {
    // simulate payment -> send to API /admin or /api/order
    alert("Payment simulated: " + money(totalAmount()));
    // optional: send order to server
    // after pay, clear cart
    cart = []; saveCart();
  };
}

// modal control
function openOrder() {
  document.getElementById("order-modal").classList.remove("hidden");
  document.getElementById("order-modal").classList.add("flex");
  renderOrderItems();
}
function closeOrder() {
  document.getElementById("order-modal").classList.add("hidden");
  document.getElementById("order-modal").classList.remove("flex");
}

// init telegram defaults
function initTelegram() {
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    // fill name
    const user = Telegram.WebApp.initDataUnsafe?.user;
    if (user && user.first_name) {
      // optional prefill in checkout later
    }
  }
}

// start
(async function start(){
  loadCart();
  initEvents();
  initTelegram();
  await fetchProductsFromApi();
  // keep UI updated periodically (sync per-card controls)
  setInterval(()=>{ /* sync if localStorage changed elsewhere */ updateUI(); }, 800);
})();
