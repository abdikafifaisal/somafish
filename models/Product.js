const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  legacyId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, trim: true, maxlength: 30, default: 'kg' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  image: { type: String, default: '' },
  inStock: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
