"""잠재능력 옵션 확률표 수집 (수동 실행 도구).

넥슨 공식 확률 공개 페이지의 '확률 검색'(잠재능력 재설정/블랙 큐브, 에디셔널 잠재능력 재설정)에서
내 캐릭터들이 착용한 장비의 (부위, 레벨) 조합에 해당하는 줄별 옵션 확률을 받아 web/rules/potential.json 에 저장합니다.

  python -m collector.fetch_potential

장비를 바꿨을 때만 다시 실행하면 됩니다. 요청 사이에 1초씩 쉽니다.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request

from .util import DATA, ROOT, now_kst, read_json

URL = "https://maplestory.nexon.com/Guide/OtherProbability/cube/GetSearchProbList"
REFERER = "https://maplestory.nexon.com/Guide/OtherProbability/cube/black"
CUBES = {"main": "5062010", "additional": "5062500"}  # 잠재능력 재설정/블랙 큐브, 에디셔널 잠재능력 재설정
GRADES = {"unique": 3, "legendary": 4}
# 공식 확률 검색의 부위 코드
PARTS = {"무기": 1, "엠블렘": 2, "보조무기": 3, "방패": 5, "모자": 6, "상의": 7, "한벌옷": 8, "하의": 9,
         "신발": 10, "장갑": 11, "망토": 12, "벨트": 13, "어깨장식": 14, "얼굴장식": 15, "눈장식": 16,
         "귀고리": 17, "반지": 18, "펜던트": 19, "기계 심장": 20}
OUT = ROOT / "web" / "rules" / "potential.json"


def part_code(item: dict) -> int | None:
    for key in (item.get("item_equipment_part"), re.sub(r"\d+$", "", item.get("item_equipment_slot") or "")):
        if key in PARTS:
            return PARTS[key]
    return None


def parse_tables(page: str) -> list[list[list]]:
    """[[줄1 옵션들], [줄2], [줄3]], 옵션 = [이름, 확률(0~1)]"""
    lines = []
    for t in re.findall(r"<table.*?</table>", page, re.S | re.I):
        rows = []
        for tr in re.findall(r"<tr.*?</tr>", t, re.S | re.I):
            cells = [" ".join(html.unescape(re.sub(r"<[^>]+>", " ", c)).split())
                     for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S | re.I)]
            if len(cells) == 2 and cells[1].endswith("%"):
                rows.append([cells[0], round(float(cells[1].rstrip("%")) / 100, 10)])
        if rows:
            lines.append(rows)
    return lines


def fetch(cube: str, grade: int, part: int, level: int) -> list:
    data = urllib.parse.urlencode({"nCubeItemID": cube, "nGrade": grade, "nPartsType": part, "nReqLev": level}).encode()
    req = urllib.request.Request(URL, data=data, headers={
        "User-Agent": "Mozilla/5.0 (maple-tracker)", "Referer": REFERER, "X-Requested-With": "XMLHttpRequest"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return parse_tables(r.read().decode("utf-8", "replace"))


def wanted_combos() -> set[tuple[int, int]]:
    combos = set()
    for f in (DATA / "characters").glob("*/latest.json"):
        for it in read_json(f, {}).get("item", []):
            code, lv = part_code(it), it.get("item_level") or 0
            if code and lv:
                combos.add((code, min(int(lv), 250)))
    return combos


def main() -> int:
    old = read_json(OUT, {"tables": {}, "index": {}})
    tables, index = old.get("tables", {}), old.get("index", {})
    combos = sorted(wanted_combos())
    todo = [(c, g, p, lv) for p, lv in combos for c in CUBES for g in GRADES
            if f"{c}|{g}|{p}|{lv}" not in index]
    print(f"[potential] 조합 {len(combos)}개, 새로 받을 표 {len(todo)}개")
    for i, (cube, grade, part, lv) in enumerate(todo, 1):
        try:
            lines = fetch(CUBES[cube], GRADES[grade], part, lv)
        except Exception as err:  # noqa: BLE001 - 하나 실패해도 나머지는 계속
            print(f"  실패 {cube} {grade} 부위{part} Lv.{lv}: {err}")
            continue
        if len(lines) != 3:
            print(f"  표 형식이 예상과 다름 {cube} {grade} 부위{part} Lv.{lv}: {len(lines)}줄")
            continue
        h = hashlib.sha1(json.dumps(lines, ensure_ascii=False).encode()).hexdigest()[:12]
        tables[h] = lines
        index[f"{cube}|{grade}|{part}|{lv}"] = h
        print(f"  {i}/{len(todo)} {cube} {grade} 부위{part} Lv.{lv} → {h}")
        time.sleep(1)
    out = {
        "_doc": "잠재능력 줄별 옵션 확률. index['cube|grade|부위코드|레벨'] → tables[해시] = [줄1, 줄2, 줄3], 줄 = [[옵션, 확률]]",
        "source": "넥슨 공식 확률 공개 '확률 검색' (maplestory.nexon.com/Guide/OtherProbability/cube/black, /addi)",
        "fetched": now_kst().date().isoformat(),
        "parts": PARTS,
        "tables": tables,
        "index": dict(sorted(index.items())),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"[potential] 저장: 표 {len(tables)}종, 조합 {len(index)}개 → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
