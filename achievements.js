/**
 * achievements.js — 成就解锁检查（从原前端 checkAchievements 移植到服务端）
 *
 * 在创建/更新/删除故事、拖拽状态变化、保存站会、完成 Sprint 等操作后调用。
 * 传入 DB 访问层与本次操作的上下文（completedPoints / totalPoints / sprintNum）。
 */

'use strict';

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (nn) => String(nn).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * @param {object} db  db.js 模块（含 getAllAchievements / saveAchievement / getAllStories / getSetting / saveMotivation / getAllStandupLog / getHatProgress 等）
 * @param {object} [ctx] 上下文 { completedPoints, totalPoints, sprintNum }
 * @returns {Array<string>} 本次新解锁的成就 id 列表
 */
function checkAchievements(db, ctx = {}) {
  const achievements = db.getAllAchievements();
  const byId = {};
  achievements.forEach((a) => (byId[a.id] = a));
  const unlock = (id) => {
    const x = byId[id];
    if (x && !x.unlocked) {
      x.unlocked = true;
      x.date = todayStr();
      unlocked.push(id);
    }
  };
  const unlocked = [];

  const motivation = db.getMotivation();
  const stories = db.getAllStories();
  const sprints = db.getAllSprints();
  const standupLog = db.getAllStandupLog();
  const hatProgress = db.getHatProgress();
  const HATS = ['po', 'sm', 'dev', 'qa', 'tl'];

  if (motivation.totalSprints >= 1) unlock('first_sprint');
  if ((ctx.completedPoints || 0) > 10) unlock('speed_star');
  if (motivation.streakSprints >= 3) unlock('three_streak');
  if (stories.length >= 20) unlock('story_master');
  if (ctx.sprintNum) {
    const left = stories.filter(
      (b) => b.sprint === ctx.sprintNum && b.status !== 'done' && (b.priority === 'P0' || b.priority === 'P1')
    ).length;
    if (left === 0) unlock('zero_bug');
  }
  const uniqueDays = new Set(standupLog.map((x) => x.date));
  let streak = 0;
  const today = todayStr();
  for (let i = 0; i < 30; i++) {
    if (uniqueDays.has(addDays(today, -i))) streak++;
    else break;
  }
  if (streak >= 7) unlock('early_bird');
  const allHatsDone = HATS_EVERY(hatProgress);
  if (allHatsDone) unlock('multihat');
  const retroCount = sprints.filter(
    (s) => s.status === 'completed' && (s.retrospective.wentWell.length > 0 || s.retrospective.needsImprovement.length > 0)
  ).length;
  if (retroCount >= 3) unlock('data_driven');
  if (ctx.totalPoints && ctx.completedPoints >= ctx.totalPoints && ctx.totalPoints > 0) unlock('fast_iter');
  if (motivation.totalStoryPoints >= 100) unlock('hundred_pts');

  // 有新解锁则回写
  if (unlocked.length > 0) {
    achievements.forEach((a) => db.saveAchievement(a));
  }
  return unlocked;
}

function HATS_EVERY(hatProgress) {
  return ['po', 'sm', 'dev', 'qa', 'tl'].every((hat) => {
    const arr = hatProgress[hat];
    return Array.isArray(arr) && arr.some(Boolean);
  });
}

module.exports = { checkAchievements };