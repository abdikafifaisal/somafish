require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const Admin = require('../models/Admin');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/somafish';

const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => input.question(prompt, resolve));
}

async function main() {
  await mongoose.connect(mongoUri);

  const username = (await question('Admin username: ')).trim();
  const password = (await question('Admin password: ')).trim();

  if (!username || !password) {
    throw new Error('Username and password are required.');
  }
  if (password.length < 10) {
    throw new Error('Password must be at least 10 characters.');
  }

  const normalized = username.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await Admin.findOne({ username: normalized });

  if (existing) {
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`Updated admin account: ${normalized}`);
  } else {
    await Admin.create({ username: normalized, passwordHash });
    console.log(`Created admin account: ${normalized}`);
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    input.close();
    await mongoose.disconnect();
  });
