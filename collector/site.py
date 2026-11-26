"""수집 데이터 → 휴대폰에서 보기 좋은 정적 웹페이지(site/index.html)."""
from __future__ import annotations

from html import escape as e

from .util import ROOT, now_kst, parse_dt

SITE = ROOT / "site"
GRADE = {"레전드리": "L", "유니크": "U", "에픽": "E", "레어": "R"}

CSS = """
:root{--bg:#f6f7f9;--card:#fff;--fg:#1d2330;--mut:#6b7385;--line:#e3e6ec;--acc:#e8790c;--acc2:#3b6fd8;--good:#1f9d55;--warn:#d64545;--chip:#f0f2f6}
@media (prefers-color-scheme:dark){:root{--bg:#12151b;--card:#1b1f27;--fg:#e8ebf1;--mut:#9aa3b5;--line:#2b313d;--acc:#ff9a3c;--acc2:#7aa2ff;--good:#4cc98a;--warn:#ff7676;--chip:#252b36}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line)}
.top{max-width:760px;margin:0 auto;padding:12px 16px 0}
h1{font-size:18px;margin:0}
.upd{color:var(--mut);font-size:12px}
nav{display:flex;gap:4px;max-width:760px;margin:0 auto;padding:8px 16px 0;overflow-x:auto}
nav button{flex:1 0 auto;border:0;background:none;color:var(--mut);font:inherit;font-weight:600;padding:8px 10px;border-bottom:3px solid transparent;cursor:pointer}
nav button.on{color:var(--fg);border-color:var(--acc)}
main{max-width:760px;margin:0 auto;padding:12px 16px 48px}
section{display:none}section.on{display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
.card h2{font-size:16px;margin:0 0 8px}.card h3{font-size:14px;margin:14px 0 6px;color:var(--mut)}
.hero{display:flex;gap:12px;align-items:center}
.hero img{width:96px;height:96px;object-fit:contain;image-rendering:pixelated}
.name{font-size:19px;font-weight:700}.sub{color:var(--mut);font-size:13px}
.bar{height:8px;border-radius:4px;background:var(--chip);overflow:hidden;margin:4px 0}
.bar i{display:block;height:100%;background:var(--acc)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:10px}
.kv div{background:var(--chip);border-radius:10px;padding:8px 10px}
.kv b{display:block;font-size:16px}.kv span{color:var(--mut);font-size:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.chip{background:var(--chip);border-radius:999px;padding:2px 9px;font-size:12px;color:var(--mut)}
.chip.hot{background:var(--warn);color:#fff}.chip.new{background:var(--acc2);color:#fff}
.list{list-style:none;margin:0;padding:0}
.list li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}
.list li:last-child{border:0}
.list .r{color:var(--mut);white-space:nowrap}
.ev{display:flex;gap:12px}.ev img{width:84px;height:84px;border-radius:10px;object-fit:cover;flex:none;background:var(--chip)}
.ev a{color:var(--fg);font-weight:700;text-decoration:none}
.hl{margin:6px 0 0;padding-left:18px;color:var(--mut);font-size:13px}
.rec{border-left:4px solid var(--acc);padding:8px 10px;margin:8px 0;background:var(--chip);border-radius:0 10px 10px 0}
.rec a{color:var(--fg);font-weight:700;text-decoration:none}
.rec p{margin:2px 0 0;font-size:13px;color:var(--mut)}
.score{color:var(--acc);letter-spacing:1px}
.charsel{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px}
.charsel button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.charsel button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.pane{display:none}.pane.on{display:block}
svg.spark{width:100%;height:60px}
.sp-l{fill:none;stroke:var(--acc2);stroke-width:2}
.sp-d{fill:var(--acc2)}
.muted{color:var(--mut);font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:5px 4px;border-bottom:1px solid var(--line);vertical-align:top}
td img{width:28px;height:28px}
.g-레전드리{color:#3fbf5f}.g-유니크{color:#e0a100}.g-에픽{color:#9b59d0}.g-레어{color:#3aa0e0}
"""

