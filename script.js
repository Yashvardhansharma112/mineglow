// ==========================================================================
// Mine Glow Organics — Luxury Storefront Script (100% On-Site Checkout)
// ==========================================================================

// 📬 Store Owner Notification Email:
// Replace with the email address where you want to receive instant new order alerts.
const OWNER_NOTIFICATION_EMAIL = 'orders.mineglow@gmail.com';

// 🚚 Delivery Fee Configuration:
const FREE_SHIPPING_THRESHOLD = 999;
const PREPAID_DELIVERY_FEE = 39;
const COD_DELIVERY_FEE = 59;
let razorpayLoader;

const PRODUCTS = [
  {
    id: 'mg-15',
    name: 'Night Cream — 15 g',
    size: '15 g (Travel Size)',
    price: 499.00,
    originalPrice: 599.00,
    img: 'assets/01_front_product.jpg',
    desc: 'Pure botanical night elixir in a travel-friendly jar. Perfect 2-week trial size.',
    rating: 4.8,
    badge: 'Trial & Travel',
    isFeatured: false
  },
  {
    id: 'mg-30',
    name: 'Night Cream — 30 g',
    size: '30 g (Daily Ritual)',
    price: 899.00,
    originalPrice: 1099.00,
    img: 'assets/03_box_and_jar.jpg',
    desc: 'Our bestselling daily ritual jar. 1-month supply for lit-from-within radiance.',
    rating: 4.9,
    badge: '★ Most Popular',
    isFeatured: true
  },
  {
    id: 'mg-50',
    name: 'Night Cream — 50 g',
    size: '50 g (Deluxe Jar)',
    price: 1349.00,
    originalPrice: 1699.00,
    img: 'assets/04_candlelit_product.jpg',
    desc: 'Deluxe size for dedicated nightly care. Maximum savings & 2+ month supply.',
    rating: 4.9,
    badge: 'Save 25% • Best Value',
    isFeatured: false
  }
];

const SHOWCASE_IMAGES = [
  { src: 'assets/01_front_product.jpg', title: 'Front Product Packaging' },
  { src: 'assets/02_open_jar.jpg', title: 'Rich Velvety Cream Texture' },
  { src: 'assets/03_box_and_jar.jpg', title: 'Luxury Box & Glass Jar' },
  { src: 'assets/04_candlelit_product.jpg', title: 'Nighttime Aesthetic Ritual' },
  { src: 'assets/05_product_benefits.jpg', title: 'Pure Botanical Benefits' }
];

let cart = [];
let currentAccount = null;

// ==========================================================================
// Cart State Management
// ==========================================================================

function loadCart() {
  try {
    const raw = localStorage.getItem('mineglow_cart');
    const savedCart = raw ? JSON.parse(raw) : [];
    cart = Array.isArray(savedCart) ? savedCart.reduce((items, savedItem) => {
      const product = PRODUCTS.find(item => item.id === savedItem.id);
      const qty = Number.isInteger(savedItem.qty) ? savedItem.qty : 0;
      if (product && qty > 0 && qty <= 99) {
        items.push({
          id: product.id,
          name: product.name,
          price: product.price,
          img: product.img,
          qty
        });
      }
      return items;
    }, []) : [];
    saveCart();
  } catch (e) {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem('mineglow_cart', JSON.stringify(cart));
  } catch (e) {}
}

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

function formatMoney(n) {
  return moneyFormatter.format(n);
}

function getSubtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getDeliveryFee(subtotal, paymentMethod) {
  if (subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0) {
    return 0;
  }
  return paymentMethod === 'Razorpay' ? PREPAID_DELIVERY_FEE : COD_DELIVERY_FEE;
}

function generateOrderId() {
  return 'MG-' + Math.floor(10000 + Math.random() * 90000);
}

