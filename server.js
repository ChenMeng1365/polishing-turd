/**
 * server.js — OPAD v2 后端服务
 *
 * 技术栈：Node.js 原生 http 模块 + better-sqlite3，零 Web 框架依赖。
 *
 * 功能：
 *   1. 托管 public/ 静态文件（前端 index.html / app.js / style.css）
 *   2. 提供 REST API（/api/state、/api/stories、/api/sprints、/api/standup、
 *      /api/hats、/api/settings、/api/vision、/api/achievements、/api/import、/api/reset）
 *
 * 启动：node server.js  （默认端口 3001，可用环境变量 PORT 覆盖；数据目录可用 OPAD_DATA_DIR 覆盖）
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const db = require('./db');
const { checkAchievements } = require('./achievements');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname);
const PUBLIC_DIR = path.join(ROOT, 'public');

db.init();

/* ===================== 工具 ===================== */
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  // 防目录穿越
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': STATIC_MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

/* ===================== 业务辅助 ===================== */
function uuid() {
  return 'US-' + String(Math.floor(Math.random() * 89999) + 10000);
}

function sanitizeStory(body) {
  const s = {
    id: body.id,
    title: String(body.title || '').trim(),
    role: String(body.role || '').trim(),
    want: String(body.want || '').trim(),
    soThat: String(body.soThat || '').trim(),
    priority: body.priority || 'P1',
    storyPoints: parseFloat(body.storyPoints) || 1,
    status: body.status || 'todo',
    sprint: body.sprint == null || body.sprint === '' ? null : parseInt(body.sprint, 10),
    acceptanceCriteria: Array.isArray(body.acceptanceCriteria)
      ? body.acceptanceCriteria.map((c) => (typeof c === 'string' ? c : { text: String(c.text || ''), checked: !!c.checked }))
      : [],
    createdAt: body.createdAt || db.todayStr(),
    boardOrder: body.boardOrder == null ? Date.now() : body.boardOrder,
  };
  return s;
}

