const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { SF_SETTINGS } = require('../puplic/shop-catalogue');

const router = express.Router();
const objectId = /^[a-f0-9]{24}$/;
const legacyId = /^[a-z-]{1,40}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

router.post('/', express.json({ limit: '16kb' }), async (req, res, next) => {
  const { checkoutId, items } = req.body || {};
  if (typeof checkoutId !== 'string' || !uuid.test(checkoutId) ||
      !Array.isArray(items) || !items.length || items.length > 200) {
    return res.status(400).json({ error: 'Invalid checkout details.' });
  }

  const seen = new Set();
  for (const item of items) {
    const { productId, quantity } = item || {};
    if (typeof productId !== 'string' || (!objectId.test(productId) && !legacyId.test(productId)) ||
        seen.has(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ error: 'Invalid product or quantity.' });
    }
    seen.add(productId);
  }

  const orderNumber = `SF-${checkoutId}`;
  try {
    let order = await Order.findOne({ orderNumber });
    if (!order) {
      const ids = [...seen];
      const products = await Product.find({
        $or: [
          { _id: { $in: ids.filter(id => objectId.test(id)) } },
          { legacyId: { $in: ids.filter(id => legacyId.test(id)) } }
        ]
      }).select('legacyId name price unit inStock').lean();
      const catalogue = new Map(products.map(product => [product.legacyId || String(product._id), product]));
      const orderItems = [];
      let subtotalCents = 0;
      for (const { productId, quantity } of items) {
        const product = catalogue.get(productId);
        if (!product || product.inStock === false) {
          return res.status(409).json({ error: 'A product in your basket is unavailable. Refresh the shop and try again.' });
        }
        const priceCents = Math.round(product.price * 100);
        const lineCents = priceCents * quantity;
        subtotalCents += lineCents;
        orderItems.push({ productId, quantity, name: product.name, unit: product.unit,
          price: priceCents / 100, lineTotal: lineCents / 100 });
      }
      const deliveryCents = Math.round(SF_SETTINGS.deliveryFee * 100);
      const fields = {
        orderNumber,
        items: orderItems,
        subtotal: subtotalCents / 100,
        deliveryFee: deliveryCents / 100,
        total: (subtotalCents + deliveryCents) / 100
      };
      try {
        order = await Order.create(fields);
      } catch (error) {
        if (error.code !== 11000) throw error;
        order = await Order.findOne({ orderNumber });
        if (!order) throw error;
      }
    }
    if (order.items.length !== items.length || !order.items.every(saved =>
      items.some(item => item.productId === saved.productId && item.quantity === saved.quantity))) {
      return res.status(409).json({ error: 'This checkout ID was already used for another cart.' });
    }
    res.json({ orderNumber, items: order.items, subtotal: order.subtotal,
      deliveryFee: order.deliveryFee, total: order.total });
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({ error: 'Invalid checkout request.' });
  }
  console.error('Checkout failed:', error.name);
  res.status(500).json({ error: 'The server could not save your order. Please try again.' });
});

module.exports = router;