// ==========================================================================
// Render Products Grid
// ==========================================================================

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  PRODUCTS.forEach(p => {
    const card = document.createElement('div');
    card.className = `product-card ${p.isFeatured ? 'featured-card' : ''}`;
    
    card.innerHTML = `
      <div class="product-card-badge ${p.isFeatured ? 'gold' : ''}">${p.badge}</div>
      <div class="product-media">
        <picture>
          <source srcset="${p.img.replace('.jpg', '.webp')}" type="image/webp">
          <img src="${p.img}" alt="${p.name}" loading="lazy" decoding="async">
        </picture>
      </div>
      <div class="product-body">
        <div class="product-header">
          <div class="product-rating">★★★★★ ${p.rating}</div>
          <span class="product-size-pill">${p.size}</span>
        </div>
        <h3 class="product-title">${p.name}</h3>
        <p class="product-desc">${p.desc}</p>
        <div class="product-price-box">
          <span class="product-current-price">${formatMoney(p.price)}</span>
          <span class="product-old-price">${formatMoney(p.originalPrice)}</span>
          <span class="product-save-badge">Save ${formatMoney(p.originalPrice - p.price)}</span>
        </div>
        <div class="product-actions">
          <button type="button" class="btn-add-cart" onclick="addToCart('${p.id}')">+ Add to Bag</button>
          <button type="button" class="btn-buy-now" onclick="buyNow('${p.id}')">Instant Buy</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function buyNow(id) {
  if (!requireAccount()) return;
  addToCart(id);
  openOrderModal();
}

function requireAccount() {
  if (currentAccount) return true;
  showToast('Please sign in or create an account before shopping.');
  openAccount();
  return false;
}

// ==========================================================================
// Render Media Showcase Gallery
// ==========================================================================

function renderShowcase() {
  const thumbsContainer = document.getElementById('showcaseThumbs');
  const mainImg = document.getElementById('showcaseMain');
  if (!thumbsContainer || !mainImg) return;

  thumbsContainer.innerHTML = '';
  SHOWCASE_IMAGES.forEach((item, index) => {
    const thumb = document.createElement('img');
    thumb.src = item.src.replace(/\.jpg$/, '.webp');
    thumb.onerror = () => { thumb.src = item.src; };
    thumb.alt = item.title;
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.className = `thumb ${index === 0 ? 'active' : ''}`;
    
    thumb.addEventListener('click', () => {
      mainImg.style.opacity = '0.4';
      setTimeout(() => {
        mainImg.src = item.src.replace(/\.jpg$/, '.webp');
        mainImg.onerror = () => { mainImg.src = item.src; };
        mainImg.style.opacity = '1';
      }, 150);

      thumbsContainer.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });

    thumbsContainer.appendChild(thumb);
  });
}

// ==========================================================================
// Cart Operations
// ==========================================================================

function addToCart(id) {
  if (!requireAccount()) return;
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;

  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      img: product.img,
      qty: 1
    });
  }

  updateCartCount();
  saveCart();
  renderCart();
  showToast(`✨ ${product.name} added to your bag`);
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(id);
  } else {
    updateCartCount();
    renderCart();
    saveCart();
    updatePaymentOptionUI();
  }
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCartCount();
  renderCart();
  saveCart();
  updatePaymentOptionUI();
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent = count;
    badge.style.transform = 'scale(1.25)';
    setTimeout(() => badge.style.transform = 'scale(1)', 200);
  }
}

function updateShippingTracker(subtotal) {
  const trackerText = document.getElementById('trackerText');
  const progressFill = document.getElementById('progressFill');
  if (!trackerText || !progressFill) return;

  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    trackerText.innerHTML = '🎉 <strong>Congratulations!</strong> You unlocked <strong>Free Express Shipping</strong>!';
    progressFill.style.width = '100%';
  } else {
    const diff = FREE_SHIPPING_THRESHOLD - subtotal;
    const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
    trackerText.innerHTML = `Add <strong>${formatMoney(diff)}</strong> more for <strong>Free Express Shipping</strong>! 🚚`;
    progressFill.style.width = `${pct}%`;
  }
}

function openCart() {
  renderCart();
  const panel = document.getElementById('cartPanel');
  const backdrop = document.getElementById('cartBackdrop');
  if (panel) panel.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeCart() {
  const panel = document.getElementById('cartPanel');
  const backdrop = document.getElementById('cartBackdrop');
  if (panel) panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  const deliveryInfoText = document.getElementById('cartDeliveryText');
  if (!container || !subtotalEl) return;

  container.innerHTML = '';

  const subtotal = getSubtotal();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-cart-msg">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 1rem;opacity:0.35"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        <p>Your shopping bag is empty.</p>
        <button type="button" class="btn btn-outline" style="margin-top:1rem;font-size:0.85rem;" onclick="closeCart(); scrollToProducts();">Explore Products</button>
      </div>
    `;
    subtotalEl.textContent = formatMoney(0);
    updateShippingTracker(0);
    if (deliveryInfoText) deliveryInfoText.textContent = 'Free Delivery on orders above ₹999';
    return;
  }

  cart.forEach(item => {
    const node = document.createElement('div');
    node.className = 'cart-item';
    node.innerHTML = `
      <img src="${item.img.replace('.jpg', '.webp')}" alt="${item.name}" class="cart-item-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${item.img}'">
      <div class="cart-item-info">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-qty-ctrl">
          <button type="button" class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
          <span class="qty-count">${item.qty}</span>
          <button type="button" class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
        </div>
      </div>
      <div class="cart-item-right">
        <div class="cart-item-price">${formatMoney(item.price * item.qty)}</div>
        <button type="button" class="remove-cart-item" onclick="removeFromCart('${item.id}')">Remove</button>
      </div>
    `;
    container.appendChild(node);
  });

  subtotalEl.textContent = formatMoney(subtotal);
  updateShippingTracker(subtotal);

  if (deliveryInfoText) {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) {
      deliveryInfoText.innerHTML = '🎉 <strong>Free Express Delivery</strong> on this order!';
    } else {
      deliveryInfoText.innerHTML = `Delivery: <strong>₹39</strong> (Prepaid) | <strong>₹59</strong> (COD) • Free on ₹999+`;
    }
  }
}

