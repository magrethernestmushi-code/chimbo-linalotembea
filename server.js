const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Data directory setup (supports a Render persistent disk) ----------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SEED_DIR = path.join(__dirname, 'seed-data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const file of ['products.json', 'orders.json', 'settings.json']) {
    const dest = path.join(DATA_DIR, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(SEED_DIR, file), dest);
    }
  }
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
ensureDataDir();

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}
function writeJSON(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2));
}

// ---------- Admin credentials (set on Render as environment variables) ----------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set. Using an insecure default. Set ADMIN_USERNAME and ADMIN_PASSWORD as environment variables on Render.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ---------- Middleware ----------
app.use(express.json({ limit: '5mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12 hours
}));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ---------- Image upload (admin) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

function priceRange(variants) {
  const prices = (variants || []).map(v => v.price).filter(p => typeof p === 'number');
  if (prices.length === 0) return { priceMin: null, priceMax: null };
  return { priceMin: Math.min(...prices), priceMax: Math.max(...prices) };
}

// ---------- Optional: email a notification for every new order ----------
// Set NOTIFY_EMAIL_USER + NOTIFY_EMAIL_PASS (a Gmail address + App Password
// work well) as environment variables on Render to turn this on. Orders still
// save fine even if this isn't configured or a send fails.
let mailTransporter = null;
if (process.env.NOTIFY_EMAIL_USER && process.env.NOTIFY_EMAIL_PASS) {
  const nodemailer = require('nodemailer');
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: process.env.NOTIFY_EMAIL_USER, pass: process.env.NOTIFY_EMAIL_PASS }
  });
}

async function notifyNewOrder(order) {
  if (!mailTransporter) return;
  const to = process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER;
  const itemLines = order.items.map(it => `  • ${it.name} (${it.variantLabel}) x${it.qty} — Tsh ${it.lineTotal.toLocaleString('en-US')}`).join('\n');
  const mapsLink = order.location ? `https://www.google.com/maps/dir/?api=1&destination=${order.location.lat},${order.location.lng}` : null;
  const text = [
    `Oda mpya: ${order.id}`,
    `Mteja: ${order.customerName} — ${order.phone}`,
    order.address ? `Eneo (maneno): ${order.address}` : null,
    mapsLink ? `Mahali (GPS): ${mapsLink}` : 'Mteja hakushiriki mahali (GPS).',
    order.notes ? `Maelezo: ${order.notes}` : null,
    '',
    'Bidhaa:',
    itemLines,
    '',
    `Jumla: Tsh ${order.total.toLocaleString('en-US')}`
  ].filter(Boolean).join('\n');
  await mailTransporter.sendMail({
    from: `"Chimbo Linalotembea" <${process.env.NOTIFY_EMAIL_USER}>`,
    to,
    subject: `Oda Mpya ${order.id} — Tsh ${order.total.toLocaleString('en-US')}`,
    text
  });
}

// =====================================================================
// PUBLIC API
// =====================================================================

app.get('/api/settings', (req, res) => {
  res.json(readJSON('settings.json'));
});

const CATEGORY_ORDER = [
  'MWANGA (Lighting)', 'Vifaa vya Umeme (Electrical)', 'Power & Extensions',
  'Ulinzi wa Vifaa (Safety)', 'Tech & Home'
];

app.get('/api/categories', (req, res) => {
  const products = readJSON('products.json').filter(p => p.active !== false);
  const present = new Set(products.map(p => p.category));
  const cats = CATEGORY_ORDER.filter(c => present.has(c));
  for (const c of present) if (!cats.includes(c)) cats.push(c);
  res.json(cats);
});

