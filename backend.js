const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 5500);
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
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
const sessions = new Map();

function loadStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: [], orders: [] }; }
}

let store = loadStore();
if (!Array.isArray(store.users)) store.users = [];
if (!Array.isArray(store.orders)) store.orders = [];

function saveStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
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

function currentUser(request) {
  const session = sessions.get(parseCookies(request).mineglow_session);
  return session ? (session.user || store.users.find(user => user.id === session.userId)) : null;
}

function normalizeUser(user) {
  return user && user.password_hash ? { ...user, passwordHash: user.password_hash } : user;
}

function publicUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null;
}

function setSession(response, userId, user = null) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, user, createdAt: Date.now() });
  response.setHeader('Set-Cookie', `mineglow_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

function requireUser(request, response) {
  const user = currentUser(request);
  if (!user) { sendJson(response, 401, { error: 'Please sign in first' }); return null; }
  return user;
}

async function saveOrder(userId, order) {
  if (!userId) return;
  if (USE_SUPABASE) return persistSupabaseOrder(userId, order);
  store.orders.push({ ...order, userId, status: order.status || 'Order received', createdAt: new Date().toISOString() });
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
  await supabaseRequest('order_items', { method: 'POST', body: JSON.stringify(order.cart.map(item => ({
    order_id: saved.id, product_id: item.id, product_name: item.name, price: item.price, quantity: item.qty
  }))) });
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
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
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
      sessions.delete(parseCookies(request).mineglow_session);
      response.setHeader('Set-Cookie', 'mineglow_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return sendJson(response, 200, { loggedOut: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const user = currentUser(request);
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === 'GET' && url.pathname === '/api/orders') {
      const user = requireUser(request, response);
      if (!user) return;
      const orders = USE_SUPABASE ? (await supabaseRequest(`orders?select=order_id,payment_method,status,grand_total,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`)).map(order => ({ orderId: order.order_id, paymentMethod: order.payment_method, status: order.status, grandTotal: order.grand_total, createdAt: order.created_at })) : store.orders.filter(order => order.userId === user.id).map(({ userId, ...order }) => order).reverse();
      return sendJson(response, 200, { orders });
    }

    if (request.method === 'POST' && url.pathname === '/api/create-order') {
      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return sendJson(response, 503, { error: 'Razorpay server configuration is missing' });
      const user = requireUser(request, response);
      if (!user) return;
      const data = await readJson(request);
      if (data.paymentMethod !== 'Razorpay') return sendJson(response, 400, { error: 'Unsupported payment method' });
      const totals = calculateOrder(data.items, data.paymentMethod);
      const order = await createRazorpayOrder(totals.grandTotal, `mg_${Date.now()}`);
      pendingOrders.set(order.id, { ...totals, userId: user.id, name: String(data.name || '').trim(), phone: String(data.phone || '').trim(), address: String(data.address || '').trim(), notes: String(data.notes || '').trim() });
      return sendJson(response, 200, { keyId: RAZORPAY_KEY_ID, razorpayOrderId: order.id, ...totals });
    }

    if (request.method === 'POST' && url.pathname === '/api/cod-order') {
      const user = requireUser(request, response);
      if (!user) return;
      const data = await readJson(request);
      const totals = calculateOrder(data.items, 'Cash on Delivery (COD)');
      const orderId = `MG-${Date.now().toString().slice(-8)}`;
      await saveOrder(user.id, { orderId, paymentMethod: 'Cash on Delivery (COD)', ...totals, name: String(data.name || '').trim(), phone: String(data.phone || '').trim(), address: String(data.address || '').trim(), notes: String(data.notes || '').trim() });
      return sendJson(response, 200, { orderId, ...totals });
    }

    if (request.method === 'POST' && url.pathname === '/api/verify-payment') {
      const data = await readJson(request);
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = data;
      if (!orderId || !paymentId || !signature) return sendJson(response, 400, { error: 'Incomplete payment response' });
      if (!pendingOrders.has(orderId)) return sendJson(response, 400, { error: 'Unknown or expired payment order' });
      const pending = pendingOrders.get(orderId);
      if (pending.userId && pending.userId !== currentUser(request)?.id) return sendJson(response, 403, { error: 'Payment session does not match order session' });
      const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return sendJson(response, 400, { error: 'Payment signature verification failed' });
      const totals = pendingOrders.get(orderId);
      pendingOrders.delete(orderId);
      await saveOrder(totals.userId, { orderId, paymentMethod: 'Razorpay', paymentId, ...totals });
      return sendJson(response, 200, { verified: true, paymentId, ...totals });
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
