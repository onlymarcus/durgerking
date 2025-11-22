// Configurações e Estado
const API_PRODUCTS = '/api/products';
const API_ORDER = '/api/order';

let products = [];
let cart = {}; // { id: quantidade }
let appState = 'shop'; // 'shop' ou 'checkout'

// Elementos do DOM
const shopPage = document.getElementById('shop-page');
const checkoutPage = document.getElementById('checkout-page');
const mainBtn = document.getElementById('main-btn');
const orderListEl = document.getElementById('order-list');
const editBtn = document.getElementById('btn-edit');

// Inputs
const inputName = document.getElementById('customer-name');
const inputPhone = document.getElementById('customer-phone');
const inputAddress = document.getElementById('customer-address');
const inputComment = document.getElementById('comment-field');

// --- INICIALIZAÇÃO ---
(async function init() {
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
    }

    loadUserData();
    await loadProducts();
    loadCart();

    renderShop();
    updateMainButton();

    // Eventos Globais
    mainBtn.addEventListener('click', handleMainButtonClick);
    editBtn.addEventListener('click', () => switchView('shop'));
})();

// --- DADOS ---
async function loadProducts() {
    try {
        const res = await fetch(API_PRODUCTS);
        products = await res.json();
    } catch (e) {
        console.error("Erro api:", e);
    }
}

// --- RENDERIZAÇÃO ---
function renderShop() {
    shopPage.innerHTML = '';

    products.forEach(p => {
        const qty = cart[p.id] || 0;
        const isSelected = qty > 0 ? 'selected' : '';
        const priceFormatted = (p.price_cents / 100).toFixed(2);

        const card = document.createElement('div');
        card.className = `cafe-item ${isSelected}`;
        card.dataset.id = p.id;

        card.innerHTML = `
            <div class="cafe-item-counter">${qty}</div>
            <div class="cafe-item-photo">
                <img src="${p.image_url}" class="cafe-item-img">
            </div>
            <div class="cafe-item-label">
                <span class="cafe-item-title">${p.name}</span>
                <span class="cafe-item-price">R$ ${priceFormatted}</span>
            </div>
            <div class="cafe-item-buttons">
                <button class="cafe-item-decr-button"></button>
                <button class="cafe-item-incr-button">
                    <span class="button-item-label">ADD</span>
                </button>
            </div>
        `;

        const btnAdd = card.querySelector('.cafe-item-incr-button');
        const btnDec = card.querySelector('.cafe-item-decr-button');

        btnAdd.addEventListener('click', () => updateQty(p.id, 1));
        btnDec.addEventListener('click', () => updateQty(p.id, -1));

        shopPage.appendChild(card);
    });
}

function renderCheckoutList() {
    orderListEl.innerHTML = '';

    Object.entries(cart).forEach(([id, qty]) => {
        const p = products.find(x => x.id == id);
        if (!p) return;

        const totalItem = (p.price_cents * qty) / 100;

        const row = document.createElement('div');
        row.className = 'cafe-order-item';
        row.innerHTML = `
            <div class="cafe-order-item-photo"><img src="${p.image_url}"></div>
            <div class="cafe-order-item-label">
                <div class="cafe-order-item-title">${p.name} <span class="cafe-order-item-counter">${qty}x</span></div>
                <div class="cafe-order-item-description">R$ ${(p.price_cents / 100).toFixed(2)} cada</div>
            </div>
            <div class="cafe-order-item-price">R$ ${totalItem.toFixed(2)}</div>
        `;
        orderListEl.appendChild(row);
    });
}

// --- LÓGICA ---
function updateQty(id, delta) {
    if (!cart[id]) cart[id] = 0;
    cart[id] += delta;
    if (cart[id] <= 0) delete cart[id];

    saveCart();

    // Atualiza APENAS o card que mudou
    const card = document.querySelector(`.cafe-item[data-id="${id}"]`);
    if (card) {
        const qty = cart[id] || 0;
        const counter = card.querySelector('.cafe-item-counter');
        counter.innerText = qty;

        if (qty > 0) card.classList.add('selected');
        else card.classList.remove('selected');
    }

    updateMainButton();
}

function switchView(view) {
    appState = view;
    window.scrollTo(0, 0);

    if (view === 'shop') {
        shopPage.style.display = 'flex';
        checkoutPage.style.display = 'none';
        updateMainButton();
    } else {
        shopPage.style.display = 'none';
        checkoutPage.style.display = 'block';
        renderCheckoutList();
        updateMainButton();
    }
}

function updateMainButton() {
    const totalCents = Object.entries(cart).reduce((acc, [id, qty]) => {
        const p = products.find(x => x.id == id);
        return acc + (p ? p.price_cents * qty : 0);
    }, 0);

    const totalFormatted = `R$ ${(totalCents / 100).toFixed(2)}`;

    if (totalCents === 0) {
        mainBtn.classList.remove('shown');
        if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hide();
        return;
    }

    mainBtn.classList.add('shown');

    if (appState === 'shop') {
        mainBtn.innerText = `VER PEDIDO (${totalFormatted})`;
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.MainButton.setText(`VER PEDIDO (${totalFormatted})`);
            window.Telegram.WebApp.MainButton.show();
            window.Telegram.WebApp.MainButton.onClick(handleMainButtonClick);
        }
    } else {
        mainBtn.innerText = `PAGAR ${totalFormatted}`;
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.MainButton.setText(`PAGAR ${totalFormatted}`);
        }
    }
}

function handleMainButtonClick() {
    if (appState === 'shop') {
        switchView('checkout');
    } else {
        submitOrder();
    }
}

async function submitOrder() {
    if (!inputName.value || !inputPhone.value) {
        alert("Por favor, preencha Nome e Telefone.");
        return;
    }

    saveUserData();

    const payload = {
        establishment_id: 1,
        items: Object.entries(cart).map(([id, qty]) => ({
            product_id: id,
            qty
        })),
        customer: {
            name: inputName.value,
            phone: inputPhone.value,
            address: inputAddress.value,
            note: inputComment.value
        }
    };

    if (window.Telegram?.WebApp) {
        payload.telegram_user = window.Telegram.WebApp.initDataUnsafe?.user;
    }

    const originalText = mainBtn.innerText;
    mainBtn.innerText = "ENVIANDO...";

    try {
        const r = await fetch(API_ORDER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await r.json();

        if (data.ok) {
            cart = {};
            saveCart();
            if (window.Telegram?.WebApp) window.Telegram.WebApp.close();
            else {
                alert("Pedido Enviado com Sucesso!");
                window.location.reload();
            }
        } else {
            alert("Erro: " + (data.error || "Desconhecido"));
            mainBtn.innerText = originalText;
        }
    } catch (e) {
        alert("Erro de conexão. Tente novamente.");
        mainBtn.innerText = originalText;
    }
}

// --- Storage Helpers ---
function saveCart() {
    localStorage.setItem('cart_v3', JSON.stringify(cart));
}

function loadCart() {
    try {
        cart = JSON.parse(localStorage.getItem('cart_v3') || '{}');
    } catch (e) {}
}

function loadUserData() {
    const data = JSON.parse(localStorage.getItem('user_data') || '{}');
    if (data.name) inputName.value = data.name;
    if (data.phone) inputPhone.value = data.phone;
    if (data.address) inputAddress.value = data.address;

    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name && !inputName.value) {
        inputName.value = window.Telegram.WebApp.initDataUnsafe.user.first_name;
    }
}

function saveUserData() {
    localStorage.setItem('user_data', JSON.stringify({
        name: inputName.value,
        phone: inputPhone.value,
        address: inputAddress.value
    }));
}