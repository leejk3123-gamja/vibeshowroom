/**
 * ============================================================
 *  바이브 벤처 웹 전시관 — Apps Script API (v4)
 *  · 이 스크립트가 붙어 있는 스프레드시트를 자동으로 읽습니다. (ID 입력 불필요)
 *  · 월 탭 이름: "6월", "7월", "2026년 1월", "01_앱자랑(8월)" 모두 인식
 *  · 작품 탭 열 순서: A 번호 | B 프로젝트명 | C 링크 | D 소개 | E 개발자 | F 학교 | G 학년 | H 반 | I 썸네일URL(선택)
 *  · 자동 생성 탭: 피드백데이터(방명록), 반응데이터(박수)
 *
 *  설치: 붙여넣기 → 저장 → authorize 실행(권한 승인) → 배포 → 새 배포(웹 앱 / 나 / 모든 사용자)
 *  수정 후에는 반드시 배포 → 배포 관리 → ✏️ → 새 버전 → 배포 를 해야 반영됩니다.
 * ============================================================
 */
var CONFIG = {
  BASE_YEAR: 2026,               // 탭 이름에 연도가 없을 때 사용할 연도 ("6월" → 2026-06)
  FEEDBACK_SHEET: '피드백데이터',
  REACTION_SHEET: '반응데이터',
  CACHE_SEC: 120,                // 작품 목록 캐시(초)
  MAX_NAME: 30,
  MAX_SCHOOL: 40,
  MAX_CONTENT: 500,
  MAX_CLAP_PER_REQUEST: 5
};
var FEEDBACK_HEADERS = ['월', '작품명', '작성자 이름', '소속 학교', '내용', '작성 시간'];
var REACTION_HEADERS = ['월', '작품명', '박수', '최근 반응 시간'];
var CACHE_KEY = 'all_v4';

