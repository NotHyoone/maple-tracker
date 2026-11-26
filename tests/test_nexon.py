import io
import unittest
import urllib.error
from unittest import mock

from collector import nexon


def http_error(code, body):
    return urllib.error.HTTPError("https://x", code, "err", {}, io.BytesIO(body.encode()))


class QuotaTest(unittest.TestCase):
    def setUp(self):
        self.sleep = mock.patch.object(nexon.time, "sleep", lambda s: None)
        self.sleep.start()

    def tearDown(self):
        self.sleep.stop()

    def test_quota_error_stops_quickly(self):
        calls = []

        def urlopen(req, timeout):
            calls.append(req.full_url)
            raise http_error(429, '{"error":{"name":"OPENAPI00007","message":"Please try again later"}}')
        c = nexon.Client(api_key="k")
        with mock.patch.object(nexon.urllib.request, "urlopen", urlopen):
            with self.assertRaises(nexon.NexonQuotaError):
                c.get("notice-event")
            self.assertEqual(len(calls), 2)  # 한 번만 다시 시도
            self.assertTrue(c.quota_exceeded)
            with self.assertRaises(nexon.NexonQuotaError):
                c.get("character/list")
            self.assertEqual(len(calls), 2)  # 한도 초과 후에는 호출 자체를 안 함

    def test_other_errors_are_not_quota(self):
        def urlopen(req, timeout):
            raise http_error(400, '{"error":{"name":"OPENAPI00003","message":"Please input valid id"}}')
        c = nexon.Client(api_key="k")
        with mock.patch.object(nexon.urllib.request, "urlopen", urlopen):
            with self.assertRaises(nexon.NexonError) as cm:
                c.get("character/basic", ocid="x")
            self.assertNotIsInstance(cm.exception, nexon.NexonQuotaError)
            self.assertFalse(c.quota_exceeded)


class MainFallbackTest(unittest.TestCase):
    def test_quota_falls_back_to_saved_data_and_builds_site(self):
        from collector import main as m

        class QuotaClient:
            calls = 0
            quota_exceeded = True

            def __init__(self, *a, **k):
                pass

            def get(self, *a, **k):
                raise nexon.NexonQuotaError("limit")

        built = {}
        with mock.patch.object(m, "Client", QuotaClient), \
             mock.patch.object(m.site, "build", lambda *a: built.setdefault("args", a)), \
             mock.patch.object(m.notify, "notify", lambda *a, **k: 0), \
             mock.patch.object(m, "write_json", lambda *a: None), \
             mock.patch.object(m.history, "collect", side_effect=AssertionError("한도 초과면 기록 수집 안 함")):
            self.assertEqual(m.main([]), 0)
        events, chars = built["args"][1], built["args"][3]
        self.assertTrue(events, "저장된 이벤트로 페이지를 만들어야 함")
        self.assertTrue(chars, "저장된 캐릭터로 페이지를 만들어야 함")


if __name__ == "__main__":
    unittest.main()
