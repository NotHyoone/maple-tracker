import unittest
from datetime import datetime, timedelta, timezone

from collector import notify

KST = timezone(timedelta(hours=9))
NOW = datetime(2026, 12, 10, 12, 0, tzinfo=KST)


def ev(nid, start_days, end_days, title="이벤트"):
    f = lambda d: (NOW + timedelta(days=d)).isoformat(timespec="minutes")
    return {"notice_id": nid, "title": f"{title}{nid}", "url": f"https://x/{nid}", "date_event_start": f(start_days),
            "date_event_end": f(end_days), "highlights": ["경험치 4배 쿠폰"], "thumbnail_url": None}


CFG = {"ending_days": [3, 1], "new_events": True}


class PlanTest(unittest.TestCase):
    def test_first_run_marks_existing_as_seen_but_alerts_ending(self):
        events = [ev(1, -10, 20), ev(2, -10, 2.5), ev(3, -10, 0.5)]
        todo, state = notify.plan(events, {}, CFG, NOW)
        kinds = sorted((e["notice_id"], k, key) for e, k, _, key in todo)
        # 새 이벤트 알림 없음, 2는 3일 기준, 3은 1일 기준 하나만 (3일 기준도 보낸 것으로 기록)
        self.assertEqual(kinds, [(2, "ending", "d3"), (3, "ending", "d1")])
        self.assertEqual(state["sent"]["3"], ["d1", "d3", "new"])

    def test_no_duplicates_and_next_threshold(self):
        events = [ev(2, -10, 2.5)]
        _, state = notify.plan(events, {}, CFG, NOW)
        todo, state = notify.plan(events, state, CFG, NOW + timedelta(hours=8))
        self.assertEqual(todo, [])
        todo, _ = notify.plan(events, state, CFG, NOW + timedelta(days=1.6))  # 0.9일 남음
        self.assertEqual([(k, key) for _, k, _, key in todo], [("ending", "d1")])

    def test_new_event_after_first_run(self):
        _, state = notify.plan([ev(1, -10, 20)], {}, CFG, NOW)
        todo, state = notify.plan([ev(1, -10, 20), ev(9, -0.1, 30)], state, CFG, NOW)
        self.assertEqual([(e["notice_id"], k) for e, k, _, _ in todo], [(9, "new")])
        # 아직 시작 안 한 이벤트는 새 이벤트로 알리지 않음
        todo, _ = notify.plan([ev(1, -10, 20), ev(9, -0.1, 30), ev(10, 2, 30)], state, CFG, NOW)
        self.assertEqual(todo, [])

    def test_ended_events_pruned(self):
        _, state = notify.plan([ev(1, -10, 20), ev(2, -10, 2)], {}, CFG, NOW)
        _, state = notify.plan([ev(1, -10, 20)], state, CFG, NOW)
        self.assertEqual(set(state["sent"]), {"1"})


class SendTest(unittest.TestCase):
    def setUp(self):
        import os, tempfile
        from pathlib import Path
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = notify.STATE
        notify.STATE = Path(self.tmp.name) / "s.json"
        os.environ["DISCORD_WEBHOOK_URL"] = "https://discord.invalid/hook"

    def tearDown(self):
        import os
        notify.STATE = self.saved
        os.environ.pop("DISCORD_WEBHOOK_URL", None)
        self.tmp.cleanup()

    def test_payload_and_guide(self):
        sent = []
        guides = {"loss기억": {"recommendations": [{"notice_id": 2, "score": 5, "category": "헥사/6차 전직"}]}}
        from unittest import mock
        with mock.patch.object(notify, "now_kst", return_value=NOW):
            n = notify.notify([ev(2, -10, 2.5)], guides, CFG, "https://site", sender=lambda url, p: sent.append(p))
        self.assertEqual(n, 1)
        emb = sent[0]["embeds"][0]
        self.assertTrue(emb["title"].startswith("⏰ D-2"))
        self.assertIn("loss기억: 헥사/6차 전직 ★★★★★", emb["fields"][1]["value"])
        self.assertIn("https://site", sent[0]["content"])
        self.assertEqual(sent[0]["allowed_mentions"], {"parse": []})

    def test_failure_keeps_alert_for_next_run(self):
        import urllib.error
        from unittest import mock

        def boom(url, p):
            raise urllib.error.URLError("down")
        with mock.patch.object(notify, "now_kst", return_value=NOW):
            self.assertEqual(notify.notify([ev(2, -10, 2.5)], {}, CFG, sender=boom), 0)
            sent = []
            self.assertEqual(notify.notify([ev(2, -10, 2.5)], {}, CFG, sender=lambda u, p: sent.append(p)), 1)

    def test_send_test_message(self):
        sent = []
        self.assertTrue(notify.send_test([ev(2, -10, 2.5)], {}, "https://site", sender=lambda u, p: sent.append(p)))
        self.assertIn("테스트", sent[0]["content"])
        self.assertEqual(len(sent[0]["embeds"]), 1)
        self.assertFalse(notify.STATE.exists())  # 테스트는 알림 상태를 바꾸지 않음

    def test_no_webhook_skips_without_saving(self):
        import os
        os.environ.pop("DISCORD_WEBHOOK_URL")
        self.assertEqual(notify.notify([ev(2, -10, 2.5)], {}, CFG, sender=lambda u, p: None), 0)
        self.assertFalse(notify.STATE.exists())


if __name__ == "__main__":
    unittest.main()
