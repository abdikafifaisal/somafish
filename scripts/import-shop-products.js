require('dotenv').config();

const mongoose = require('mongoose');
const Product = require('../models/Product');

const products = [
  { id: 'barracuda', name: 'Barracuda', category: 'Fish', price: 7, unit: 'kg', image: '../img/barracuda.jpg', alt: 'Fresh barracuda on ice' },
  { id: 'grilled-fish', name: 'Grilled fish', category: 'Prepared', price: 9, unit: 'piece', image: '../img/fish2%20(2).jpg', alt: 'Prepared grilled fish' },
  { id: 'whole-fish', name: 'Fresh whole fish', category: 'Fish', price: 6, unit: 'kg', image: '../img/fish1.jpg', alt: 'Fresh whole fish' },
  { id: 'fillets', name: 'Fish fillets', category: 'Fillets', price: 11, unit: 'kg', image: '../img/fillet.jpg', alt: 'Fresh fish fillets on ice' },
  { id: 'kingfish', name: 'Kingfish steaks', category: 'Fillets', price: 12, unit: 'kg', image: '../img/kingfish.jpg', alt: 'Kingfish steaks' },
  { id: 'squid', name: 'Squid', category: 'Shellfish', price: 8, unit: 'kg', image: '../img/squid%20ring.jpg', alt: 'Fresh squid' },
  { id: 'sardines', name: 'Sardines', category: 'Fish', price: 4, unit: 'kg', image: '../img/sardines.jpg', alt: 'Fresh sardines on ice' },
  { id: 'red-snapper', name: 'Red snapper', category: 'Fish', price: 10, unit: 'kg', image: '../img/red%20shapper.jpg', alt: 'Fresh red snapper' },
  { id: 'prawns', name: 'Prawns', category: 'Shellfish', price: 15, unit: 'kg', image: '../img/prawn.jpg', alt: 'Fresh prawns' },
  { id: 'lobster', name: 'Lobster tail', category: 'Shellfish', price: 25, unit: 'piece', image: '../img/lobstar%20tail.jpg', alt: 'Lobster tail' },
  { id: 'tuna', name: 'Tuna', category: 'Fish', price: 13, unit: 'kg', image: '../img/tunafish.jpg', alt: 'Fresh tuna being prepared' },
  { id: 'grouper', name: 'White grouper', category: 'Fish', price: 12, unit: 'kg', image: '../img/white%20grouper.jpg', alt: 'White grouper' }
];

async function importProducts() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Product.init();
  for (const { id, alt, ...product } of products) {
    if (await Product.exists({ legacyId: id })) continue;
    const existing = await Product.findOne({ name: product.name })
      .collation({ locale: 'en', strength: 2 }).sort({ _id: 1 });
    if (existing) {
      if (!existing.legacyId) {
        await Product.updateOne({ _id: existing._id, legacyId: { $exists: false } }, { $set: { legacyId: id } });
      }
      continue;
    }
    product.image = product.image.startsWith('../') ? product.image.slice(2) : product.image;
    const now = new Date();
    await Product.updateOne({ legacyId: id }, { $setOnInsert: { ...product, createdAt: now, updatedAt: now } },
      { upsert: true, timestamps: false, setDefaultsOnInsert: true });
  }
  console.log('Shop catalogue imported.');
}

importProducts().catch(error => {
  console.error('Could not import shop products:', error.name);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
