# THAFL Portal

Türkan Halit Aykılıç Fen Lisesi portalı: öğrenci kaydı ve girişi, öğretmen oturumu, destek bileti oluşturma/takibi ve öğretmenlerin bilet kapatması.

## Gereksinimler

- Node.js 18 veya üzeri
- npm

## Kurulum ve çalıştırma

```bash
npm install
cp .env.example .env
```

`.env` içindeki `SESSION_SECRET` değerini uzun ve rastgele bir değerle değiştirin. Ardından:

```bash
npm start
```

Portal varsayılan olarak `http://localhost:3000` adresinde açılır. SQLite veritabanı varsayılan olarak `data/thafl_portal.db` konumunda oluşturulur; isterseniz `DATABASE_PATH` ile değiştirebilirsiniz.

## Öğretmen hesabı

Herkese açık öğretmen kaydı bilerek kapalıdır. İlk öğretmen hesabını uygulama durduğunda aşağıdaki komutla oluşturun:

```bash
TEACHER_TC=12345678901 TEACHER_NAME="Örnek Öğretmen" TEACHER_PASSWORD="en-az-8-karakter" npm run create-teacher
```

Windows PowerShell'de değişkenleri komut öncesi `$env:TEACHER_TC="..."` biçiminde tanımlayın. Öğretmen, giriş ekranından "Öğretmen" rolünü seçerek T.C. kimlik numarası ve şifresiyle giriş yapar. Gerçek kişisel verileri ve okul sistemlerini kullanmadan önce okul yönetiminin onayını alın.

## Güvenlik ve dağıtım notları

- Üretimde `NODE_ENV=production` ve 32 karakterden uzun, gizli bir `SESSION_SECRET` zorunludur. HTTPS kullanın; arkasında güvenilir bir proxy varsa `TRUST_PROXY=1` ayarlayın.
- Oturumlar varsayılan Express bellek deposunda tutulur; bu, tek sunuculu deneme/yerel kullanım içindir. Ölçekli veya kalıcı üretim dağıtımında SQLite/Redis destekli bir session store kurun.
- Öğrenci kaydı öğretmen yetkisi vermez. Parolalar bcrypt ile özetlenir, yazma istekleri CSRF token'ı ve giriş/kayıt işlemleri hız sınırlaması kullanır.
- `data/` veritabanı dosyasını, yedeklerini ve `.env` dosyasını herkese açık depoya koymayın. Yasal/kurumsal onay olmadan gerçek T.C. kimlik numarası gibi hassas verileri toplamayın.
