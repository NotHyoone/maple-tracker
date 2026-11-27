// 목표 탭의 스타포스 목표: 장비 선택, 옵션, 기댓값 표시, 모의 시행(비동기)
import { esc, fmtNum, fmtInt } from "./format.js";
import { expected, maxStar, simulate } from "./calc/starforce.js";
import { equipmentSteps } from "./roadmap.js";

// 스타포스 강화가 안 되는 부위
const NO_STARFORCE = new Set(["엠블렘", "뱃지", "훈장", "포켓 아이템", "보조무기"]);

export const EVENT_PRESETS = {
  auto: { label: "자동 (진행 중 이벤트 반영)", events: null },
  none: { label: "이벤트 없음", events: [] },
  cost30: { label: "강화 비용 30% 할인", events: ["cost30"] },
  destroy30: { label: "21성 이하 파괴 30% 감소", events: ["destroy30"] },
  shining: { label: "샤이닝 스타포스 (할인 + 파괴 감소)", events: ["cost30", "destroy30"] },
  fiveTenFifteen: { label: "5·10·15성 100% 성공", events: ["fiveTenFifteen"] },
  onePlusOne: { label: "10성 이하 1+1", events: ["onePlusOne"] },
};

const EVENT_NAMES = { cost30: "비용 30% 할인", destroy30: "파괴 30% 감소", fiveTenFifteen: "5·10·15성 100%", onePlusOne: "10성 이하 1+1" };

export function starforceItems(c, rules) {
  return (c.item || [])
    .map((it, i) => ({ ...it, idx: i }))
    .filter((it) => it.item_level > 0 && !NO_STARFORCE.has(it.item_equipment_slot) && it.starforce_scroll_flag !== "사용"
      && maxStar(rules, it.item_level) > Number(it.starforce || 0));
}

/** 진행 중인 이벤트 중 스타포스 관련 효과 감지 */
export function detectStarforceEvents(events, now = Date.now()) {
  const found = new Set(), titles = [];
  for (const ev of events || []) {
    const s = Date.parse(ev.date_event_start ?? ""), e = Date.parse(ev.date_event_end ?? "");
    if ((s && s > now) || (e && e < now)) continue;
    const text = `${ev.title}\n${ev.text || ""}`;
    if (!text.includes("스타포스")) continue;
    const before = found.size;
    if (/샤이닝 스타포스/.test(text)) { found.add("cost30"); found.add("destroy30"); }
    if (/(비용|메소)[^\n]{0,20}30%\s*할인|30%\s*할인/.test(text)) found.add("cost30");
    if (/파괴 확률[^\n]{0,10}30%\s*감소/.test(text)) found.add("destroy30");
    if (/5\s*[,/·]\s*10\s*[,/·]\s*15\s*성[^\n]{0,20}100%/.test(text)) found.add("fiveTenFifteen");
    if (/1\s*\+\s*1/.test(text)) found.add("onePlusOne");
    if (found.size > before) titles.push(ev.title);
  }
  return { events: [...found], titles };
}

/** 목표 + 캐릭터 → 계산 입력값 */
export function sfParams(goal, c, ctx) {
  const it = (c.item || []).find((x) => x.item_equipment_slot === goal.slot);
  if (!it) return null;
  const preset = EVENT_PRESETS[goal.eventPreset] ?? EVENT_PRESETS.auto;
  const events = preset.events ?? ctx.sfEvents.events;
  return {
    item: it,
    params: {
      level: Number(it.item_level), from: Number(it.starforce || 0), to: Number(goal.target),
      starcatch: goal.starcatch !== false, safeguard: goal.safeguard || [], events,
      mvp: Number(goal.mvp) || 0, pcroom: !!goal.pcroom, replacementPrice: Number(goal.replacementPrice) || 0,
    },
  };
}

const pct = (v) => (v >= 0.9995 ? "100%" : v < 0.0001 ? "0.01% 미만" : `${(v * 100).toFixed(2)}%`);

