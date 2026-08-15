/**
 * db.js — SQLite 数据访问层
 *
 * 职责：
 *   1. 初始化 data/ 目录与 SQLite 数据库文件（opad.db）
 *   2. 建表（settings / stories / sprints / standup_log / hat_progress / achievements）
 *   3. 首次运行时写入默认种子数据（与原 localStorage 版 defaultState 一致）
 *   4. 提供与旧版 state 对象结构一致的读写接口
 *
 * 说明：
 *   - 旧版单页应用把整个 state 存在 localStorage；改造后数据落 SQLite，
 *     前端通过 REST API 读写，本模块负责 JSON 字段（<-> TEXT 列）的序列化。
 *   - 数据库文件默认在 <项目根>/data/opad.db，可用环境变量 OPAD_DATA_DIR 覆盖。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname);
const DATA_DIR = process.env.OPAD_DATA_DIR
  ? path.resolve(process.env.OPAD_DATA_DIR)
  : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'opad.db');

/* ---------------- 日期工具（与前端一致） ---------------- */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayStrFrom(d);
}
function todayStrFrom(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------------- 默认种子数据（对齐原 defaultState） ---------------- */
function defaultData() {
  const today = todayStr();
  return {
    version: 1,
    settings: {
      sprintDuration: 7,
      currentSprintNum: 1,
      sprintStartDate: today,
      ownerName: 'Solo Founder',
    },
    backlog: [
      {
        id: 'US-001',
        title: '搭建项目脚手架',
        role: '作为开发者',
        want: '我希望有一个完整的项目骨架',
        soThat: '以便快速开始功能开发',
        priority: 'P1',
        storyPoints: 3,
        status: 'todo',
        sprint: 1,
        acceptanceCriteria: ['包含目录结构', '配置好构建工具', 'README说明如何启动'],
        createdAt: today,
        boardOrder: 1,
      },
      {
        id: 'US-002',
        title: '设计数据库模型',
        role: '作为开发者',
        want: '我希望定义核心数据模型',
        soThat: '以便前后端有统一的数据结构',
        priority: 'P0',
        storyPoints: 5,
        status: 'todo',
        sprint: 1,
        acceptanceCriteria: ['ER图完成', '模型字段定义完整', '包含关系映射'],
        createdAt: today,
        boardOrder: 2,
      },
    ],
    sprints: [
      {
        num: 1,
        goal: '完成项目基础架构搭建',
        startDate: today,
        endDate: addDays(today, 6),
        status: 'active',
        retrospective: { wentWell: [], needsImprovement: [], actionItems: [], mood: 0 },
      },
    ],
    standupLog: [],
    achievements: [
      { id: 'first_sprint', name: '首战告捷', desc: '完成第1个Sprint', unlocked: false, date: null },
      { id: 'speed_star', name: '速度之星', desc: '单Sprint完成超过10个故事点', unlocked: false, date: null },
      { id: 'three_streak', name: '三连胜', desc: '连续完成3个Sprint', unlocked: false, date: null },
      { id: 'story_master', name: '故事大师', desc: '编写20个用户故事', unlocked: false, date: null },
      { id: 'zero_bug', name: '零缺陷发布', desc: '一个Sprint无P0/P1遗留', unlocked: false, date: null },
      { id: 'early_bird', name: '晨型战士', desc: '连续7天完成站会记录', unlocked: false, date: null },
      { id: 'multihat', name: '多面手', desc: '5顶帽子的清单都至少完成过一次', unlocked: false, date: null },
      { id: 'data_driven', name: '数据驱动', desc: '完成3次Sprint回顾', unlocked: false, date: null },
      { id: 'fast_iter', name: '快速迭代', desc: 'Sprint完成率>=100%', unlocked: false, date: null },
      { id: 'hundred_pts', name: '百点达成', desc: '累计完成100个故事点', unlocked: false, date: null },
    ],
    motivation: { streakSprints: 0, totalStoryPoints: 0, totalSprints: 0 },
    hatProgress: {
      po: [false, false, false, false],
      sm: [false, false, false, false],
      dev: [false, false, false, false],
      qa: [false, false, false, false],
      tl: [false, false, false, false],
    },
    vision: '',
  };
}

/* ---------------- 数据库初始化 ---------------- */
let db = null;

function init() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  if (isFirstRun()) seed();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stories (
      id        TEXT PRIMARY KEY,
      data      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sprints (
      num       INTEGER PRIMARY KEY,
      data      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS standup_log (
      date       TEXT PRIMARY KEY,
      data       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hat_progress (
      hat        TEXT PRIMARY KEY,
      data       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id         TEXT PRIMARY KEY,
      data       TEXT NOT NULL
    );
  `);
}

function isFirstRun() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  return row.c === 0;
}

function seed() {
  const d = defaultData();
  setSetting('version', d.version);
  setSetting('settings', d.settings);
  d.backlog.forEach((s) => saveStory(s));
  d.sprints.forEach((sp) => saveSprint(sp));
  d.standupLog.forEach((l) => saveStandupLog(l));
  d.achievements.forEach((a) => saveAchievement(a));
  saveMotivation(d.motivation);
  saveHatProgress(d.hatProgress);
  setSetting('vision', d.vision);
}

/* ---------------- 读写接口（全部原子事务，返回深拷贝） ---------------- */
const jsonParse = (s, fallback) => {
  try { return JSON.parse(s); } catch (e) { return fallback; }
};
const clone = (v) => JSON.parse(JSON.stringify(v));

/* -- settings -- */
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? jsonParse(row.value, fallback) : fallback;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value));
}
/* settings 对象便捷读写（存于 settings 表的 'settings' key） */
function getSettings() {
  return getSetting('settings', defaultData().settings);
}
function setSettings(obj) {
  setSetting('settings', obj);
}

/* -- stories -- */
function saveStory(s) {
  db.prepare(
    'INSERT INTO stories (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
  ).run(s.id, JSON.stringify(s));
}
function getStory(id) {
  const row = db.prepare('SELECT data FROM stories WHERE id = ?').get(id);
  return row ? jsonParse(row.data, null) : null;
}
function deleteStory(id) {
  db.prepare('DELETE FROM stories WHERE id = ?').run(id);
}
function getAllStories() {
  return db.prepare('SELECT data FROM stories ORDER BY rowid').all().map((r) => jsonParse(r.data, null));
}
function nextStorySeq() {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id, 4) AS INTEGER)) AS m FROM stories").get();
  return (row.m || 0) + 1;
}

/* -- sprints -- */
function saveSprint(sp) {
  db.prepare(
    'INSERT INTO sprints (num, data) VALUES (?, ?) ON CONFLICT(num) DO UPDATE SET data = excluded.data'
  ).run(sp.num, JSON.stringify(sp));
}
function getSprint(num) {
  const row = db.prepare('SELECT data FROM sprints WHERE num = ?').get(num);
  return row ? jsonParse(row.data, null) : null;
}
function getAllSprints() {
  return db
    .prepare('SELECT data FROM sprints ORDER BY num')
    .all()
    .map((r) => jsonParse(r.data, null));
}
function deleteSprint(num) {
  db.prepare('DELETE FROM sprints WHERE num = ?').run(num);
}

/* -- standup log -- */
function saveStandupLog(entry) {
  db.prepare(
    'INSERT INTO standup_log (date, data) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET data = excluded.data'
  ).run(entry.date, JSON.stringify(entry));
}
function getAllStandupLog() {
  return db
    .prepare('SELECT data FROM standup_log ORDER BY date')
    .all()
    .map((r) => jsonParse(r.data, null));
}

/* -- hat progress -- */
function saveHatProgress(progress) {
  for (const hat of Object.keys(progress)) {
    db.prepare(
      'INSERT INTO hat_progress (hat, data) VALUES (?, ?) ON CONFLICT(hat) DO UPDATE SET data = excluded.data'
    ).run(hat, JSON.stringify(progress[hat]));
  }
}
function getHatProgress() {
  const rows = db.prepare('SELECT hat, data FROM hat_progress').all();
  const out = { po: [], sm: [], dev: [], qa: [], tl: [] };
  rows.forEach((r) => {
    out[r.hat] = jsonParse(r.data, []);
  });
  return out;
}

/* -- achievements -- */
function saveAchievement(a) {
  db.prepare(
    'INSERT INTO achievements (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
  ).run(a.id, JSON.stringify(a));
}
function getAllAchievements() {
  return db
    .prepare('SELECT data FROM achievements ORDER BY rowid')
    .all()
    .map((r) => jsonParse(r.data, null));
}

/* -- motivation & vision 存 settings 表 -- */
function saveMotivation(m) {
  setSetting('motivation', m);
}
function getMotivation() {
  return getSetting('motivation', { streakSprints: 0, totalStoryPoints: 0, totalSprints: 0 });
}

/* ================= 组合读取：一次拼出完整 state ================= */
function getFullState() {
  const settings = getSetting('settings', defaultData().settings);
  return {
    version: getSetting('version', 1),
    settings,
    backlog: getAllStories(),
    sprints: getAllSprints(),
    standupLog: getAllStandupLog(),
    achievements: getAllAchievements(),
    motivation: getMotivation(),
    hatProgress: getHatProgress(),
    vision: getSetting('vision', ''),
    _obDone: getSetting('_obDone', false),
  };
}

/* ================= 数据导入导出 ================= */
function importState(data) {
  const tx = db.transaction(() => {
    // 清空所有表
    db.exec('DELETE FROM settings; DELETE FROM stories; DELETE FROM sprints; DELETE FROM standup_log; DELETE FROM hat_progress; DELETE FROM achievements;');
    const d = data || {};
    setSetting('version', d.version || 1);
    setSetting('settings', d.settings || defaultData().settings);
    (d.backlog || []).forEach((s) => { if (s.id) saveStory(s); });
    (d.sprints || []).forEach((sp) => saveSprint(sp));
    (d.standupLog || []).forEach((e) => { if (e.date) saveStandupLog(e); });
    (d.achievements || []).forEach((a) => { if (a.id) saveAchievement(a); });
    saveMotivation(d.motivation || { streakSprints: 0, totalStoryPoints: 0, totalSprints: 0 });
    saveHatProgress(d.hatProgress || defaultData().hatProgress);
    setSetting('vision', d.vision || '');
    setSetting('_obDone', !!d._obDone);
  });
  tx();
  return getFullState();
}

function resetAll() {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM settings; DELETE FROM stories; DELETE FROM sprints; DELETE FROM standup_log; DELETE FROM hat_progress; DELETE FROM achievements;');
    seed();
  });
  tx();
  return getFullState();
}

module.exports = {
  init,
  get db() { return db; },
  DATA_DIR,
  DB_FILE,
  // 日期工具
  todayStr,
  addDays,
  // settings
  getSetting,
  setSetting,
  getSettings,
  setSettings,
  // stories
  getStory,
  saveStory,
  deleteStory,
  getAllStories,
  nextStorySeq,
  // sprints
  getSprint,
  saveSprint,
  getAllSprints,
  deleteSprint,
  // standup
  saveStandupLog,
  getAllStandupLog,
  // hats
  saveHatProgress,
  getHatProgress,
  // achievements
  saveAchievement,
  getAllAchievements,
  // motivation
  saveMotivation,
  getMotivation,
  // state
  getFullState,
  exportState: getFullState,
  importState,
  resetAll,
};