// ==========================================================================
// Checkout Modal & Live Calculations
// ==========================================================================

function openOrderModal() {
  if (!requireAccount()) return;
  if (cart.length === 0) {
    showToast('⚠️ Your bag is empty! Please add a cream first.');
    closeCart();
    scrollToProducts();
    return;
  }

  closeCart();

  // Pre-fill customer details from localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('mineglow_customer') || '{}');
    if (saved.name) document.getElementById('orderName').value = saved.name;
    if (saved.phone) document.getElementById('orderPhone').value = saved.phone;
    if (saved.address) document.getElementById('orderAddress').value = saved.address;
    if (saved.paymentMethod) {
      selectPaymentMethod(saved.paymentMethod);
    }
  } catch (e) {}

  updatePaymentOptionUI();
  
  const modal = document.getElementById('orderModal');
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeOrderModal() {
  const modal = document.getElementById('orderModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function selectPaymentMethod(method) {
  const radio = document.querySelector(`input[name="paymentMethod"][value="${method}"]`);
  if (radio) {
    radio.checked = true;
  }
  updatePaymentOptionUI();
}

function updatePaymentOptionUI() {
  const subtotal = getSubtotal();
  const selectedRadio = document.querySelector('input[name="paymentMethod"]:checked');
  const paymentMethod = selectedRadio ? selectedRadio.value : 'Razorpay';
  const isFreeDelivery = subtotal >= FREE_SHIPPING_THRESHOLD;

  const prepaidBadge = document.getElementById('prepaidDeliveryBadge');
  const codBadge = document.getElementById('codDeliveryBadge');
  const prepaidSaveTag = document.getElementById('prepaidSaveTag');

  if (isFreeDelivery) {
    if (prepaidBadge) {
      prepaidBadge.textContent = 'FREE Delivery';
      prepaidBadge.className = 'badge-tag free';
    }
    if (codBadge) {
      codBadge.textContent = 'FREE Delivery';
      codBadge.className = 'badge-tag free';
    }
    if (prepaidSaveTag) prepaidSaveTag.style.display = 'none';
  } else {
    if (prepaidBadge) {
      prepaidBadge.textContent = `Delivery: ₹${PREPAID_DELIVERY_FEE}`;
      prepaidBadge.className = 'badge-tag gold';
    }
    if (codBadge) {
      codBadge.textContent = `Delivery: ₹${COD_DELIVERY_FEE}`;
      codBadge.className = 'badge-tag';
    }
    if (prepaidSaveTag) prepaidSaveTag.style.display = 'inline-block';
  }

  // Active card highlight
  document.querySelectorAll('.payment-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // Calculate live delivery fee and grand total
  const deliveryFee = getDeliveryFee(subtotal, paymentMethod);
  const grandTotal = subtotal + deliveryFee;

  const modalSubtotalEl = document.getElementById('modalSubtotal');
  const modalDeliveryFeeEl = document.getElementById('modalDeliveryFee');
  const modalGrandTotalEl = document.getElementById('modalGrandTotal');
  const btnText = document.getElementById('orderBtnText');

  if (modalSubtotalEl) modalSubtotalEl.textContent = formatMoney(subtotal);

  if (modalDeliveryFeeEl) {
    if (deliveryFee === 0) {
      modalDeliveryFeeEl.innerHTML = '<span style="color:#2E7D32;font-weight:700;">FREE (₹0)</span>';
    } else {
      modalDeliveryFeeEl.textContent = `+ ₹${deliveryFee}`;
    }
  }

  if (modalGrandTotalEl) modalGrandTotalEl.textContent = formatMoney(grandTotal);

  if (btnText) {
    if (paymentMethod === 'Razorpay') {
      btnText.textContent = `Pay ${formatMoney(grandTotal)} via Razorpay ➔`;
    } else {
      btnText.textContent = `Place COD Order (${formatMoney(grandTotal)}) ➔`;
    }
  }
}

function confirmOrderAndSend() {
  const name = (document.getElementById('orderName').value || '').trim();
  const phone = (document.getElementById('orderPhone').value || '').trim();
  const address = (document.getElementById('orderAddress').value || '').trim();
  const notes = (document.getElementById('orderNotes').value || '').trim();

  if (!name) {
    alert('Please enter your full name.');
    document.getElementById('orderName').focus();
    return;
  }
  if (!phone) {
    alert('Please enter your phone number.');
    document.getElementById('orderPhone').focus();
    return;
  }
  if (!/^\+?[0-9]{10,15}$/.test(phone)) {
    alert('Please enter a valid phone number.');
    document.getElementById('orderPhone').focus();
    return;
  }
  if (!address) {
    alert('Please enter your complete delivery address.');
    document.getElementById('orderAddress').focus();
    return;
  }

  const selectedPaymentEl = document.querySelector('input[name="paymentMethod"]:checked');
  const paymentMethod = selectedPaymentEl ? selectedPaymentEl.value : 'Razorpay';

  // Save info for returning customer
  try {
    localStorage.setItem('mineglow_customer', JSON.stringify({ name, phone, address, paymentMethod }));
  } catch (e) {}

  const subtotal = getSubtotal();
  const deliveryFee = getDeliveryFee(subtotal, paymentMethod);
  const grandTotal = subtotal + deliveryFee;
  const orderId = generateOrderId();

  const orderData = {
    orderId,
    name,
    phone,
    address,
    notes,
    paymentMethod,
    subtotal,
    deliveryFee,
    grandTotal,
    cart: [...cart]
  };

  // Route payment method
  if (paymentMethod === 'Razorpay') {
    initiateRazorpayCheckout(orderData);
  } else {
    // Process Cash on Delivery on-site
    processCODOrder(orderData);
  }
}

// ==========================================================================
// Razorpay Checkout Flow
// ==========================================================================

async function initiateRazorpayCheckout(orderData) {
  const confirmButton = document.getElementById('orderConfirm');

  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.setAttribute('aria-busy', 'true');
  }

  try {
    const response = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: orderData.cart.map(item => ({ id: item.id, qty: item.qty })),
        paymentMethod: 'Razorpay',
        name: orderData.name,
        phone: orderData.phone,
        address: orderData.address,
        notes: orderData.notes
      })
    });
    const serverOrder = await response.json();
    if (!response.ok) throw new Error(serverOrder.error || 'Could not create payment order');

    orderData.cart = serverOrder.cart;
    orderData.subtotal = serverOrder.subtotal / 100;
    orderData.deliveryFee = serverOrder.deliveryFee / 100;
    orderData.grandTotal = serverOrder.grandTotal / 100;
    const itemsDescription = orderData.cart.map(i => `${i.name} (x${i.qty})`).join(', ');

    await loadRazorpay();

    const options = {
    key: serverOrder.keyId,
    order_id: serverOrder.razorpayOrderId,
    amount: serverOrder.grandTotal,
    currency: "INR",
    name: "Mine Glow Organics",
    description: itemsDescription,
    image: "assets/logo.png",
    prefill: {
      name: orderData.name,
      contact: orderData.phone,
      email: "order@mineglow.com"
    },
    notes: {
      orderId: orderData.orderId,
      address: orderData.address,
      notes: orderData.notes || "None",
      items: itemsDescription,
      deliveryFee: `₹${orderData.deliveryFee}`
    },
    theme: {
      color: "#8B3A4F"
    },
    handler: function(response) {
      if (!response || !response.razorpay_payment_id || !response.razorpay_order_id || !response.razorpay_signature) {
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.removeAttribute('aria-busy');
        }
        alert('Razorpay returned an incomplete payment response. Please try again.');
        return;
      }
      verifyRazorpayPayment(response, orderData, confirmButton);
    },
    modal: {
      ondismiss: function() {
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.removeAttribute('aria-busy');
        }
        showToast('Payment window cancelled');
      }
    }
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function(response) {
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.removeAttribute('aria-busy');
      }
      alert('Payment failed: ' + (response.error.description || 'Please try again.'));
    });
    rzp.open();
  } catch (err) {
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.removeAttribute('aria-busy');
    }
    console.error('Unable to start Razorpay Checkout:', err);
    alert(err.message || 'Unable to start Razorpay Checkout. Please try again.');
  }
}

