try { require('dotenv').config(); } catch (e) {}
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) {}

const PORT = Number(process.env.PORT || 5500);
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const SESSION_SECRET = (process.env.SESSION_SECRET || 'mineglow-secret-session-key-2026').trim();

// Email Configuration (Supports SMTP / Gmail & Resend API)
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const SMTP_USER = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
const SMTP_PASS = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || '').trim();
const SMTP_HOST = (process.env.SMTP_HOST || (SMTP_USER.endsWith('@gmail.com') ? 'smtp.gmail.com' : '')).trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || (SMTP_HOST === 'smtp.gmail.com' ? 465 : 587));
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : SMTP_PORT === 465;

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'gauravsharma2000gk@gmail.com').trim();
const EMAIL_FROM = (process.env.EMAIL_FROM || (SMTP_USER ? `Mine Glow Organics <${SMTP_USER}>` : 'Mine Glow Organics <gauravsharma2000gk@gmail.com>')).trim();

const ROOT = __dirname;
const FREE_SHIPPING_THRESHOLD = 99900;
const PREPAID_DELIVERY_FEE = 3900;
const COD_DELIVERY_FEE = 5900;
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'mineglow-data') : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const PRODUCTS = new Map([
  ['mg-15', { name: 'Night Cream — 15 g', price: 49900, img: 'assets/01_front_product.jpg' }],
  ['mg-30', { name: 'Night Cream — 30 g', price: 89900, img: 'assets/03_box_and_jar.jpg' }],
  ['mg-50', { name: 'Night Cream — 50 g', price: 134900, img: 'assets/04_candlelit_product.jpg' }]
]);
const pendingOrders = new Map();

function loadStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: [], orders: [] }; }
}

let store = loadStore();
if (!Array.isArray(store.users)) store.users = [];
if (!Array.isArray(store.orders)) store.orders = [];

function saveStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.renameSync(temp, DATA_FILE);
  } catch (err) {
    console.warn('Store save notice:', err.message);
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(`${salt}:${derived.toString('hex')}`)));
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual.split(':')[1], 'hex'), Buffer.from(expected, 'hex'));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(cookie => {
    const index = cookie.indexOf('=');
    return [cookie.slice(0, index).trim(), decodeURIComponent(cookie.slice(index + 1))];
  }));
}

async function currentUser(request) {
  const token = parseCookies(request).mineglow_session;
  if (!SESSION_SECRET || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!session.userId || session.expiresAt < Date.now()) return null;
    return USE_SUPABASE ? await findSupabaseUser(`id=eq.${encodeURIComponent(session.userId)}`) : store.users.find(user => user.id === session.userId) || null;
  } catch { return null; }
}

function normalizeUser(user) {
  return user && user.password_hash ? { ...user, passwordHash: user.password_hash } : user;
}

function publicUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null;
}

function setSession(response, userId, user = null) {
  const encoded = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 604800000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  response.setHeader('Set-Cookie', `mineglow_session=${encoded}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.VERCEL ? '; Secure' : ''}`);
}

async function requireUser(request, response) {
  const user = await currentUser(request);
  if (!user) { sendJson(response, 401, { error: 'Please sign in first' }); return null; }
  return user;
}

