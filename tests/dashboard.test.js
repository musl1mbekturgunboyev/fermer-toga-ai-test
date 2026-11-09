const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('public/index.html', 'utf8');
function workspace() {
  const S = { user: 'Fermer', animals: [], weight: [], rem: [], farm: {}, plan: 'Bepul' };
  const context = { S, X: [], logo: () => '<img alt="Fermer Tog‘a AI">', weightTrend: () => '<section id="weight-trend"></section>', esc: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/ui-icons.js', 'utf8'), context);
  vm.runInContext(html.slice(html.indexOf('function nav(a){'), html.indexOf('function weightTrend()')), context);
  vm.runInContext(html.slice(html.indexOf('function dashboard(){'), html.indexOf('function animals()')), context);
  return context;
}
test('Dashboard gauge counts distinct active animals with valid historical weight records', () => {
  const c = workspace();
  c.S.animals = [{ id: 'one', type: 'Sigir' }, { id: 'two', type: 'Qo‘y' }];
  c.S.weight = [{ a: 'one', kg: '400' }, { a: 'one', kg: 410 }, { a: 'archived', kg: 200 }, { a: 'two', kg: 'NaN' }];
  c.S.rem = [['Kuzatuv <script>', '2026-11-10', '09:00']];
  const out = c.dashboard();
  assert.match(out, /50%<\/text>/);
  assert.match(out, /2 ta hayvondan 1 tasida vazn yozuvi bor/);
  assert.doesNotMatch(out, /Kuzatuv <script>/);
  assert.match(out, /Kuzatuv &lt;script&gt;/);
  assert.match(out, /href="#\/agro-scan"/);
  assert.match(out, /id="weight-trend"/);
});
test('Empty dashboard shows no invented gauge percentage or animal bars', () => {
  const c = workspace();
  const out = c.dashboard();
  assert.match(out, /Hozircha hayvonlar yo‘q/);
  assert.doesNotMatch(out, /\d+%<\/text>/);
  assert.match(out, /Birinchi hayvonni qo‘shish/);
});
test('Grouped navigation retains all sections and keeps admin role-gated', () => {
  const c = workspace();
  for (const route of ['app','animals','scan','agro-scan','assistant','passport','weight','feeding','health','vacc','reminders','farm','reports','market','feed-market','sellers','market-my','market-chats','pricing2','profile']) {
    assert.ok(c.nav('#/app').includes(`href="#/${route}"`), route);
  }
  assert.doesNotMatch(c.nav('#/app'), /href="#\/admin"/);
  c.S.admin = true;
  assert.match(c.nav('#/app'), /href="#\/admin"/);
});
