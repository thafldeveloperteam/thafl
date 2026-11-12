const path = require('node:path');
const fs = require('node:fs');
const sqlite3 = require('sqlite3').verbose();

const filename = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, 'data', 'thafl_portal.db'));
fs.mkdirSync(path.dirname(filename), { recursive: true });
const db = new sqlite3.Database(filename);

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ id: this.lastID, changes: this.changes });
  }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function initialize() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('PRAGMA foreign_keys = ON');
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tc TEXT NOT NULL UNIQUE,
        okul_no TEXT UNIQUE,
        ad TEXT NOT NULL,
        sube TEXT,
        sifre TEXT NOT NULL,
        rol TEXT NOT NULL CHECK (rol IN ('Ogrenci', 'Ogretmen')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS biletler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ogrenci_id INTEGER NOT NULL REFERENCES users(id),
        konu TEXT NOT NULL,
        detay TEXT NOT NULL,
        durum TEXT NOT NULL DEFAULT 'Acik' CHECK (durum IN ('Acik', 'Kapali')),
        tarih TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`, (err) => err ? reject(err) : resolve());
    });
  });
}

module.exports = { db, run, get, all, initialize };
