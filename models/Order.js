const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: String,
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerName: { type: String, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 40 },
  email: { type: String, trim: true, maxlength: 160 },
  deliveryArea: { type: String, trim: true, maxlength: 160 },
  address: { type: String, trim: true, maxlength: 500 },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  deliveryTime: { type: String, trim: true, maxlength: 160 },
  items: { type: [orderItemSchema], default: [] },
  subtotal: { type: Number, required: true, min: 0 },
  deliveryFee: { type: Number, required: true, min: 0, default: 0 },
  total: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' }
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
