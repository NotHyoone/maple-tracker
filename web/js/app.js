// 진입점: data/app.json을 읽어 화면을 그리고 탭·백업 동작을 연결합니다.
import { esc } from "./format.js";
import * as store from "./store.js";
import {
  characterPane, eventCard, endingSoonCard, rosterCard, updatesCard, backupCard,
} from "./render.js";
import { renderGoalsTab } from "./goals.js";

const $ = (sel, root = document) => root.querySelector(sel);

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${url}, HTTP ${res.status})`);
  return res.json();
}

async function loadData() {
  const [app, level, hexa, symbol, starforce, potential, potentialMeta] = await Promise.all(
    ["data/app.json", "rules/level.json", "rules/hexa.json", "rules/symbol.json", "rules/starforce.json",
      "rules/potential.json", "rules/potential_meta.json"].map(getJSON));
  app.rules = { level, hexa, symbol, starforce, potential, potentialMeta };
  return app;
}

function setupTabs(group, panes, key) {
  const btns = [...group.querySelectorAll("[data-t]")];
  const show = (id) => {
    if (!btns.some((b) => b.dataset.t === id)) return;
    btns.forEach((b) => b.classList.toggle("on", b.dataset.t === id));
    panes.forEach((p) => p.classList.toggle("on", p.id === id));
    store.save(key, id);
  };
  btns.forEach((b) => b.addEventListener("click", () => show(b.dataset.t)));
  const saved = store.load(key, null);
  show(btns.some((b) => b.dataset.t === saved) ? saved : btns[0]?.dataset.t);
}

function setupBackup() {
  const msg = $("#backup-msg");
  $("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `maple-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg.textContent = "백업 파일을 내려받았습니다.";
  });
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const n = store.importAll(JSON.parse(await file.text()));
      msg.textContent = `${n}개 항목을 가져왔습니다. 새로고침하면 적용됩니다.`;
    } catch (err) {
      msg.textContent = err instanceof SyntaxError ? "JSON 파일이 아닙니다." : err.message;
    }
    e.target.value = "";
  });
}

function render(d) {
  const now = Date.now();
  document.title = d.title;
  $("#title").textContent = d.title;
  $("#updated").textContent = `마지막 수집 ${d.generated_at.slice(0, 16).replace("T", " ")} (KST)`;

  const eventsById = new Map(d.events.map((ev) => [ev.notice_id, ev]));
  const chars = d.characters;

  $("#tabs").innerHTML =
    '<button data-t="t-char">내 캐릭터</button>' +
    '<button data-t="t-goal">목표</button>' +
    `<button data-t="t-event">이벤트 (${d.events.length})</button>` +
    '<button data-t="t-more">계정·설정</button>';

  const sel = chars.map((c, i) => `<button data-t="c${i}">${esc(c.basic.character_name)}</button>`).join("");
  const panes = chars.map((c, i) =>
    `<div class="pane" id="c${i}">${characterPane(c, d.guides[c.basic.character_name], eventsById, now)}</div>`).join("");

  $("#app").innerHTML = `
<section id="t-char"><div class="charsel">${sel}</div>${panes || '<p class="muted">수집된 캐릭터가 없습니다.</p>'}</section>
<section id="t-goal"></section>
<section id="t-event">${endingSoonCard(d.events, now)}${d.events.map((ev) => eventCard(ev, now)).join("") || '<p class="muted">진행 중인 이벤트가 없습니다.</p>'}</section>
<section id="t-more">${rosterCard(d.roster)}${updatesCard(d.updates)}${backupCard(store.available())}<p class="muted">Data based on NEXON Open API</p></section>`;

  renderGoalsTab($("#t-goal"), { chars, rules: d.rules, observed: d.observed_exp, events: d.events, setupTabs });
  setupTabs($("#tabs"), [...document.querySelectorAll("main > section")], "tab:main");
  setupTabs($(".charsel"), [...document.querySelectorAll(".pane")], "tab:character");
  setupBackup();
}

loadData().then(render).catch((err) => {
  $("#app").innerHTML = `<div class="card"><p class="err">${esc(err.message)}</p>` +
    '<button class="btn" onclick="location.reload()">다시 시도</button></div>';
  console.error(err);
});
