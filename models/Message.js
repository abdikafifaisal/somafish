const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 40 },
  email: { type: String, trim: true, maxlength: 160 },
  topic: { type: String, trim: true, maxlength: 120 },
  orderNumber: { type: String, trim: true, maxlength: 80 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  status: { type: String, enum: ['new', 'replied'], default: 'new' }
}, { timestamps: true });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
