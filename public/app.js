// app.js — WebApp DurgerKing com Lottie FULL
// Autor: ChatGPT + Marcus
// Coloque este arquivo em: /var/www/fastfood-bot/public/app.js

// ========================================================
// CONFIG
// ========================================================
const API_BASE = ""; // usar domínio atual automaticamente

// Função de preço
function money(cents) {
  return `R$ ${(Number(cents) / 100).toFixed(2)}`;
}

// Carrinho local
let cart = [];

// Categorias e produtos
let categories = [];
let products = [];

// ========================================================
// LOTTIE HELPERS
// ========================================================

// Executa uma animação Lottie em um canvas
function playLottie(canvasId, src, autoplay = true, loop = true) {
  import("https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web/+esm")
    .then(({ DotLottie }) => {
      new DotLottie({
        canvas: document.getElementById(canvasId),
        src,
        autoplay,
        loop,
      });
    })
    .catch(err => console.error("Erro Lottie:", err));
}

// ========================================================
// INIT LOTTIE FIXAS (logo, hero, carrinho)
// ========================================================
function initStaticAnimations() {
  // Logo animada
  playLottie("logoAnim",
    "https://lottie.host/408a151f-48f0-4df0-8556-fc056688426a/l5zkfWFyyP.lottie"
  );

  // Hero animado
  playLottie("heroAnim",
    "https://lottie.host/10000936-bf65-4bc8-8884-bad1627fb3f6/My6uAaB6SB.lottie"
  );

  // Carrinho no header
  playLottie("cartAnim",
    "https://lottie.host/edeea4ca-2baa-46a6-8d20-c90b50debeca/sVxCqJYhsK.lottie"
  );

  // Carrinho flutuante
  playLottie("floatCartAnim",
    "https://lottie.host/8de49c0a-3d8a-43e3-8cec-56c060eb9cf2/CJLSuo87eC.lottie"
  );
}

