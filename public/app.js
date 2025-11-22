// Configurações
const API_URL = '/api/products';
const API_ORDER = '/api/order';

let products = [];
let cart = {}; // Estrutura: { id_produto: quantidade }

// Elementos do DOM
const container = document.getElementById('products-container');
const viewOrderBtn = document.getElementById('view-order-btn');
const totalPriceSpan = document.getElementById('total-price');

// 1. Inicia a Aplicação
(async function init() {
    // Configura Telegram
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
    }

    // Carrega produtos do servidor
    await loadProducts();
    
    // Restaura carrinho se existir (opcional)
    loadCartFromStorage();
    
    // Renderiza
    renderProducts();
    updateMainButton();

    // Evento do botão View Order
    viewOrderBtn.addEventListener('click', checkout);
})();

// 2. Busca Produtos
async function loadProducts() {
    try {
        const res = await fetch(API_URL);
        products = await res.json();
    } catch (e) {
        console.error("Erro ao buscar produtos", e);
        alert("Erro ao carregar cardápio.");
    }
}

// 3. Renderiza na tela (ESTILO DURGER KING)
function renderProducts() {
    container.innerHTML = '';

    products.forEach(p => {
        const qty = cart[p.id] || 0;
        const priceFormatted = (p.price_cents / 100).toFixed(2);
        const isSelected = qty > 0 ? 'selected' : '';

        // Cria o Card
        const card = document.createElement('div');
        card.className = `cafe-item ${isSelected}`;
        card.dataset.id = p.id;

        card.innerHTML = `
            <div class="cafe-item-counter">${qty}</div>
            
            <div class="cafe-item-photo">
                <img src="${p.image_url}" class="cafe-item-img" alt="${p.name}">
            </div>
            
            <div class="cafe-item-label">
                <span class="cafe-item-title">${p.name}</span>
                <span class="cafe-item-price">${priceFormatted}</span>
            </div>
            
            <div class="cafe-item-buttons">
                <button class="cafe-item-decr-button"></button>
                <button class="cafe-item-incr-button">
                    <span class="button-item-label">ADD</span>
                </button>
            </div>
        `;

        // Eventos dos botões
        const btnAdd = card.querySelector('.cafe-item-incr-button');
        const btnDec = card.querySelector('.cafe-item-decr-button');

        btnAdd.onclick = () => updateQty(p, 1);
        btnDec.onclick = () => updateQty(p, -1);

        container.appendChild(card);
    });
}

// 4. Atualiza Quantidade
function updateQty(product, change) {
    if (!cart[product.id]) cart[product.id] = 0;
    cart[product.id] += change;

    if (cart[product.id] <= 0) {
        delete cart[product.id];
    }

    // Salva e Atualiza UI
    saveCartToStorage();
    updateCardVisual(product.id);
    updateMainButton();
}

// 5. Atualiza visual de UM card específico (para não recarregar tudo)
function updateCardVisual(id) {
    const card = document.querySelector(`.cafe-item[data-id="${id}"]`);
    if (!card) return;

    const qty = cart[id] || 0;
    const counter = card.querySelector('.cafe-item-counter');
    
    counter.innerText = qty;

    if (qty > 0) {
        card.classList.add('selected');
    } else {
        card.classList.remove('selected');
    }
}

// 6. Barra Inferior (Total)
function updateMainButton() {
    let totalCents = 0;
    let count = 0;

    for (const [id, qty] of Object.entries(cart)) {
        const p = products.find(x => x.id == id);
        if (p) {
            totalCents += p.price_cents * qty;
            count += qty;
        }
    }

    totalPriceSpan.innerText = `R$ ${(totalCents / 100).toFixed(2)}`;

    if (count > 0) {
        viewOrderBtn.classList.add('shown');
        // Se estiver no Telegram, usa o MainButton nativo também
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.MainButton.setText(`VER PEDIDO (R$ ${(totalCents / 100).toFixed(2)})`);
            window.Telegram.WebApp.MainButton.show();
            window.Telegram.WebApp.MainButton.onClick(checkout);
        }
    } else {
        viewOrderBtn.classList.remove('shown');
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.MainButton.hide();
        }
    }
}

// 7. Checkout (Envia Pedido)
async function checkout() {
    if (Object.keys(cart).length === 0) return;

    // Prepara dados para enviar ao servidor
    const items = Object.entries(cart).map(([id, qty]) => {
        return { product_id: id, qty: qty };
    });

    const payload = {
        establishment_id: 1,
        items: items,
        customer: { name: "Cliente Web", phone: "00000000" } // Aqui você pode abrir um modal para pedir dados
    };
    
    if (window.Telegram && window.Telegram.WebApp) {
        payload.telegram_user = window.Telegram.WebApp.initDataUnsafe?.user;
    }

    if(confirm("Deseja finalizar o pedido?")) {
         try {
            const res = await fetch(API_ORDER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();

            if (json.ok) {
                alert(`Pedido #${json.order_id} enviado com sucesso!`);
                cart = {};
                saveCartToStorage();
                renderProducts();
                updateMainButton();
                if (window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close();
            } else {
                alert("Erro: " + (json.error || "Desconhecido"));
            }
        } catch (e) {
            alert("Erro de conexão");
        }
    }
}

// --- Storage ---
function saveCartToStorage() {
    localStorage.setItem('cart_v3', JSON.stringify(cart));
}

function loadCartFromStorage() {
    try {
        const s = localStorage.getItem('cart_v3');
        if (s) cart = JSON.parse(s);
    } catch (e) { cart = {}; }
}