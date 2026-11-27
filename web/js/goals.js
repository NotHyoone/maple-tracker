// 목표 탭: 캐릭터별 목표 추가/삭제(브라우저 저장)와 계산 결과 표시
import { esc, fmtNum, fmtInt } from "./format.js";
import * as store from "./store.js";
import { listPresets, savePreset, applyPreset, deletePreset } from "./settingpresets.js";
import { buildExpTable, remainingExp, dailyExpGain } from "./calc/level.js";
import { symbolGoal, daysFor } from "./calc/symbol.js";
import { hexaGoal } from "./calc/hexa.js";
import {
  starforceResult, starforceFormFields, readStarforceForm, runSimulations, detectStarforceEvents, starforceItems,
} from "./sfgoal.js";
import { potentialResult, potentialFormFields, syncPotentialFields, readPotentialForm, potentialItems } from "./potgoal.js";
import {
  PRICE_ITEMS, normalizePrices, priceFromInput, ageDays, isStale, fragmentsToMeso, mesoToWon, sumMeso,
} from "./calc/prices.js";

const PRICE_KEY = "prices";
export const loadPrices = () => normalizePrices(store.load(PRICE_KEY, {}));

const KEY = "goals";
const TYPES = { level: "레벨", hexa: "HEXA 코어", symbol: "심볼", starforce: "스타포스", potential: "잠재능력" };

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
  if (Number(goal.target) <= b.character_level) return { html: `${head}<p class="good">달성했습니다 🎉</p>` };
  if (r.remaining == null) {
    return { html: `${head}<p class="muted">필요 경험치를 아직 모르는 레벨이 있어 계산할 수 없습니다: Lv.${esc(rangeText(r.missing))}</p>` };
  }
  const perDay = dailyExpGain(c.history, table);
  const days = perDay > 0 ? Math.ceil(r.remaining / perDay) : null;
  return { html: `${head}<div class="kv">` +
    `<div><span>남은 경험치</span><b>${fmtNum(r.remaining)}</b></div>` +
    `<div><span>최근 하루 평균</span><b>${perDay != null ? fmtNum(perDay) : "기록 중"}</b></div>` +
    `<div><span>예상 기간</span><b>${days != null ? `약 ${days}일` : "-"}</b></div></div>` +
    (r.approx ? '<p class="muted">일부 레벨은 실측 근사값(오차 0.01% 이하)으로 계산했습니다.</p>' : "") +
    (perDay == null ? '<p class="muted">예상 기간은 이틀 이상 기록이 쌓이면 표시됩니다.</p>' : "") };
}

function hexaResult(goal, c, ctx) {
  const all = c.hexamatrix || [];
  const cores = goal.core === "*" ? all : all.filter((h) => h.hexa_core_name === goal.core);
  if (!cores.length) return { html: '<p class="muted">해당 HEXA 코어가 없습니다. (6차 전직 전이거나 코어 이름이 바뀌었을 수 있습니다)</p>' };
  const g = hexaGoal(ctx.rules.hexa, cores, goal.target);
  const head = `${esc(goal.core === "*" ? "모든 코어" : goal.core)} → <b>Lv.${esc(goal.target)}</b>`;
  if (!g.rows.length) return { html: `${head}<p class="good">달성했습니다 🎉</p>` };
  const list = '<ul class="list">' + g.rows.map((r) =>
    `<li><span>${esc(r.name)}<br><span class="sub">${esc(r.type)}</span></span><span class="r">Lv.${r.from} → ${esc(goal.target)}` +
    (r.cost ? `<br>솔 에르다 ${fmtInt(r.cost.sol_erda)} · 조각 ${fmtInt(r.cost.fragment)}` : '<br><span class="sub">재료표 미확인</span>') + "</span></li>").join("") + "</ul>";
  const kv = (t) => `<div class="kv"><div><span>솔 에르다</span><b>${fmtInt(t.sol_erda)}개</b></div><div><span>솔 에르다 조각</span><b>${fmtInt(t.fragment)}개</b></div></div>`;
  let total;
  if (g.total) total = kv(g.total);
  else if (g.partial) total = '<p class="muted">재료표가 있는 코어만 합친 값입니다.</p>' + kv(g.partial) +
    `<p class="muted">재료표를 확인하지 못한 코어 ${g.rows.filter((r) => !r.cost).length}개(아래 목록에서 재료가 비어 있는 코어)는 빠져 있습니다.</p>`;
  else total = `<p class="muted">재료표를 아직 확인하지 못해(${esc(g.unknownTypes.join(", "))}) 필요 재료를 계산할 수 없습니다. 패치로 요구량이 여러 번 바뀌어 확인된 최신 표만 넣고 있습니다.</p>`;
  const src = g.sources.length ? `<p class="muted">재료표 출처: ${esc(g.sources.join(" / "))}</p>` : "";
  // 솔 에르다는 거래 불가 → 조각만 메소로 환산
  const frag = (g.total || g.partial)?.fragment ?? null;
  return {
    html: head + total + list + src,
    hasMeso: frag != null,
    meso: fragmentsToMeso(frag, ctx.prices),
    partial: !g.total,
    needPrice: frag != null && !ctx.prices.fragment,
    mesoLabel: "조각 구매 메소",
  };
}

