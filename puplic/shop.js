const formatMoney = amount => new Intl.NumberFormat(SF_SETTINGS.locale, {
  style: 'currency', currency: SF_SETTINGS.currency
}).format(amount);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

/* Cart persistence and state. Quantities are whole units in this shop. */
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(SF_SETTINGS.storageKey) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    const clean = {};
    for (const product of products) {
      const quantity = saved[product.id];
      if (Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 999) clean[product.id] = quantity;
    }
    return clean;
  } catch { return {}; }
}
let products = [];
let cart = {};
let selectedCategory = 'All';
let lastFocusedElement = null;
const $ = selector => document.querySelector(selector);
const categoryList = $('#sf-category-list');
const productGrid = $('#sf-product-grid');
const searchInput = $('#sf-search-input');
const sortSelect = $('#sf-sort-select');
const showing = $('#sf-showing');
const cartBadge = $('#sf-cart-badge');
const cartOpen = $('#sf-cart-open');
const drawer = $('#sf-cart-drawer');
const overlay = $('#sf-cart-overlay');
const cartItems = $('#sf-cart-items');
const checkoutButton = $('#sf-checkout');
const checkoutStatus = $('#sf-checkout-status');
let checkoutPending = false;
let checkoutAttempt;
let catalogueReady = false;
let catalogueLoading = false;

function saveCart() {
  try { localStorage.setItem(SF_SETTINGS.storageKey, JSON.stringify(cart)); }
  catch { /* Shop still works if browser storage is blocked. */ }
}
function cartQuantity() { return Object.values(cart).reduce((total, quantity) => total + quantity, 0); }
function cartSubtotal() { return products.reduce((total, product) => total + (cart[product.id] || 0) * product.price, 0); }

/* Categories are derived from the products array, including newly added ones.
   Counts reflect the current search term (but not the active category). */
function renderCategories() {
  if (!categoryList) return;
  const query = searchInput.value.trim().toLocaleLowerCase();
  const categories = ['All', ...new Set(products.map(product => product.category))];
  if (!categories.includes(selectedCategory)) selectedCategory = 'All';
  categoryList.innerHTML = categories.map(category => {
    const count = products.filter(product =>
      (category === 'All' || product.category === category) &&
      `${product.name} ${product.category}`.toLocaleLowerCase().includes(query)
    ).length;
    const active = selectedCategory === category;
    return `<button type="button" class="sf-category${active ? ' is-active' : ''}" data-category="${escapeHTML(category)}" aria-pressed="${active}">
      <span>${escapeHTML(category)}</span><span class="sf-category__count">${count}</span>
    </button>`;
  }).join('');
}

