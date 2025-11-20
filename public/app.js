// app.js — DurgerKing style — FULL CHECKOUT (B)
// Substituir /public/app.js pelo conteúdo abaixo

const API_BASE = ""; // use same origin

/* ---------------- helpers ---------------- */
function money(cents) {
  if (typeof cents === "number") return `$${(cents/100).toFixed(2)}`;
  if (typeof cents === "string" && cents.includes(".")) return `$${Number(cents).toFixed(2)}`;
  return `$${(Number(cents)/100).toFixed(2)}`;
}

let products = [];
let cart = [];

/* ---------- storage ---------- */
function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem("dk_cart_v2") || "[]");
  } catch(e) { cart = []; }
}
function saveCart() {
  localStorage.setItem("dk_cart_v2", JSON.stringify(cart));
  updateUI();
}
function totalQty() { return cart.reduce((s,i) => s + i.qty, 0); }
function totalAmount() { return cart.reduce((s,i) => s + i.qty * i.price_cents, 0); }

/* ---------- cart ops ---------- */
function findItem(pid){ return cart.find(x => x.product_id == pid); }
function addOne(product){
  const it = findItem(product.id);
  if (it) it.qty++;
  else cart.push({ product_id: product.id, name: product.name, price_cents: product.price_cents, qty: 1, image_url: product.image_url || null });
  saveCart();
}
function decOne(product){
  const it = findItem(product.id);
  if (!it) return;
  it.qty--;
  if (it.qty <= 0) cart = cart.filter(x => x.product_id != product.id);
  saveCart();
}
function setQty(productId, qty){
  const it = cart.find(x => x.product_id == productId);
  if (it) it.qty = qty;
  else {
    const p = products.find(x => x.id == productId);
    if (p) cart.push({ product_id: productId, name: p.name, price_cents: p.price_cents, qty, image_url: p.image_url||null });
  }
  cart = cart.filter(x => x.qty > 0);
  saveCart();
}

/* ---------- UI ---------- */
function updateUI(){
  // badge
  const badge = document.getElementById("top-badge");
  const qty = totalQty();
  if (!badge) return;
  if (qty > 0) { badge.innerText = qty; badge.classList.remove("hidden"); }
  else badge.classList.add("hidden");

  // view-order bar
  const viewBar = document.getElementById("view-order-bar");
  if (qty > 0) viewBar.classList.remove("hidden"); else viewBar.classList.add("hidden");

  // update submit amount
  const submitAmount = document.getElementById("submit-amount");
  if (submitAmount) submitAmount.innerText = money(totalAmount());

  // per-card controls
  document.querySelectorAll("[data-product-id]").forEach(el => {
    const pid = Number(el.getAttribute("data-product-id"));
    const q = (cart.find(i => i.product_id == pid) || {qty:0}).qty;
    const addBtn = el.querySelector(".btn-add");
    const qtyWrap = el.querySelector(".qty-wrap");
    const bubble = el.querySelector(".qty-bubble");
    if (q > 0) {
      addBtn?.classList.add("hidden");
      qtyWrap?.classList.remove("hidden");
      if (bubble) { bubble.innerText = q; bubble.classList.remove("hidden"); }
    } else {
      addBtn?.classList.remove("hidden");
      qtyWrap?.classList.add("hidden");
      if (bubble) bubble.classList.add("hidden");
    }
  });
}

