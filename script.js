// Product data — images should be placed in `assets/` as img1.jpg..img5.jpg
const PRODUCTS = [
  { id: 'mg-15', name: 'Night Cream — 15 g', size: '15 g', price: 499.00, img: 'assets/01_front_product.jpg', desc: 'Glow-boosting & nourishing night cream — travel size.', rating:4.8, badge:'15 g' },
  { id: 'mg-30', name: 'Night Cream — 30 g', size: '30 g', price: 899.00, img: 'assets/03_box_and_jar.jpg', desc: 'Brightening night cream — popular medium size.', rating:4.8, badge:'30 g' },
  { id: 'mg-50', name: 'Night Cream — 50 g', size: '50 g', price: 1349.00, img: 'assets/04_candlelit_product.jpg', desc: 'Deluxe 50 g jar — best value for nightly use.', rating:4.9, badge:'50 g' }
];

// Showcase gallery images (use the five optimized images)
const SHOWCASE_IMAGES = ['assets/01_front_product.jpg','assets/02_open_jar.jpg','assets/03_box_and_jar.jpg','assets/04_candlelit_product.jpg','assets/05_product_benefits.jpg'];

let cart = [];

// Store WhatsApp number for orders (country code, no +). Update this value or use the modal to set before sending.
const STORE_WHATSAPP_NUMBER = '7042403063';

// Load cart from localStorage if present
function loadCart(){
  try{
    const raw = localStorage.getItem('mineglow_cart');
    if(raw){ cart = JSON.parse(raw); }
  }catch(e){ cart = []; }
}

function saveCart(){
  try{ localStorage.setItem('mineglow_cart', JSON.stringify(cart)); }catch(e){}
}

const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
function formatMoney(n){ return moneyFormatter.format(n); }

function renderProducts(){
  const grid = document.getElementById('productsGrid');
  if(!grid) return;
  grid.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const card = document.createElement('div'); card.className='product';
    card.innerHTML = `
      <div class="media"><img src="${p.img}" alt="${p.name}"></div>
      <div class="meta"><div><h4>${p.name}</h4><div class="muted">${p.desc}</div></div><div style="text-align:right"><div class="badge">${p.badge || ''}</div></div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.5rem"><div class="rating">★ ${p.rating}</div><div class="price">${formatMoney(p.price)}</div></div>
      <div style="margin-top:auto;display:flex;gap:.5rem;">
        <button class="add-btn" data-id="${p.id}">Add to cart</button>
        <button class="add-btn small" data-id="${p.id}" onclick="window.scrollTo({top:0,behavior:'smooth'})">Buy</button>
      </div>`
    grid.appendChild(card);
  })
  grid.querySelectorAll('.add-btn').forEach(b=>b.addEventListener('click',e=>{
    const id = e.currentTarget.dataset.id; addToCart(id);
  }))
}

function renderShowcase(){
  const thumbs = document.getElementById('showcaseThumbs');
  const main = document.getElementById('showcaseMain');
  if(!thumbs || !main) return;
  thumbs.innerHTML = '';
  SHOWCASE_IMAGES.forEach((src, idx)=>{
    const t = document.createElement('img');
    t.src = src; t.alt = 'thumb-'+(idx+1); t.className='thumb';
    t.addEventListener('click', ()=>{ main.src = src; });
    thumbs.appendChild(t);
  })
}

function addToCart(id){
  const p = PRODUCTS.find(x=>x.id===id); if(!p) return;
  const existing = cart.find(i=>i.id===id);
  if(existing) existing.qty += 1; else cart.push({id:p.id,name:p.name,price:p.price,qty:1,img:p.img});
  updateCartCount(); saveCart();
}

function changeQty(id, delta){
  const item = cart.find(i=>i.id===id); if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) removeFromCart(id);
  updateCartCount(); renderCart(); saveCart();
}

function removeFromCart(id){
  cart = cart.filter(i=>i.id!==id); updateCartCount(); renderCart(); saveCart();
}

function updateCartCount(){
  const count = cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById('cartCount').textContent = count;
}

function openCart(){
  renderCart(); document.getElementById('cartPanel').classList.add('open');
}

function closeCart(){ document.getElementById('cartPanel').classList.remove('open'); }