function symbolResult(goal, c, ctx) {
  const syms = (c.symbol || []).filter((s) => goal.symbol === "*" ? true : s.symbol_name === goal.symbol);
  const rows = syms.map((s) => ({ s, r: symbolGoal(ctx.rules.symbol, s, goal.target) })).filter((x) => !x.r.done);
  const head = `${esc(goal.symbol === "*" ? "모든 심볼" : goal.symbol)} → <b>Lv.${esc(goal.target)}</b> <span class="sub">(최대 레벨을 넘으면 최대까지)</span>`;
  if (!rows.length) return { html: `${head}<p class="good">달성했습니다 🎉</p>` };
  // 하루 획득량: 직접 입력값 > 공식 일일 퀘스트 지급량
  const dailyOf = (r) => Number(goal.perDay) || ctx.rules.symbol?.kinds?.[r.kind]?.daily?.[r.region] || 0;
  const list = '<ul class="list">' + rows.map(({ s, r }) => {
    const days = daysFor(r.growth, dailyOf(r));
    return `<li><span>${esc(r.region || s.symbol_name)}<br><span class="sub">${esc(r.kind)} Lv.${esc(s.symbol_level)}</span></span><span class="r">` +
      (r.growth == null ? "성장치표 미확인" : `성장치 ${fmtInt(r.growth)} 더 필요${days != null ? `<br>약 ${days}일` : ""}`) +
      (r.meso != null ? `<br>${fmtNum(r.meso)} 메소` : "") + "</span></li>";
  }).join("") + "</ul>";
  const known = rows.filter((x) => x.r.growth != null);
  const totalGrowth = known.reduce((a, x) => a + x.r.growth, 0);
  const mesoUnknown = rows.some((x) => x.r.meso == null);
  const mesoKnown = rows.filter((x) => x.r.meso != null);
  const html = head + `<div class="kv"><div><span>더 모아야 할 성장치 합계</span><b>${fmtInt(totalGrowth)}</b></div>` +
    `<div><span>강화 메소</span><b>${mesoUnknown ? "비용표 미확인" : fmtNum(rows.reduce((a, x) => a + x.r.meso, 0))}</b></div></div>` +
    (rows.some(({ r }) => r.growth != null && !dailyOf(r)) ? '<p class="muted">하루 획득량을 모르는 심볼은 목표에 하루 획득량을 입력하면 예상 기간을 계산합니다.</p>' : "") +
    (Number(goal.perDay) ? `<p class="muted">하루 ${fmtInt(goal.perDay)}개 기준</p>` : '<p class="muted">예상 기간은 일일 퀘스트 지급량(공식 가이드) 기준이며 주간 컨텐츠 등은 빠져 있습니다.</p>') +
    list + '<p class="muted">강화 메소 출처: 인벤 심볼 강화표(아케인은 계산기 공식과 교차 확인)</p>';
  return {
    html, hasMeso: true,
    meso: mesoKnown.length ? mesoKnown.reduce((a, x) => a + x.r.meso, 0) : null,
    partial: mesoUnknown, mesoLabel: "강화 메소",
  };
}

const RESULT = { level: levelResult, hexa: hexaResult, symbol: symbolResult, starforce: starforceResult, potential: potentialResult };