// ========================================================
// FETCH API
// ========================================================
async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/categories`);
    categories = await res.json();
    renderCategories();
  } catch (e) {
    console.error("Erro ao buscar categorias:", e);
  }
}

async function fetchProducts(establishment_id = 1) {
  try {
    const res = await fetch(`${API_BASE}/api/products?establishment_id=${establishment_id}`);
    products = await res.json();
    renderProducts();
  } catch (e) {
    console.error("Erro ao buscar produtos:", e);
  }
}

// ========================================================
// RENDER CATEGORIES
// ========================================================
function renderCategories() {
  const nav = document.getElementById("categories");
  nav.innerHTML = "";

  // Botão "Todos"
  const btnAll = document.createElement("button");
  btnAll.className = "px-4 py-2 rounded-full bg-[#ffdede] text-[#d62828] font-semibold";
  btnAll.innerText = "Todos";
  btnAll.onclick = () => renderProducts();
  nav.appendChild(btnAll);

  categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "px-4 py-2 rounded-full bg-white border shadow-sm";
    btn.innerText = cat.name;
    btn.onclick = () => renderProducts(cat.id);
    nav.appendChild(btn);
  });
}

// ========================================================
// RENDER PRODUCTS (COM LOTTIE)
// ========================================================
function renderProducts(filterCategoryId = null) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  const list = filterCategoryId
    ? products.filter(p => p.category_id == filterCategoryId)
    : products;

  if (!list.length) {
    container.innerHTML = `<div class="col-span-3 text-center py-10 text-gray-500">
      Nenhum produto encontrado.
    </div>`;
    return;
  }

  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl shadow p-4 flex flex-col";

    // Canvas da animação
    const anim = document.createElement("canvas");
    anim.id = `prod-anim-${p.id}`;
    anim.width = 300;
    anim.height = 200;
    anim.className = "mb-3 rounded-md shadow-sm";
    card.appendChild(anim);

    // Se for .lottie, anima
    if (p.image_url && p.image_url.endsWith(".lottie")) {
      playLottie(`prod-anim-${p.id}`, p.image_url);
    } else {
      // fallback PNG
      const img = document.createElement("img");
      img.src = p.image_url || "/placeholder.png";
      img.className = "w-full h-48 object-cover rounded-md mb-3";
      card.replaceChild(img, anim);
    }

    // Título
    const title = document.createElement("h3");
    title.className = "font-bold text-lg";
    title.innerText = p.name;
    card.appendChild(title);

    // Descrição
    const desc = document.createElement("p");
    desc.className = "text-sm text-gray-600 flex-1";
    desc.innerText = p.description || "";
    card.appendChild(desc);

    // Rodapé card
    const bottom = document.createElement("div");
    bottom.className = "mt-3 flex items-center justify-between";

    const price = document.createElement("div");
    price.className = "font-bold text-xl text-[#d62828]";
    price.innerText = money(p.price_cents);
    bottom.appendChild(price);

    const add = document.createElement("button");
    add.className = "bg-[#ffd166] px-3 py-2 rounded-md font-semibold";
    add.innerText = "Adicionar";
    add.onclick = () => addToCart(p);
    bottom.appendChild(add);

    card.appendChild(bottom);
    container.appendChild(card);
  });
}

// ========================================================
// CARRINHO
// ========================================================
function saveCart() {
  localStorage.setItem("dk_cart", JSON.stringify(cart));
  updateCartUI();
}

function loadCart() {
  const c = localStorage.getItem("dk_cart");
  cart = c ? JSON.parse(c) : [];
  updateCartUI();
}

function updateCartUI() {
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = cart.reduce((sum, i) => sum + i.qty * i.price_cents, 0);

  document.getElementById("cart-count").innerText = totalQty;
  document.getElementById("floating-total").innerText = money(totalPrice);
  document.getElementById("subtotal").innerText = money(totalPrice);
  document.getElementById("checkout-total").innerText = money(totalPrice);

  renderCartItems();
}

function addToCart(p) {
  const item = cart.find(i => i.product_id == p.id);
  if (item) item.qty++;
  else
    cart.push({
      product_id: p.id,
      name: p.name,
      qty: 1,
      price_cents: p.price_cents,
    });
  saveCart();
  showToast("Adicionado ao carrinho!");
}

function changeQty(id, delta) {
  const item = cart.find(i => i.product_id == id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.product_id != id);
  saveCart();
}

function removeItem(id) {
  cart = cart.filter(i => i.product_id != id);
  saveCart();
}

function clearCart() {
  cart = [];
  saveCart();
  showToast("Carrinho limpo");
}

// ========================================================
// RENDER CARRINHO
// ========================================================
function renderCartItems() {
  const el = document.getElementById("cart-items");
  el.innerHTML = "";

  if (!cart.length) {
    el.innerHTML = `<div class="py-6 text-center text-gray-500">Seu carrinho está vazio.</div>`;
    return;
  }

  cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "py-3 flex items-center gap-3";

    row.innerHTML = `
      <div class="flex-1">
        <div class="font-medium">${item.name}</div>
        <div class="text-sm text-gray-600">${money(item.price_cents)} x ${item.qty}
         = <strong>${money(item.qty * item.price_cents)}</strong></div>
      </div>
      <div class="flex items-center gap-2">
        <button class="px-2 py-1 bg-gray-100 rounded">-</button>
        <button class="px-2 py-1 bg-gray-100 rounded">+</button>
        <button class="px-2 py-1 text-red-600"><i class="fa-solid fa-trash"></i></button>
      </div>`;

    const [minus, plus, del] = row.querySelectorAll("button");

    minus.onclick = () => changeQty(item.product_id, -1);
    plus.onclick = () => changeQty(item.product_id, 1);
    del.onclick = () => removeItem(item.product_id);

    el.appendChild(row);
  });
}

// ========================================================
// TOAST
// ========================================================
function showToast(msg, seconds = 2) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), seconds * 1000);
}

// ========================================================
// MODALS
// ========================================================
function openCartModal() {
  const m = document.getElementById("cart-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeCartModal() {
  const m = document.getElementById("cart-modal");
  m.classList.add("hidden");
  m.classList.remove("flex");
}

function openCheckout() {
  const m = document.getElementById("checkout-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeCheckout() {
  const m = document.getElementById("checkout-modal");
  m.classList.add("hidden");
  m.classList.remove("flex");
}

// ========================================================
// SUBMIT ORDER
// ========================================================
async function submitOrder(formData) {
  if (!cart.length) {
    showToast("Carrinho vazio");
    return;
  }

  const payload = {
    establishment_id: 1,
    items: cart.map(i => ({
      product_id: i.product_id,
      name: i.name,
      qty: i.qty,
      price_cents: i.price_cents,
    })),
    customer: {
      name: formData.get("name"),
      phone: formData.get("phone"),
      address: formData.get("address"),
    },
  };

  try {
    const res = await fetch(`${API_BASE}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await res.json();

    if (j.ok) {
      clearCart();
      closeCheckout();
      closeCartModal();
      showToast("Pedido enviado! #" + j.order_id, 4);
    } else {
      showToast("Erro ao enviar pedido");
    }
  } catch (err) {
    console.error(err);
    showToast("Erro de rede ao enviar pedido");
  }
}

// ========================================================
// INIT EVENTS
// ========================================================
function initEvents() {
  document.getElementById("open-cart-btn").onclick = openCartModal;
  document.getElementById("floating-cart").onclick = openCartModal;

  document.getElementById("close-cart").onclick = closeCartModal;
  document.getElementById("clear-cart").onclick = clearCart;

  document.getElementById("checkout-btn").onclick = () => {
    closeCartModal();
    openCheckout();
  };

  document.getElementById("close-checkout").onclick = closeCheckout;

  document.getElementById("checkout-form").onsubmit = ev => {
    ev.preventDefault();
    submitOrder(new FormData(ev.target));
  };
}

// ========================================================
// INIT TELEGRAM
// ========================================================
function initTelegram() {
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();

    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) {
      const inputName = document.querySelector("#checkout-form [name=name]");
      if (inputName && !inputName.value) inputName.value = user.first_name;
    }
  }
}

// ========================================================
// START
// ========================================================
(async function start() {
  initStaticAnimations();
  initEvents();
  loadCart();

  await fetchCategories();
  await fetchProducts();

  initTelegram();
})();