app.get('/api/products', (req, res) => {
  let products = readJSON('products.json').filter(p => p.active !== false);
  const { category, q } = req.query;
  if (category && category !== 'All') {
    products = products.filter(p => p.category === category);
  }
  if (q && q.trim() !== '') {
    const needle = q.trim().toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(needle) ||
      (p.subcategory || '').toLowerCase().includes(needle) ||
      (p.variants || []).some(v => v.label.toLowerCase().includes(needle))
    );
  }
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const products = readJSON('products.json');
  const product = products.find(p => String(p.id) === String(req.params.id));
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

app.post('/api/orders', (req, res) => {
  const { customerName, phone, address, notes, items, location } = req.body || {};
  if (!customerName || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Jina, namba ya simu na angalau bidhaa moja zinahitajika.' });
  }
  const products = readJSON('products.json');
  const orderItems = [];
  let total = 0;
  for (const it of items) {
    const product = products.find(p => String(p.id) === String(it.id));
    if (!product) continue;
    const variant = (product.variants || [])[it.variantIndex];
    if (!variant) continue;
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    const lineTotal = variant.price * qty;
    total += lineTotal;
    orderItems.push({
      id: product.id,
      name: product.name,
      variantLabel: variant.label,
      image: product.image,
      price: variant.price,
      qty,
      lineTotal
    });
  }
  if (orderItems.length === 0) {
    return res.status(400).json({ error: 'Bidhaa zilizochaguliwa hazikupatikana.' });
  }
  let cleanLocation = null;
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    cleanLocation = { lat: location.lat, lng: location.lng };
  }
  const orders = readJSON('orders.json');
  const order = {
    id: 'CL' + Date.now().toString(36).toUpperCase(),
    createdAt: new Date().toISOString(),
    customerName,
    phone,
    address: address || '',
    notes: notes || '',
    location: cleanLocation,
    items: orderItems,
    total,
    status: 'new'
  };
  orders.unshift(order);
  writeJSON('orders.json', orders);
  notifyNewOrder(order).catch(err => console.error('Order notification failed:', err.message));
  res.json({ ok: true, order });
});

// =====================================================================
// ADMIN AUTH
// =====================================================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Jina la mtumiaji au password si sahihi.' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// =====================================================================
// ADMIN: PRODUCTS
// =====================================================================

app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(readJSON('products.json'));
});

function parseVariants(body) {
  let variants = [];
  if (body.variantsJson) {
    try {
      const raw = JSON.parse(body.variantsJson);
      variants = raw
        .filter(v => v && v.label && v.price !== '' && v.price != null)
        .map(v => ({ label: String(v.label).trim(), price: Number(v.price), note: (v.note || '').trim() }))
        .filter(v => Number.isFinite(v.price));
    } catch (e) { /* ignore malformed */ }
  }
  return variants;
}

app.post('/api/admin/products', requireAdmin, upload.single('image'), (req, res) => {
  const products = readJSON('products.json');
  const { name, category, subcategory } = req.body;
  const variants = parseVariants(req.body);
  if (!name || !category || variants.length === 0) {
    return res.status(400).json({ error: 'Jina, kundi (category), na angalau bei moja (variant) vinahitajika.' });
  }
  const nextId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
  const { priceMin, priceMax } = priceRange(variants);
  const product = {
    id: nextId,
    category,
    subcategory: subcategory || '',
    name,
    variants,
    priceMin,
    priceMax,
    image: req.file ? `/uploads/${req.file.filename}` : '/images/logo.png',
    active: true
  };
  products.push(product);
  writeJSON('products.json', products);
  res.json({ ok: true, product });
});

app.put('/api/admin/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const products = readJSON('products.json');
  const idx = products.findIndex(p => String(p.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Bidhaa haipo.' });
  const existing = products[idx];
  const { name, category, subcategory, active } = req.body;
  const variants = req.body.variantsJson ? parseVariants(req.body) : existing.variants;
  const { priceMin, priceMax } = priceRange(variants);
  products[idx] = {
    ...existing,
    name: name !== undefined ? name : existing.name,
    category: category !== undefined ? category : existing.category,
    subcategory: subcategory !== undefined ? subcategory : existing.subcategory,
    variants,
    priceMin,
    priceMax,
    active: active !== undefined ? (active === 'true' || active === true) : existing.active,
    image: req.file ? `/uploads/${req.file.filename}` : existing.image
  };
  writeJSON('products.json', products);
  res.json({ ok: true, product: products[idx] });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  let products = readJSON('products.json');
  const before = products.length;
  products = products.filter(p => String(p.id) !== String(req.params.id));
  if (products.length === before) return res.status(404).json({ error: 'Bidhaa haipo.' });
  writeJSON('products.json', products);
  res.json({ ok: true });
});

// =====================================================================
// ADMIN: ORDERS
// =====================================================================

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(readJSON('orders.json'));
});

app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const orders = readJSON('orders.json');
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Oda haipo.' });
  const allowed = ['new', 'contacted', 'fulfilled', 'cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Status batili.' });
  order.status = req.body.status;
  writeJSON('orders.json', orders);
  res.json({ ok: true, order });
});

// ---------- Fallbacks ----------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  next();
});

app.listen(PORT, () => {
  console.log(`Chimbo Linalotembea shop running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
