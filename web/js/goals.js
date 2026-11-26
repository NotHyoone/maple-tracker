// 목표 탭: 캐릭터별 목표 추가/삭제(브라우저 저장)와 계산 결과 표시
import { esc, fmtNum, fmtInt } from "./format.js";
import * as store from "./store.js";
import { buildExpTable, remainingExp, dailyExpGain } from "./calc/level.js";
import { symbolGoal, daysFor } from "./calc/symbol.js";
import { hexaGoal } from "./calc/hexa.js";

const KEY = "goals";
const TYPES = { level: "레벨", hexa: "HEXA 코어", symbol: "심볼" };

export const loadGoals = () => store.load(KEY, []);
const saveGoals = (g) => store.save(KEY, g);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- 목표별 계산 + 표시 ----------

function rangeText(levels) {
  if (!levels.length) return "";
  const parts = [];
  let s = levels[0], p = levels[0];
  for (const l of [...levels.slice(1), null]) {
    if (l === p + 1) { p = l; continue; }
    parts.push(s === p ? `${s}` : `${s}~${p}`);
    s = p = l;
  }
  return parts.join(", ");
}

function levelResult(goal, c, ctx) {
  const b = c.basic;
  const table = buildExpTable(ctx.rules.level, ctx.observed);
  const r = remainingExp({ level: b.character_level, exp: b.character_exp }, goal.target, table);
  const head = `Lv.${esc(b.character_level)} (${Number(b.character_exp_rate).toFixed(2)}%) → <b>Lv.${esc(goal.target)}</b>`;
  if (Number(goal.target) <= b.character_level) return `${head}<p class="good">달성했습니다 🎉</p>`;
  if (r.remaining == null) {
    return `${head}<p class="muted">필요 경험치를 아직 모르는 레벨이 있어 계산할 수 없습니다: Lv.${esc(rangeText(r.missing))}<br>` +
      "계정의 캐릭터가 이 레벨을 지나가면 자동으로 측정되어 채워집니다.</p>";
  }
  const perDay = dailyExpGain(c.history, table);
  const days = perDay > 0 ? Math.ceil(r.remaining / perDay) : null;
  return `${head}<div class="kv">` +
    `<div><span>남은 경험치</span><b>${fmtNum(r.remaining)}</b></div>` +
    `<div><span>최근 하루 평균</span><b>${perDay != null ? fmtNum(perDay) : "기록 중"}</b></div>` +
    `<div><span>예상 기간</span><b>${days != null ? `약 ${days}일` : "-"}</b></div></div>` +
    (r.approx ? '<p class="muted">일부 레벨은 실측 근사값(오차 0.01% 이하)으로 계산했습니다.</p>' : "") +
    (perDay == null ? '<p class="muted">예상 기간은 이틀 이상 기록이 쌓이면 표시됩니다.</p>' : "");
}

function hexaResult(goal, c, ctx) {
  const all = c.hexamatrix || [];
  const cores = goal.core === "*" ? all : all.filter((h) => h.hexa_core_name === goal.core);
  if (!cores.length) return '<p class="muted">해당 HEXA 코어가 없습니다. (6차 전직 전이거나 코어 이름이 바뀌었을 수 있습니다)</p>';
  const g = hexaGoal(ctx.rules.hexa, cores, goal.target);
  const head = `${esc(goal.core === "*" ? "모든 코어" : goal.core)} → <b>Lv.${esc(goal.target)}</b>`;
  if (!g.rows.length) return `${head}<p class="good">달성했습니다 🎉</p>`;
  const list = '<ul class="list">' + g.rows.map((r) =>
    `<li><span>${esc(r.name)}<br><span class="sub">${esc(r.type)}</span></span><span class="r">Lv.${r.from} → ${esc(goal.target)}` +
    (r.cost ? `<br>솔 에르다 ${fmtInt(r.cost.sol_erda)} · 조각 ${fmtInt(r.cost.fragment)}` : "") + "</span></li>").join("") + "</ul>";
  const total = g.total
    ? `<div class="kv"><div><span>솔 에르다</span><b>${fmtInt(g.total.sol_erda)}개</b></div><div><span>솔 에르다 조각</span><b>${fmtInt(g.total.fragment)}개</b></div></div>`
    : `<p class="muted">재료표가 아직 확인되지 않아(${esc(g.unknownTypes.join(", "))}) 필요 재료를 계산할 수 없습니다.</p>`;
  return head + total + list;
}

