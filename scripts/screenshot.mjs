/**
 * 작품 스크린샷 생성기 (GitHub Actions 에서 실행)
 *  - js/config.js 의 API_URL 로 작품 목록을 받아, 각 링크를 Playwright(Chromium)로 열어 캡처합니다.
 *  - 저장 위치: thumbs/<월키>/<번호 2자리>.jpg  (예: thumbs/2026-09/03.jpg)
 *  - 이미 찍은 작품은 건너뜁니다. 다시 찍으려면 FORCE=1
 *  - 특정 달만: ONLY_MONTH=2026-09
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const cfgText = await fs.readFile(path.join(ROOT, 'js/config.js'), 'utf8');
const API = process.env.API_URL || (cfgText.match(/API_URL:\s*['"]([^'"]+)['"]/) || [])[1];
if (!API) { console.error('❌ js/config.js 에 API_URL 이 없습니다.'); process.exit(1); }

const FORCE = process.env.FORCE === '1';
const ONLY = (process.env.ONLY_MONTH || '').trim();
const OUT = path.join(ROOT, 'thumbs');
const manifestPath = path.join(OUT, 'manifest.json');

let manifest = {};
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { manifest = {}; }

const slugOf = (p, i) => { const n = String(p.no || '').replace(/\D/g, ''); return (n || String(i + 1)).padStart(2, '0'); };
const exists = async f => !!(await fs.stat(f).catch(() => null));

console.log('📡 작품 목록 요청:', API);
const res = await fetch(API + '?action=all', { redirect: 'follow' });
const data = await res.json();
if (!data.ok) throw new Error(data.error || 'API 오류');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'ko-KR', ignoreHTTPSErrors: true });
let ok = 0, skipped = 0; const failed = [];

for (const room of data.rooms) {
  if (!room.open) continue;
  if (ONLY && room.key !== ONLY) continue;
  await fs.mkdir(path.join(OUT, room.key), { recursive: true });

  for (const [i, p] of room.projects.entries()) {
    if (!/^https?:/i.test(p.link || '')) continue;
    const rel = `${room.key}/${slugOf(p, i)}.jpg`;
    const file = path.join(OUT, rel);
    if (!FORCE && manifest[rel] && await exists(file)) { skipped++; continue; }

    const page = await ctx.newPage();
    try {
      await page.goto(p.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
      manifest[rel] = { name: p.name, link: p.link, at: new Date().toISOString() };
      ok++; console.log('✅', room.key, p.name);
    } catch (e) {
      failed.push(`${room.key} / ${p.name}: ${e.message.split('\n')[0]}`);
      delete manifest[rel];
      await fs.rm(file, { force: true });
      console.warn('⚠️ 실패', room.key, p.name, '-', e.message.split('\n')[0]);
    } finally { await page.close(); }
  }
}
await browser.close();

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n완료: 새로 촬영 ${ok} · 건너뜀 ${skipped} · 실패 ${failed.length}`);
if (failed.length) console.log('실패 목록 (사이트가 꺼져 있거나 응답이 없는 경우, 페이지에서는 실시간 미리보기로 대체됩니다):\n - ' + failed.join('\n - '));
