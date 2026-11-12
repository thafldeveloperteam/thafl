const bcrypt = require('bcrypt');
const { run, initialize } = require('../database');

async function main() {
  const tc = process.env.TEACHER_TC || '';
  const ad = (process.env.TEACHER_NAME || '').trim();
  const password = process.env.TEACHER_PASSWORD || '';
  if (!/^\d{11}$/.test(tc) || ad.length < 2 || password.length < 8 || password.length > 72) {
    throw new Error('TEACHER_TC 11 haneli, TEACHER_NAME en az 2 ve TEACHER_PASSWORD 8-72 karakter olmalı.');
  }
  await initialize();
  const hash = await bcrypt.hash(password, 12);
  await run("INSERT INTO users (tc, ad, sifre, rol) VALUES (?, ?, ?, 'Ogretmen')", [tc, ad, hash]);
  console.log('Öğretmen hesabı oluşturuldu. Parolayı güvenli biçimde saklayın.');
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => {
  // Wait for queued SQLite operations to finish before ending the process.
  const { db } = require('../database');
  db.close();
});