/* Cards are rendered from products; no hardcoded articles in the HTML. */
function renderProducts() {
  if (!productGrid || !catalogueReady) return;
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = products.filter(product =>
    (selectedCategory === 'All' || product.category === selectedCategory) &&
    `${product.name} ${product.category}`.toLocaleLowerCase().includes(query)
  );
  const sort = sortSelect.value;
  filtered.sort((a, b) => sort === 'price-asc' ? a.price - b.price :
    sort === 'price-desc' ? b.price - a.price : a.name.localeCompare(b.name));
  showing.textContent = `Showing ${filtered.length} item${filtered.length === 1 ? '' : 's'}`;
  productGrid.innerHTML = filtered.length ? filtered.map(product => `
    <article class="sf-product-card" data-product-id="${escapeHTML(product.id)}">
      ${product.image ? `<div class="sf-product-photo"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy"></div>` : ''}
      <div class="sf-product-content">
        <p class="sf-product-category">${escapeHTML(product.category)}</p>
        <h3>${escapeHTML(product.name)}</h3>
        <div class="sf-card-purchase">
          <p class="sf-price">${formatMoney(product.price)} <span>/ ${escapeHTML(product.unit)}</span></p>
          ${product.inStock ? `<div class="sf-card-qty" role="group" aria-label="Quantity for ${escapeHTML(product.name)}">
            <button type="button" data-card-decrease="${escapeHTML(product.id)}" aria-label="Decrease ${escapeHTML(product.name)} quantity" disabled>−</button>
            <output data-card-quantity="${escapeHTML(product.id)}" aria-label="Selected quantity">1</output>
            <button type="button" data-card-increase="${escapeHTML(product.id)}" aria-label="Increase ${escapeHTML(product.name)} quantity">+</button>
          </div>
          <button type="button" class="sf-add-btn sf-card-add" data-add="${escapeHTML(product.id)}" aria-label="Add ${escapeHTML(product.name)} to cart">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16l-1.3 12H5.3L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg> Add to cart
          </button>` : '<p>Out of stock</p>'}
        </div>
      </div>
    </article>`).join('') : `<div class="sf-empty-results"><h3>No seafood found</h3><p>Try another category or search.</p><button type="button" class="sf-add-btn" id="sf-clear-filters">Show all products</button></div>`;
}
function renderCatalogue() { renderCategories(); renderProducts(); }

/* Controls inside each card. Quantities here are staged until Add to cart. */
productGrid?.addEventListener('click', event => {
  const change = event.target.closest('[data-card-decrease], [data-card-increase]');
  if (change) {
    const card = change.closest('.sf-product-card');
    const output = card.querySelector('[data-card-quantity]');
    const increase = card.querySelector('[data-card-increase]');
    const decrease = card.querySelector('[data-card-decrease]');
    const quantity = Math.max(1, Math.min(999, Number(output.value) + (change === increase ? 1 : -1)));
    output.value = String(quantity);
    decrease.disabled = quantity === 1;
    increase.disabled = quantity === 999;
    return;
  }
  const addButton = event.target.closest('[data-add]');
  if (addButton) {
    const id = addButton.dataset.add;
    const product = products.find(item => item.id === id);
    if (!product?.inStock) return;
    const chosen = Number(addButton.closest('.sf-product-card').querySelector('[data-card-quantity]').value);
    cart[id] = Math.min(999, (cart[id] || 0) + chosen);
    saveCart(); updateCart(); openCart();
  }
  if (event.target.closest('#sf-clear-filters')) {
    selectedCategory = 'All'; searchInput.value = ''; sortSelect.value = 'name'; renderCatalogue();
  }
});
categoryList?.addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderCatalogue();
});
searchInput?.addEventListener('input', renderCatalogue);
sortSelect?.addEventListener('change', renderCatalogue);

/* Cart drawer, quantity editing, totals and dismissal. */
function updateCart() {
  const count = cartQuantity();
  cartBadge.textContent = String(count);
  cartOpen.setAttribute('aria-label', `Open cart, ${count} item${count === 1 ? '' : 's'}`);
  const selected = products.filter(product => cart[product.id]);
  cartItems.innerHTML = selected.length ? selected.map(product => `
    <div class="sf-cart-line">
      ${product.image ? `<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy">` : '<span aria-hidden="true"></span>'}
      <div class="sf-cart-line-details">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${formatMoney(product.price)} / ${escapeHTML(product.unit)}</span>
        <div class="sf-cart-line-controls" role="group" aria-label="Quantity for ${escapeHTML(product.name)}">
          <button type="button" data-cart-minus="${escapeHTML(product.id)}" aria-label="Remove one ${escapeHTML(product.unit)} of ${escapeHTML(product.name)}">−</button>
          <output>${cart[product.id]}</output>
          <button type="button" data-cart-plus="${escapeHTML(product.id)}" aria-label="Add one ${escapeHTML(product.unit)} of ${escapeHTML(product.name)}">+</button>
          <button type="button" class="sf-cart-remove" data-cart-remove="${escapeHTML(product.id)}" aria-label="Remove ${escapeHTML(product.name)} from cart">Remove</button>
        </div>
      </div>
      <strong class="sf-cart-line-price">${formatMoney(product.price * cart[product.id])}</strong>
    </div>`).join('') : `<div class="sf-cart-empty"><h3>Your basket is empty</h3><p>Add something fresh from the shop.</p><button type="button" class="sf-add-btn" id="sf-continue-shopping">Continue shopping</button></div>`;
  const subtotal = cartSubtotal();
  const delivery = count ? SF_SETTINGS.deliveryFee : 0;
  $('#sf-cart-subtotal').textContent = formatMoney(subtotal);
  $('#sf-cart-delivery').textContent = formatMoney(delivery);
  $('#sf-cart-total').textContent = formatMoney(subtotal + delivery);
  checkoutButton.disabled = checkoutPending || !count;
}
function openCart() {
  if (!drawer.hidden) return;
  lastFocusedElement = document.activeElement;
  drawer.hidden = false; overlay.hidden = false;
  document.body.classList.add('sf-cart-is-open');
  $('#sf-cart-close').focus();
}
function closeCart() {
  if (drawer.hidden) return;
  drawer.hidden = true; overlay.hidden = true;
  document.body.classList.remove('sf-cart-is-open');
  lastFocusedElement?.focus?.();
}
cartOpen?.addEventListener('click', openCart);
$('#sf-cart-close')?.addEventListener('click', closeCart);
overlay?.addEventListener('click', closeCart);
cartItems?.addEventListener('click', event => {
  if (event.target.closest('#sf-continue-shopping')) { closeCart(); return; }
  const button = event.target.closest('[data-cart-minus], [data-cart-plus], [data-cart-remove]');
  if (!button) return;
  const id = button.dataset.cartMinus || button.dataset.cartPlus || button.dataset.cartRemove;
  if (button.hasAttribute('data-cart-remove')) delete cart[id];
  else {
    cart[id] = Math.min(999, cart[id] + (button.hasAttribute('data-cart-plus') ? 1 : -1));
    if (cart[id] <= 0) delete cart[id];
  }
  saveCart(); updateCart();
});
document.addEventListener('keydown', event => {
  if (drawer.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeCart(); }
  if (event.key === 'Tab') {
    const focusable = [...drawer.querySelectorAll('button:not([disabled]), a[href], input, select')];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

checkoutButton.addEventListener('click', async () => {
  if (checkoutPending || !cartQuantity()) return;
  const items = products.filter(product => cart[product.id]).map(product => ({
    productId: product.id,
    quantity: cart[product.id]
  }));
  const cartSnapshot = JSON.stringify(items);
  checkoutPending = true;
  checkoutButton.disabled = true;
  checkoutStatus.textContent = 'Saving your order…';

  try {
    if (checkoutAttempt?.cartSnapshot !== cartSnapshot) {
      checkoutAttempt = { cartSnapshot, id: crypto.randomUUID() };
    }
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutId: checkoutAttempt.id, items })
    });
    const order = await response.json();
    if (!response.ok) throw new Error(order.error || 'Could not save your order.');

    const lines = order.items.map(item =>
      `${item.name}: ${item.quantity} ${item.unit} × ${formatMoney(item.price)} = ${formatMoney(item.lineTotal)}`
    );
    const message = [
      `Hello Somafish, I would like to confirm order ${order.orderNumber}:`, '', ...lines, '',
      `Subtotal: ${formatMoney(order.subtotal)}`,
      `Delivery: ${formatMoney(order.deliveryFee)}`,
      `TOTAL: ${formatMoney(order.total)}`,
      '', 'Please confirm availability and delivery details.'
    ].join('\n');
    const url = new URL(`https://wa.me/${SF_SETTINGS.whatsappNumber}`);
    url.searchParams.set('text', message);
    checkoutStatus.textContent = 'Order saved. Opening WhatsApp…';
    window.location.assign(url);
  } catch (error) {
    checkoutStatus.textContent = 'Could not complete checkout. ' + error.message;
  } finally {
    checkoutPending = false;
    checkoutButton.disabled = !cartQuantity();
  }
});

async function loadCatalogue() {
  if (catalogueLoading) return;
  catalogueLoading = true;
  if (!catalogueReady) showing.textContent = 'Loading products…';
  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load products.');
    const catalogue = await response.json();
    if (catalogueReady && JSON.stringify(products) === JSON.stringify(catalogue.items)) return;
    products = catalogue.items;
    if (!catalogueReady) cart = loadCart();
    for (const id of Object.keys(cart)) {
      if (!products.some(product => product.id === id)) delete cart[id];
    }
    catalogueReady = true;
    renderCatalogue();
    updateCart();
  } catch {
    if (!catalogueReady) showing.textContent = 'Could not load products. Refresh the page to try again.';
  } finally {
    catalogueLoading = false;
  }
}

updateCart();
loadCatalogue();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadCatalogue();
});
