import copy
import unittest

from collector import characters


class SlimTest(unittest.TestCase):
    def test_item_presets_share_current_item_format(self):
        items = [
            {**{k: f"value-{k}" for k in characters.ITEM_KEYS},
             "item_base_option": {"base_equipment_level": 200}, "unused": "drop"},
            {"item_name": "장비", "item_base_option": None},
            {"item_name": "기본 옵션 없는 장비"},
        ]
        raw = {"item": {"item_equipment": items, "preset_no": 2,
                        **{f"item_equipment_preset_{i}": [item]
                           for i, item in enumerate(items, 1)}}}
        original = copy.deepcopy(raw)
        result = characters.slim(raw)
        expected = [
            {**{k: item.get(k) for k in characters.ITEM_KEYS}, "item_level": level}
            for item, level in zip(items, [200, None, None])
        ]
        self.assertEqual(result["item"], expected)
        self.assertEqual(result["item_presets"], [[item] for item in expected])
        self.assertEqual(result["item_preset_no"], 2)
        self.assertEqual(raw, original)

    def test_ability_presets_keep_current_grade_and_lines(self):
        raw = {"ability": {
            "ability_grade": "레전드리",
            "ability_info": [{"ability_value": "현재 옵션", "ability_no": "1"}],
            "preset_no": 3,
            **{f"ability_preset_{i}": {
                "ability_preset_grade": f"등급{i}",
                "ability_info": [{"ability_value": f"옵션{i}", "ability_no": "1"},
                                 {"ability_value": "두 번째 옵션"}],
            } for i in range(1, 4)},
        }}
        self.assertEqual(characters.slim(raw)["ability"], {
            "grade": "레전드리", "lines": ["현재 옵션"], "preset_no": 3,
            "presets": [{"grade": f"등급{i}", "lines": [f"옵션{i}", "두 번째 옵션"]}
                        for i in range(1, 4)],
        })

    def test_hyper_stat_presets_filter_unused_lines(self):
        for preset_no in (2, "2"):
            with self.subTest(preset_no=preset_no):
                raw = {"hyper_stat": {
                    "use_preset_no": preset_no,
                    **{f"hyper_stat_preset_{i}": [
                        {"stat_type": f"능력치{i}", "stat_point": 10,
                         "stat_level": i, "stat_increase": f"증가량{i}"},
                        {"stat_type": "미사용", "stat_level": 0},
                        {"stat_type": "레벨 누락"},
                    ] for i in range(1, 4)},
                }}
                self.assertEqual(characters.slim(raw)["hyper_stat"], {
                    "preset_no": 2,
                    "presets": [[{"stat_type": f"능력치{i}", "stat_level": i,
                                  "stat_increase": f"증가량{i}"}]
                                for i in range(1, 4)],
                })

    def test_null_and_missing_preset_fields(self):
        for fields in ({}, {
            "item_equipment_preset_1": None, "item_equipment_preset_2": None,
            "item_equipment_preset_3": None,
            "ability_preset_1": None, "ability_preset_2": None, "ability_preset_3": None,
            "hyper_stat_preset_1": None, "hyper_stat_preset_2": None,
            "hyper_stat_preset_3": None,
        }):
            with self.subTest(fields=fields):
                result = characters.slim({"item": fields, "ability": fields,
                                          "hyper_stat": fields})
                self.assertEqual(result["item"], [])
                self.assertEqual(result["item_presets"], [[], [], []])
                self.assertIsNone(result["item_preset_no"])
                self.assertEqual(result["ability"], {
                    "grade": None, "lines": [], "presets": [None, None, None],
                    "preset_no": None,
                })
                self.assertEqual(result["hyper_stat"], {
                    "preset_no": None, "presets": [[], [], []],
                })

    def test_missing_hyper_stat_key_is_omitted(self):
        self.assertNotIn("hyper_stat", characters.slim({}))

    def test_null_hyper_stat_response(self):
        self.assertEqual(characters.slim({"hyper_stat": None})["hyper_stat"], {
            "preset_no": None, "presets": [[], [], []],
        })

    def test_invalid_hyper_stat_preset_number(self):
        result = characters.slim({"hyper_stat": {"use_preset_no": "invalid"}})
        self.assertIsNone(result["hyper_stat"]["preset_no"])

    def test_empty_ability_preset_is_present(self):
        result = characters.slim({"ability": {"ability_preset_1": {},
                                              "ability_preset_2": {"ability_info": None}}})
        self.assertEqual(result["ability"]["presets"], [
            {"grade": None, "lines": []}, {"grade": None, "lines": []}, None,
        ])

    def test_hyper_stat_endpoint_is_last_after_union(self):
        self.assertEqual(list(characters.ENDPOINTS.items())[-2:], [
            ("union", "user/union"), ("hyper_stat", "character/hyper-stat"),
        ])


if __name__ == "__main__":
    unittest.main()