function computeGoal(goal, c, ctx) {
  try { return RESULT[goal.type](goal, c, ctx); } catch (err) {
    return { html: `<p class="err">계산 오류: ${esc(err.message)}</p>` };
  }
}

const wonText = (meso, prices) => {
  const won = mesoToWon(meso, prices);
  return won != null ? ` <span class="sub">(약 ${fmtNum(won)}원)</span>` : "";
};

function mesoBlock(res, prices) {
  if (!res.hasMeso) return "";
  if (res.needPrice) return '<p class="muted">위 시세 카드에 솔 에르다 조각 가격을 입력하면 필요 메소를 계산합니다.</p>';
  if (res.meso == null) return "";
  return `<div class="meso-line"><span>${esc(res.mesoLabel)}${res.partial ? " (확인된 부분만)" : ""}</span>` +
    `<b>${fmtNum(res.meso)} 메소${wonText(res.meso, prices)}</b></div>`;
}

function goalCard(goal, res, prices) {
  return `<div class="card goal"><div class="goal-h"><span class="chip">${esc(TYPES[goal.type])}</span>` +
    `<button class="btn small" data-del="${esc(goal.id)}" aria-label="목표 삭제">삭제</button></div>${res.html}${mesoBlock(res, prices)}</div>`;
}

function summaryCard(results, prices) {
  const withMeso = results.filter((r) => r.hasMeso);
  if (!withMeso.length) return "";
  const { total, incomplete } = sumMeso(withMeso);
  if (total == null) return "";
  return `<div class="card summary"><h2>목표 달성에 필요한 메소</h2><div class="big">${fmtNum(total)} 메소</div>` +
    (mesoToWon(total, prices) != null ? `<div class="sub">현금 환산 약 ${fmtNum(mesoToWon(total, prices))}원 (메이플포인트 시세 기준)</div>` : "") +
    (incomplete ? '<p class="muted">수치표나 시세가 없는 항목은 빠져 있어 실제로는 더 필요합니다.</p>' : "") + "</div>";
}

// ---------- 설정 프리셋 ----------

function settingPresetCard() {
  const presets = listPresets();
  const rows = presets.map((p) => {
    const date = Date.parse(p.saved_at);
    const shownDate = Number.isNaN(date) ? "날짜 미상" : new Date(date).toLocaleString("ko-KR");
    return `<li><span>${esc(p.name)}<br><span class="sub">${esc(shownDate)} · 목표 ${esc(p.goals.length)}개</span></span>` +
      `<span class="row"><button type="button" class="btn small" data-setting-apply="${esc(p.name)}">불러오기</button>` +
      `<button type="button" class="btn small" data-setting-delete="${esc(p.name)}">삭제</button></span></li>`;
  }).join("");
  return '<div class="card setting-presets"><h2>설정 프리셋</h2>' +
    '<form id="setting-preset-form"><label>프리셋 이름 <input name="presetName" required placeholder="예: 본캐 육성"></label>' +
    '<div class="row"><button class="btn primary" type="submit">현재 설정 저장</button></div></form>' +
    '<p class="sub" id="setting-preset-msg" role="status"></p>' +
    (presets.length ? `<ul class="list">${rows}</ul>` : '<p class="muted">저장된 프리셋이 없습니다.</p>') + '</div>';
}

// ---------- 시세 카드 ----------

function priceCard(prices) {
  const rows = Object.entries(PRICE_ITEMS).map(([key, it]) => {
    const p = prices[key];
    const shown = p ? p.value / it.unit : "";
    const age = p ? ageDays(p.updated) : null;
    const status = !p ? '<span class="sub">미입력</span>'
      : `<span class="sub${isStale(p.updated) ? " err" : ""}">${esc(p.updated)} 입력${age ? ` · ${age}일 전` : " · 오늘"}${isStale(p.updated) ? " · 시세 갱신 필요" : ""}</span>`;
    return `<label>${esc(it.label)} <span class="sub">(${esc(it.unitLabel)}, ${esc(it.hint)})</span>
<input name="${key}" type="number" inputmode="decimal" min="0" step="any" value="${esc(shown)}" placeholder="비워두면 계산에서 제외">${status}</label>`;
  }).join("");
  const open = Object.keys(prices).length === 0 || Object.values(prices).some((p) => isStale(p.updated));
  return `<details class="card price-card"${open ? " open" : ""}><summary><h2>시세</h2>` +
    `<span class="sub">${Object.keys(prices).length ? "필요 메소 계산에 사용 중" : "입력하면 필요 메소를 계산합니다"}</span></summary>` +
    `<form id="price-form">${rows}<div class="row"><button class="btn primary" type="submit">시세 저장</button>` +
    '<span class="sub" id="price-msg" role="status"></span></div></form>' +
    '<p class="muted">공식 시세 API가 없어 직접 입력합니다. 입력한 날짜가 함께 저장되고, 14일이 지나면 갱신하라고 알려드립니다.</p></details>';
}

