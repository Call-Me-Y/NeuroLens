import unittest
from guard import parse_guard_output


class GuardOutputTest(unittest.TestCase):
    def test_official_response_format(self):
        self.assertEqual(parse_guard_output("Safety: Safe\nCategories: None\nRefusal: Yes")["label"], "安全")
        unsafe = parse_guard_output("Safety: Unsafe\nCategories: Violent, Non-violent Illegal Acts\nRefusal: No")
        self.assertEqual(unsafe["categories"], ["Violent", "Non-violent Illegal Acts"])
        self.assertEqual(unsafe["label"], "不安全")

    def test_unknown_is_not_safe(self):
        self.assertEqual(parse_guard_output("unexpected output")["label"], "未判定")