function loadRazorpay() {
  if (typeof Razorpay !== 'undefined') return Promise.resolve();
  if (razorpayLoader) return razorpayLoader;
  razorpayLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Razorpay Checkout could not load'));
    document.head.appendChild(script);
  });
  return razorpayLoader;
}

async function verifyRazorpayPayment(response, orderData, confirmButton) {
  try {
    const verification = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    });
    const result = await verification.json();
    if (!verification.ok || !result.verified) throw new Error(result.error || 'Payment verification failed');
    onOrderPlacedSuccess(response.razorpay_payment_id, orderData);
  } catch (error) {
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.removeAttribute('aria-busy');
    }
    console.error('Payment verification failed:', error);
    alert('Payment received but could not be verified. Please contact support with your payment ID.');
  }
}

// ==========================================================================
// Cash on Delivery Checkout Flow
// ==========================================================================

async function processCODOrder(orderData) {
  try {
    const response = await fetch('/api/cod-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: orderData.cart.map(item => ({ id: item.id, qty: item.qty })),
        name: orderData.name,
        phone: orderData.phone,
        address: orderData.address,
        notes: orderData.notes
      })
    });
    const serverOrder = await response.json();
    if (!response.ok) throw new Error(serverOrder.error || 'Could not register COD order');
    orderData.orderId = serverOrder.orderId;
    orderData.cart = serverOrder.cart;
    orderData.subtotal = serverOrder.subtotal / 100;
    orderData.deliveryFee = serverOrder.deliveryFee / 100;
    orderData.grandTotal = serverOrder.grandTotal / 100;
    onOrderPlacedSuccess(null, orderData);
  } catch (error) {
    console.error('COD order registration failed:', error);
    alert('Unable to register your COD order. Please try again.');
  }
}