function symbolResult(goal, c, ctx) {
  const syms = (c.symbol || []).filter((s) => goal.symbol === "*" ? true : s.symbol_name === goal.symbol);
  const rows = syms.map((s) => ({ s, r: symbolGoal(ctx.rules.symbol, s, goal.target) })).filter((x) => !x.r.done);
  const head = `${esc(goal.symbol === "*" ? "모든 심볼" : goal.symbol)} → <b>Lv.${esc(goal.target)}</b> <span class="sub">(최대 레벨을 넘으면 최대까지)</span>`;
  if (!rows.length) return `${head}<p class="good">달성했습니다 🎉</p>`;
  const perDay = Number(goal.perDay) || 0;
  const list = '<ul class="list">' + rows.map(({ s, r }) => {
    const days = daysFor(r.growth, perDay);
    return `<li><span>${esc(r.region || s.symbol_name)}<br><span class="sub">${esc(r.kind)} Lv.${esc(s.symbol_level)}</span></span><span class="r">` +
      (r.growth == null ? "성장치표 미확인" : `성장치 ${fmtInt(r.growth)} 더 필요${days != null ? `<br>약 ${days}일` : ""}`) +
      (r.meso != null ? `<br>${fmtNum(r.meso)} 메소` : "") + "</span></li>";
  }).join("") + "</ul>";
  const known = rows.filter((x) => x.r.growth != null);
  const totalGrowth = known.reduce((a, x) => a + x.r.growth, 0);
  const mesoUnknown = rows.some((x) => x.r.meso == null);
  return head + `<div class="kv"><div><span>더 모아야 할 성장치 합계</span><b>${fmtInt(totalGrowth)}</b></div>` +
    `<div><span>강화 메소</span><b>${mesoUnknown ? "비용표 미확인" : fmtNum(rows.reduce((a, x) => a + x.r.meso, 0))}</b></div></div>` +
    (perDay ? "" : '<p class="muted">하루 획득량을 입력하면 지역별 예상 기간을 계산합니다.</p>') + list;
}

const RESULT = { level: levelResult, hexa: hexaResult, symbol: symbolResult };

function goalCard(goal, c, ctx) {
  let body;
  try { body = RESULT[goal.type](goal, c, ctx); } catch (err) { body = `<p class="err">계산 오류: ${esc(err.message)}</p>`; }
  return `<div class="card goal"><div class="goal-h"><span class="chip">${esc(TYPES[goal.type])}</span>` +
    `<button class="btn small" data-del="${esc(goal.id)}" aria-label="목표 삭제">삭제</button></div>${body}</div>`;
}

// ---------- 목표 추가 폼 ----------

function addForm(c, i) {
  const coreOpts = (c.hexamatrix || []).map((h) => `<option value="${esc(h.hexa_core_name)}">${esc(h.hexa_core_name)} (Lv.${esc(h.hexa_core_level)})</option>`).join("");
  const symOpts = (c.symbol || []).map((s) => `<option value="${esc(s.symbol_name)}">${esc(s.symbol_name)} (Lv.${esc(s.symbol_level)})</option>`).join("");
  return `<form class="card goal-form" data-char="${i}"><h2>목표 추가</h2>
<label>종류 <select name="type">
  <option value="level">레벨</option>
  ${c.hexamatrix?.length ? '<option value="hexa">HEXA 코어</option>' : ""}
  ${c.symbol?.length ? '<option value="symbol">심볼</option>' : ""}
</select></label>
<label data-for="hexa" hidden>코어 <select name="core"><option value="*">모든 코어</option>${coreOpts}</select></label>
<label data-for="symbol" hidden>심볼 <select name="symbol"><option value="*">모든 심볼</option>${symOpts}</select></label>
<label>목표 레벨 <input name="target" type="number" inputmode="numeric" min="1" max="300" required></label>
<label data-for="symbol" hidden>하루 획득량(선택) <input name="perDay" type="number" inputmode="numeric" min="0" placeholder="예: 20"></label>
<div class="row"><button class="btn primary" type="submit">추가</button></div></form>`;
}

function syncFormFields(form) {
  const type = form.type.value;
  form.querySelectorAll("[data-for]").forEach((el) => { el.hidden = el.dataset.for !== type; });
  const c = form._char;
  const presets = { level: c.basic.character_level + 1, hexa: 30, symbol: 20 };
  form.target.placeholder = `예: ${presets[type]}`;
}

// ---------- 탭 전체 ----------

export function renderGoalsTab(root, ctx) {
  const goals = loadGoals();
  const sel = ctx.chars.map((c, i) => `<button data-t="g${i}">${esc(c.basic.character_name)}</button>`).join("");
  const panes = ctx.chars.map((c, i) => {
    const mine = goals.filter((g) => g.char === c.basic.character_name);
    return `<div class="gpane" id="g${i}">` +
      (mine.length ? mine.map((g) => goalCard(g, c, ctx)).join("") : '<p class="muted card">아직 목표가 없습니다. 아래에서 추가해 보세요.</p>') +
      addForm(c, i) + "</div>";
  }).join("");
  root.innerHTML = `<div class="charsel" id="goal-sel">${sel}</div>${panes}` +
    '<p class="muted">목표는 이 브라우저에만 저장됩니다. 계정·설정 탭에서 백업할 수 있습니다.</p>';

  root.querySelectorAll(".goal-form").forEach((f) => {
    f._char = ctx.chars[Number(f.dataset.char)];
    syncFormFields(f);
    f.type.addEventListener("change", () => syncFormFields(f));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const goal = { id: newId(), char: f._char.basic.character_name, type: f.type.value, target: Number(f.target.value) };
      if (goal.type === "hexa") goal.core = f.core.value;
      if (goal.type === "symbol") { goal.symbol = f.symbol.value; goal.perDay = Number(f.perDay.value) || 0; }
      saveGoals([...loadGoals(), goal]);
      renderGoalsTab(root, ctx);
    });
  });
  root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    saveGoals(loadGoals().filter((g) => g.id !== b.dataset.del));
    renderGoalsTab(root, ctx);
  }));
  ctx.setupTabs(root.querySelector("#goal-sel"), [...root.querySelectorAll(".gpane")], "tab:goalchar");
}