async function saveOrder(userId, order) {
  if (!userId) return;
  if (USE_SUPABASE) return persistSupabaseOrder(userId, order);
  store.orders.push({ ...order, userId, status: order.status || 'Order received', createdAt: order.createdAt || new Date().toISOString() });
  saveStore();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function supabaseRequest(table, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.method === 'POST' ? 'return=representation' : undefined,
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

async function findSupabaseUser(filter) {
  const rows = await supabaseRequest(`users?select=*&${filter}`);
  return normalizeUser(rows[0] || null);
}

async function persistSupabaseOrder(userId, order) {
  const rows = await supabaseRequest('orders', { method: 'POST', body: JSON.stringify({
    user_id: userId, order_id: order.orderId, razorpay_order_id: order.razorpayOrderId || null,
    razorpay_payment_id: order.paymentId || null, payment_method: order.paymentMethod,
    status: order.status || 'Order received', subtotal: order.subtotal, delivery_fee: order.deliveryFee,
    grand_total: order.grandTotal, name: order.name, phone: order.phone, address: order.address, notes: order.notes || null
  }) });
  const saved = rows[0];
  if (saved && Array.isArray(order.cart)) {
    await supabaseRequest('order_items', { method: 'POST', body: JSON.stringify(order.cart.map(item => ({
      order_id: saved.id, product_id: item.id, product_name: item.name, price: item.price, quantity: item.qty
    }))) });
  }
}

function escapeEmailHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function formatRupees(paise) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ==========================================================================
// Multi-Provider Email Delivery (SMTP / Gmail & Resend)
// ==========================================================================

let smtpTransporter = null;
function getSmtpTransporter() {
  if (!nodemailer || !SMTP_USER || !SMTP_PASS) return null;
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }
  return smtpTransporter;
}

async function sendEmail(to, subject, html, text = '') {
  if (!to || !to.includes('@')) {
    console.warn('[EMAIL SKIP] Invalid recipient email address:', to);
    return { ok: false, error: 'Invalid recipient email address' };
  }

  const transporter = getSmtpTransporter();

  // Option 1: SMTP / Gmail
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: EMAIL_FROM,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      });
      console.log(`[EMAIL SUCCESS - SMTP] Sent "${subject}" to ${to} (MessageId: ${info.messageId})`);
      return { ok: true, provider: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error(`[EMAIL ERROR - SMTP] Failed sending to ${to}:`, err.message);
      return { ok: false, provider: 'smtp', error: err.message };
    }
  }

  // Option 2: Resend API
  if (RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [to],
          subject,
          html,
          text: text || undefined
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        let errorMsg = data.message || `Resend HTTP ${response.status}`;
        if (data.statusCode === 403 || errorMsg.includes('testing emails') || errorMsg.includes('onboarding@resend.dev')) {
          errorMsg = `Resend sandbox limit: With onboarding@resend.dev, emails can only be sent to the registered Resend account address. To send to all customer email IDs, configure Gmail SMTP (SMTP_USER, SMTP_PASS) or verify your custom domain in Resend.`;
        }
        console.error(`[EMAIL ERROR - Resend] Failed sending to ${to}:`, errorMsg);
        return { ok: false, provider: 'resend', error: errorMsg, raw: data };
      }

      console.log(`[EMAIL SUCCESS - Resend] Sent "${subject}" to ${to} (ID: ${data.id})`);
      return { ok: true, provider: 'resend', id: data.id };
    } catch (err) {
      console.error(`[EMAIL ERROR - Resend Network] Failed sending to ${to}:`, err.message);
      return { ok: false, provider: 'resend', error: err.message };
    }
  }

  const warning = 'No email provider configured. Please set SMTP credentials (SMTP_USER, SMTP_PASS) or RESEND_API_KEY.';
  console.warn(`[EMAIL SKIPPED] ${warning}`);
  return { ok: false, provider: 'none', error: warning };
}

// ==========================================================================
// Luxury Responsive Email Templates
// ==========================================================================

