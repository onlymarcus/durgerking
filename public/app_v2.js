// app_v2.js — Com Modal de Detalhes

const API_BASE = '/api';
const urlParams = new URLSearchParams(window.location.search);
const CURRENT_ESTABLISHMENT_ID = urlParams.get('loja') || 1;

let products = [];
let cart = {}; 
let appState = 'shop'; 

const shopPage = document.getElementById('shop-page');
const checkoutPage = document.getElementById('checkout-page');
const mainBtn = document.getElementById('main-btn');
const orderListEl = document.getElementById('order-list');
const editBtn = document.getElementById('btn-edit');
const inputName = document.getElementById('customer-name');
const inputPhone = document.getElementById('customer-phone');
const inputAddress = document.getElementById('customer-address');
const inputComment = document.getElementById('comment-field');

// Elementos do Modal
const modalOverlay = document.getElementById('product-modal-overlay');
const modalImg = document.getElementById('modal-img');
const modalTitle = document.getElementById('modal-title');
const modalPrice = document.getElementById('modal-price');
const modalDesc = document.getElementById('modal-desc');
const modalAddBtn = document.getElementById('modal-add-btn');

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

    mainBtn.addEventListener('click', handleMainButtonClick);
    editBtn.addEventListener('click', () => switchView('shop'));
})();

async function loadProducts() {
    try {
        const res = await fetch(`${API_BASE}/products?establishment_id=${CURRENT_ESTABLISHMENT_ID}`);
        products = await res.json();
    } catch (e) { console.error("Erro api:", e); }
}