JS = """
document.querySelectorAll('[data-tabs]').forEach(g=>{
  const btns=g.querySelectorAll('[data-t]');
  btns.forEach(b=>b.onclick=()=>{
    const scope=document.querySelectorAll(g.dataset.tabs);
    btns.forEach(x=>x.classList.toggle('on',x===b));
    scope.forEach(s=>s.classList.toggle('on',s.id===b.dataset.t));
    try{localStorage.setItem('tab:'+g.dataset.tabs,b.dataset.t)}catch(_){}
  });
  try{const saved=localStorage.getItem('tab:'+g.dataset.tabs);const b=g.querySelector('[data-t="'+saved+'"]');if(b)b.click()}catch(_){}
});
"""


def fmt_num(n) -> str:
    try:
        n = int(n)
    except (TypeError, ValueError):
        return "-"
    if n >= 100_000_000:
        return f"{n // 100_000_000}억 {n % 100_000_000 // 10_000:,}만"
    if n >= 10_000:
        return f"{n // 10_000:,}만"
    return f"{n:,}"


def fmt_date(s) -> str:
    d = parse_dt(s)
    return d.strftime("%m.%d %H:%M") if d else "-"


def left_label(ev) -> str:
    if ev.get("upcoming"):
        return f'<span class="chip new">{fmt_date(ev["date_event_start"])} 시작</span>'
    dl = ev.get("days_left")
    if dl is None:
        return ""
    if dl < 1:
        return '<span class="chip hot">오늘 종료</span>'
    cls = "chip hot" if dl <= 3 else "chip"
    return f'<span class="{cls}">D-{int(dl)}</span>'


def sparkline(values: list[float]) -> str:
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return '<p class="muted">기록이 쌓이면(2일 이상) 그래프가 표시됩니다.</p>'
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1
    w, h, pad = 300, 60, 6
    pts = [(pad + i * (w - 2 * pad) / (len(vals) - 1), h - pad - (v - lo) / span * (h - 2 * pad))
           for i, v in enumerate(vals)]
    path = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    x, y = pts[-1]
    return (f'<svg class="spark" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<polyline class="sp-l" points="{path}"/><circle class="sp-d" cx="{x:.1f}" cy="{y:.1f}" r="3"/></svg>')


