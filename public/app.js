const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modalContent');
const workspace = document.querySelector('#workspace');
const notice = document.querySelector('#notice');
let csrfToken = '';
let currentUser = null;

async function refreshCsrf() {
  const response = await fetch('/api/csrf');
  const data = await response.json();
  csrfToken = data.token;
}
function notify(message) {
  notice.textContent = message;
  notice.classList.add('visible');
  setTimeout(() => notice.classList.remove('visible'), 3500);
}
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'İşlem tamamlanamadı.');
  return data;
}
function field(label, id, type = 'text', attrs = '') {
  return `<label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" ${attrs} required>`;
}
function openModal(title, content, submitLabel, onSubmit) {
  modalContent.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = title;
  modalContent.append(heading);
  const fields = document.createElement('div');
  fields.innerHTML = content;
  modalContent.append(fields);
  const submit = document.createElement('button');
  submit.className = 'button full';
  submit.type = 'submit';
  submit.textContent = submitLabel;
  modalContent.append(submit);
  modal.showModal();
  document.querySelector('#modalForm').onsubmit = async (event) => {
    event.preventDefault();
    try { await onSubmit(); } catch (err) { notify(err.message); }
  };
}
function showLogin() {
  openModal('Portal girişi', `${field('T.C. kimlik / okul numarası', 'loginId', 'text', 'autocomplete="username" maxlength="30"')}${field('Şifre', 'loginPassword', 'password', 'autocomplete="current-password" maxlength="72"')}<label for="loginRole">Rol</label><select id="loginRole"><option value="Ogrenci">Öğrenci</option><option value="Ogretmen">Öğretmen</option></select>`, 'Giriş Yap', async () => {
    const data = await api('/api/giris', { method: 'POST', body: { tcVeyaSicil: document.querySelector('#loginId').value, sifre: document.querySelector('#loginPassword').value, rolSecimi: document.querySelector('#loginRole').value } });
    csrfToken = data.csrfToken;
    modal.close();
    await loadSession();
    notify(`Hoş geldiniz, ${data.user.ad}.`);
  });
}
function showRegister() {
  openModal('Öğrenci kaydı', `${field('Ad soyad', 'regName', 'text', 'maxlength="80" autocomplete="name"')}${field('T.C. kimlik numarası (11 hane)', 'regTc', 'text', 'inputmode="numeric" pattern="[0-9]{11}" maxlength="11"')}${field('Okul numarası (isteğe bağlı)', 'regNo', 'text', 'maxlength="20"')}<label for="regClass">Şube</label><select id="regClass"><option>9/A</option><option>9/B</option><option>9/C</option><option>10/A</option><option>10/B</option><option>10/C</option><option>11/A</option><option>11/B</option><option>11/C</option><option>12/A</option><option>12/B</option><option>12/C</option></select>${field('Şifre (en az 8 karakter)', 'regPassword', 'password', 'minlength="8" maxlength="72" autocomplete="new-password"')}`, 'Hesap Oluştur', async () => {
    const data = await api('/api/kayit/ogrenci', { method: 'POST', body: { ad: document.querySelector('#regName').value, tc: document.querySelector('#regTc').value, no: document.querySelector('#regNo').value, sube: document.querySelector('#regClass').value, sifre: document.querySelector('#regPassword').value } });
    modal.close(); notify(data.message); showLogin();
  });
}
function addTicketCard(ticket, teacher = false) {
  const card = document.createElement('article');
  card.className = 'ticket card';
  const title = document.createElement('h3'); title.textContent = ticket.konu;
  const details = document.createElement('p'); details.textContent = ticket.detay;
  const meta = document.createElement('p'); meta.className = 'muted';
  const date = new Date(`${ticket.tarih.replace(' ', 'T')}Z`);
  meta.textContent = `${teacher ? `${ticket.ad} · ${ticket.sube || 'Şube belirtilmemiş'} · ` : ''}${date.toLocaleString('tr-TR')} · ${ticket.durum}`;
  card.append(title, details, meta);
  if (teacher && ticket.durum === 'Acik') {
    const close = document.createElement('button'); close.className = 'button danger'; close.textContent = 'Bileti Kapat';
    close.onclick = async () => { try { await api(`/api/bilet/${ticket.id}`, { method: 'DELETE' }); await loadWorkspace(); } catch (err) { notify(err.message); } };
    card.append(close);
  }
  workspace.append(card);
}
async function loadWorkspace() {
  workspace.replaceChildren(); workspace.classList.remove('hidden');
  const heading = document.createElement('h2');
  heading.textContent = currentUser.rol === 'Ogretmen' ? 'Öğretmen bilet masası' : 'Öğrenci paneli';
  workspace.append(heading);
  if (currentUser.rol === 'Ogrenci') {
    const button = document.createElement('button'); button.className = 'button'; button.textContent = 'Destek talebi oluştur';
    button.onclick = showTicketForm; workspace.append(button);
  }
  try {
    const data = await api(currentUser.rol === 'Ogretmen' ? '/api/biletler' : '/api/biletlerim');
    if (!data.biletler.length) { const empty = document.createElement('p'); empty.textContent = 'Henüz bilet yok.'; workspace.append(empty); }
    data.biletler.forEach((ticket) => addTicketCard(ticket, currentUser.rol === 'Ogretmen'));
  } catch (err) { notify(err.message); }
}
function showTicketForm() {
  openModal('Destek talebi', `<label for="ticketSubject">Konu</label><input id="ticketSubject" maxlength="120" required><label for="ticketDetails">Açıklama</label><textarea id="ticketDetails" rows="5" maxlength="2000" required></textarea>`, 'Talebi Gönder', async () => {
    const data = await api('/api/bilet', { method: 'POST', body: { konu: document.querySelector('#ticketSubject').value, detay: document.querySelector('#ticketDetails').value } });
    modal.close(); notify(data.message); await loadWorkspace();
  });
}
async function logout() {
  try { await api('/api/cikis', { method: 'POST' }); csrfToken = ''; await refreshCsrf(); await loadSession(); notify('Oturum kapatıldı.'); }
  catch (err) { notify(err.message); }
}
async function loadSession() {
  const data = await api('/api/oturum');
  currentUser = data.loggedIn ? data.user : null;
  const auth = document.querySelector('#authArea');
  const actions = document.querySelector('#heroActions');
  const welcome = document.querySelector('#welcome');
  auth.replaceChildren(); actions.replaceChildren();
  if (currentUser) {
    const label = document.createElement('span'); label.className = 'user-label'; label.textContent = `${currentUser.ad} · ${currentUser.rol === 'Ogrenci' ? 'Öğrenci' : 'Öğretmen'}`;
    const exit = document.createElement('button'); exit.className = 'button secondary'; exit.textContent = 'Çıkış'; exit.onclick = logout;
    auth.append(label, exit);
    welcome.textContent = `Hoş geldiniz, ${currentUser.ad}.`;
    await loadWorkspace();
  } else {
    workspace.classList.add('hidden'); workspace.replaceChildren();
    welcome.textContent = 'Gelecek bilimle, bilim fenle şekillenir.';
    const register = document.createElement('button'); register.className = 'button'; register.textContent = 'Öğrenci Kaydı'; register.onclick = showRegister;
    const login = document.createElement('button'); login.className = 'button secondary'; login.textContent = 'Portal Girişi'; login.onclick = showLogin;
    auth.append(login); actions.append(register, login.cloneNode(true)); actions.lastChild.onclick = showLogin;
  }
}
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'show-login') showLogin();
  if (action === 'show-register') showRegister();
});
document.querySelector('.dialog-close').addEventListener('click', () => modal.close());
(async () => {
  try { await refreshCsrf(); await loadSession(); }
  catch (err) { notify(`Portal başlatılamadı: ${err.message}`); }
})();
