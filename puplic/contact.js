/* Save contact submissions before handing them off to WhatsApp. */
(() => {
  'use strict';
  const form = document.getElementById('sf-contact-form');
  if (!form) return;
  const fields = {
    name: document.getElementById('sf-contact-name'),
    phone: document.getElementById('sf-contact-phone'),
    email: document.getElementById('sf-contact-email'),
    message: document.getElementById('sf-contact-message')
  };
  const status = document.getElementById('sf-contact-status');
  const submitButton = form.querySelector('button[type="submit"]');
  let pending = false;
  let submission;
  const errors = {
    name: document.getElementById('sf-name-error'),
    phone: document.getElementById('sf-phone-error'),
    email: document.getElementById('sf-email-error'),
    message: document.getElementById('sf-message-error')
  };
  function setError(key, text) {
    errors[key].textContent = text;
    if (text) fields[key].setAttribute('aria-invalid', 'true');
    else fields[key].removeAttribute('aria-invalid');
  }
  function validate() {
    const name = fields.name.value.trim();
    const phone = fields.phone.value.trim();
    const email = fields.email.value.trim();
    const message = fields.message.value.trim();
    setError('name', name ? '' : 'Please enter your name.');
    setError('phone', !phone ? 'Please enter your phone number.' :
      !/^\+?[\d\s()\-]{7,20}$/.test(phone) ? 'Enter a valid phone number (at least 7 digits).' : '');
    setError('email', email && !fields.email.validity.valid ? 'Enter a valid email address, or leave this blank.' : '');
    setError('message', message ? '' : 'Please tell us what you need.');
    return !Object.values(errors).some(element => element.textContent);
  }
  for (const [key, input] of Object.entries(fields)) {
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') setError(key, '');
      status.hidden = true;
    });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    status.hidden = true;
    if (!validate()) {
      const first = Object.keys(fields).find(key => errors[key].textContent);
      if (first) fields[first].focus();
      return;
    }
    const details = {
      ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value.trim()])),
      topic: form.querySelector('input[name="topic"]:checked').value,
      orderNumber: document.getElementById('sf-contact-order').value.trim()
    };
    const snapshot = JSON.stringify(details);
    pending = true;
    submitButton.disabled = true;
    status.textContent = 'Saving your message…';
    status.hidden = false;

    try {
      if (submission?.snapshot !== snapshot) {
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        submission = { snapshot, id: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') };
      }
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, submissionId: submission.id })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Could not save your message. Please try again.');

      const message = [
        'Hello Somafish,', '',
        `Topic: ${details.topic}`,
        `Name: ${details.name}`,
        `Phone: ${details.phone}`,
        `Email: ${details.email || 'Not provided'}`,
        `Order number: ${details.orderNumber || 'Not provided'}`,
        '', `Message: ${details.message}`
      ].join('\n');
      status.textContent = 'Message saved. Opening WhatsApp…';
      window.location.assign(`https://wa.me/256727267634?text=${encodeURIComponent(message)}`);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      pending = false;
      submitButton.disabled = false;
      status.hidden = false;
    }
  });

  /* Mirror shop1's saved basket count on the contact header. */
  const cartButton = document.getElementById('sf-cart-open');
  const cartBadge = document.getElementById('sf-cart-badge');
  function updateBadge() {
    let count = 0;
    try {
      const saved = JSON.parse(localStorage.getItem('somafish-shop1-cart-v1') || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        count = Object.values(saved).reduce((n, value) => n + (Number.isInteger(value) && value > 0 ? value : 0), 0);
      }
    } catch { /* Blocked storage should not block the contact form. */ }
    if (cartBadge) cartBadge.textContent = String(count);
    if (cartButton) cartButton.setAttribute('aria-label', `View shopping basket in shop, ${count} items`);
  }
  updateBadge();
  window.addEventListener('storage', updateBadge);
  cartButton?.addEventListener('click', () => { window.location.href = 'shop1.html'; });
})();