def char_pane(c: dict, guide: dict) -> str:
    b, st, a = c["basic"], c.get("stat", {}), guide["analysis"]
    hist = c.get("history", [])
    rate = float(b.get("character_exp_rate") or 0)
    out = [f"""<div class="card"><div class="hero">
<img src="{e(b.get('character_image') or '')}" alt="">
<div><div class="name">{e(b['character_name'])}</div>
<div class="sub">{e(b.get('world_name',''))} · {e(b.get('character_class',''))} · {e(b.get('character_guild_name') or '길드 없음')}</div>
<div><b>Lv.{b.get('character_level')}</b> <span class="sub">{rate:.3f}%</span></div>
<div class="bar"><i style="width:{min(rate,100):.1f}%"></i></div></div></div>
<div class="kv">
<div><span>전투력</span><b>{fmt_num(st.get('전투력'))}</b></div>
<div><span>유니온</span><b>{e(str(a.get('union_level') or '-'))}</b></div>
<div><span>하루 평균 경험치</span><b>{f"{a['exp_per_day']:.2f}%" if a['exp_per_day'] is not None else '기록 중'}</b></div>
<div><span>다음 레벨까지</span><b>{f"약 {a['days_to_next']:.0f}일" if a['days_to_next'] else '-'}</b></div>
<div><span>아케인 / 어센틱 포스</span><b>{e(str(st.get('아케인포스','-')))} / {e(str(st.get('어센틱포스','-')))}</b></div>
<div><span>무릉도장</span><b>{e(str((c.get('dojang') or {}).get('dojang_best_floor') or '-'))}층</b></div>
</div>
<h3>전투력 추이</h3>{sparkline([h.get('combat_power') for h in hist])}
</div>"""]

    recs = guide["recommendations"][:8]
    out.append('<div class="card"><h2>이벤트로 성장하기</h2>')
    if recs:
        for r in recs:
            stars = "★" * min(r["score"], 5)
            out.append(f'<div class="rec"><span class="score">{stars}</span> {left_label(r)} <span class="chip">{e(r["category"])}</span><br>'
                       f'<a href="{e(r["url"])}" target="_blank" rel="noopener">{e(r["title"])}</a><p>{e(r["reason"])}</p>'
                       + (f'<p>🎁 {e(" · ".join(r["rewards"]))}</p>' if r.get("rewards") else "") + '</div>')
    else:
        out.append('<p class="muted">지금 이 캐릭터에게 특별히 필요한 이벤트가 없습니다.</p>')
    out.append("</div>")

    stat_rows = ["보스 몬스터 데미지", "방어율 무시", "최종 데미지", "크리티컬 데미지", "데미지", "스타포스", "아이템 드롭률", "메소 획득량", "추가 경험치 획득"]
    out.append('<div class="card"><h2>주요 스탯</h2><ul class="list">' + "".join(
        f'<li><span>{e(k)}</span><span class="r">{e(str(st.get(k,"-")))}</span></li>' for k in stat_rows) + "</ul></div>")

    hexa = c.get("hexamatrix", [])
    if hexa:
        out.append(f'<div class="card"><h2>HEXA 코어 <span class="sub">평균 Lv.{a["hexa_avg"]:.1f}</span></h2><ul class="list">' + "".join(
            f'<li><span>{e(h["hexa_core_name"])}<br><span class="sub">{e(h["hexa_core_type"])}</span></span><span class="r">Lv.{h["hexa_core_level"]}/30</span></li>'
            for h in hexa) + "</ul></div>")

    sym = c.get("symbol", [])
    if sym:
        out.append('<div class="card"><h2>심볼</h2><ul class="list">' + "".join(
            f'<li><span>{e(s["symbol_name"])}</span><span class="r">Lv.{s["symbol_level"]}'
            f'{"" if not s.get("symbol_require_growth_count") else f" ({s.get("symbol_growth_count")}/{s.get("symbol_require_growth_count")})"}</span></li>'
            for s in sym) + "</ul></div>")

    items = c.get("item", [])
    if items:
        rows = []
        for it in items:
            pot = it.get("potential_option_grade") or ""
            add = it.get("additional_potential_option_grade") or ""
            opts = " / ".join(o for o in (it.get("potential_option_1"), it.get("potential_option_2"), it.get("potential_option_3")) if o)
            rows.append(f'<tr><td><img src="{e(it.get("item_icon") or "")}" alt=""></td>'
                        f'<td>{e(it.get("item_name") or "")}<br><span class="sub">{e(opts)}</span></td>'
                        f'<td class="r">{"★"+e(str(it["starforce"])) if str(it.get("starforce") or "0") != "0" else ""}<br>'
                        f'<span class="g-{e(pot)}">{GRADE.get(pot, "")}</span> <span class="g-{e(add)}">{GRADE.get(add, "")}</span></td></tr>')
        out.append(f'<div class="card"><h2>장비 <span class="sub">평균 {a["starforce_avg"]:.1f}성</span></h2><table>{"".join(rows)}</table>'
                   '<p class="muted">오른쪽 글자: 잠재 / 에디셔널 등급 (L 레전드리 · U 유니크 · E 에픽 · R 레어)</p></div>')

    if c.get("errors"):
        out.append(f'<p class="muted">일부 정보 조회 실패: {e("; ".join(c["errors"]))[:300]}</p>')
    return "".join(out)