/* ===================== API 处理器 ===================== */
async function handleApi(req, res, parts) {
  const method = req.method;
  const [p0, p1, p2] = parts; // e.g. ['stories','US-001']

  /* ---- GET /api/state : 全量状态 ---- */
  if (p0 === 'state' && method === 'GET') {
    return send(res, 200, db.getFullState());
  }

  /* ---- stories ---- */
  if (p0 === 'stories') {
    if (method === 'GET') return send(res, 200, db.getAllStories());

    if (method === 'POST') {
      const body = await readBody(req);
      const s = sanitizeStory(body);
      s.id = uuid();
      s.status = 'todo';
      s.createdAt = db.todayStr();
      s.boardOrder = Date.now();
      db.saveStory(s);
      checkAchievements(db);
      return send(res, 201, s);
    }

    if (method === 'PUT') {
      const body = await readBody(req);
      const existing = db.getStory(p1);
      if (!existing) return send(res, 404, { error: '故事不存在' });
      const s = sanitizeStory({ ...existing, ...body, id: p1 });
      db.saveStory(s);
      checkAchievements(db);
      return send(res, 200, s);
    }

    if (method === 'DELETE' && p1) {
      db.deleteStory(p1);
      checkAchievements(db);
      return send(res, 200, { ok: true });
    }
  }

  /* ---- sprints ---- */
  if (p0 === 'sprints') {
    if (method === 'GET') return send(res, 200, db.getAllSprints());

    if (method === 'POST') {
      const body = await readBody(req);
      const settings = db.getSetting('settings', {});
      const goal = String(body.goal || '').trim();
      if (!goal) return send(res, 400, { error: '请填写Sprint目标' });
      const start = body.startDate || db.todayStr();
      const dur = parseInt(body.duration, 10) || 7;
      const num = (settings.currentSprintNum || 0) + 1;
      const sp = {
        num,
        goal,
        startDate: start,
        endDate: db.addDays(start, dur - 1),
        status: 'active',
        retrospective: { wentWell: [], needsImprovement: [], actionItems: [], mood: 0 },
      };
      db.saveSprint(sp);
      // 同步设置：当前 Sprint 号、开始日期、时长
      db.setSettings({
        ...settings,
        currentSprintNum: num,
        sprintStartDate: start,
        sprintDuration: dur,
      });
      checkAchievements(db);
      return send(res, 201, sp);
    }

    if (method === 'PUT' && p1) {
      const body = await readBody(req);
      const sp = db.getSprint(parseInt(p1, 10));
      if (!sp) return send(res, 404, { error: 'Sprint不存在' });
      if (body.goal != null) sp.goal = String(body.goal).trim();
      if (body.status != null) sp.status = body.status;
      if (body.startDate != null) sp.startDate = body.startDate;
      if (body.endDate != null) sp.endDate = body.endDate;
      if (body.retrospective != null) sp.retrospective = body.retrospective;
      db.saveSprint(sp);
      checkAchievements(db);
      return send(res, 200, sp);
    }

    if (method === 'DELETE' && p1) {
      const num = parseInt(p1, 10);
      const sp = db.getSprint(num);
      if (!sp) return send(res, 404, { error: 'Sprint不存在' });
      // 不允许删除当前活跃 Sprint
      const settings = db.getSettings();
      if (settings.currentSprintNum === num && sp.status === 'active') {
        return send(res, 400, { error: '不能删除当前活跃的Sprint，请先切换到其他Sprint或标记为已完成' });
      }
      db.deleteSprint(num);
      // 删除该 Sprint 下的故事，或将其移回 Backlog（sprint=null）
      const stories = db.getAllStories().filter((s) => s.sprint === num);
      stories.forEach((s) => {
        s.sprint = null;
        db.saveStory(s);
      });
      checkAchievements(db);
      return send(res, 200, { ok: true, movedToBacklog: stories.length });
    }
  }

  /* ---- motivation ---- */
  if (p0 === 'motivation') {
    if (method === 'GET') return send(res, 200, db.getMotivation());

    if (method === 'PUT') {
      const body = await readBody(req);
      db.saveMotivation({
        streakSprints: parseInt(body.streakSprints, 10) || 0,
        totalStoryPoints: parseFloat(body.totalStoryPoints) || 0,
        totalSprints: parseInt(body.totalSprints, 10) || 0,
      });
      checkAchievements(db);
      return send(res, 200, db.getMotivation());
    }
  }

  /* ---- onboarding ---- */
  if (p0 === 'onboarding') {
    if (method === 'PUT') {
      const body = await readBody(req);
      db.setSetting('_obDone', !!body.done);
      return send(res, 200, { ok: true });
    }
  }

  /* ---- standup ---- */
  if (p0 === 'standup') {
    if (method === 'GET') return send(res, 200, db.getAllStandupLog());

    if (method === 'POST') {
      const body = await readBody(req);
      const entry = {
        date: body.date || db.todayStr(),
        yesterday: String(body.yesterday || '').trim(),
        today: String(body.today || '').trim(),
        blockers: String(body.blockers || '').trim(),
        mood: parseInt(body.mood, 10) || 3,
      };
      db.saveStandupLog(entry);
      checkAchievements(db);
      return send(res, 200, entry);
    }
  }

  /* ---- hats ---- */
  if (p0 === 'hats') {
    if (method === 'GET') return send(res, 200, db.getHatProgress());

    if (method === 'PUT') {
      const body = await readBody(req);
      const progress = db.getHatProgress();
      progress[p1] = Array.isArray(body.data) ? body.data : progress[p1] || [];
      db.saveHatProgress(progress);
      checkAchievements(db);
      return send(res, 200, progress[p1]);
    }
  }

  /* ---- settings ---- */
  if (p0 === 'settings') {
    if (method === 'GET') return send(res, 200, db.getSettings());

    if (method === 'PUT') {
      const body = await readBody(req);
      const cur = db.getSettings();
      const next = {
        ...cur,
        ownerName: body.ownerName != null ? body.ownerName : cur.ownerName,
        sprintDuration: body.sprintDuration != null ? parseInt(body.sprintDuration, 10) || 7 : cur.sprintDuration,
        sprintStartDate: body.sprintStartDate || cur.sprintStartDate,
        currentSprintNum: body.currentSprintNum != null ? parseInt(body.currentSprintNum, 10) : cur.currentSprintNum,
      };
      // 切换 Sprint 时同步开始日期
      if (body.currentSprintNum != null && body.currentSprintNum !== cur.currentSprintNum) {
        const sp = db.getSprint(parseInt(body.currentSprintNum, 10));
        if (sp) next.sprintStartDate = sp.startDate;
      }
      db.setSettings(next);
      return send(res, 200, next);
    }
  }

  /* ---- vision ---- */
  if (p0 === 'vision') {
    if (method === 'GET') return send(res, 200, { vision: db.getSetting('vision', '') });

    if (method === 'PUT') {
      const body = await readBody(req);
      db.setSetting('vision', String(body.vision || ''));
      return send(res, 200, { vision: String(body.vision || '') });
    }
  }

  /* ---- achievements ---- */
  if (p0 === 'achievements' && method === 'GET') {
    return send(res, 200, db.getAllAchievements());
  }

  /* ---- import / reset ---- */
  if (p0 === 'import' && method === 'POST') {
    const body = await readBody(req);
    if (!body || !body.version) return send(res, 400, { error: '导入数据格式错误' });
    const state = db.importState(body);
    return send(res, 200, state);
  }

  if (p0 === 'reset' && method === 'POST') {
    const state = db.resetAll();
    return send(res, 200, state);
  }

  return send(res, 404, { error: '接口不存在' });
}

/* ===================== 主请求分发 ===================== */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const parts = pathname.slice(5).split('/').filter(Boolean);
    handleApi(req, res, parts).catch((err) => {
      console.error('[API ERROR]', err.message);
      send(res, 500, { error: err.message || '服务器内部错误' });
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`OPAD 服务已启动`);
  console.log(`  地址: http://127.0.0.1:${PORT}`);
  console.log(`  数据: ${db.DATA_DIR}`);
});