function customerOrderEmailHtml(order) {
  const itemsHtml = (order.cart || []).map(item => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0e6e8;">
        <strong style="color:#2b1b1f;font-size:15px;display:block;">${escapeEmailHtml(item.name)}</strong>
        <span style="color:#7a6268;font-size:13px;">Qty: ${item.qty} × ${formatRupees(item.price)}</span>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f0e6e8;text-align:right;font-weight:600;color:#2b1b1f;font-size:15px;">
        ${formatRupees(item.price * item.qty)}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Order Confirmation #${escapeEmailHtml(order.orderId)}</title>
</head>
<body style="margin:0;padding:0;background-color:#faf6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b1b1f;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#faf6f5;padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(139,58,79,0.08);border:1px solid #f4e8eb;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg, #4A1224 0%, #8B3A4F 100%);padding:36px 30px;text-align:center;color:#ffffff;">
              <div style="font-size:24px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#F6D38B;margin-bottom:6px;">Mine Glow</div>
              <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#e8c7ce;">ORGANICS</div>
              <h1 style="margin:20px 0 6px;font-size:22px;font-weight:600;color:#ffffff;">✨ Order Confirmed!</h1>
              <p style="margin:0;font-size:14px;color:#fcecee;">Order #${escapeEmailHtml(order.orderId)}</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:32px 30px;">
              <p style="font-size:16px;color:#2b1b1f;margin-top:0;">Hello <strong>${escapeEmailHtml(order.name || 'Valued Customer')}</strong>,</p>
              <p style="font-size:14px;color:#5c474d;line-height:1.6;">
                Thank you for your order with <strong>Mine Glow Organics</strong>! We have received your order and our skincare artisans are preparing your pure cold-pressed botanical cream for dispatch.
              </p>

              <!-- Order Info Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fcf8f9;border-radius:12px;padding:16px 20px;margin:24px 0;border:1px solid #f2e2e6;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#7a6268;width:40%;">Order ID:</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:700;color:#8B3A4F;">#${escapeEmailHtml(order.orderId)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#7a6268;">Payment Method:</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:600;color:#2b1b1f;">${escapeEmailHtml(order.paymentMethod)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#7a6268;">Estimated Delivery:</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:600;color:#2E7D32;">2–4 Business Days 🚚</td>
                </tr>
              </table>

              <!-- Itemized Table -->
              <h3 style="font-size:16px;color:#2b1b1f;margin:24px 0 12px;border-bottom:2px solid #8B3A4F;padding-bottom:8px;">Order Summary</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                ${itemsHtml}
              </table>

              <!-- Totals -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#7a6268;">Subtotal:</td>
                  <td style="padding:6px 0;font-size:14px;text-align:right;color:#2b1b1f;">${formatRupees(order.subtotal)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#7a6268;">Delivery:</td>
                  <td style="padding:6px 0;font-size:14px;text-align:right;color:${order.deliveryFee === 0 ? '#2E7D32' : '#2b1b1f'};font-weight:${order.deliveryFee === 0 ? '700' : 'normal'};">
                    ${order.deliveryFee === 0 ? 'FREE' : formatRupees(order.deliveryFee)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0 6px;font-size:16px;font-weight:700;color:#2b1b1f;border-top:2px dashed #f0e6e8;">Total Amount:</td>
                  <td style="padding:12px 0 6px;font-size:18px;font-weight:700;text-align:right;color:#8B3A4F;border-top:2px dashed #f0e6e8;">${formatRupees(order.grandTotal)}</td>
                </tr>
              </table>

              <!-- Delivery Address Box -->
              <div style="background-color:#fbf8f7;border-radius:12px;padding:18px 20px;margin:28px 0 16px;border-left:4px solid #8B3A4F;">
                <h4 style="margin:0 0 8px;font-size:14px;color:#8B3A4F;text-transform:uppercase;letter-spacing:1px;">Delivery Address</h4>
                <p style="margin:0;font-size:14px;color:#2b1b1f;line-height:1.5;">
                  <strong>${escapeEmailHtml(order.name)}</strong><br>
                  ${escapeEmailHtml(order.address)}<br>
                  <strong>Phone:</strong> ${escapeEmailHtml(order.phone)}
                  ${order.notes ? `<br><strong>Instructions:</strong> ${escapeEmailHtml(order.notes)}` : ''}
                </p>
              </div>

              <!-- Customer Support Help -->
              <p style="font-size:13px;color:#7a6268;margin-top:24px;text-align:center;">
                Need help or want to track your order? WhatsApp us directly at <a href="https://wa.me/917042403063" style="color:#8B3A4F;font-weight:600;text-decoration:none;">+91 7042403063</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#2b1b1f;padding:24px 30px;text-align:center;color:#bca5ab;font-size:12px;">
              <p style="margin:0 0 8px;color:#e8c7ce;font-weight:600;">Mine Glow Organics • Pure Cold-Pressed Botanicals</p>
              <p style="margin:0;color:#9c858c;">100% Organic • Cruelty Free • Dermatologically Approved</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function ownerOrderEmailHtml(order) {
  const items = (order.cart || []).map(i => `<li><strong>${escapeEmailHtml(i.name)}</strong> × ${i.qty} — ${formatRupees(i.price * i.qty)}</li>`).join('');
  return `
    <h2>🛍️ New Order #${escapeEmailHtml(order.orderId)}</h2>
    <p><strong>Total:</strong> ${formatRupees(order.grandTotal)} | <strong>Payment:</strong> ${escapeEmailHtml(order.paymentMethod)} (${escapeEmailHtml(order.status || 'Received')})</p>
    <h3>Customer Details</h3>
    <p>
      <strong>Name:</strong> ${escapeEmailHtml(order.name)}<br>
      <strong>Email:</strong> ${escapeEmailHtml(order.email || 'Not provided')}<br>
      <strong>Phone:</strong> <a href="tel:${escapeEmailHtml(order.phone)}">${escapeEmailHtml(order.phone)}</a><br>
      <strong>Delivery Address:</strong> ${escapeEmailHtml(order.address)}<br>
      ${order.notes ? `<strong>Notes:</strong> ${escapeEmailHtml(order.notes)}<br>` : ''}
      ${order.paymentId ? `<strong>Razorpay Payment ID:</strong> ${escapeEmailHtml(order.paymentId)}<br>` : ''}
    </p>
    <h3>Items Ordered</h3>
    <ul>${items}</ul>
    <p>
      <strong>Subtotal:</strong> ${formatRupees(order.subtotal)}<br>
      <strong>Delivery Fee:</strong> ${formatRupees(order.deliveryFee)}<br>
      <strong>Grand Total:</strong> ${formatRupees(order.grandTotal)}
    </p>
  `;
}

function welcomeEmailHtml(user) {
  return `
    <h2>Welcome to Mine Glow Organics, ${escapeEmailHtml(user.name)}! ✨</h2>
    <p>Your account has been created successfully.</p>
    <p>You can now sign in, browse our organic botanical night creams, and view your order history anytime.</p>
    <p><a href="https://www.mineglow.in" style="background:#8B3A4F;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:10px;">Visit Store ➔</a></p>
  `;
}

function ownerRegistrationEmailHtml(user) {
  return `
    <h2>New Customer Registration</h2>
    <p>
      <strong>Name:</strong> ${escapeEmailHtml(user.name)}<br>
      <strong>Email:</strong> ${escapeEmailHtml(user.email)}<br>
      <strong>Phone:</strong> ${escapeEmailHtml(user.phone || 'Not provided')}
    </p>
  `;
}

async function notifyRegistration(user) {
  const userEmail = String(user.email || '').trim();
  const ownerEmail = OWNER_EMAIL;
  console.log(`[REGISTRATION] Notifying user: ${userEmail}, owner: ${ownerEmail}`);

  if (userEmail && userEmail.includes('@')) {
    sendEmail(userEmail, 'Welcome to Mine Glow Organics ✨', welcomeEmailHtml(user)).catch(e => console.warn('User welcome email error:', e.message));
  }
  if (ownerEmail && ownerEmail.includes('@')) {
    sendEmail(ownerEmail, `New customer registration: ${user.name}`, ownerRegistrationEmailHtml(user)).catch(e => console.warn('Owner alert email error:', e.message));
  }
}

async function notifyOrder(order) {
  const customerEmail = String(order.email || '').trim();
  const ownerEmail = OWNER_EMAIL;

  console.log(`[ORDER NOTIFICATION] Dispatching notifications for Order #${order.orderId} (Customer: ${customerEmail || 'NONE'}, Owner: ${ownerEmail || 'NONE'})`);

  const results = {};

  // 1. Dispatch Customer Order Confirmation
  if (customerEmail && customerEmail.includes('@')) {
    try {
      results.customer = await sendEmail(
        customerEmail,
        `Order Confirmed #${order.orderId} — Mine Glow Organics`,
        customerOrderEmailHtml(order)
      );
    } catch (err) {
      results.customer = { ok: false, error: err.message };
      console.error(`[CUSTOMER EMAIL FAILED] Order #${order.orderId}:`, err.message);
    }
  } else {
    results.customer = { ok: false, error: 'No customer email address provided' };
    console.warn(`[CUSTOMER EMAIL SKIPPED] No valid email for Order #${order.orderId}`);
  }

  // 2. Dispatch Store Owner Alert
  if (ownerEmail && ownerEmail.includes('@')) {
    try {
      results.owner = await sendEmail(
        ownerEmail,
        `🛍️ New Order #${order.orderId} - ${formatRupees(order.grandTotal)} (${order.paymentMethod})`,
        ownerOrderEmailHtml(order)
      );
    } catch (err) {
      results.owner = { ok: false, error: err.message };
      console.error(`[OWNER EMAIL FAILED] Order #${order.orderId}:`, err.message);
    }
  }

  return results;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 100000) reject(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function calculateOrder(items, paymentMethod) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw new Error('Cart is empty or invalid');
  }
  let subtotal = 0;
  const cart = items.map(item => {
    const product = PRODUCTS.get(item && item.id);
    const qty = Number.isInteger(item && item.qty) ? item.qty : 0;
    if (!product || qty < 1 || qty > 99) throw new Error('Invalid product or quantity');
    subtotal += product.price * qty;
    return { id: item.id, name: product.name, price: product.price, img: product.img, qty };
  });
  const deliveryFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : paymentMethod === 'Razorpay' ? PREPAID_DELIVERY_FEE : COD_DELIVERY_FEE;
  return { cart, subtotal, deliveryFee, grandTotal: subtotal + deliveryFee };
}

async function createRazorpayOrder(amount, receipt) {
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR', receipt, payment_capture: 1 })
  });
  if (!response.ok) throw new Error(`Razorpay order creation failed (${response.status})`);
  return response.json();
}

function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) return sendJson(response, 403, { error: 'Forbidden' });
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(response, 404, { error: 'Not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    // Health and Configuration Check Endpoint
    if (request.method === 'GET' && url.pathname === '/api/health') {
      const activeProvider = getSmtpTransporter() ? 'smtp' : (RESEND_API_KEY ? 'resend' : 'none');
      return sendJson(response, 200, {
        ok: true,
        emailService: {
          activeProvider,
          smtpConfigured: Boolean(SMTP_USER && SMTP_PASS),
          resendConfigured: Boolean(RESEND_API_KEY),
          emailFrom: EMAIL_FROM,
          ownerEmail: OWNER_EMAIL
        },
        razorpayConfigured: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
        supabaseConfigured: USE_SUPABASE,
        sessionConfigured: Boolean(SESSION_SECRET)
      });
    }

    // Diagnostic Test Email Endpoint: /api/test-email?to=your_email@gmail.com
    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/test-email') {
      let to = url.searchParams.get('to');
      if (!to && request.method === 'POST') {
        const data = await readJson(request).catch(() => ({}));
        to = data.to;
      }
      to = (to || OWNER_EMAIL || '').trim();
      if (!to || !to.includes('@')) {
        return sendJson(response, 400, {
          ok: false,
          error: 'Please provide a valid recipient email via ?to=your_email@domain.com or {"to": "your_email@domain.com"}'
        });
      }

      const sampleOrder = {
        orderId: `MG-TEST-${Date.now().toString().slice(-4)}`,
        paymentMethod: 'Prepaid (Razorpay)',
        name: 'Test Customer',
        email: to,
        phone: '+91 9876543210',
        address: 'Flat 402, Lotus Residency, Mumbai, Maharashtra 400050',
        notes: 'Test email confirmation dispatch',
        subtotal: 89900,
        deliveryFee: 0,
        grandTotal: 89900,
        cart: [
          { id: 'mg-30', name: 'Night Cream — 30 g (Daily Ritual)', price: 89900, qty: 1 }
        ]
      };

      const result = await sendEmail(
        to,
        '🧪 Test Order Confirmation — Mine Glow Organics',
        customerOrderEmailHtml(sampleOrder)
      );

      const activeProvider = getSmtpTransporter() ? 'smtp' : (RESEND_API_KEY ? 'resend' : 'none');

      return sendJson(response, result.ok ? 200 : 500, {
        ok: result.ok,
        recipient: to,
        activeProvider,
        smtpConfigured: Boolean(SMTP_USER && SMTP_PASS),
        resendConfigured: Boolean(RESEND_API_KEY),
        emailFrom: EMAIL_FROM,
        ownerEmail: OWNER_EMAIL,
        result,
        message: result.ok
          ? `Order confirmation test email successfully sent to ${to}!`
          : `Failed to deliver email: ${result.error}`
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/register') {
      const data = await readJson(request);
      const name = String(data.name || '').trim();
      const email = String(data.email || '').trim().toLowerCase();
      const phone = String(data.phone || '').trim();
      const password = String(data.password || '');
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (phone && !/^\+?[0-9]{10,15}$/.test(phone)) || password.length < 8) return sendJson(response, 400, { error: 'Enter a valid name, email, phone number, and password of at least 8 characters' });
      if (USE_SUPABASE ? await findSupabaseUser(`email=eq.${encodeURIComponent(email)}`) : store.users.some(user => user.email === email)) return sendJson(response, 409, { error: 'An account with this email already exists' });
      const user = { id: crypto.randomUUID(), name, email, phone, passwordHash: await hashPassword(password) };
      if (USE_SUPABASE) {
        const rows = await supabaseRequest('users', { method: 'POST', body: JSON.stringify({ id: user.id, name, email, phone, password_hash: user.passwordHash }) });
        user.id = rows[0].id;
      } else { store.users.push(user); saveStore(); }
      setSession(response, user.id, user);
      try { await notifyRegistration(user); } catch (error) { console.warn('Registration email failed:', error.message); }
      return sendJson(response, 201, { user: publicUser(user) });
    }

    if (request.method === 'POST' && url.pathname === '/api/login') {
      const data = await readJson(request);
      const email = String(data.email || '').trim().toLowerCase();
      const user = USE_SUPABASE ? await findSupabaseUser(`email=eq.${encodeURIComponent(email)}`) : store.users.find(item => item.email === email);
      if (!user || !(await verifyPassword(String(data.password || ''), user.passwordHash))) return sendJson(response, 401, { error: 'Email or password is incorrect' });
      setSession(response, user.id, user);
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === 'POST' && url.pathname === '/api/forgot-password') {
      const data = await readJson(request);
      const email = String(data.email || '').trim().toLowerCase();
      const user = USE_SUPABASE ? await findSupabaseUser(`email=eq.${encodeURIComponent(email)}`) : store.users.find(item => item.email === email);
      const responseBody = { message: 'If an account exists for that email, a reset link has been sent.' };
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        user.resetTokenHash = hashToken(token);
        user.resetTokenExpires = Date.now() + 15 * 60 * 1000;
        if (USE_SUPABASE) await supabaseRequest(`users?id=eq.${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ reset_token_hash: user.resetTokenHash, reset_token_expires: new Date(user.resetTokenExpires).toISOString() }) });
        else saveStore();
        const resetUrl = `http://localhost:${PORT}/?reset=${token}`;
        console.log(`Password reset link for ${email}: ${resetUrl}`);
        if (process.env.NODE_ENV !== 'production') responseBody.devResetUrl = resetUrl;
      }
      return sendJson(response, 200, responseBody);
    }

    if (request.method === 'POST' && url.pathname === '/api/reset-password') {
      const data = await readJson(request);
      const token = String(data.token || '');
      const password = String(data.password || '');
      const user = USE_SUPABASE ? await findSupabaseUser(`reset_token_hash=eq.${hashToken(token)}&reset_token_expires=gt.${encodeURIComponent(new Date().toISOString())}`) : store.users.find(item => item.resetTokenHash === hashToken(token) && item.resetTokenExpires > Date.now());
      if (!user || password.length < 8) return sendJson(response, 400, { error: 'This reset link is invalid or expired' });
      user.passwordHash = await hashPassword(password);
      delete user.resetTokenHash;
      delete user.resetTokenExpires;
      if (USE_SUPABASE) await supabaseRequest(`users?id=eq.${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ password_hash: user.passwordHash, reset_token_hash: null, reset_token_expires: null }) });
      else saveStore();
      setSession(response, user.id, user);
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === 'POST' && url.pathname === '/api/logout') {
      response.setHeader('Set-Cookie', 'mineglow_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return sendJson(response, 200, { loggedOut: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const user = await currentUser(request);
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === 'GET' && url.pathname === '/api/orders') {
      const user = await requireUser(request, response);
      if (!user) return;
      const orders = USE_SUPABASE ? (await supabaseRequest(`orders?select=order_id,payment_method,status,grand_total,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`)).map(order => ({ orderId: order.order_id, paymentMethod: order.payment_method, status: order.status, grandTotal: order.grand_total, createdAt: order.created_at })) : store.orders.filter(order => order.userId === user.id).map(({ userId, ...order }) => order).reverse();
      return sendJson(response, 200, { orders });
    }

    if (request.method === 'POST' && url.pathname === '/api/create-order') {
      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return sendJson(response, 503, { error: 'Razorpay server configuration is missing' });
      const user = await currentUser(request);
      const data = await readJson(request);
      if (data.paymentMethod !== 'Razorpay') return sendJson(response, 400, { error: 'Unsupported payment method' });
      const totals = calculateOrder(data.items, data.paymentMethod);
      const email = String(data.email || (user ? user.email : '')).trim().toLowerCase();
      const order = await createRazorpayOrder(totals.grandTotal, `mg_${Date.now()}`);
      pendingOrders.set(order.id, {
        ...totals,
        userId: user ? user.id : null,
        email,
        name: String(data.name || '').trim(),
        phone: String(data.phone || '').trim(),
        address: String(data.address || '').trim(),
        notes: String(data.notes || '').trim()
      });
      return sendJson(response, 200, { keyId: RAZORPAY_KEY_ID, razorpayOrderId: order.id, ...totals });
    }

    if (request.method === 'POST' && url.pathname === '/api/cod-order') {
      const user = await currentUser(request);
      const data = await readJson(request);
      const totals = calculateOrder(data.items, 'Cash on Delivery (COD)');
      const orderId = `MG-${Date.now().toString().slice(-8)}`;
      const email = String(data.email || (user ? user.email : '')).trim().toLowerCase();
      const name = String(data.name || (user ? user.name : '')).trim();
      const phone = String(data.phone || (user ? user.phone : '')).trim();
      const address = String(data.address || '').trim();
      const notes = String(data.notes || '').trim();

      const savedOrder = {
        orderId,
        paymentMethod: 'Cash on Delivery (COD)',
        status: 'Order received',
        ...totals,
        email,
        name,
        phone,
        address,
        notes,
        createdAt: new Date().toISOString()
      };

      if (user) {
        await saveOrder(user.id, savedOrder);
      } else {
        store.orders.push({ ...savedOrder, userId: null });
        saveStore();
      }

      let emailResults = null;
      try {
        emailResults = await notifyOrder(savedOrder);
      } catch (error) {
        console.error('Order email notification error:', error.message);
      }

      return sendJson(response, 200, {
        orderId,
        email,
        emailDispatched: Boolean(emailResults?.customer?.ok),
        ...totals
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/verify-payment') {
      const data = await readJson(request);
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = data;
      if (!orderId || !paymentId || !signature) return sendJson(response, 400, { error: 'Incomplete payment response' });
      if (!pendingOrders.has(orderId)) return sendJson(response, 400, { error: 'Unknown or expired payment order' });
      const pending = pendingOrders.get(orderId);
      const user = await currentUser(request);
      if (pending.userId && user && pending.userId !== user.id) return sendJson(response, 403, { error: 'Payment session does not match order session' });
      const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return sendJson(response, 400, { error: 'Payment signature verification failed' });
      const totals = pendingOrders.get(orderId);
      pendingOrders.delete(orderId);
      const savedOrder = {
        orderId,
        paymentMethod: 'Razorpay',
        paymentId,
        status: 'Payment verified',
        ...totals,
        createdAt: new Date().toISOString()
      };

      if (totals.userId) {
        await saveOrder(totals.userId, savedOrder);
      } else {
        store.orders.push({ ...savedOrder, userId: null });
        saveStore();
      }

      let emailResults = null;
      try {
        emailResults = await notifyOrder(savedOrder);
      } catch (error) {
        console.error('Order email notification error:', error.message);
      }

      return sendJson(response, 200, {
        verified: true,
        paymentId,
        emailDispatched: Boolean(emailResults?.customer?.ok),
        ...totals
      });
    }

    if (request.method === 'GET') return serveStatic(request, response, url.pathname);
    return sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error.message);
    return sendJson(response, 400, { error: error.message || 'Request failed' });
  }
}

module.exports = handler;

if (require.main === module) {
  http.createServer(handler).listen(PORT, () => console.log(`Mine Glow server running at http://localhost:${PORT}`));
}