// ---------- 목표 추가 폼 ----------

function addForm(c, i, ctx) {
  const coreOpts = (c.hexamatrix || []).map((h) => `<option value="${esc(h.hexa_core_name)}">${esc(h.hexa_core_name)} (Lv.${esc(h.hexa_core_level)})</option>`).join("");
  const symOpts = (c.symbol || []).map((s) => `<option value="${esc(s.symbol_name)}">${esc(s.symbol_name)} (Lv.${esc(s.symbol_level)})</option>`).join("");
  return `<form class="card goal-form" data-char="${i}"><h2>목표 추가</h2>
<label>종류 <select name="type">
  <option value="level">레벨</option>
  ${c.hexamatrix?.length ? '<option value="hexa">HEXA 코어</option>' : ""}
  ${c.symbol?.length ? '<option value="symbol">심볼</option>' : ""}
  ${starforceItems(c, ctx.rules.starforce).length ? '<option value="starforce">스타포스</option>' : ""}
  ${potentialItems(c, ctx.rules.potential).length ? '<option value="potential">잠재능력</option>' : ""}
</select></label>
<label data-for="hexa" hidden>코어 <select name="core"><option value="*">모든 코어</option>${coreOpts}</select></label>
<label data-for="symbol" hidden>심볼 <select name="symbol"><option value="*">모든 심볼</option>${symOpts}</select></label>
${starforceFormFields(c, ctx.rules.starforce)}
${potentialFormFields(c, ctx.rules.potential)}
<label data-target-wrap><span data-label-target>목표 레벨</span> <input name="target" type="number" inputmode="numeric" min="1" max="300" required></label>
<label data-for="symbol" hidden>하루 획득량(선택, 비우면 일일 퀘스트 기준) <input name="perDay" type="number" inputmode="numeric" min="0" placeholder="예: 20"></label>
<div class="row"><button class="btn primary" type="submit">추가</button></div></form>`;
}

function syncFormFields(form) {
  const type = form.type.value;
  form.querySelectorAll("[data-for]").forEach((el) => { el.hidden = el.dataset.for !== type; });
  const c = form._char;
  const presets = { level: c.basic.character_level + 1, hexa: 30, symbol: 20, starforce: 22 };
  form.target.placeholder = `예: ${presets[type]}`;
  form.querySelector("[data-label-target]").textContent = type === "starforce" ? "목표 성급" : "목표 레벨";
  // 잠재능력은 목표 레벨 대신 목표 등급·옵션 조건을 씁니다
  form.querySelector("[data-target-wrap]").hidden = type === "potential";
  form.target.required = type !== "potential";
  syncPotentialFields(form);
}

// ---------- 탭 전체 ----------

