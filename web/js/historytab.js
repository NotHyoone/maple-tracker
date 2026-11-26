// 기록 탭: 스타포스·잠재능력 사용 기록을 기댓값과 비교 ("내 운")
import { esc, fmtNum, fmtInt } from "./format.js";
import { starforceLuck, potentialLuck, luckText } from "./calc/luck.js";

const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");
const num = (v) => (v >= 100 ? fmtInt(v) : v.toFixed(1));

function luckBar(p) {
  if (p == null) return "";
  const w = Math.round(p * 100);
  return `<div class="luckbar" title="${w}"><i style="left:${w}%"></i><span>운 나쁨</span><span>운 좋음</span></div>`;
}

function statusCard(state, history) {
  const days = Object.keys(history || {}).sort();
  if (!state?.oldest) {
    return '<div class="card"><h2>사용 기록</h2><p class="muted">아직 수집된 기록이 없습니다. 다음 자동 수집 때부터 스타포스·큐브·메소 재설정 기록을 모읍니다.</p></div>';
  }
  return `<div class="card"><h2>사용 기록</h2><p class="muted">${esc(state.oldest)}부터 집계됨${state.complete ? " (전체 기간 완료)" : " — 과거 기록은 수집할 때마다 20일씩 더 채웁니다"}. ` +
    `기록이 있는 날 ${fmtInt(days.length)}일. 공개 저장소라 원본 기록이 아닌 집계 숫자만 저장합니다.</p></div>`;
}

function starforceCard(r, since) {
  if (!r.total.n) {
    return `<div class="card"><h2>스타포스 운</h2><p class="muted">${esc(since)} 이후 비교할 수 있는 스타포스 기록이 없습니다.` +
      (r.excluded ? ` (이벤트·찬스타임·슈페리얼·개편 전 기록 ${fmtInt(r.excluded)}회는 제외)` : "") + "</p></div>";
  }
  const t = r.total;
  const rows = r.rows.filter((x) => x.n > 0).map((x) => `<tr><td>${x.star}→${x.star + 1}</td><td class="r">${fmtInt(x.n)}</td>` +
    `<td class="r">${fmtInt(x.success)} <span class="sub">/ ${num(x.expSuccess)}</span></td>` +
    `<td class="r">${fmtInt(x.destroy)} <span class="sub">/ ${num(x.expDestroy)}</span></td></tr>`).join("");
  return `<div class="card"><h2>스타포스 운 <span class="sub">${esc(since)} 이후</span></h2>
<div class="kv">
<div><span>성공 (실제 / 기대)</span><b>${fmtInt(t.success)} / ${num(t.expSuccess)}</b></div>
<div><span>파괴 (실제 / 기대)</span><b>${fmtInt(t.destroy)} / ${num(t.expDestroy)}</b></div>
</div>
<p><b>성공:</b> ${esc(luckText(r.successLuck))}</p>${luckBar(r.successLuck)}
<p><b>파괴:</b> ${esc(luckText(r.destroyLuck))}</p>${luckBar(r.destroyLuck)}
${t.unknownCatch ? `<p class="muted">넥슨 API가 스타캐치 결과를 주지 않아(${fmtInt(t.unknownCatch)}회) 위 값은 <b>스타캐치를 매번 성공했다고 가정</b>한 결과입니다. 스타캐치를 안 했다면 기대 성공 ${num(t.expSuccessB)}회 · 파괴 ${num(t.expDestroyB)}회로, 성공은 ${esc(luckText(r.successLuckB))}, 파괴는 ${esc(luckText(r.destroyLuckB))}입니다.</p>` : ""}
<details class="steps"><summary>성급별 (시도 · 성공 실제/기대 · 파괴 실제/기대)</summary>
<table><tr><td>성급</td><td class="r">시도</td><td class="r">성공</td><td class="r">파괴</td></tr>${rows}</table></details>
<p class="muted">총 ${fmtInt(t.n)}회 비교. 스타캐치 성공 여부와 파괴 방지를 시도마다 반영한 기대값입니다. 이벤트·찬스타임·슈페리얼·강화권·개편 전 기록 ${fmtInt(r.excluded)}회는 확률이 달라 제외했습니다.</p></div>`;
}

function potentialCard(r, meta) {
  const ko = meta.grade_names;
  const months = Object.entries(r.mesoByMonth).sort().reverse().slice(0, 6);
  const meso = months.length ? `<h3>메소 재설정에 쓴 메소 (최근 ${months.length}개월)</h3><ul class="list">` +
    months.map(([m, v]) => `<li><span>${esc(m)}</span><span class="r">${fmtNum(v)}</span></li>`).join("") + "</ul>" : "";
  if (!r.total.n) {
    return `<div class="card"><h2>잠재능력 운</h2><p class="muted">비교할 수 있는 큐브·재설정 기록이 없습니다.</p>${meso}</div>`;
  }
  const rows = r.rows.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) =>
    `<li><span>${esc(x.name)} · ${esc(ko[x.grade])}${x.kind === "additional" && !/에디셔널/.test(x.name) ? " (에디)" : ""}<br>` +
    `<span class="sub">${fmtInt(x.n)}회 · 등급 상승 ${fmtInt(x.up)} / 기대 ${num(x.expUp)}${x.guaranteed ? ` · 천장 ${x.guaranteed}회` : ""}</span></span>` +
    `<span class="r">${esc(luckText(x.luck))}</span></li>`).join("");
  return `<div class="card"><h2>잠재능력 운 <span class="sub">등급 상승 기준</span></h2>
<div class="kv"><div><span>등급 상승 (실제 / 기대)</span><b>${fmtInt(r.total.up)} / ${num(r.total.expUp)}</b></div>
<div><span>비교한 재설정</span><b>${fmtInt(r.total.n)}회</b></div></div>
<p><b>종합:</b> ${esc(luckText(r.total.luck))}</p>${luckBar(r.total.luck)}
<ul class="list">${rows}</ul>${meso}
<p class="muted">천장으로 확정된 등급 상승은 확률 비교에서 뺐고, 레전드리 옵션 재설정(더 오를 등급 없음)·미라클 타임·비교할 확률표가 없는 큐브 ${fmtInt(r.excluded)}회도 제외했습니다. 메소는 공식 재설정 비용표로 계산한 값입니다(에디셔널은 출처 1곳).</p></div>`;
}

export function renderHistoryTab(root, d) {
  const since = d.rules.starforce.compare_since;
  const sf = starforceLuck(d.history, d.rules.starforce, { since });
  const pot = potentialLuck(d.history, d.rules.potentialMeta);
  root.innerHTML = statusCard(d.history_state, d.history) + starforceCard(sf, since) + potentialCard(pot, d.rules.potentialMeta);
}
