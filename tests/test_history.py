import unittest

from collector.history import aggregate, flag, sf_key, pot_key


def sf(before, result, catch="스타캐치 성공", guard="파괴 방지 미적용", event=None, chance=False, superior=False):
    return {"before_starforce_count": before, "item_upgrade_result": result, "starcatch_result": catch,
            "destroy_defence": guard, "starforce_event_list": event or [], "chance_time": chance,
            "superior_item_flag": superior, "target_item": "비밀 아이템", "character_name": "x"}


class HistoryTest(unittest.TestCase):
    def test_flag(self):
        for v in (True, 1, "1", "적용", "파괴 방지 적용", "이벤트 적용중"):
            self.assertTrue(flag(v), v)
        for v in (False, 0, "0", "", None, "미적용", "파괴 방지 미적용", "해당 없음",
                  "슈페리얼 장비 미해당", "찬스타임 미적용", "이벤트 적용되지 않음", "파괴 방지 이벤트맵 미적용",
                  "프로텍트 실드 미적용/소멸되지 않음"):
            self.assertFalse(flag(v), v)

    def test_starforce_keys_and_outcomes(self):
        agg = aggregate({"starforce": [
            sf(17, "성공"), sf(17, "실패(유지)"), sf(17, "파괴"),
            sf(17, "실패(유지)", catch="해당 없음"),
            sf(16, "실패(하락)", guard="파괴 방지 적용"),
            sf(15, "성공", event=[{"success_rate": "100"}]),
            sf(10, "성공", chance=True),
            sf(12, "성공", superior=True),
        ]})["starforce"]
        self.assertEqual(agg["17|success|noguard|none"], {"success": 1, "keep": 1, "down": 0, "destroy": 1})
        self.assertEqual(agg["17|none|noguard|none"]["keep"], 1)
        self.assertEqual(agg["16|success|guard|none"]["down"], 1)
        self.assertIn("15|success|noguard|event", agg)
        self.assertIn("10|success|noguard|chance", agg)
        self.assertIn("12|success|noguard|superior", agg)

    def test_real_response_values(self):
        # 2026-11 실제 응답에서 확인한 값 형식
        rec = {"before_starforce_count": 17, "item_upgrade_result": "성공", "starcatch_result": None,
               "superior_item_flag": "슈페리얼 장비 미해당", "destroy_defence": "파괴 방지 미적용",
               "chance_time": "찬스타임 미적용", "event_field_flag": "파괴 방지 이벤트맵 미적용",
               "upgrade_item": "", "starforce_event_list": None}
        self.assertEqual(sf_key(rec), "17|none|noguard|none")
        self.assertEqual(sf_key({**rec, "upgrade_item": "카르마 스타포스 17성 강화권"}), "17|none|noguard|item")
        k, _ = pot_key({"cube_type": "카르마 블랙 큐브", "miracle_time_flag": "이벤트 적용되지 않음",
                        "before_potential_option": [{"grade": "유니크"}]}, "cube")
        self.assertEqual(k, "main|카르마 블랙 큐브|unique|normal")
        k, _ = pot_key({"cube_type": "카르마 블랙 큐브", "miracle_time_flag": "이벤트 적용중",
                        "before_potential_option": [{"grade": "유니크"}]}, "cube")
        self.assertTrue(k.endswith("|miracle"))

    def test_potential(self):
        rec = lambda **kw: {"item_upgrade_result": "실패", "item_level": 200, **kw}
        agg = aggregate({
            "cube": [rec(cube_type="블랙 큐브", before_potential_option=[{"value": "INT +9%", "grade": "유니크"}], item_upgrade_result="성공"),
                     rec(cube_type="화이트 에디셔널 큐브", before_additional_potential_option=[{"value": "x", "grade": "에픽"}])],
            "potential": [rec(potential_type="잠재능력 재설정", before_potential_option=[{"grade": "유니크"}]),
                          rec(potential_type="잠재능력 재설정", before_potential_option=[{"grade": "유니크"}],
                              item_upgrade_result="성공", upgrade_guarantee=True),
                          rec(potential_type="잠재능력 재설정", before_potential_option=[{"grade": "유니크"}], miracle_time_flag="미라클 타임 적용")],
        })["potential"]
        self.assertEqual(agg["main|블랙 큐브|unique|normal"]["up"], 1)
        self.assertEqual(agg["additional|화이트 에디셔널 큐브|epic|normal"]["n"], 1)
        p = agg["main|잠재능력 재설정|unique|normal"]
        self.assertEqual((p["n"], p["up"], p["guaranteed"], p["levels"]), (2, 0, 1, {"200": 2}))
        self.assertEqual(agg["main|잠재능력 재설정|unique|miracle"]["n"], 1)

    def test_no_raw_fields_saved(self):
        agg = aggregate({"starforce": [sf(17, "성공")]})
        text = repr(agg)
        self.assertNotIn("비밀 아이템", text)
        self.assertNotIn("character_name", text)

    def test_unknown_records_skipped(self):
        self.assertIsNone(sf_key({"item_upgrade_result": "성공"}))
        self.assertIsNone(pot_key({"cube_type": "블랙 큐브"}, "cube"))


if __name__ == "__main__":
    unittest.main()


class CollectFlowTest(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        from collector import history
        self.h = history
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (history.HIST_DIR, history.STATE)
        history.HIST_DIR = Path(self.tmp.name)
        history.STATE = history.HIST_DIR / "state.json"

    def tearDown(self):
        self.h.HIST_DIR, self.h.STATE = self.saved
        self.tmp.cleanup()

    def test_paging_backfill_and_state(self):
        from collector.nexon import NexonError
        calls = []

        class Fake:
            def get(self, path, **p):
                calls.append((path, p))
                if "cursor" in p:
                    return {"starforce_history": [sf(20, "성공")], "next_cursor": None}
                if path == "history/starforce" and p["date"].endswith("-01"):
                    raise NexonError("HTTP 400")
                if path == "history/starforce":
                    return {"starforce_history": [sf(20, "파괴")], "next_cursor": "abc"}
                return {"cube_history": [], "potential_history": [], "next_cursor": None}

        state = self.h.collect(Fake(), {"backfill_days_per_run": 5})
        self.assertIn("oldest", state)
        months = list(self.h.HIST_DIR.glob("20*.json"))
        self.assertTrue(months)
        data = self.h.load_all()
        some_day = next(iter(data.values()))
        self.assertEqual(some_day["starforce"]["20|success|noguard|none"], {"success": 1, "keep": 0, "down": 0, "destroy": 1})
        # 커서 페이지 요청이 있었고, 날짜 요청은 count=1000
        self.assertTrue(any("cursor" in p for _, p in calls))
        self.assertTrue(all(p.get("count") == 1000 for _, p in calls if "date" in p))
        # 두 번째 실행은 oldest 이전부터 이어서 채움
        first_oldest = state["oldest"]
        state2 = self.h.collect(Fake(), {"backfill_days_per_run": 5})
        self.assertLess(state2["oldest"], first_oldest)

    def test_disabled(self):
        self.assertEqual(self.h.collect(object(), {"enabled": False}), {})