def event_card(ev: dict) -> str:
    chips = "".join(f'<span class="chip">{e(n)}</span>' for n in ev.get("category_names", []))
    hl = "".join(f"<li>{e(h)}</li>" for h in ev.get("highlights", []))
    thumb = f'<img src="{e(ev["thumbnail_url"])}" alt="" loading="lazy">' if ev.get("thumbnail_url") else ""
    return (f'<div class="card ev">{thumb}<div><a href="{e(ev["url"])}" target="_blank" rel="noopener">{e(ev["title"])}</a>'
            f'<div class="sub">{fmt_date(ev.get("date_event_start"))} ~ {fmt_date(ev.get("date_event_end"))}</div>'
            f'<div class="chips">{left_label(ev)}{chips}</div>{f"<ul class=hl>{hl}</ul>" if hl else ""}</div></div>')


def build(title: str, events: list[dict], updates: list[dict], characters: list[dict],
          roster: list[dict], guides: dict) -> None:
    now = now_kst()
    names = [c["basic"]["character_name"] for c in characters]
    sel = "".join(f'<button data-t="c{i}" class="{"on" if i == 0 else ""}">{e(n)}</button>' for i, n in enumerate(names))
    panes = "".join(f'<div class="pane{" on" if i == 0 else ""}" id="c{i}">{char_pane(c, guides[c["basic"]["character_name"]])}</div>'
                    for i, c in enumerate(characters))
    ending = [ev for ev in events if ev.get("days_left") is not None and ev["days_left"] <= 3 and not ev.get("upcoming")]

    roster_html = ""
    if roster:
        roster_html = ('<div class="card"><h2>내 계정 캐릭터 ' + f'<span class="sub">{len(roster)}명</span></h2><ul class="list">' +
                       "".join(f'<li><span>{e(r["character_name"])} <span class="sub">{e(r["world_name"])} · {e(r["character_class"])}</span></span>'
                               f'<span class="r">Lv.{r["character_level"]}</span></li>' for r in roster) + "</ul></div>")

    upd_html = ""
    if updates:
        upd_html = '<div class="card"><h2>업데이트 공지</h2><ul class="list">' + "".join(
            f'<li><a href="{e(u.get("url",""))}" target="_blank" rel="noopener" style="color:inherit">{e(u.get("title",""))}</a>'
            f'<span class="r">{fmt_date(u.get("date"))}</span></li>' for u in updates) + "</ul></div>"

    ending_html = ""
    if ending:
        ending_html = '<div class="card"><h2>곧 끝나는 이벤트</h2><ul class="list">' + "".join(
            f'<li><a href="{e(ev["url"])}" target="_blank" rel="noopener" style="color:inherit">{e(ev["title"])}</a><span class="r">{left_label(ev)}</span></li>'
            for ev in ending) + "</ul></div>"

    page = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{e(title)}</title><style>{CSS}</style></head><body>
<header><div class="top"><h1>{e(title)}</h1><div class="upd">마지막 갱신 {now.strftime('%Y-%m-%d %H:%M')} (KST)</div></div>
<nav data-tabs="main > section"><button data-t="t-char" class="on">내 캐릭터</button><button data-t="t-event">이벤트 ({len(events)})</button><button data-t="t-more">계정·공지</button></nav></header>
<main>
<section id="t-char" class="on"><div class="charsel" data-tabs=".pane">{sel}</div>{panes or '<p class="muted">수집된 캐릭터가 없습니다.</p>'}</section>
<section id="t-event">{ending_html}{"".join(event_card(ev) for ev in events) or '<p class="muted">진행 중인 이벤트가 없습니다.</p>'}</section>
<section id="t-more">{roster_html}{upd_html}<p class="muted">Data based on NEXON Open API</p></section>
</main><script>{JS}</script></body></html>"""
    SITE.mkdir(exist_ok=True)
    (SITE / "index.html").write_text(page, encoding="utf-8")
    print(f"[site] {SITE / 'index.html'} 생성")
