const express = require('express');
const Product = require('../models/Product');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const products = await Product.find()
      .select('legacyId name category price unit image inStock').sort({ name: 1 }).lean();
    res.set('Cache-Control', 'no-store').json({
      items: products.map(product => ({
        id: product.legacyId || String(product._id),
        name: product.name,
        category: product.category,
        price: product.price,
        unit: product.unit,
        image: product.image,
        inStock: product.inStock !== false
      }))
    });
  } catch (error) {
    console.error('Could not load shop products:', error.name);
    res.status(500).json({ error: 'Could not load products.' });
  }
});

module.exports = router;