function renderCart(){
  const container = document.getElementById('cartItems'); container.innerHTML='';
  if(cart.length===0){ container.innerHTML='<div class="muted">Your cart is empty.</div>'; document.getElementById('cartTotal').textContent = formatMoney(0); return; }
  cart.forEach(i=>{
    const node = document.createElement('div'); node.className='cart-item';
    node.innerHTML = `
      <img src="${i.img}" alt="${i.name}">
      <div style="flex:1">
        <div>${i.name}</div>
        <div style="color:var(--muted);margin-top:.35rem">Qty: <button class="qty-btn" data-id="${i.id}" data-delta="-1">−</button> <span class="qty">${i.qty}</span> <button class="qty-btn" data-id="${i.id}" data-delta="1">+</button></div>
      </div>
      <div style="text-align:right">
        <div>${formatMoney(i.price*i.qty)}</div>
        <button class="remove-btn" data-id="${i.id}" style="margin-top:.4rem">Remove</button>
      </div>`;
    container.appendChild(node);
  })
  const total = cart.reduce((s,i)=>s + i.price*i.qty,0);
  document.getElementById('cartTotal').textContent = formatMoney(total);

  // wire cart buttons
  container.querySelectorAll('.qty-btn').forEach(b=>b.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id; const d = Number(e.currentTarget.dataset.delta); changeQty(id,d);
  }));
  container.querySelectorAll('.remove-btn').forEach(b=>b.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id; removeFromCart(id);
  }));
}

function openOrderModal(){
  if(cart.length===0){ alert('Your cart is empty'); return; }
  // populate modal with saved customer info if present
  try{
    const customer = JSON.parse(localStorage.getItem('mineglow_customer')||'{}');
    if(customer.name) document.getElementById('orderName').value = customer.name;
    if(customer.phone) document.getElementById('orderPhone').value = customer.phone;
    if(customer.address) document.getElementById('orderAddress').value = customer.address;
  }catch(e){}
  // prefill store number
  const sn = document.getElementById('orderStoreNumber'); if(sn) sn.value = STORE_WHATSAPP_NUMBER;
  document.getElementById('orderModal').classList.add('open'); document.getElementById('orderModal').setAttribute('aria-hidden','false');
}

function closeOrderModal(){ document.getElementById('orderModal').classList.remove('open'); document.getElementById('orderModal').setAttribute('aria-hidden','true'); }

function confirmOrderAndSend(){
  const name = (document.getElementById('orderName').value || 'Guest').trim();
  const phone = (document.getElementById('orderPhone').value || '').trim();
  const address = (document.getElementById('orderAddress').value || '').trim();
  const notes = (document.getElementById('orderNotes').value || '').trim();
  const storeNum = (document.getElementById('orderStoreNumber').value || STORE_WHATSAPP_NUMBER).replace(/\D/g,'');
  if(!storeNum){ alert('Please enter the store WhatsApp number (country code, no +)'); return; }
  // save customer info for next time
  try{ localStorage.setItem('mineglow_customer', JSON.stringify({name,phone,address})); }catch(e){}

  const total = cart.reduce((s,i)=>s + i.price*i.qty,0);
  let msg = `Order from Mine Glow Organics\nName: ${name}`;
  if(phone) msg += `\nPhone: ${phone}`;
  if(address) msg += `\nAddress: ${address}`;
  msg += `\n\nItems:\n`;
  cart.forEach(i=> msg += `- ${i.name} x${i.qty} = ${formatMoney(i.price*i.qty)}\n`);
  msg += `\nTotal: ${formatMoney(total)}\n`;
  if(notes) msg += `\nNotes: ${notes}\n`;
  msg += `\nPlease confirm availability and payment instructions.`;

  const waUrl = `https://wa.me/${storeNum}?text=` + encodeURIComponent(msg);
  window.open(waUrl, '_blank');
  closeOrderModal();
}

// Wire UI
document.getElementById('cartButton').addEventListener('click', openCart);
document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('whatsappOrder').addEventListener('click', openOrderModal);
// modal buttons
document.getElementById('orderCancel').addEventListener('click', closeOrderModal);
document.getElementById('orderConfirm').addEventListener('click', confirmOrderAndSend);
document.getElementById('shopNow').addEventListener('click', ()=>{
  document.getElementById('products').scrollIntoView({behavior:'smooth'});
  // highlight first product briefly
  const first = document.querySelector('.product'); if(first){ first.style.boxShadow='0 30px 60px rgba(240,138,165,0.12)'; setTimeout(()=>first.style.boxShadow='',600)}
});

function showToast(text){
  let t = document.getElementById('siteToast');
  if(!t){ t = document.createElement('div'); t.id='siteToast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); clearTimeout(t._hide);
  t._hide = setTimeout(()=>t.classList.remove('show'),1800);
}

// add small toast on add to cart
const origAdd = addToCart;
addToCart = function(id){ origAdd(id); const p = PRODUCTS.find(x=>x.id===id); showToast(p.name + ' added'); }

loadCart(); renderProducts(); renderShowcase(); updateCartCount();