export function starforceResult(goal, c, ctx) {
  const sp = sfParams(goal, c, ctx);
  if (!sp) return { steps: [], html: `<p class="muted">${esc(goal.slot)} 부위 장비를 찾을 수 없습니다. (장비를 바꿨다면 목표를 다시 추가하세요)</p>` };
  const { item, params } = sp;
  const r = expected(ctx.rules.starforce, params);
  const head = `${esc(item.item_name)} <span class="sub">${esc(item.item_equipment_slot)} · Lv.${esc(item.item_level)}</span><br>` +
    `★${esc(params.from)} → <b>★${esc(r.to)}</b>${r.to < Number(goal.target) ? ` <span class="sub">(이 장비는 최대 ${r.max}성)</span>` : ""}`;
  const steps = equipmentSteps("sf", goal.slot, `${goal.slot} ★${r.to} 달성`, r.to <= params.from);
  if (r.to <= params.from) return { steps, html: `${head}<p class="good">달성했습니다 🎉</p>` };

  const opts = [params.starcatch ? "스타캐치" : "스타캐치 안 함",
    params.safeguard.length ? `파괴 방지 ${params.safeguard.join("·")}성` : null,
    ...params.events.map((e) => EVENT_NAMES[e]),
    params.mvp ? `MVP ${Math.round(params.mvp * 100)}%` : null, params.pcroom ? "PC방" : null].filter(Boolean);
  const autoNote = (goal.eventPreset ?? "auto") === "auto"
    ? (ctx.sfEvents.titles.length ? `<p class="muted">진행 중 이벤트 반영: ${esc(ctx.sfEvents.titles.join(", "))}</p>` : '<p class="muted">진행 중인 스타포스 이벤트가 없어 이벤트 없이 계산했습니다.</p>')
    : "";

  const html = head +
    `<div class="kv">
<div><span>평균 강화 메소</span><b>${fmtNum(r.meso)}</b></div>
<div><span>평균 파괴 횟수</span><b>${r.booms >= 100 ? fmtInt(r.booms) : r.booms.toFixed(2)}회</b></div>
<div><span>파괴 없이 성공할 확률</span><b>${pct(r.noBoomRate)}</b></div>
<div><span>평균 시도 횟수</span><b>${fmtInt(r.attempts)}회</b></div>
</div>` +
    (r.items > 0 ? `<p class="muted">파괴 복구에 같은 장비가 평균 ${r.items >= 100 ? fmtInt(r.items) : r.items.toFixed(2)}개 필요합니다${params.replacementPrice ? ` (개당 ${fmtNum(params.replacementPrice)} → ${fmtNum(r.extraMeso)} 메소, 아래 합계에 포함)` : ". 장비 가격을 입력하면 비용에 포함됩니다"}.</p>` : "") +
    (r.noBoomRate < 0.01 ? '<p class="err">⚠ 파괴 없이 성공할 확률이 1% 미만인, 현실적으로 매우 어려운 목표입니다.</p>' : "") +
    `<div class="sim" data-sim="${esc(goal.id)}" data-incl="${params.replacementPrice ? 1 : 0}"><p class="muted">운에 따른 비용 구간 계산 중…</p></div>` +
    `<p class="muted">조건: ${esc(opts.join(" · "))}</p>${autoNote}` +
    `<details class="steps"><summary>성급별 확률·1회 비용</summary><table>` +
    r.steps.map((s) => `<tr><td>${s.star}→${s.star + 1}</td><td>성공 ${pct(s.success)}</td><td>파괴 ${pct(s.destroy)}</td><td class="r">${fmtNum(s.cost)}</td></tr>`).join("") +
    "</table></details>";
  return {
    html, hasMeso: true, meso: r.total, partial: false, mesoLabel: "스타포스 평균 비용",
    steps,
    sim: { id: goal.id, params },
  };
}

// ---------- 모의 시행 (Worker, 안 되면 메인 스레드) ----------

let worker = null;
const pending = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL("./calc/sf-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
    worker.onerror = () => { worker = false; };
  } catch { worker = false; }
  return worker;
}

