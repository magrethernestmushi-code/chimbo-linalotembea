(function () {
  const state = {
    products: [],
    categories: [],
    activeCategory: 'All',
    query: '',
    cart: [] // { id, name, image, variantIndex, variantLabel, price, qty }
  };

  const fmt = (n) => 'Tsh ' + Number(n).toLocaleString('en-US');

  const el = (sel) => document.querySelector(sel);
  const grid = el('#productGrid');
  const catNav = el('#catNav');
  const searchInput = el('#searchInput');
  const resultsCount = el('#resultsCount');
  const emptyState = el('#emptyState');

  async function loadSettings() {
    try {
      const s = await fetch('/api/settings').then(r => r.json());
      if (s.location) { el('#footerLocation').hidden = false; el('#footerLocation').textContent = s.location; }
      if (s.phone) {
        el('#footerPhone').hidden = false;
        el('#footerPhone').textContent = s.phone;
        el('#footerPhone').href = 'tel:' + s.phone.replace(/\s+/g, '');
      }
    } catch (e) { /* ignore */ }
  }

  async function loadCategories() {
    state.categories = await fetch('/api/categories').then(r => r.json());
    renderCatNav();
  }

  async function loadProducts() {
    const params = new URLSearchParams();
    if (state.activeCategory !== 'All') params.set('category', state.activeCategory);
    if (state.query) params.set('q', state.query);
    state.products = await fetch('/api/products?' + params.toString()).then(r => r.json());
    renderGrid();
  }

  function renderCatNav() {
    const cats = ['All', ...state.categories];
    catNav.innerHTML = cats.map(c =>
      `<button class="cat-chip ${c === state.activeCategory ? 'active' : ''}" data-cat="${escapeAttr(c)}">${c === 'All' ? 'Zote' : c}</button>`
    ).join('');
    catNav.querySelectorAll('.cat-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeCategory = btn.dataset.cat;
        renderCatNav();
        loadProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function renderGrid() {
    resultsCount.textContent = state.products.length + ' bidhaa';
    emptyState.hidden = state.products.length !== 0;
    grid.innerHTML = state.products.map(cardHTML).join('');

    grid.querySelectorAll('.card-media').forEach(media => {
      media.addEventListener('click', () => openQuickView(media.dataset.id));
    });
    grid.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.card');
        const select = card.querySelector('.variant-select');
        const vIdx = select ? Number(select.value) : 0;
        addToCart(btn.dataset.id, vIdx);
        btn.classList.add('added');
        btn.textContent = 'Imeongezwa ✓';
        setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'Ongeza kwenye Oda'; }, 900);
      });
    });
  }

  function cardHTML(p) {
    const single = p.variants.length === 1;
    const priceLabel = single
      ? fmt(p.variants[0].price)
      : (p.priceMin === p.priceMax ? fmt(p.priceMin) : 'Kutoka ' + fmt(p.priceMin));
    const variantControl = single
      ? `<div class="single-variant-note">${escapeHTML(p.variants[0].label)}${p.variants[0].note ? ' · ' + escapeHTML(p.variants[0].note) : ''}</div>`
      : `<select class="variant-select">${p.variants.map((v, i) => `<option value="${i}">${escapeHTML(v.label)} — ${fmt(v.price)}${v.note ? ' (' + escapeHTML(v.note) + ')' : ''}</option>`).join('')}</select>`;
    return `
      <div class="card">
        <div class="card-media" data-id="${p.id}">
          <img src="${p.image}" alt="${escapeAttr(p.name)}" loading="lazy">
          <div class="price-tag">${priceLabel}</div>
        </div>
        <div class="card-body">
          <span class="card-cat">${escapeHTML(p.subcategory || p.category)}</span>
          <span class="card-name">${escapeHTML(p.name)}</span>
          ${variantControl}
          <button class="add-btn" data-id="${p.id}">Ongeza kwenye Oda</button>
        </div>
      </div>`;
  }

  function openQuickView(id) {
    const p = state.products.find(x => String(x.id) === String(id));
    if (!p) return;
    const content = el('#quickViewContent');
    content.innerHTML = `
      <div class="modal-head"><h2>Maelezo ya Bidhaa</h2><button id="qvClose">&times;</button></div>
      <img class="qv-img" src="${p.image}" alt="${escapeAttr(p.name)}">
      <span class="qv-cat">${escapeHTML(p.category)}</span><span class="qv-sub">${escapeHTML(p.subcategory || '')}</span>
      <h3 class="qv-name">${escapeHTML(p.name)}</h3>
      <div class="qv-variants">
        ${p.variants.map((v, i) => `
          <div class="qv-variant-row">
            <div class="qv-variant-info">
              <span class="qv-variant-label">${escapeHTML(v.label)}</span>
              ${v.note ? `<span class="qv-variant-note">${escapeHTML(v.note)}</span>` : ''}
            </div>
            <span class="qv-variant-price">${fmt(v.price)}</span>
            <button class="qv-add-btn" data-id="${p.id}" data-vidx="${i}">Ongeza</button>
          </div>
        `).join('')}
      </div>
    `;
    content.querySelector('#qvClose').addEventListener('click', closeQuickView);
    content.querySelectorAll('.qv-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addToCart(btn.dataset.id, Number(btn.dataset.vidx));
        btn.classList.add('added');
        btn.textContent = 'Imeongezwa ✓';
        setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'Ongeza'; }, 900);
      });
    });
    el('#quickViewOverlay').classList.add('open');
  }
  function closeQuickView() { el('#quickViewOverlay').classList.remove('open'); }

  // ---------- Cart ----------
  function addToCart(id, variantIndex) {
    const p = state.products.find(x => String(x.id) === String(id));
    if (!p) return;
    const variant = p.variants[variantIndex];
    if (!variant) return;
    const existing = state.cart.find(c => String(c.id) === String(id) && c.variantIndex === variantIndex);
    if (existing) existing.qty += 1;
    else state.cart.push({
      id: p.id, name: p.name, image: p.image,
      variantIndex, variantLabel: variant.label, price: variant.price, qty: 1
    });
    renderCart();
  }
  function changeQty(id, variantIndex, delta) {
    const item = state.cart.find(c => String(c.id) === String(id) && c.variantIndex === variantIndex);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) state.cart = state.cart.filter(c => c !== item);
    renderCart();
  }
  function removeFromCart(id, variantIndex) {
    state.cart = state.cart.filter(c => !(String(c.id) === String(id) && c.variantIndex === variantIndex));
    renderCart();
  }

  function renderCart() {
    el('#cartCount').textContent = state.cart.reduce((s, c) => s + c.qty, 0);
    const wrap = el('#cartItems');
    if (state.cart.length === 0) {
      wrap.innerHTML = '<p class="cart-empty">Oda yako ni tupu. Chagua bidhaa uongeze.</p>';
    } else {
      wrap.innerHTML = state.cart.map(c => `
        <div class="cart-item">
          <img src="${c.image}" alt="">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHTML(c.name)}</div>
            <div class="cart-item-variant">${escapeHTML(c.variantLabel)}</div>
            <div class="cart-item-price">${fmt(c.price)}</div>
            <div class="qty-row">
              <button class="qty-btn" data-act="dec" data-id="${c.id}" data-vidx="${c.variantIndex}">&minus;</button>
              <span class="qty-val">${c.qty}</span>
              <button class="qty-btn" data-act="inc" data-id="${c.id}" data-vidx="${c.variantIndex}">+</button>
              <button class="remove-btn" data-act="rm" data-id="${c.id}" data-vidx="${c.variantIndex}">ondoa</button>
            </div>
          </div>
        </div>`).join('');
      wrap.querySelectorAll('[data-act="inc"]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, Number(b.dataset.vidx), 1)));
      wrap.querySelectorAll('[data-act="dec"]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, Number(b.dataset.vidx), -1)));
      wrap.querySelectorAll('[data-act="rm"]').forEach(b => b.addEventListener('click', () => removeFromCart(b.dataset.id, Number(b.dataset.vidx))));
    }
    const total = state.cart.reduce((s, c) => s + c.price * c.qty, 0);
    el('#cartTotal').textContent = fmt(total);
    el('#checkoutBtn').disabled = state.cart.length === 0;
  }

  function openCart() { el('#cartDrawer').classList.add('open'); el('#drawerOverlay').classList.add('open'); }
  function closeCart() { el('#cartDrawer').classList.remove('open'); el('#drawerOverlay').classList.remove('open'); }

  el('#cartBtn').addEventListener('click', openCart);
  el('#closeCart').addEventListener('click', closeCart);
  el('#drawerOverlay').addEventListener('click', closeCart);
  el('#quickViewOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeQuickView(); });

  el('#checkoutBtn').addEventListener('click', () => el('#checkoutOverlay').classList.add('open'));
  el('#closeCheckout').addEventListener('click', () => el('#checkoutOverlay').classList.remove('open'));
  el('#checkoutOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) el('#checkoutOverlay').classList.remove('open'); });

  el('#checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      customerName: fd.get('customerName'),
      phone: fd.get('phone'),
      address: fd.get('address'),
      notes: fd.get('notes'),
      items: state.cart.map(c => ({ id: c.id, variantIndex: c.variantIndex, qty: c.qty }))
    };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Inatuma…';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hitilafu imetokea');
      el('#checkoutOverlay').classList.remove('open');
      closeCart();
      state.cart = [];
      renderCart();
      e.target.reset();
      el('#confirmOrderId').textContent = data.order.id;
      el('#confirmOverlay').classList.add('open');
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Wasilisha Oda';
    }
  });
  el('#confirmClose').addEventListener('click', () => el('#confirmOverlay').classList.remove('open'));

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = searchInput.value; loadProducts(); }, 280);
  });

  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

  loadSettings();
  loadCategories();
  loadProducts();
  renderCart();
})();
