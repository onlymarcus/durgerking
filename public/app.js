// app.js — DurgerKing style (adaptado para QueroComida)

const API_BASE = "";

// Helpers
function money(cents) {
  if (typeof cents === "number") return `R$ ${(cents/100).toFixed(2)}`;
  if (typeof cents === "string" && cents.includes(".")) return `R$ ${Number(cents).toFixed(2)}`;
  return `R$ ${(Number(cents)/100).toFixed(2)}`;
}

let products = [];
let cart = [];

// Storage
function loadCart() {
  try { cart = JSON.parse(localStorage.getItem("dk_cart_v2") || "[]"); }
  catch(e) { cart = []; }
}
function saveCart() {
  localStorage.setItem("dk_cart_v2", JSON.stringify(cart));
  updateUI();
}
function totalQty() { return cart.reduce((s,i)=>s+i.qty,0); }
function totalAmount() { return cart.reduce((s,i)=>s+i.qty*i.price_cents,0); }

// Cart ops
function findItem(pid){ return cart.find(x=>x.product_id==pid); }
function addOne(p){
  const it = findItem(p.id);
  if (it) it.qty++;
  else cart.push({product_id:p.id,name:p.name,price_cents:p.price_cents,qty:1,image_url:p.image_url||null});
  saveCart();
}
function decOne(p){
  const it = findItem(p.id);
  if(!it) return;
  it.qty--;
  if(it.qty<=0) cart=cart.filter(x=>x.product_id!=p.id);
  saveCart();
}

// UI
function updateUI(){
  const badge=document.getElementById("top-badge");
  const qty=totalQty();
  if(!badge) return;
  if(qty>0){badge.innerText=qty;badge.classList.remove("hidden");}
  else badge.classList.add("hidden");

  const bar=document.getElementById("view-order-bar");
  if(qty>0) bar.classList.remove("hidden");
  else bar.classList.add("hidden");

  const sa=document.getElementById("submit-amount");
  if(sa) sa.innerText=money(totalAmount());

  document.querySelectorAll("[data-product-id]").forEach(el=>{
    const pid=Number(el.getAttribute("data-product-id"));
    const q=(cart.find(i=>i.product_id==pid)||{qty:0}).qty;
    const addBtn=el.querySelector(".btn-add");
    const wrap=el.querySelector(".qty-wrap");
    const bub=el.querySelector(".qty-bubble");
    if(q>0){
      addBtn?.classList.add("hidden");
      wrap?.classList.remove("hidden");
      if(bub){bub.innerText=q;bub.classList.remove("hidden");}
    } else {
      addBtn?.classList.remove("hidden");
      wrap?.classList.add("hidden");
      if(bub) bub.classList.add("hidden");
    }
  });
}

// Products rendering
function renderProducts(list){
  const c=document.getElementById("products");
  c.innerHTML="";
  list.forEach((p,idx)=>{
    const card=document.createElement("div");
    card.className="card";
    card.setAttribute("data-product-id",p.id);

    const w=document.createElement("div");
    w.style.position="relative";
    w.style.width="100%";
    w.style.display="flex";
    w.style.flexDirection="column";
    w.style.alignItems="center";

    const src=getLottieForProduct(p,idx);
    const player=document.createElement("lottie-player");
    player.setAttribute("src",src);
    player.setAttribute("background","transparent");
    player.setAttribute("speed","1");
    player.setAttribute("loop","");
    player.setAttribute("autoplay","");
    player.className="product-lottie";
    w.appendChild(player);

    const bub=document.createElement("div");
    bub.className="qty-bubble hidden";
    w.appendChild(bub);

    const name=document.createElement("div");
    name.className="prod-name mt-1";
    name.innerText=p.name;

    const price=document.createElement("div");
    price.className="prod-price";
    price.innerText=money(p.price_cents);

    const controls=document.createElement("div");
    controls.className="mt-2 w-full flex items-center justify-center gap-2";

    const addBtn=document.createElement("button");
    addBtn.className="btn-add";
    addBtn.innerText="ADD";
    addBtn.onclick=()=>addOne(p);

    const wrap=document.createElement("div");
    wrap.className="qty-wrap hidden flex items-center gap-2";

    const decBtn=document.createElement("button");
    decBtn.className="btn-dec";
    decBtn.innerText="-";
    decBtn.onclick=()=>decOne(p);

    const plusBtn=document.createElement("button");
    plusBtn.className="btn-add";
    plusBtn.style.minWidth="40px";
    plusBtn.innerText="+";
    plusBtn.onclick=()=>addOne(p);

    wrap.appendChild(decBtn);
    wrap.appendChild(plusBtn);

    controls.appendChild(addBtn);
    controls.appendChild(wrap);

    card.appendChild(w);
    card.appendChild(name);
    card.appendChild(price);
    card.appendChild(controls);

    c.appendChild(card);
  });

  updateUI();
}

