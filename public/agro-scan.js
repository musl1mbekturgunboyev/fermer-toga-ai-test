/* Crop assessment shares the existing authenticated AI and account storage. */
const AGRO_RISK = { low: ['Past', ''], medium: ['Kuzatuv zarur', 'w'], high: ['Agronomga murojaat qiling', 'w'], unknown: ['Aniqlashtirish kerak', 'b'] };
const AGRO_STATUS = { watching: 'Kuzatuvda', improving: 'Yaxshilanmoqda', worsening: 'Belgilar kuchaymoqda', resolved: 'Kuzatuv yakunlandi' };
S.agroScans = [];
const agroRecords = () => Array.isArray(S.agroScans) ? S.agroScans : [];
const agroDay = () => new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10);
const agroDate = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sana noma’lum';
const agroList = values => `<ul>${(Array.isArray(values) ? values : []).map(value => `<li>${esc(value)}</li>`).join('')}</ul>`;
const agroRecord = id => agroRecords().find(record => record.id === id);

function agroResult(record) {
  const risk = AGRO_RISK[record.severity] || AGRO_RISK.unknown;
  const group = agroRecords().filter(item => item.group === record.group);
  return `<article class="card agro-result" id="agro-result"><div class="agro-result-head"><div><span class="pill b">AI TAXMINI</span><h2>${esc(record.plant)}</h2><p>${esc(record.plot || 'Maydon ko‘rsatilmagan')} · ${esc(agroDate(record.createdAt))}</p></div><span class="pill ${risk[1]}">${risk[0]}</span></div>
  <div class="agro-result-grid">${record.photo ? `<img class="agro-photo" src="${esc(record.photo)}" alt="Tahlil uchun yuklangan o‘simlik">` : ''}<div><h3>${esc(record.problem)}</h3><p>${esc(record.summary)}</p><h3>Ko‘ringan belgilar</h3>${agroList(record.observations)}<h3>Ehtimoliy sabablar</h3>${agroList(record.possible_causes)}</div></div>
  <div class="grid g2"><section class="agro-advice"><h3>Hozir nima qilish mumkin?</h3>${agroList(record.actions)}</section><section class="agro-advice"><h3>Keyingi parvarish va kuzatuv</h3>${agroList(record.prevention)}<p><b>Qayta kuzatuv</b> · ${esc(record.nextCheck)}</p></section></div>
  <p class="disc">${esc(record.agronomist_note)}</p><p class="muted">Rasm asosidagi baho agronom tekshiruvi va laboratoriya tahlili o‘rnini bosmaydi.</p>
  ${S.agroSaveError ? '<p class="disc" role="alert">Tahlil tayyor. Hisobingizga saqlash amalga oshmadi. <button class="btn alt" type="button" data-agro-save>Saqlashni qayta urinish</button></p>' : ''}
  <div class="agro-actions"><button class="btn" type="button" data-agro-follow="${esc(record.id)}">${uiIcon('scan',16)} Qayta suratga olib kuzatish</button><button class="btn alt" type="button" data-agro-remind="${esc(record.id)}">${uiIcon('bell',16)} Eslatma qo‘shish</button></div>
  <form class="agro-observation" data-agro-observation="${esc(record.id)}"><h3>O‘zingiz kuzatgan holat</h3><p class="muted">Bu holatni siz belgilaysiz.</p><label class="field">Kuzatuv holati<select name="status">${Object.entries(AGRO_STATUS).map(([value, title]) => `<option value="${value}" ${value === (record.status || 'watching') ? 'selected' : ''}>${title}</option>`).join('')}</select></label><label class="field">Qayd<textarea name="note" maxlength="800" placeholder="Masalan, kechagi holatga nisbatan bargdagi dog‘lar o‘zgardimi?">${esc(record.note || '')}</textarea></label><button class="btn alt">Qaydni saqlash</button><span role="status" class="agro-note-status"></span></form>
  ${group.length > 1 ? `<details><summary>Shu ekin bo‘yicha ${group.length} ta tahlil</summary><div class="agro-timeline">${group.map(item => `<button type="button" class="agro-history-row" data-agro-open="${esc(item.id)}"><span>${esc(agroDate(item.createdAt))}</span><b>${esc(item.problem)}</b><span>${esc(AGRO_STATUS[item.status] || AGRO_STATUS.watching)}</span></button>`).join('')}</div></details>` : ''}</article>`;
}