/* ───────────── 진입점 ───────────── */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'all';
  try {
    if (action === 'all' || action === 'rooms' || action === 'months') return json_(getAll_());
    if (action === 'comments') return json_({ ok: true, comments: getComments_(p.month) });
    if (action === 'recent') return json_({ ok: true, comments: getRecent_(Number(p.limit) || 12) });
    if (action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
    return json_({ ok: false, error: '알 수 없는 action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: '잘못된 요청 형식' }); }
  try {
    if (body.action === 'comment') return json_(saveComment_(body));
    if (body.action === 'clap') return json_(saveClap_(body));
    return json_({ ok: false, error: '알 수 없는 action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ───────────── 유틸 ───────────── */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fmt_(d) { return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }

function parseMonthSheet_(name) {
  name = str_(name);
  var m = name.match(/^(?:(\d{4})\s*년?\s*)?(\d{1,2})\s*월$/) || name.match(/\((?:(\d{4})\s*년?\s*)?(\d{1,2})\s*월\)/);
  if (!m) return null;
  var year = m[1] ? Number(m[1]) : CONFIG.BASE_YEAR;
  var month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: year, month: month, key: year + '-' + ('0' + month).slice(-2), label: (m[1] ? year + '년 ' : '') + month + '월' };
}

function getOrCreateSheet_(name, headers) {
  var ss = ss_(); var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  else if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function headerIndex_(sh) {
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var idx = {}; head.forEach(function (h, i) { var k = str_(h); if (k && idx[k] === undefined) idx[k] = i; });
  return idx;
}

/* ───────────── 작품 목록 ───────────── */
function readRooms_() {
  var rooms = [];
  ss_().getSheets().forEach(function (sh) {
    var info = parseMonthSheet_(sh.getName());
    if (!info) return;
    var values = sh.getLastRow() > 0 ? sh.getDataRange().getValues() : [];
    var projects = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var name = str_(r[1]);
      if (!name) continue;
      projects.push({
        no: str_(r[0]), name: name, link: str_(r[2]), description: str_(r[3]),
        developer: str_(r[4]), school: str_(r[5]), grade: str_(r[6]), classNo: str_(r[7]), thumb: str_(r[8])
      });
    }
    rooms.push({ sheetName: sh.getName(), year: info.year, month: info.month, key: info.key, label: info.label, open: projects.length > 0, projects: projects });
  });
  rooms.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  return rooms;
}

function getAll_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);

  var rooms = readRooms_();
  var stats = readStats_();
  rooms.forEach(function (r) {
    r.projects.forEach(function (p) {
      p.comments = (stats.comments[r.key + '|' + p.name] || 0) + (stats.comments['*|' + p.name] || 0);
      p.claps = stats.claps[r.key + '|' + p.name] || 0;
    });
  });
  var out = { ok: true, generatedAt: new Date().toISOString(), baseYear: CONFIG.BASE_YEAR, rooms: rooms };
  try { cache.put(CACHE_KEY, JSON.stringify(out), CONFIG.CACHE_SEC); } catch (e) { /* 100KB 초과 시 캐시 생략 */ }
  return out;
}

function projectExists_(month, project) {
  var all = getAll_();
  for (var i = 0; i < all.rooms.length; i++) {
    var r = all.rooms[i];
    if (r.key !== month) continue;
    for (var j = 0; j < r.projects.length; j++) if (r.projects[j].name === project) return true;
  }
  return false;
}

/* ───────────── 방명록 ───────────── */
function readFeedbackRows_() {
  var sh = ss_().getSheetByName(CONFIG.FEEDBACK_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var idx = headerIndex_(sh);
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var col = function (r, key) { return idx[key] === undefined ? '' : r[idx[key]]; };
  var out = [];
  values.forEach(function (r) {
    var project = str_(col(r, '작품명'));
    if (!project) return;
    var t = col(r, '작성 시간');
    var d = t instanceof Date ? t : (t ? new Date(t) : null);
    var valid = d && !isNaN(d.getTime());
    out.push({
      month: str_(col(r, '월')), project: project, name: str_(col(r, '작성자 이름')), school: str_(col(r, '소속 학교')),
      content: str_(col(r, '내용')), ts: valid ? d.getTime() : 0, date: valid ? fmt_(d) : ''
    });
  });
  return out;
}
function getComments_(month) {
  month = str_(month);
  return readFeedbackRows_()
    .filter(function (c) { return !month || !c.month || c.month === month; })
    .sort(function (a, b) { return b.ts - a.ts; })
    .map(function (c) { return { project: c.project, name: c.name, school: c.school, content: c.content, date: c.date }; });
}
function getRecent_(limit) {
  return readFeedbackRows_()
    .sort(function (a, b) { return b.ts - a.ts; })
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map(function (c) { return { month: c.month, project: c.project, name: c.name, content: c.content, date: c.date }; });
}
function saveComment_(b) {
  if (str_(b.website)) return { ok: true, skipped: true };   // 허니팟(봇) → 조용히 무시
  var month = str_(b.month), project = str_(b.project);
  var name = str_(b.name).slice(0, CONFIG.MAX_NAME);
  var school = str_(b.school).slice(0, CONFIG.MAX_SCHOOL);
  var content = str_(b.content).slice(0, CONFIG.MAX_CONTENT);
  if (!month || !project || !name || !content) return { ok: false, error: '필수 항목이 비어 있습니다.' };
  if (!projectExists_(month, project)) return { ok: false, error: '존재하지 않는 작품입니다.' };

  var now = new Date();
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = getOrCreateSheet_(CONFIG.FEEDBACK_SHEET, FEEDBACK_HEADERS);
    var idx = headerIndex_(sh);
    var width = Math.max(sh.getLastColumn(), FEEDBACK_HEADERS.length);
    var row = []; for (var i = 0; i < width; i++) row.push('');
    var put = function (k, v) { if (idx[k] !== undefined) row[idx[k]] = v; };
    put('월', month); put('작품명', project); put('작성자 이름', name); put('소속 학교', school); put('내용', content); put('작성 시간', now);
    sh.appendRow(row);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove(CACHE_KEY);
  return { ok: true, comment: { project: project, name: name, school: school, content: content, date: fmt_(now) } };
}

/* ───────────── 박수 ───────────── */
function readStats_() {
  var comments = {}, claps = {};
  readFeedbackRows_().forEach(function (c) {
    var k = (c.month || '*') + '|' + c.project;
    comments[k] = (comments[k] || 0) + 1;
  });
  var sh = ss_().getSheetByName(CONFIG.REACTION_SHEET);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
      var k = str_(r[0]) + '|' + str_(r[1]);
      claps[k] = (claps[k] || 0) + (Number(r[2]) || 0);
    });
  }
  return { comments: comments, claps: claps };
}
function saveClap_(b) {
  var month = str_(b.month), project = str_(b.project);
  var n = Math.max(1, Math.min(CONFIG.MAX_CLAP_PER_REQUEST, parseInt(b.n, 10) || 1));
  if (!month || !project) return { ok: false, error: '필수 항목이 비어 있습니다.' };
  if (!projectExists_(month, project)) return { ok: false, error: '존재하지 않는 작품입니다.' };

  var total = 0;
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = getOrCreateSheet_(CONFIG.REACTION_SHEET, REACTION_HEADERS);
    var last = sh.getLastRow(), found = -1, cur = 0;
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, 3).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (str_(vals[i][0]) === month && str_(vals[i][1]) === project) { found = i + 2; cur = Number(vals[i][2]) || 0; break; }
      }
    }
    total = cur + n;
    if (found > 0) sh.getRange(found, 3, 1, 2).setValues([[total, new Date()]]);
    else sh.appendRow([month, project, total, new Date()]);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove(CACHE_KEY);
  return { ok: true, claps: total };
}

/* ───────────── 관리용 (편집기에서 직접 실행) ───────────── */
function authorize() {
  var rooms = readRooms_();
  if (!rooms.length) Logger.log('⚠ 월 탭을 찾지 못했습니다. 탭 이름을 "6월", "7월" 또는 "2026년 1월" 형식으로 지어 주세요.');
  rooms.forEach(function (r) {
    Logger.log(r.sheetName + '  →  ' + r.key + ' / 작품 ' + r.projects.length + '개' + (r.open ? '' : '  (준비 중)'));
  });
  getOrCreateSheet_(CONFIG.FEEDBACK_SHEET, FEEDBACK_HEADERS);
  getOrCreateSheet_(CONFIG.REACTION_SHEET, REACTION_HEADERS);
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log('✅ 준비 완료. 배포 → 새 배포(웹 앱 / 나 / 모든 사용자)를 진행하세요.');
}
function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log('캐시를 비웠습니다. 시트 변경이 즉시 반영됩니다.');
}