/* ---------- render products (grid) ---------- */
function renderProducts(list) {
  const container = document.getElementById("products");
  container.innerHTML = "";
  list.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-product-id", p.id);

    // wrapper
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";

    // lottie player
    const src = getLottieForProduct(p, idx);
    const player = document.createElement("lottie-player");
    player.setAttribute("src", src);
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

    const name = document.createElement("div");
    name.className = "prod-name mt-1";
    name.innerText = p.name;

    const price = document.createElement("div");
    price.className = "prod-price";
    price.innerText = money(p.price_cents);

    // controls
    const controls = document.createElement("div");
    controls.className = "mt-2 w-full flex items-center justify-center gap-2";

    const addBtn = document.createElement("button");
    addBtn.className = "btn-add";
    addBtn.innerText = "ADD";
    addBtn.onclick = () => addOne(p);

    const qtyWrap = document.createElement("div");
    qtyWrap.className = "qty-wrap hidden flex items-center gap-2";

    const decBtn = document.createElement("button");
    decBtn.className = "btn-dec";
    decBtn.innerText = "-";
    decBtn.onclick = () => decOne(p);

    const plusBtn = document.createElement("button");
    plusBtn.className = "btn-add";
    plusBtn.style.minWidth = "40px";
    plusBtn.innerText = "+";
    plusBtn.onclick = () => addOne(p);

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

/* ---------- lottie selection ---------- */
const LOTTIE_FALLBACKS = [
  "https://assets10.lottiefiles.com/packages/lf20_x62chJ.json",
  "https://assets3.lottiefiles.com/packages/lf20_jzqkng7v.json",
  "https://assets10.lottiefiles.com/packages/lf20_p8bfn5to.json",
  "https://assets1.lottiefiles.com/packages/lf20_e3tfju2v.json",
  "https://assets2.lottiefiles.com/packages/lf20_tfb3estd.json",
  "https://assets2.lottiefiles.com/packages/lf20_0yfsb3a1.json",
];

function getLottieForProduct(p, idx) {
  if (p.image_url && (p.image_url.endsWith(".json") || p.image_url.includes("lottie") || p.image_url.endsWith(".lottie"))) return p.image_url;
  return LOTTIE_FALLBACKS[idx % LOTTIE_FALLBACKS.length];
}

/* ---------- ORDER modal rendering ---------- */
function renderCheckoutModal() {
  const itemsEl = document.getElementById("checkout-items");
  itemsEl.innerHTML = "";
  if (!cart.length) {
    itemsEl.innerHTML = `<div class="py-6 text-center text-neutral-500">Seu carrinho está vazio.</div>`;
    return;
  }

  cart.forEach(i => {
    const row = document.createElement("div");
    row.className = "row";

    const thumb = document.createElement("div");
    thumb.style.width = "46px"; thumb.style.height = "46px";
    thumb.innerHTML = `<lottie-player src="${getLottieForProduct({image_url: i.image_url}, 0)}" background="transparent" speed="1" style="width:46px;height:46px;" loop autoplay></lottie-player>`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="name">${i.name} <span style="color:#ffd166;font-weight:800"> ${i.qty}x</span></div>
                      <div class="sub">${money(i.price_cents)} each</div>`;

    const price = document.createElement("div");
    price.innerText = money(i.qty * i.price_cents);

    row.appendChild(thumb);
    row.appendChild(meta);
    row.appendChild(price);
    itemsEl.appendChild(row);
  });

  // update totals
  const totalEl = document.getElementById("checkout-total");
  if (totalEl) totalEl.innerText = money(totalAmount());
}

/* ---------- FETCH API ---------- */
async function fetchProductsFromApi() {
  try {
    const res = await fetch(`${API_BASE}/api/products?establishment_id=1`);
    const json = await res.json();
    products = json.map(p => ({ id: p.id, name: p.name, price_cents: p.price_cents, image_url: p.image_url || null }));
    renderProducts(products);
  } catch (e) {
    console.warn("API fetch products failed, using demo", e);
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

/* ---------- EVENTS & CHECKOUT ---------- */
function initEvents(){
  document.getElementById("open-cart-btn").onclick = () => openOrder();
  document.getElementById("open-order").onclick = () => openOrder();
  document.getElementById("close-order").onclick = () => closeOrder();

  document.getElementById("pay-btn")?.addEventListener("click", () => {
    // legacy pay in old modal (not used)
  });

  document.getElementById("submit-order").onclick = async () => {
    await submitOrderFromCheckout();
  };
}

function openOrder(){
  renderCheckoutModal();
  document.getElementById("order-modal").classList.remove("hidden");
  document.getElementById("order-modal").classList.add("flex");
}
function closeOrder(){
  document.getElementById("order-modal").classList.add("hidden");
  document.getElementById("order-modal").classList.remove("flex");
}

/* ---------- TELEGRAM PRE-FILL ---------- */
function fillTelegramUserInfo() {
  if (!(window.Telegram && window.Telegram.WebApp)) return;
  const user = Telegram.WebApp.initDataUnsafe?.user;
  if (!user) return;
  const nameEl = document.getElementById("field-name");
  const phoneEl = document.getElementById("field-phone");
  if (user.first_name && !nameEl.value) nameEl.value = user.first_name + (user.last_name ? (" " + user.last_name) : "");
  // phone isn't provided by Telegram WebApp by default, but if legacy init data contains phone_number, prefill:
  if (Telegram.WebApp.initDataUnsafe?.user?.phone_number && !phoneEl.value) phoneEl.value = Telegram.WebApp.initDataUnsafe.user.phone_number;
}

/* ---------- SUBMIT ORDER (main) ---------- */
async function submitOrderFromCheckout(){
  // validation
  const name = document.getElementById("field-name").value.trim();
  const phone = document.getElementById("field-phone").value.trim();
  const address = document.getElementById("field-address").value.trim();
  const note = document.getElementById("field-note").value.trim();

  if (!name) { alert("Por favor preencha o nome"); return; }
  if (!phone) { alert("Por favor preencha o telefone"); return; }
  if (!cart.length) { alert("Carrinho vazio"); return; }

  // prepare payload
  const payload = {
    establishment_id: 1,
    items: cart.map(i => ({ product_id: i.product_id, name: i.name, qty: i.qty, price_cents: i.price_cents })),
    customer: { name, phone, address, note },
  };

  // add telegram user if possible
  if (window.Telegram && window.Telegram.WebApp) {
    payload.telegram_user = Telegram.WebApp.initDataUnsafe?.user || null;
  }

  // UI: disable button & show loading
  const btn = document.getElementById("submit-order");
  btn.disabled = true;
  const oldText = btn.innerHTML;
  btn.innerHTML = "Enviando...";

  try {
    const res = await fetch(`${API_BASE}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const j = await res.json();
    if (j && j.ok) {
      // success
      alert("Pedido enviado! #" + j.order_id);
      // clear cart
      cart = []; saveCart();
      closeOrder();
      // optionally: notify Telegram WebApp to close or show result
      if (window.Telegram && window.Telegram.WebApp) {
        Telegram.WebApp.close();
      }
    } else {
      console.error("order error", j);
      alert("Erro ao enviar pedido: " + (j.error || "server_error"));
    }
  } catch (err) {
    console.error("network error", err);
    alert("Erro de rede ao enviar pedido");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

/* ---------- INIT ---------- */
(async function start(){
  loadCart();
  initEvents();
  // render initial UI quickly
  await fetchProductsFromApi();
  fillTelegramUserInfo();
  updateUI();
  // keep UI updated periodically
  setInterval(()=> updateUI(), 800);
})();