function agroScanView() {
  const records = agroRecords();
  const selected = agroRecord(S.agroSelected) || records[0];
  const followup = agroRecord(S.agroFollowup);
  const draft = S.agroDraft || {};
  const reviewing = records.filter(record => record.status !== 'resolved').length;
  return shell('#/agro-scan', `<section class="agro-hero"><div><span class="pill">${uiIcon('sprout',14)} O‘SIMLIK VA HOSIL KUZATUVI</span><h1>Agro scan</h1><p>Barg, poya yoki meva rasmini yuklang. Ko‘ringan belgilarni baholang va ekiningizdagi o‘zgarishlarni kuzatib boring.</p></div><div class="agro-hero-mark" aria-hidden="true">${uiIcon('sprout',64)}</div></section>
  <div class="grid g2 agro-stats"><div class="card"><b>${records.length}</b><span>Saqlangan tahlillar</span></div><div class="card"><b>${reviewing}</b><span>Kuzatuvdagi yozuvlar</span></div></div>
  <div class="agro-workspace"><section class="card"><h2>${followup ? 'Qayta kuzatuv' : 'Yangi o‘simlik tahlili'}</h2><p class="muted">1. Rasm yuklang · 2. Ma’lumot kiriting · 3. Tahlilni oling</p>
  ${followup ? `<p class="disc">${esc(followup.crop || followup.plant)} · ${esc(followup.plot || '')}<br>Oldingi tahlil bilan bir kuzatuv tarixiga saqlanadi. <button type="button" class="btn alt" data-agro-new>Yangi kuzatuv boshlash</button></p>` : ''}
  <form id="agro-form"><label class="agro-upload">${uiIcon('scan',18)} O‘simlik rasmlarini tanlang<input name="photos" type="file" accept="image/jpeg,image/png" multiple required><span>1–3 ta JPG yoki PNG. Har biri 15 MB gacha.</span></label><div id="agro-preview" class="agro-preview"></div>
  <div class="grid g2"><label class="field">Ekin nomi<input name="crop" maxlength="80" placeholder="Pomidor, bodring, bug‘doy…" value="${esc(draft.crop || '')}"></label><label class="field">Maydon yoki joy nomi<input name="plot" maxlength="100" placeholder="Issiqxona 1, tomorqa…" value="${esc(draft.plot || '')}"></label></div>
  <label class="field">O‘sish bosqichi<select name="stage">${['Noma’lum', 'Ko‘chat', 'O‘sish davri', 'Gullash', 'Meva tugish', 'Hosil davri'].map(stage => `<option ${stage === draft.stage ? 'selected' : ''}>${stage}</option>`).join('')}</select></label>
  <label class="field">Nimani kuzatdingiz?<textarea name="symptoms" maxlength="800" placeholder="Qachondan boshlandi? Qanday dog‘, sarg‘ayish yoki qurish bor?">${esc(draft.symptoms || '')}</textarea></label>
  <p class="muted">Agro scan va chorva AI Scan bir xil oylik skan limitidan foydalanadi.</p><p id="agro-error" role="alert" class="agro-error">${esc(S.agroError || '')}</p><button class="btn" ${S.agroPending ? 'disabled' : ''}>${S.agroPending ? 'Tahlil qilinmoqda…' : uiIcon('sprout',16)+' O‘simlikni tahlil qilish'}</button><p class="muted" role="status">${S.agroPending ? 'Rasmlardagi belgilar o‘rganilmoqda. Natija shu bo‘limda ko‘rinadi.' : 'Yaqin masofadan bargni va butun o‘simlikni tabiiy yorug‘likda suratga oling.'}</p></form></section>
  <aside class="card agro-help"><span class="pill b">YAXSHI RASM — ANIQLIROQ BAHO</span><h2>Nimani suratga olish kerak?</h2><p>🍃 Bargning oldi va orqa tomoni</p><p>🌱 Poya va butun o‘simlik</p><p>🍅 Zararlangan meva yoki yaqin belgi</p><hr><p class="muted">Tiniq, filtrsiz rasm tanlang. O‘simlik turi, alomat boshlangan vaqt va sug‘orish holati tahlilga yordam beradi.</p><p class="disc">AI rasmda ko‘rinmaydigan muammolarni aniqlay olmasligi mumkin. Hosil bo‘yicha yakuniy qaror uchun agronom bilan maslahatlashing.</p></aside></div>
  ${selected ? agroResult(selected) : '<section class="card agro-empty"><span aria-hidden="true">🌾</span><h2>Birinchi kuzatuvingizni boshlang</h2><p>Rasm va tahlillar shu yerda paydo bo‘ladi. Oxirgi 30 ta tahlil hisobingizda saqlanadi.</p></section>'}
  <section class="card agro-history"><div class="agro-result-head"><h2>Kuzatuv tarixi</h2><span class="pill">${records.length} / 30</span></div>${records.length ? records.map(record => `<button type="button" class="agro-history-row ${selected?.id === record.id ? 'agro-active' : ''}" data-agro-open="${esc(record.id)}"><span>${esc(agroDate(record.createdAt))}</span><b>${esc(record.crop || record.plant)} · ${esc(record.problem)}</b><span>${esc(record.plot || 'Maydon ko‘rsatilmagan')} · ${esc(AGRO_STATUS[record.status] || AGRO_STATUS.watching)}</span></button>`).join('') : '<p class="muted">Hozircha tahlil yo‘q.</p>'}</section>`);
}