function renderSim(el, data) {
  if (!el) return;
  if (data.error || !data.result) { el.innerHTML = '<p class="muted">비용 구간을 계산하지 못했습니다.</p>'; return; }
  const s = data.result;
  if (s.runs < 1000) {
    el.innerHTML = `<p class="muted">시도 횟수가 너무 많은 목표라 비용 구간은 생략했습니다(모의 ${fmtInt(s.runs)}회). 위 평균만 참고하세요.</p>`;
    return;
  }
  const incl = el.dataset.incl === "1" ? ", 장비 복구비 포함" : "";
  el.innerHTML = `<h3>운에 따른 비용 <span class="sub">(모의 ${fmtInt(s.runs)}회${incl})</span></h3><div class="kv">
<div><span>운 좋음 (상위 10%)</span><b>${fmtNum(s.total.p10)}</b></div>
<div><span>보통 (중간값)</span><b>${fmtNum(s.total.p50)}</b></div>
<div><span>운 나쁨 (하위 10%)</span><b>${fmtNum(s.total.p90)}</b></div>
<div><span>최악 1%</span><b>${fmtNum(s.total.p99)}</b></div></div>
<p class="muted">10명 중 9명은 '운 나쁨' 금액 안에 끝납니다. 평균은 소수의 큰 손해 때문에 중간값보다 높게 나옵니다.</p>`;
}

export function runSimulations(root, jobs, rules) {
  for (const job of jobs) {
    const el = () => root.querySelector(`[data-sim="${CSS.escape(job.id)}"]`);
    const w = getWorker();
    if (w) {
      pending.set(job.id, (d) => renderSim(el(), d));
      w.postMessage({ id: job.id, rules, params: job.params });
    } else {
      setTimeout(() => {
        try { renderSim(el(), { result: simulate(rules, job.params, { runs: 3000, maxSteps: 5e6, deadline: Date.now() + 1500 }) }); }
        catch (err) { renderSim(el(), { error: String(err) }); }
      }, 0);
    }
  }
}

// ---------- 목표 추가 폼 조각 ----------

export function starforceFormFields(c, rules) {
  const items = starforceItems(c, rules);
  const opts = items.map((it) => `<option value="${esc(it.item_equipment_slot)}">${esc(it.item_equipment_slot)} · ${esc(it.item_name)} (★${esc(it.starforce)}/${maxStar(rules, it.item_level)})</option>`).join("");
  const ev = Object.entries(EVENT_PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
  return `<label data-for="starforce" hidden>장비 <select name="slot">${opts}</select></label>
<fieldset data-for="starforce" hidden class="sf-opts"><legend>강화 조건</legend>
<label class="ck"><input type="checkbox" name="starcatch" checked> 스타캐치 (매번 성공 가정)</label>
<div class="ck-row">파괴 방지: ${[15, 16, 17].map((s) => `<label class="ck"><input type="checkbox" name="safeguard" value="${s}"> ${s}→${s + 1}</label>`).join("")}</div>
<label>이벤트 <select name="eventPreset">${ev}</select></label>
<label>MVP 할인 (16성 이하) <select name="mvp"><option value="0">없음</option><option value="0.03">실버 3%</option><option value="0.05">골드 5%</option><option value="0.1">다이아/레드 10%</option></select></label>
<label class="ck"><input type="checkbox" name="pcroom"> PC방 (16성 이하 5% 할인)</label>
<label>같은 장비 1개 가격 (선택, 억 메소) <input name="replacementPrice" type="number" inputmode="decimal" min="0" step="any" placeholder="파괴 복구에 쓰는 장비 시세"></label>
</fieldset>`;
}

export function readStarforceForm(f) {
  return {
    slot: f.slot.value,
    starcatch: f.starcatch.checked,
    safeguard: [...f.querySelectorAll('[name="safeguard"]:checked')].map((x) => Number(x.value)),
    eventPreset: f.eventPreset.value,
    mvp: Number(f.mvp.value) || 0,
    pcroom: f.pcroom.checked,
    replacementPrice: (Number(f.replacementPrice.value) || 0) * 1e8,
  };
}