// Lottie selector
function getLottieForProduct(p,idx){
  if(p.image_url && (p.image_url.endsWith(".json")||p.image_url.includes("lottie")||p.image_url.endsWith(".lottie"))) return p.image_url;
  if(p.image_url && (p.image_url.endsWith(".png")||p.image_url.endsWith(".jpg"))) return p.image_url;
  return `/img/lottie${(idx%6)+1}.json`;
}

// Checkout modal
function renderCheckoutModal(){
  const el=document.getElementById("checkout-items");
  el.innerHTML="";
  if(!cart.length){
    el.innerHTML=`<div class='py-6 text-center text-neutral-500'>Seu carrinho está vazio.</div>`;
    return;
  }

  cart.forEach(i=>{
    const row=document.createElement("div");
    row.className="row";

    const t=document.createElement("div");
    t.style.width="46px";t.style.height="46px";
    t.innerHTML=`<lottie-player src='${getLottieForProduct({image_url:i.image_url},0)}' background='transparent' speed='1' style='width:46px;height:46px;' loop autoplay></lottie-player>`;

    const meta=document.createElement("div");
    meta.className="meta";
    meta.innerHTML=`<div class='name'>${i.name} <span style='color:#ffd166;font-weight:800'> ${i.qty}x</span></div>
                    <div class='sub'>${money(i.price_cents)} each</div>`;

    const price=document.createElement("div");
    price.innerText=money(i.qty*i.price_cents);

    row.appendChild(t);
    row.appendChild(meta);
    row.appendChild(price);
    el.appendChild(row);
  });

  const total=document.getElementById("checkout-total");
  if(total) total.innerText=money(totalAmount());
}

// Fetch products
async function fetchProductsFromApi(){
  try{
    const r=await fetch(`${API_BASE}/api/products?establishment_id=1`);
    const j=await r.json();
    products=j.map(p=>({id:p.id,name:p.name,price_cents:p.price_cents,image_url:p.image_url||null}));
    renderProducts(products);
  }catch(e){
    products=[];
    renderProducts(products);
  }
}

// Events
function initEvents(){
  document.getElementById("open-cart-btn").onclick=()=>openOrder();
  document.getElementById("open-order").onclick=()=>openOrder();
  document.getElementById("close-order").onclick=()=>closeOrder();
  document.getElementById("submit-order").onclick=()=>submitOrderFromCheckout();
}

function openOrder(){
  renderCheckoutModal();
  const m=document.getElementById("order-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}
function closeOrder(){
  const m=document.getElementById("order-modal");
  m.classList.add("hidden");
  m.classList.remove("flex");
}

// Telegram prefill
function fillTelegramUserInfo(){
  if(!(window.Telegram&&window.Telegram.WebApp)) return;
  const u=Telegram.WebApp.initDataUnsafe?.user;
  if(!u) return;
  const n=document.getElementById("field-name");
  const p=document.getElementById("field-phone");
  if(u.first_name&&!n.value) n.value=u.first_name+(u.last_name?" "+u.last_name:"");
}

// Submit order
async function submitOrderFromCheckout(){
  const name=document.getElementById("field-name").value.trim();
  const phone=document.getElementById("field-phone").value.trim();
  const address=document.getElementById("field-address").value.trim();
  const note=document.getElementById("field-note").value.trim();

  if(!name){alert("Preencha seu nome.");return;}
  if(!phone){alert("Preencha seu telefone.");return;}
  if(!cart.length){alert("Carrinho vazio.");return;}

  const payload={
    establishment_id:1,
    items:cart.map(i=>({product_id:i.product_id,name:i.name,qty:i.qty,price_cents:i.price_cents})),
    customer:{name,phone,address,note}
  };

  if(window.Telegram&&window.Telegram.WebApp){
    payload.telegram_user=Telegram.WebApp.initDataUnsafe?.user||null;
  }

  const btn=document.getElementById("submit-order");
  btn.disabled=true;
  const old=btn.innerHTML;
  btn.innerHTML="Enviando...";

  try{
    const r=await fetch(`${API_BASE}/api/order`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });

    const j=await r.json();
    if(j&&j.ok){
      alert("Pedido enviado! #"+j.order_id);
      cart=[];saveCart();
      closeOrder();
      if(window.Telegram&&window.Telegram.WebApp){
        Telegram.WebApp.close();
      }
    }else{
      alert("Erro ao enviar pedido: "+(j.error||"server_error"));
    }
  }catch(err){
    alert("Erro de rede.");
  }finally{
    btn.disabled=false;
    btn.innerHTML=old;
  }
}

// Init
(async function start(){
  loadCart();
  initEvents();
  await fetchProductsFromApi();
  fillTelegramUserInfo();
  updateUI();
  setInterval(()=>updateUI(),800);
})();