async function agroThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .65));
  if (!blob) throw Error('Rasmni tayyorlab bo‘lmadi. Boshqa rasm tanlang.');
  const data = await b64(blob);
  if (data.length > 120000) throw Error('Rasm hajmi katta. Boshqa rasm tanlang.');
  return data;
}

function agroDraft(form) {
  return Object.fromEntries(['crop', 'plot', 'stage', 'symptoms'].map(key => [key, form.elements[key].value.trim()]));
}

document.addEventListener('input', event => {
  if (event.target.form?.id === 'agro-form' && event.target.name !== 'photos') S.agroDraft = agroDraft(event.target.form);
});
document.addEventListener('change', async event => {
  if (event.target.form?.id !== 'agro-form' || event.target.name !== 'photos') return;
  const input = event.target;
  const revision = input.agroRevision = (input.agroRevision || 0) + 1;
  const preview = document.getElementById('agro-preview');
  const error = document.getElementById('agro-error');
  preview.innerHTML = '';
  try {
    const files = [...input.files];
    if (files.length > 3) throw Error('Ko‘pi bilan 3 ta rasm tanlang.');
    const photos = await Promise.all(files.map(file => {
      if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 15 * 1024 * 1024) throw Error('Har bir rasm JPG yoki PNG va 15 MB dan kichik bo‘lsin.');
      return agroThumbnail(file);
    }));
    if (preview.isConnected && input.agroRevision === revision) {
      preview.innerHTML = photos.map(photo => `<img src="${photo}" alt="Tanlangan o‘simlik rasmi">`).join('');
      error.textContent = '';
    }
  } catch (problem) { if (error.isConnected && input.agroRevision === revision) error.textContent = problem.message; }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id === 'agro-form') {
    event.preventDefault();
    if (S.agroPending) return;
    const owner = S.uid;
    if (!owner || !DB) return toast('Hisobingizga qayta kiring.');
    const error = form.querySelector('#agro-error');
    const button = form.querySelector('button');
    S.agroDraft = agroDraft(form);
    const followup = agroRecord(S.agroFollowup);
    S.agroError = '';
    try {
      const files = [...form.elements.photos.files];
      if (files.length < 1 || files.length > 3) throw Error('1–3 ta rasm tanlang.');
      if (files.some(file => !/^image\/(jpeg|png)$/.test(file.type) || file.size > 15 * 1024 * 1024)) throw Error('JPG yoki PNG formatida, 15 MB dan kichik rasm tanlang.');
      S.agroPending = true;
      button.disabled = true;
      button.textContent = 'Tahlil qilinmoqda…';
      error.textContent = '';
      const draft = { ...S.agroDraft };
      const images = await Promise.all(files.map(async file => b64(await comp(file))));
      const photo = await agroThumbnail(files[0]);
      const previous = followup ? `${followup.createdAt}: ${followup.problem}. ${followup.summary}. Fermer qaydi: ${followup.note || ''}` : '';
      const result = await api('/api/agro-scan', { ...draft, previous, images, lang: S.lang || 'uz' });
      if (S.uid !== owner) return;
      const createdAt = new Date().toISOString();
      const nextCheck = new Date(Date.parse(agroDay()) + result.next_check_days * 864e5).toISOString().slice(0, 10);
      const id = crypto.randomUUID();
      const record = { ...result, ...draft, id, group: followup?.group || id, createdAt, nextCheck, photo, status: 'watching', note: '' };
      S.agroScans = [record, ...agroRecords()].slice(0, 30);
      S.agroSelected = id;
      S.agroFollowup = null;
      S.agroDraft = {};
      try { await persistNow(); S.agroSaveError = false; }
      catch (_) { S.agroSaveError = true; }
      if (S.uid === owner) toast(S.agroSaveError ? 'Tahlil tayyor. Saqlashni qayta urinib ko‘ring.' : 'Agro scan tahlili saqlandi');
    } catch (problem) {
      if (S.uid === owner) S.agroError = problem.message || 'Rasmni tahlil qilib bo‘lmadi. Qayta urinib ko‘ring.';
    } finally {
      if (S.uid === owner) {
        S.agroPending = false;
        if (location.hash === '#/agro-scan') render();
      }
    }
    return;
  }
  if (form.dataset.agroObservation) {
    event.preventDefault();
    const record = agroRecord(form.dataset.agroObservation);
    if (!record) return;
    const owner = S.uid;
    const status = form.elements.status.value;
    if (!Object.hasOwn(AGRO_STATUS, status)) return;
    Object.assign(record, { status, note: form.elements.note.value.trim().slice(0, 800) });
    const button = form.querySelector('button');
    const message = form.querySelector('.agro-note-status');
    button.disabled = true;
    try {
      await persistNow();
      if (owner === S.uid) { S.agroSaveError = false; if (location.hash === '#/agro-scan') render(); toast('Kuzatuv qaydi saqlandi'); }
    } catch (_) { if (message.isConnected) message.textContent = 'Saqlanmadi. Qayta urinib ko‘ring.'; }
    finally { button.disabled = false; }
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-agro-open],[data-agro-follow],[data-agro-new],[data-agro-remind],[data-agro-save]');
  if (!button) return;
  if (S.agroPending && (button.hasAttribute('data-agro-new') || button.dataset.agroFollow)) return;
  const data = button.dataset;
  if (data.agroOpen) { S.agroSelected = data.agroOpen; render(); document.getElementById('agro-result')?.scrollIntoView({ behavior: 'smooth' }); }
  if (data.agroFollow) {
    const record = agroRecord(data.agroFollow);
    if (!record) return;
    S.agroFollowup = record.id;
    S.agroDraft = { crop: record.crop || record.plant, plot: record.plot || '', stage: record.stage || 'Noma’lum', symptoms: '' };
    S.agroError = '';
    render();
  }
  if (button.hasAttribute('data-agro-new')) { S.agroFollowup = null; S.agroDraft = {}; S.agroError = ''; render(); }
  if (button.hasAttribute('data-agro-save') || data.agroRemind) {
    const owner = S.uid;
    if (!owner || !DB) return;
    button.disabled = true;
    try {
      if (data.agroRemind) {
        const record = agroRecord(data.agroRemind);
        if (!record) return;
        if (record.nextCheck < agroDay()) throw Error('Kuzatuv sanasi o‘tgan. Yangi tahlil qiling yoki Eslatmalar bo‘limida sana tanlang.');
        const title = `Agro scan — ${record.crop || record.plant}${record.plot ? ' · ' + record.plot : ''}`;
        if (!S.rem.some(item => item[0] === title && item[1] === record.nextCheck)) S.rem.unshift([title, record.nextCheck, '09:00', 0]);
      }
      await persistNow();
      if (owner === S.uid) { S.agroSaveError = false; toast(data.agroRemind ? 'Eslatmalar bo‘limiga qo‘shildi' : 'Tahlil hisobingizga saqlandi'); if (location.hash === '#/agro-scan') render(); }
    } catch (problem) { if (owner === S.uid) toast(problem.message); }
    finally { button.disabled = false; }
  }
});

R['#/agro-scan'] = agroScanView;
guarded.push('#/agro-scan');
X.unshift(['#/agro-scan', '🌿', 'Agro scan']);
