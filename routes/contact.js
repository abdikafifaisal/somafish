const express = require('express');
const rateLimit = require('express-rate-limit');
const Message = require('../models/Message');

const router = express.Router();
const topics = new Set(['A retail order', 'Wholesale', 'Export', 'A problem with an order']);
const limits = { name: 120, phone: 40, email: 160, topic: 120, orderNumber: 80, message: 5000 };
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again later.' }
});

router.post('/', limiter, express.json({ limit: '40kb' }), async (req, res, next) => {
  const body = req.body || {};
  if (typeof body.submissionId !== 'string' || !/^[a-f0-9]{24}$/.test(body.submissionId)) {
    return res.status(400).json({ error: 'Invalid message submission.' });
  }

  const fields = {};
  for (const [key, maxLength] of Object.entries(limits)) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > maxLength) {
      return res.status(400).json({ error: 'One of the form fields is invalid or too long.' });
    }
    fields[key] = value.trim();
  }
  if (!fields.name || !fields.message || !topics.has(fields.topic) ||
      !/^\+?[\d\s()\-]{7,20}$/.test(fields.phone) || fields.phone.replace(/\D/g, '').length < 7 ||
      (fields.email && !/^[^\s@]+@[^\s@]+$/.test(fields.email))) {
    return res.status(400).json({ error: 'Check your name, phone number, email, topic, and message.' });
  }

  try {
    try {
      await Message.create({ _id: body.submissionId, ...fields });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await Message.findById(body.submissionId).lean();
      if (!existing || !Object.keys(fields).every(key => existing[key] === fields[key])) {
        return res.status(409).json({ error: 'This submission ID was already used.' });
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({ error: 'Invalid message request.' });
  }
  console.error('Contact submission failed:', error.name);
  res.status(500).json({ error: 'Could not save your message. Please try again.' });
});

module.exports = router;
