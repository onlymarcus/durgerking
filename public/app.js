// Configurações e Estado
const API_PRODUCTS = '/api/products';
const API_ORDER = '/api/order';

let products = [];
let cart = {}; // { id: quantidade }
let appState = 'shop'; // 'shop' ou 'checkout'

// Elementos
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

    // Carrega dados salvos do usuário (Nome/Tel/Endereço)
    loadUserData();

    await loadProducts();
    loadCart();
    
    renderShop();
    updateMainButton();

    // Eventos
    mainBtn.addEventListener('click', handleMainButtonClick);
    editBtn.addEventListener('click', () => switchView('shop'));
})();

// --- FUNÇÕES DE DADOS ---
async function loadProducts() {
    try {
        const res = await fetch(API_PRODUCTS);
        products = await res.json();
    } catch (e) { console.error(e); }
}

function loadUserData() {
    const data = JSON.parse(localStorage.getItem('user_data') || '{}');
    if(data.name) inputName.value = data.name;
    if(data.phone) inputPhone.value = data.phone;
    if(data.address) inputAddress.value = data.address;

    // Se tiver Telegram, tenta pegar o primeiro nome
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name && !inputName.value) {
        inputName.value = window.Telegram.WebApp.initDataUnsafe.user.first_name;
    }
}

function saveUserData() {
    const data = {
        name: inputName.value,
        phone: inputPhone.value,
        address: inputAddress.value
    };
    localStorage.setItem('user_data', JSON.stringify(data));
}

// --- RENDERIZAÇÃO ---
function renderShop() {
    shopPage.innerHTML = '';
    products.forEach(p => {
        const qty = cart[p.id] || 0;
        const isSelected = qty > 0 ? 'selected' : '';
        
        const card = document.createElement('div');
        card.className = `cafe-item ${isSelected}`;
        card.dataset.id = p.id;
        card.innerHTML = `
            <div class="cafe-item-counter">${qty}</div>
            <div class="cafe-item-photo"><img src="${p.image_url}" class="cafe-item-img"></div>
            <div class="cafe-item-label">
                <span class="cafe-item-title">${p.name}</span>
                <span class="cafe-item-price">R$ ${(p.price_cents/100).toFixed(2)}</span>
            </div>
            <div class="cafe-item-buttons">
                <button class="cafe-item-decr-button" onclick="updateQty(${p.id}, -1)"></button>
                <button class="cafe-item-incr-button" onclick="updateQty(${p.id}, 1)">
                    <span class="button-item-label">ADD</span>
                </button>
            </div>
        `;
        shopPage.appendChild(card);
    });
}

function renderCheckoutList() {
    orderListEl.innerHTML = '';
    let total = 0;

    Object.entries(cart).forEach(([id, qty]) => {
        const p = products.find(x => x.id == id);
        if(!p) return;

        const itemTotal = (p.price_cents * qty) / 100;
        total += itemTotal;

        const row = document.createElement('div');
        row.className = 'cafe-order-item';
        row.innerHTML = `
            <div class="cafe-order-item-photo"><img src="${p.image_url}"></div>
            <div class="cafe-order-item-label">
                <div class="cafe-order-item-title">${p.name} <span class="cafe-order-item-counter">${qty}x</span></div>
                <div class="cafe-order-item-description">Opções padrão</div>
            </div>
            <div class="cafe-order-item-price">R$ ${itemTotal.toFixed(2)}</div>
        `;
        orderListEl.appendChild(row);
    });
}

// --- LÓGICA PRINCIPAL ---
window.updateQty = function(id, delta) {
    if(!cart[id]) cart[id] = 0;
    cart[id] += delta;
    if(cart[id] <= 0) delete cart[id];

    saveCart();
    
    // Atualiza visualmente apenas o card afetado (otimização)
    const card = document.querySelector(`.cafe-item[data-id="${id}"]`);
    if(card) {
        const qty = cart[id] || 0;
        card.querySelector('.cafe-item-counter').innerText = qty;
        if(qty > 0) card.classList.add('selected');
        else card.classList.remove('selected');
    }
    
    updateMainButton();
}

function switchView(view) {
    appState = view;
    window.scrollTo(0,0);

    if (view === 'shop') {
        shopPage.style.display = 'flex';
        checkoutPage.style.display = 'none';
    } else {
        shopPage.style.display = 'none';
        checkoutPage.style.display = 'block';
        renderCheckoutList();
    }
    updateMainButton();
}

function updateMainButton() {
    const totalCents = Object.entries(cart).reduce((acc, [id, qty]) => {
        const p = products.find(x => x.id == id);
        return acc + (p ? p.price_cents * qty : 0);
    }, 0);

    const totalFormatted = `R$ ${(totalCents/100).toFixed(2)}`;

    if (totalCents === 0) {
        mainBtn.classList.remove('shown');
        if(window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hide();
        return;
    }

    mainBtn.classList.add('shown');
    
    if (appState === 'shop') {
        mainBtn.innerText = `VER PEDIDO (${totalFormatted})`;
        // Telegram Nativo
        if(window.Telegram?.WebApp) {
            window.Telegram.WebApp.MainButton.setText(`VER PEDIDO (${totalFormatted})`);
            window.Telegram.WebApp.MainButton.show();
            window.Telegram.WebApp.MainButton.onClick(handleMainButtonClick);
        }
    } else {
        mainBtn.innerText = `PAGAR ${totalFormatted}`;
        if(window.Telegram?.WebApp) {
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
    // Validação Simples
    if (!inputName.value || !inputPhone.value) {
        alert("Por favor, preencha seu nome e telefone.");
        return;
    }

    // Salva dados para a próxima
    saveUserData();

    const payload = {
        establishment_id: 1,
        items: Object.entries(cart).map(([id, qty]) => ({ product_id: id, qty })),
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

    mainBtn.innerText = "ENVIANDO...";
    
    try {
        const r = await fetch(API_ORDER, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await r.json();

        if(data.ok) {
            cart = {}; saveCart();
            // Fecha o WebApp
            if(window.Telegram?.WebApp) window.Telegram.WebApp.close();
            else {
                alert("Pedido Enviado!");
                window.location.reload();
            }
        } else {
            alert("Erro: " + data.error);
        }
    } catch(e) {
        alert("Erro de conexão");
    } finally {
        updateMainButton();
    }
}

// Helpers Storage
function saveCart() { localStorage.setItem('cart_v3', JSON.stringify(cart)); }
function loadCart() { try { cart = JSON.parse(localStorage.getItem('cart_v3') || '{}'); } catch(e){} }

// Expor funcões globais para o HTML
window.updateQty = updateQty;