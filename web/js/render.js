// 화면 조각을 HTML 문자열로 만드는 함수들. 모든 데이터 값은 esc()로 이스케이프합니다.
import { esc, fmtNum, fmtDate, leftBadge, isEndingSoon, sparkPoints } from "./format.js";

const GRADE = { 레전드리: "L", 유니크: "U", 에픽: "E", 레어: "R" };
const STAT_ROWS = ["보스 몬스터 데미지", "방어율 무시", "최종 데미지", "크리티컬 데미지", "데미지",
  "스타포스", "아이템 드롭률", "메소 획득량", "추가 경험치 획득"];

const link = (url, text, style = "") =>
  `<a href="${esc(url)}" target="_blank" rel="noopener"${style ? ` style="${style}"` : ""}>${esc(text)}</a>`;

export function badge(ev, now) {
  const b = leftBadge(ev, now);
  return b ? `<span class="chip${b.kind ? " " + b.kind : ""}">${esc(b.text)}</span>` : "";
}

export function sparkline(values) {
  const pts = sparkPoints(values);
  if (!pts) return '<p class="muted">기록이 쌓이면(2일 이상) 그래프가 표시됩니다.</p>';
  const [x, y] = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="전투력 추이">` +
    `<polyline class="sp-l" points="${pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}"/>` +
    `<circle class="sp-d" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/></svg>`;
}

function heroCard(c, a) {
  const b = c.basic, st = c.stat || {};
  const rate = Number(b.character_exp_rate) || 0;
  const hist = c.history || [];
  return `<div class="card"><div class="hero">
<img src="${esc(b.character_image)}" alt="">
<div><div class="name">${esc(b.character_name)}</div>
<div class="sub">${esc(b.world_name)} · ${esc(b.character_class)} · ${esc(b.character_guild_name || "길드 없음")}</div>
<div><b>Lv.${esc(b.character_level)}</b> <span class="sub">${rate.toFixed(3)}%</span></div>
<div class="bar"><i style="width:${Math.min(rate, 100).toFixed(1)}%"></i></div></div></div>
<div class="kv">
<div><span>전투력</span><b>${fmtNum(st["전투력"])}</b></div>
<div><span>유니온</span><b>${esc(a.union_level || "-")}</b></div>
<div><span>하루 평균 경험치</span><b>${a.exp_per_day != null ? a.exp_per_day.toFixed(2) + "%" : "기록 중"}</b></div>
<div><span>다음 레벨까지</span><b>${a.days_to_next ? `약 ${Math.round(a.days_to_next)}일` : "-"}</b></div>
<div><span>아케인 / 어센틱 포스</span><b>${esc(st["아케인포스"] ?? "-")} / ${esc(st["어센틱포스"] ?? "-")}</b></div>
<div><span>무릉도장</span><b>${esc(c.dojang?.dojang_best_floor || "-")}층</b></div>
</div>
<h3>전투력 추이</h3>${sparkline(hist.map((h) => h.combat_power))}
</div>`;
}

function guideCard(guide, eventsById, now) {
  const recs = (guide?.recommendations || []).slice(0, 8);
  const body = recs.length ? recs.map((r) => {
    const ev = eventsById.get(r.notice_id) || {};
    return `<div class="rec"><span class="score">${"★".repeat(Math.min(r.score, 5))}</span> ${badge(ev, now)} ` +
      `<span class="chip">${esc(r.category)}</span><br>${link(r.url, r.title)}<p>${esc(r.reason)}</p>` +
      (r.rewards?.length ? `<p>🎁 ${esc(r.rewards.join(" · "))}</p>` : "") + "</div>";
  }).join("") : '<p class="muted">지금 이 캐릭터에게 특별히 필요한 이벤트가 없습니다.</p>';
  return `<div class="card"><h2>이벤트로 성장하기</h2>${body}</div>`;
}

function statCard(st) {
  return `<div class="card"><h2>주요 스탯</h2><ul class="list">` +
    STAT_ROWS.map((k) => `<li><span>${esc(k)}</span><span class="r">${esc(st[k] ?? "-")}</span></li>`).join("") +
    "</ul></div>";
}

function hexaCard(hexa, a) {
  if (!hexa?.length) return "";
  return `<div class="card"><h2>HEXA 코어 <span class="sub">평균 Lv.${a.hexa_avg.toFixed(1)}</span></h2><ul class="list">` +
    hexa.map((h) => `<li><span>${esc(h.hexa_core_name)}<br><span class="sub">${esc(h.hexa_core_type)}</span></span>` +
      `<span class="r">Lv.${esc(h.hexa_core_level)}/30</span></li>`).join("") + "</ul></div>";
}

function symbolCard(sym) {
  if (!sym?.length) return "";
  return `<div class="card"><h2>심볼</h2><ul class="list">` + sym.map((s) => {
    const growth = s.symbol_require_growth_count ? ` (${esc(s.symbol_growth_count)}/${esc(s.symbol_require_growth_count)})` : "";
    return `<li><span>${esc(s.symbol_name)}</span><span class="r">Lv.${esc(s.symbol_level)}${growth}</span></li>`;
  }).join("") + "</ul></div>";
}

function itemCard(items, a) {
  if (!items?.length) return "";
  const rows = items.map((it) => {
    const pot = it.potential_option_grade || "", add = it.additional_potential_option_grade || "";
    const opts = [it.potential_option_1, it.potential_option_2, it.potential_option_3].filter(Boolean).join(" / ");
    const sf = String(it.starforce || "0") !== "0" ? `★${esc(it.starforce)}` : "";
    const lv = it.item_level ? `<span class="sub">Lv.${esc(it.item_level)} · </span>` : "";
    return `<tr><td><img src="${esc(it.item_icon)}" alt=""></td>` +
      `<td>${esc(it.item_name)}<br>${lv}<span class="sub">${esc(opts)}</span></td>` +
      `<td class="r">${sf}<br><span class="g-${esc(pot)}">${GRADE[pot] || ""}</span> <span class="g-${esc(add)}">${GRADE[add] || ""}</span></td></tr>`;
  }).join("");
  return `<div class="card"><h2>장비 <span class="sub">평균 ${a.starforce_avg.toFixed(1)}성</span></h2><table>${rows}</table>` +
    '<p class="muted">오른쪽 글자: 잠재 / 에디셔널 등급 (L 레전드리 · U 유니크 · E 에픽 · R 레어)</p></div>';
}

export function characterPane(c, guide, eventsById, now) {
  const a = guide?.analysis || { hexa_avg: 0, starforce_avg: 0, exp_per_day: null };
  const errors = c.errors?.length ? `<p class="muted">일부 정보 조회 실패: ${esc(c.errors.join("; ").slice(0, 300))}</p>` : "";
  return heroCard(c, a) + guideCard(guide, eventsById, now) + statCard(c.stat || {}) +
    hexaCard(c.hexamatrix, a) + symbolCard(c.symbol) + itemCard(c.item, a) + errors;
}

export function eventCard(ev, now) {
  const chips = (ev.category_names || []).map((n) => `<span class="chip">${esc(n)}</span>`).join("");
  const hl = (ev.highlights || []).map((h) => `<li>${esc(h)}</li>`).join("");
  const thumb = ev.thumbnail_url ? `<img src="${esc(ev.thumbnail_url)}" alt="" loading="lazy">` : "";
  return `<div class="card ev">${thumb}<div>${link(ev.url, ev.title)}` +
    `<div class="sub">${fmtDate(ev.date_event_start)} ~ ${fmtDate(ev.date_event_end)}</div>` +
    `<div class="chips">${badge(ev, now)}${chips}</div>${hl ? `<ul class="hl">${hl}</ul>` : ""}</div></div>`;
}

export function endingSoonCard(events, now) {
  const ending = events.filter((ev) => isEndingSoon(ev, now));
  if (!ending.length) return "";
  return `<div class="card"><h2>곧 끝나는 이벤트</h2><ul class="list">` +
    ending.map((ev) => `<li>${link(ev.url, ev.title, "color:inherit")}<span class="r">${badge(ev, now)}</span></li>`).join("") +
    "</ul></div>";
}

export function rosterCard(roster) {
  if (!roster?.length) return "";
  return `<div class="card"><h2>내 계정 캐릭터 <span class="sub">${roster.length}명</span></h2><ul class="list">` +
    roster.map((r) => `<li><span>${esc(r.character_name)} <span class="sub">${esc(r.world_name)} · ${esc(r.character_class)}</span></span>` +
      `<span class="r">Lv.${esc(r.character_level)}</span></li>`).join("") + "</ul></div>";
}

export function updatesCard(updates) {
  if (!updates?.length) return "";
  return `<div class="card"><h2>업데이트 공지</h2><ul class="list">` +
    updates.map((u) => `<li>${link(u.url, u.title, "color:inherit")}<span class="r">${fmtDate(u.date)}</span></li>`).join("") +
    "</ul></div>";
}

export function backupCard(storageOk) {
  return `<div class="card"><h2>내 설정 백업</h2>
<p class="muted">목표·시세 같은 설정은 이 기기의 브라우저에만 저장됩니다. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에 내보내 두세요.</p>
${storageOk ? "" : '<p class="err">이 브라우저에서는 저장이 차단되어 있어(사생활 보호 모드 등) 설정이 유지되지 않습니다.</p>'}
<div class="row"><button class="btn" id="export-btn">내보내기</button>
<label class="btn" for="import-file">가져오기</label><input type="file" id="import-file" accept="application/json,.json" class="sr"></div>
<p class="muted" id="backup-msg" role="status"></p></div>`;
}
