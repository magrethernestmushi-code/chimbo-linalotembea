(function () {
  const el = (sel) => document.querySelector(sel);
  let allProducts = [];
  let allOrders = [];
  let categories = [];

  async function checkSession() {
    const { isAdmin } = await fetch('/api/admin/session').then(r => r.json());
    if (isAdmin) showDashboard(); else showLogin();
  }
  function showLogin() { el('#loginScreen').hidden = false; el('#dashboard').hidden = true; }
  function showDashboard() {
    el('#loginScreen').hidden = true;
    el('#dashboard').hidden = false;
    loadProducts();
    loadOrders();
  }

  el('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') })
    });
    const data = await res.json();
    if (!res.ok) {
      el('#loginError').hidden = false;
      el('#loginError').textContent = data.error || 'Login failed';
      return;
    }
    showDashboard();
  });

  el('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      el('#tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ---------- Products ----------
  async function loadProducts() {
    allProducts = await fetch('/api/admin/products').then(r => r.json());
    categories = [...new Set(allProducts.map(p => p.category))].sort();
    const filterSel = el('#categoryFilter');
    filterSel.innerHTML = '<option value="All">All categories</option>' +
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
    el('#categoryOptions').innerHTML = categories.map(c => `<option value="${c}">`).join('');
    renderProductTable();
  }

  function fmt(n) { return n == null ? '—' : 'Tsh ' + Number(n).toLocaleString('en-US'); }

  function renderProductTable() {
    const q = el('#productSearch').value.trim().toLowerCase();
    const cat = el('#categoryFilter').value;
    let rows = allProducts;
    if (cat !== 'All') rows = rows.filter(p => p.category === cat);
    if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q));
    el('#productTableBody').innerHTML = rows.map(p => `
      <tr>
        <td><img class="thumb" src="${p.image}" alt=""></td>
        <td>${escapeHTML(p.name)}</td>
        <td>${escapeHTML(p.category)}</td>
        <td>${p.priceMin === p.priceMax ? fmt(p.priceMin) : fmt(p.priceMin) + ' – ' + fmt(p.priceMax)}</td>
        <td>${p.variants.length}</td>
        <td><span class="status-pill ${p.active !== false ? 'active' : 'inactive'}">${p.active !== false ? 'Visible' : 'Hidden'}</span></td>
        <td class="row-actions">
          <button data-act="edit" data-id="${p.id}">Edit</button>
          <button data-act="del" data-id="${p.id}" class="danger">Delete</button>
        </td>
      </tr>
    `).join('');
    el('#productTableBody').querySelectorAll('[data-act="edit"]').forEach(b =>
      b.addEventListener('click', () => openProductModal(b.dataset.id)));
    el('#productTableBody').querySelectorAll('[data-act="del"]').forEach(b =>
      b.addEventListener('click', () => deleteProduct(b.dataset.id)));
  }
  el('#productSearch').addEventListener('input', renderProductTable);
  el('#categoryFilter').addEventListener('change', renderProductTable);
  el('#addProductBtn').addEventListener('click', () => openProductModal(null));

  // ---------- Variant editor ----------
  function addVariantRow(label, price, note) {
    const wrap = document.createElement('div');
    wrap.className = 'variant-row';
    wrap.innerHTML = `
      <input type="text" class="v-label" placeholder="e.g. 5W" value="${escapeAttr(label || '')}">
      <input type="number" class="v-price" placeholder="price" min="0" step="1" value="${price != null ? price : ''}">
      <input type="text" class="v-note" placeholder="e.g. 10pcs" value="${escapeAttr(note || '')}">
      <button type="button" class="v-remove" aria-label="Remove">&times;</button>
    `;
    wrap.querySelector('.v-remove').addEventListener('click', () => wrap.remove());
    el('#variantEditor').appendChild(wrap);
  }
  el('#addVariantBtn').addEventListener('click', () => addVariantRow('', '', ''));

  function collectVariants() {
    return Array.from(el('#variantEditor').querySelectorAll('.variant-row')).map(row => ({
      label: row.querySelector('.v-label').value.trim(),
      price: row.querySelector('.v-price').value,
      note: row.querySelector('.v-note').value.trim()
    })).filter(v => v.label && v.price !== '');
  }

  function openProductModal(id) {
    const form = el('#productForm');
    form.reset();
    el('#productFormError').hidden = true;
    el('#productImgPreview').hidden = true;
    el('#variantEditor').innerHTML = '';
    if (id) {
      const p = allProducts.find(x => String(x.id) === String(id));
      el('#productModalTitle').textContent = 'Edit Product';
      form.id.value = p.id;
      form.name.value = p.name;
      form.category.value = p.category;
      form.subcategory.value = p.subcategory || '';
      form.active.checked = p.active !== false;
      el('#productImgPreview').src = p.image;
      el('#productImgPreview').hidden = false;
      p.variants.forEach(v => addVariantRow(v.label, v.price, v.note));
    } else {
      el('#productModalTitle').textContent = 'Add Product';
      form.id.value = '';
      form.active.checked = true;
      addVariantRow('', '', '');
    }
    el('#productModalOverlay').classList.add('open');
  }
  el('#closeProductModal').addEventListener('click', () => el('#productModalOverlay').classList.remove('open'));
  el('#productModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) el('#productModalOverlay').classList.remove('open'); });

  el('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.id.value;
    const variants = collectVariants();
    if (variants.length === 0) {
      el('#productFormError').hidden = false;
      el('#productFormError').textContent = 'Add at least one price option (label + price).';
      return;
    }
    const fd = new FormData(form);
    fd.set('active', form.active.checked ? 'true' : 'false');
    fd.set('variantsJson', JSON.stringify(variants));
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save product');
      el('#productModalOverlay').classList.remove('open');
      await loadProducts();
    } catch (err) {
      el('#productFormError').hidden = false;
      el('#productFormError').textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Product';
    }
  });

  async function deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (res.ok) loadProducts();
  }

  // ---------- Orders ----------
  async function loadOrders() {
    allOrders = await fetch('/api/admin/orders').then(r => r.json());
    const newCount = allOrders.filter(o => o.status === 'new').length;
    el('#newOrdersBadge').hidden = newCount === 0;
    el('#newOrdersBadge').textContent = newCount;
    renderOrders();
  }
  function renderOrders() {
    const filter = el('#orderStatusFilter').value;
    let rows = allOrders;
    if (filter !== 'All') rows = rows.filter(o => o.status === filter);
    if (rows.length === 0) {
      el('#ordersList').innerHTML = '<p style="color:#6b7280;text-align:center;padding:30px;">No orders yet.</p>';
      return;
    }
    el('#ordersList').innerHTML = rows.map(o => `
      <div class="order-card">
        <div class="order-top">
          <div>
            <div class="order-id">${o.id}</div>
            <div class="order-date">${new Date(o.createdAt).toLocaleString()}</div>
          </div>
          <select class="order-status-select" data-id="${o.id}">
            <option value="new" ${o.status === 'new' ? 'selected' : ''}>New</option>
            <option value="contacted" ${o.status === 'contacted' ? 'selected' : ''}>Contacted</option>
            <option value="fulfilled" ${o.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <div class="order-customer">
          <a href="tel:${o.phone}">${escapeHTML(o.customerName)} — ${escapeHTML(o.phone)}</a>
          ${o.address ? ' · ' + escapeHTML(o.address) : ''}
        </div>
        <div class="order-items">
          ${o.items.map(it => `
            <div class="order-item-row">
              <span>${escapeHTML(it.name)} (${escapeHTML(it.variantLabel)}) × ${it.qty}</span>
              <span>Tsh ${it.lineTotal.toLocaleString('en-US')}</span>
            </div>`).join('')}
        </div>
        <div class="order-total-row"><span>Total</span><span>Tsh ${o.total.toLocaleString('en-US')}</span></div>
        ${o.notes ? `<div class="order-notes">"${escapeHTML(o.notes)}"</div>` : ''}
      </div>
    `).join('');
    el('#ordersList').querySelectorAll('.order-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        await fetch(`/api/admin/orders/${sel.dataset.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sel.value })
        });
        loadOrders();
      });
    });
  }
  el('#orderStatusFilter').addEventListener('change', renderOrders);

  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

  checkSession();
})();