// ==========================================================================
// Order Completion (100% On-Site & Background Notification)
// ==========================================================================

function onOrderPlacedSuccess(paymentId, orderData) {
  closeOrderModal();
  
  // Clear cart
  cart = [];
  saveCart();
  updateCartCount();
  renderCart();

  const isPrepaid = !!paymentId;
  orderData.paymentId = paymentId;

  // 1. Send silent background notification to Store Owner Email & Endpoint
  sendBackgroundOwnerNotification(orderData);

  // 2. Configure On-Site Confirmation Screen
  const orderIdEl = document.getElementById('receiptOrderId');
  if (orderIdEl) orderIdEl.textContent = `Order #${orderData.orderId}`;
  
  const titleEl = document.getElementById('successTitle');
  const subEl = document.getElementById('successSub');
  const methodEl = document.getElementById('receiptMethod');
  const payIdRow = document.getElementById('receiptPaymentIdRow');

  if (titleEl) titleEl.textContent = 'Order Confirmed!';
  if (subEl) subEl.textContent = isPrepaid 
    ? 'Your payment was successful and your order has been received.' 
    : 'Your Cash on Delivery order has been registered.';
  
  if (methodEl) methodEl.textContent = isPrepaid ? 'Paid Online (Razorpay)' : 'Cash on Delivery (COD)';

  if (payIdRow) {
    if (isPrepaid) {
      payIdRow.style.display = 'flex';
      const pidEl = document.getElementById('receiptPaymentId');
      if (pidEl) pidEl.textContent = paymentId;
    } else {
      payIdRow.style.display = 'none';
    }
  }

  const custEl = document.getElementById('receiptCustomer');
  if (custEl) custEl.textContent = `${orderData.name} (${orderData.phone})`;
  
  const addrEl = document.getElementById('receiptAddress');
  if (addrEl) addrEl.textContent = orderData.address;

  const subElRec = document.getElementById('receiptSubtotal');
  if (subElRec) subElRec.textContent = formatMoney(orderData.subtotal);

  const delElRec = document.getElementById('receiptDelivery');
  if (delElRec) delElRec.textContent = orderData.deliveryFee === 0 ? 'FREE (₹0)' : `₹${orderData.deliveryFee}`;

  const grandElRec = document.getElementById('receiptAmount');
  if (grandElRec) grandElRec.textContent = formatMoney(orderData.grandTotal);

  const itemsContainer = document.getElementById('receiptItems');
  if (itemsContainer) {
    itemsContainer.innerHTML = '<strong>Ordered Items:</strong><br>' + 
      orderData.cart.map(i => `• ${i.name} × ${i.qty} (${formatMoney(i.price * i.qty)})`).join('<br>');
  }

  // Show Success Modal
  const successModal = document.getElementById('successModal');
  if (successModal) {
    successModal.classList.add('open');
    successModal.setAttribute('aria-hidden', 'false');
  }

  showToast(`🎉 Order #${orderData.orderId} Confirmed!`);
}