export function renderGoalsTab(root, ctx) {
  const goals = loadGoals();
  ctx.prices = loadPrices();
  ctx.sfEvents = detectStarforceEvents(ctx.events);
  const simJobs = [];
  const sel = ctx.chars.map((c, i) => `<button data-t="g${i}">${esc(c.basic.character_name)}</button>`).join("");
  const panes = ctx.chars.map((c, i) => {
    const mine = goals.filter((g) => g.char === c.basic.character_name);
    const results = mine.map((g) => computeGoal(g, c, ctx));
    results.forEach((r) => r.sim && simJobs.push(r.sim));
    return `<div class="gpane" id="g${i}">` + summaryCard(results, ctx.prices) +
      (mine.length ? mine.map((g, j) => goalCard(g, results[j], ctx.prices)).join("") : '<p class="muted card">아직 목표가 없습니다. 아래에서 추가해 보세요.</p>') +
      addForm(c, i, ctx) + "</div>";
  }).join("");
  root.innerHTML = `${settingPresetCard()}${priceCard(ctx.prices)}<div class="charsel" id="goal-sel">${sel}</div>${panes}` +
    '<p class="muted">목표는 이 브라우저에만 저장됩니다. 계정·설정 탭에서 백업할 수 있습니다.</p>';

  const presetAction = (action, message, failure = "저장하지 못했습니다 (브라우저 저장 차단)") => {
    try {
      if (!action()) { root.querySelector("#setting-preset-msg").textContent = failure; return; }
      renderGoalsTab(root, ctx);
      root.querySelector("#setting-preset-msg").textContent = message;
    } catch (err) {
      root.querySelector("#setting-preset-msg").textContent = err.message;
    }
  };
  root.querySelector("#setting-preset-form").addEventListener("submit", (e) => {
    e.preventDefault();
    presetAction(() => savePreset(e.target.elements.presetName.value), "현재 설정을 저장했습니다.");
  });
  root.querySelectorAll("[data-setting-apply]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm(`“${b.dataset.settingApply}” 프리셋을 불러올까요? 현재 목표와 시세를 덮어씁니다.`)) return;
    presetAction(() => applyPreset(b.dataset.settingApply), "프리셋을 불러왔습니다.",
      "설정을 모두 저장하지 못했습니다 (브라우저 저장 차단). 목표만 적용되었을 수 있습니다. 다시 불러와 주세요.");
  }));
  root.querySelectorAll("[data-setting-delete]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm(`“${b.dataset.settingDelete}” 프리셋을 삭제할까요?`)) return;
    presetAction(() => deletePreset(b.dataset.settingDelete), "프리셋을 삭제했습니다.");
  }));

  root.querySelectorAll(".goal-form").forEach((f) => {
    f._char = ctx.chars[Number(f.dataset.char)];
    syncFormFields(f);
    f.type.addEventListener("change", () => syncFormFields(f));
    f.cond?.addEventListener("change", () => syncPotentialFields(f));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const goal = { id: newId(), char: f._char.basic.character_name, type: f.type.value, target: Number(f.target.value) };
      if (goal.type === "hexa") goal.core = f.core.value;
      if (goal.type === "symbol") { goal.symbol = f.symbol.value; goal.perDay = Number(f.perDay.value) || 0; }
      if (goal.type === "starforce") Object.assign(goal, readStarforceForm(f));
      if (goal.type === "potential") {
        Object.assign(goal, readPotentialForm(f));
        delete goal.target;
        if (goal.cond !== "none" && !(goal.min > 0)) { f.min.focus(); f.min.setCustomValidity("기준값을 입력하세요"); f.min.reportValidity(); f.min.setCustomValidity(""); return; }
      }
      saveGoals([...loadGoals(), goal]);
      renderGoalsTab(root, ctx);
    });
  });
  root.querySelector("#price-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = store.load(PRICE_KEY, {});
    const next = {};
    for (const key of Object.keys(PRICE_ITEMS)) {
      const input = e.target[key].value;
      const old = normalizePrices(raw)[key];
      // 값이 바뀌지 않았으면 입력 날짜도 유지
      if (old && input !== "" && Number(input) * PRICE_ITEMS[key].unit === old.value) { next[key] = old; continue; }
      const p = priceFromInput(key, input);
      if (p) next[key] = p;
    }
    if (!store.save(PRICE_KEY, next)) { root.querySelector("#price-msg").textContent = "저장하지 못했습니다 (브라우저 저장 차단)"; return; }
    renderGoalsTab(root, ctx);
    root.querySelector("#price-msg").textContent = "저장했습니다.";
  });
  root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    saveGoals(loadGoals().filter((g) => g.id !== b.dataset.del));
    renderGoalsTab(root, ctx);
  }));
  ctx.setupTabs(root.querySelector("#goal-sel"), [...root.querySelectorAll(".gpane")], "tab:goalchar");
  runSimulations(root, simJobs, ctx.rules.starforce);
}

