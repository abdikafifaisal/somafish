require('dotenv').config();

const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const createAdminRouter = require('./routes/admin-routes');

const app = express();
if (process.env.TRUST_LOOPBACK_PROXY === 'true') {
  app.set('trust proxy', 'loopback');
}
const adminDir = path.join(__dirname, 'public', 'admin');
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'products');

const { router, auth } = createAdminRouter({
  Admin: require('./models/Admin'),
  Order: require('./models/Order'),
  Product: require('./models/Product'),
  Message: require('./models/Message'),
  jwtSecret: process.env.ADMIN_JWT_SECRET,
  uploadDir: uploadsDir
});

app.use('/api/admin', router);
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/checkout'));
app.use('/api/messages', require('./routes/contact'));

for (const file of ['login.html', 'admin.css', 'admin.js']) {
  app.get(`/admin/${file}`, (req, res) => {
    res.sendFile(path.join(adminDir, file));
  });
}

app.get(['/admin', '/admin/index.html'], auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(adminDir, 'index.html'));
});

app.use('/uploads/products', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'puplic')));

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  const port = process.env.PORT || 3000;
  app.listen(port, process.env.BIND_HOST, () => console.log(`Somafish is running on port ${port}`));
}

start().catch(error => {
  console.error('Could not start Somafish:', error.message);
  process.exitCode = 1;
});