// --- RENDERIZAÇÃO DA LOJA (COM CLIQUE NA FOTO) ---
function renderShop() {
    shopPage.innerHTML = '';
    
    if(products.length === 0) {
        shopPage.innerHTML = '<div style="width:100%;text-align:center;padding:20px;">Cardápio carregando ou vazio...</div>';
        return;
    }
    
    products.forEach(p => {
        const qty = cart[p.id] || 0;
        const isSelected = qty > 0 ? 'selected' : '';
        const priceFormatted = (p.price_cents / 100).toFixed(2);
        
        const card = document.createElement('div');
        card.className = `cafe-item ${isSelected}`;
        card.dataset.id = p.id;
        
        card.innerHTML = `
            <div class="cafe-item-counter">${qty}</div>
            <div class="cafe-item-photo" style="cursor:pointer">
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

        // Eventos
        const btnAdd = card.querySelector('.cafe-item-incr-button');
        const btnDec = card.querySelector('.cafe-item-decr-button');
        const photo = card.querySelector('.cafe-item-photo');

        btnAdd.addEventListener('click', (e) => { e.stopPropagation(); updateQty(p.id, 1); });
        btnDec.addEventListener('click', (e) => { e.stopPropagation(); updateQty(p.id, -1); });
        
        // CLIQUE NA FOTO ABRE O MODAL
        photo.addEventListener('click', () => openProductModal(p));

        shopPage.appendChild(card);
    });
}

// --- LÓGICA DO MODAL ---
function openProductModal(p) {
    modalImg.src = p.image_url;
    modalTitle.innerText = p.name;
    modalPrice.innerText = `R$ ${(p.price_cents / 100).toFixed(2)}`;
    
    // Se não tiver descrição, coloca um texto padrão
    modalDesc.innerText = p.description || "Ingredientes selecionados com a melhor qualidade para você.";

    // Configura o botão do modal para adicionar este produto
    modalAddBtn.onclick = () => {
        updateQty(p.id, 1);
        closeProductModal(); // Fecha ao adicionar (opcional)
    };

    modalOverlay.classList.add('open');
}

window.closeProductModal = function() {
    modalOverlay.classList.remove('open');
}

// Fecha modal se clicar fora
modalOverlay.addEventListener('click', (e) => {
    if(e.target === modalOverlay) closeProductModal();
});


function renderCheckoutList() {
    orderListEl.innerHTML = '';
    Object.entries(cart).forEach(([id, qty]) => {
        const p = products.find(x => x.id == id);
        if(!p) return;
        const totalItem = (p.price_cents * qty) / 100;

        const row = document.createElement('div');
        row.className = 'cafe-order-item';
        row.innerHTML = `
            <div class="cafe-order-item-photo"><img src="${p.image_url}"></div>
            <div class="cafe-order-item-label">
                <div class="cafe-order-item-title">${p.name} <span class="cafe-order-item-counter">${qty}x</span></div>
                <div class="cafe-order-item-description">R$ ${(p.price_cents/100).toFixed(2)} un</div>
            </div>
            <div class="cafe-order-item-price">R$ ${totalItem.toFixed(2)}</div>
        `;
        orderListEl.appendChild(row);
    });
}

function updateQty(id, delta) {
    if (!cart[id]) cart[id] = 0;
    cart[id] += delta;
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    
    // Atualiza visual
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
    window.scrollTo(0,0);
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
    const totalFormatted = `R$ ${(totalCents/100).toFixed(2)}`;

    if (totalCents === 0) {
        mainBtn.classList.remove('shown');
        if(window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hide();
        return;
    }

    const isTelegram = window.Telegram?.WebApp?.initData !== "";
    if (isTelegram) {
        mainBtn.classList.remove('shown');
        window.Telegram.WebApp.MainButton.setText(
            appState === 'shop' ? `VER PEDIDO (${totalFormatted})` : `PAGAR ${totalFormatted}`
        );
        window.Telegram.WebApp.MainButton.show();
        window.Telegram.WebApp.MainButton.offClick(handleMainButtonClick);
        window.Telegram.WebApp.MainButton.onClick(handleMainButtonClick);
    } else {
        mainBtn.classList.add('shown');
        mainBtn.innerText = appState === 'shop' ? `VER PEDIDO (${totalFormatted})` : `PAGAR ${totalFormatted}`;
    }
}

function handleMainButtonClick() {
    if (appState === 'shop') switchView('checkout');
    else submitOrder();
}

async function submitOrder() {
    if (!inputName.value || !inputPhone.value) { alert("Preencha Nome e Telefone."); return; }
    saveUserData();

    const payload = {
        establishment_id: CURRENT_ESTABLISHMENT_ID,
        items: Object.entries(cart).map(([id, qty]) => ({ product_id: id, qty })),
        customer: {
            name: inputName.value,
            phone: inputPhone.value,
            address: inputAddress.value,
            note: inputComment.value
        }
    };

    if (window.Telegram?.WebApp) payload.telegram_user = window.Telegram.WebApp.initDataUnsafe?.user;

    const originalText = mainBtn.innerText;
    mainBtn.innerText = "ENVIANDO...";
    
    try {
        const r = await fetch(`${API_BASE}/order`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await r.json();
        if(data.ok) {
            cart = {}; saveCart();
            if(window.Telegram?.WebApp) window.Telegram.WebApp.close();
            else { alert("Pedido Enviado!"); window.location.reload(); }
        } else {
            alert("Erro: " + (data.error || "Desconhecido"));
            mainBtn.innerText = originalText;
        }
    } catch(e) {
        alert("Erro de conexão.");
        mainBtn.innerText = originalText;
    }
}

function saveCart() { localStorage.setItem(`cart_shop_${CURRENT_ESTABLISHMENT_ID}`, JSON.stringify(cart)); }
function loadCart() { try { cart = JSON.parse(localStorage.getItem(`cart_shop_${CURRENT_ESTABLISHMENT_ID}`) || '{}'); } catch(e){} }
function loadUserData() {
    const data = JSON.parse(localStorage.getItem('user_data') || '{}');
    if(data.name) inputName.value = data.name;
    if(data.phone) inputPhone.value = data.phone;
    if(data.address) inputAddress.value = data.address;
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name && !inputName.value) {
        inputName.value = window.Telegram.WebApp.initDataUnsafe.user.first_name;
    }
}
function saveUserData() {
    localStorage.setItem('user_data', JSON.stringify({ name: inputName.value, phone: inputPhone.value, address: inputAddress.value }));
}
// Expondo funções para o HTML
window.closeProductModal = closeProductModal;