// ==========================================================================
// Silent Background Notification Dispatch
// ==========================================================================

async function sendBackgroundOwnerNotification(orderData) {
  const isPrepaid = !!orderData.paymentId;
  const itemsText = orderData.cart.map(i => `${i.name} (Qty: ${i.qty}) - ₹${i.price * i.qty}`).join(' | ');

  const payload = {
    _subject: `🛍️ New Order #${orderData.orderId} - ${formatMoney(orderData.grandTotal)} (${isPrepaid ? 'PREPAID' : 'COD'})`,
    "Order ID": orderData.orderId,
    "Payment Method": isPrepaid ? `Prepaid (Razorpay ID: ${orderData.paymentId})` : "Cash on Delivery (COD)",
    "Payment Status": isPrepaid ? "PAID ONLINE" : "COLLECT UPON DELIVERY",
    "Customer Name": orderData.name,
    "Phone Number": orderData.phone,
    "Delivery Address": orderData.address,
    "Delivery Notes": orderData.notes || "None",
    "Items Ordered": itemsText,
    "Items Subtotal": formatMoney(orderData.subtotal),
    "Delivery Charges": orderData.deliveryFee === 0 ? "FREE" : formatMoney(orderData.deliveryFee),
    "Grand Total": formatMoney(orderData.grandTotal),
    "Order Placed At": new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };

  try {
    // Dispatch to Store Owner Email via FormSubmit AJAX endpoint (silent in background)
    if (OWNER_NOTIFICATION_EMAIL && OWNER_NOTIFICATION_EMAIL.includes('@')) {
      fetch(`https://formsubmit.co/ajax/${OWNER_NOTIFICATION_EMAIL}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      }).then(res => res.json())
        .then(data => console.log('Order notification dispatched:', data))
        .catch(e => console.warn('Notification dispatch notice:', e));
    }
  } catch (err) {
    console.warn('Background notification notice:', err);
  }
}

function closeSuccessModal() {
  const successModal = document.getElementById('successModal');
  if (successModal) {
    successModal.classList.remove('open');
    successModal.setAttribute('aria-hidden', 'true');
  }
}

function scrollToProducts() {
  const target = document.getElementById('products');
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================================================
// FAQ Accordion Handler
// ==========================================================================

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (btn) {
      btn.onclick = function() {
        const isOpen = item.classList.contains('active');
        faqItems.forEach(i => {
          i.classList.remove('active');
          i.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('active');
          btn.setAttribute('aria-expanded', 'true');
        }
      };
    }
  });
}

async function refreshAccount() {
  const response = await fetch('/api/me');
  const data = await response.json();
  currentAccount = data.user;
  const button = document.getElementById('accountButton');
  if (button) button.textContent = currentAccount ? currentAccount.name : 'Account';
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function openAccount() {
  const modal = document.getElementById('accountModal');
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  renderAccountPanel();
}

function closeAccount() {
  const modal = document.getElementById('accountModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function renderAccountPanel() {
  const panel = document.getElementById('accountContent');
  if (!panel) return;
  if (!currentAccount) {
    panel.innerHTML = `<div class="account-forms"><form onsubmit="registerAccount(event)"><h4>Create account</h4><input id="registerName" placeholder="Full name" required><input id="registerEmail" type="email" placeholder="Email address" required><input id="registerPhone" type="tel" inputmode="tel" pattern="\+?[0-9]{10,15}" placeholder="Phone number (optional)"><input id="registerPassword" type="password" minlength="8" placeholder="Password (8+ characters)" required><button class="btn btn-primary btn-full">Register</button></form><form onsubmit="loginAccount(event)"><h4>Sign in</h4><input id="loginEmail" type="email" placeholder="Email address" required><input id="loginPassword" type="password" placeholder="Password" required><button class="btn btn-outline btn-full">Sign in</button><button type="button" class="account-link" onclick="showForgotPassword()">Forgot password?</button></form></div>`;
    return;
  }
  const response = await fetch('/api/orders');
  const data = await response.json();
  panel.innerHTML = `<div class="account-welcome"><div><strong>Welcome, ${escapeHTML(currentAccount.name)}</strong><p>${escapeHTML(currentAccount.email)}</p></div><button class="btn btn-ghost" onclick="logoutAccount()">Sign out</button></div><h4>Your orders</h4>${data.orders.length ? data.orders.map(order => `<div class="account-order"><strong>${escapeHTML(order.orderId)}</strong><span>${escapeHTML(order.status || 'Order received')}</span><span>${formatMoney(order.grandTotal / 100)}</span><small>${new Date(order.createdAt).toLocaleDateString('en-IN')}</small></div>`).join('') : '<p class="account-empty">Your completed orders will appear here.</p>'}`;
}

function showForgotPassword() {
  const panel = document.getElementById('accountContent');
  if (!panel) return;
  panel.innerHTML = `<form class="account-forms" onsubmit="requestPasswordReset(event)"><h4>Reset your password</h4><p class="account-empty">Enter your account email and we will send a reset link.</p><input id="forgotEmail" type="email" placeholder="Email address" required><button class="btn btn-primary btn-full">Send reset link</button><button type="button" class="btn btn-ghost" onclick="renderAccountPanel()">Back to sign in</button></form>`;
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const response = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: forgotEmail.value }) });
  const data = await response.json();
  if (data.devResetUrl) {
    const token = new URL(data.devResetUrl).searchParams.get('reset');
    showResetPassword(token);
  } else alert(data.message);
}

function showResetPassword(token) {
  const panel = document.getElementById('accountContent');
  if (!panel) return;
  panel.innerHTML = `<form class="account-forms" onsubmit="submitPasswordReset(event)"><h4>Choose a new password</h4><input id="newPassword" type="password" minlength="8" placeholder="New password (8+ characters)" required><input id="resetPasswordConfirm" type="password" minlength="8" placeholder="Confirm new password" required><input id="resetToken" type="hidden" value="${escapeHTML(token)}"><button class="btn btn-primary btn-full">Update password</button></form>`;
}

async function submitPasswordReset(event) {
  event.preventDefault();
  if (newPassword.value !== resetPasswordConfirm.value) return alert('Passwords do not match');
  const response = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken.value, password: newPassword.value }) });
  const data = await response.json();
  if (!response.ok) return alert(data.error);
  currentAccount = data.user;
  renderAccountPanel();
  refreshAccount();
}

async function registerAccount(event) {
  event.preventDefault();
  const response = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: registerName.value, email: registerEmail.value, phone: registerPhone.value, password: registerPassword.value }) });
  const data = await response.json();
  if (!response.ok) return alert(data.error);
  currentAccount = data.user;
  renderAccountPanel();
  refreshAccount();
}

async function loginAccount(event) {
  event.preventDefault();
  const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }) });
  const data = await response.json();
  if (!response.ok) return alert(data.error);
  currentAccount = data.user;
  renderAccountPanel();
  refreshAccount();
}

async function logoutAccount() {
  await fetch('/api/logout', { method: 'POST' });
  currentAccount = null;
  refreshAccount();
  renderAccountPanel();
}

// ==========================================================================
// Toast Alerts
// ==========================================================================

function showToast(text) {
  let toast = document.getElementById('siteToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'siteToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ==========================================================================
// Global Scope Bindings & Init
// ==========================================================================

window.openCart = openCart;
window.closeCart = closeCart;
window.addToCart = addToCart;
window.buyNow = buyNow;
window.changeQty = changeQty;
window.removeFromCart = removeFromCart;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
window.selectPaymentMethod = selectPaymentMethod;
window.confirmOrderAndSend = confirmOrderAndSend;
window.closeSuccessModal = closeSuccessModal;
window.scrollToProducts = scrollToProducts;
window.openAccount = openAccount;
window.closeAccount = closeAccount;
window.registerAccount = registerAccount;
window.loginAccount = loginAccount;
window.logoutAccount = logoutAccount;
window.showForgotPassword = showForgotPassword;
window.requestPasswordReset = requestPasswordReset;
window.showResetPassword = showResetPassword;
window.submitPasswordReset = submitPasswordReset;

function initApp() {
  loadCart();
  renderProducts();
  renderShowcase();
  updateCartCount();
  initFAQ();
  refreshAccount().catch(() => {});

  const shopNowBtn = document.getElementById('shopNow');
  if (shopNowBtn) {
    shopNowBtn.onclick = scrollToProducts;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
