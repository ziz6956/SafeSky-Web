#!/usr/bin/env python3
"""Тест-сторож маскировки номеров в журнале воркера (SAF-288, SAF-246 § 11.3).

`redact()` обязан маскировать 11-значные РФ-номера в произвольном тексте
(тексты исключений pjsua2 могут включать Request-URI), в т.ч. разделённые
пробелами/скобками/дефисами — журнал воркера живёт на не-РФ хосте (Hetzner)
и попадает под ч. 5 ст. 18 152-ФЗ. Сужение регекспа обратно до
`\b[78]\d{10}\b` роняет кейсы с разделителями.

Запуск (pjsua2 не требуется — модуль заглушён):
    python3 -m unittest discover -s infra/softphone/worker -p "test_*.py" -v
    python3 infra/softphone/worker/test_worker_redact.py
"""

import os
import sys
import types
import unittest

# pjsua2 ставится только на софтфон-хосте (Hetzner/RuVDS), в CI его нет.
# Заглушка нужна лишь для импорта worker: pj.* упоминается в сигнатурах
# и базовом классе PlayCall, но при импорте методы не вызываются.
class _PjStub:
    """Любой класс/значение pjsua2 — достаточно существования атрибута."""


class _PjStubModule(types.ModuleType):
    def __getattr__(self, name):
        return _PjStub


sys.modules["pjsua2"] = _PjStubModule("pjsua2")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import worker  # noqa: E402  — импорт после заглушки намеренный


def _digits(text: str) -> str:
    return "".join(ch for ch in text if ch.isdigit())


MASK_7 = "+7 (9**) ***-**-67"


class RedactTest(unittest.TestCase):
    """Кейсы из SAF-288: форматированные номера не должны утекать в журнал."""

    def test_11_digits_plain(self):
        # SIP Request-URI с каноническим номером (эталон из SAF-288).
        self.assertEqual(
            worker.redact("sip:79991234567@1.2.3.4"),
            f"sip:{MASK_7}@1.2.3.4",
        )

    def test_plus_with_brackets_spaces(self):
        # «Как набрано»: +7 (999) 123-45-67 — старый регексп пропускал.
        result = worker.redact("sip:+7 (999) 123-45-67")
        self.assertIn(MASK_7, result)
        # Инвариант: после маскировки в тексте не осталось маскируемого
        # номера (сама маска содержит 4 цифры по формату SRE — это норма).
        self.assertIsNone(worker._PHONE_RE.search(result))

    def test_spaces_only(self):
        self.assertEqual(worker.redact("7999 123-45-67"), MASK_7)

    def test_spaces_only_8(self):
        self.assertEqual(worker.redact("dial 8 999 123 45 67"), "dial +8 (9**) ***-**-67")

    def test_uri_in_exception_text(self):
        # Текст исключения pjsua2 с Request-URI — целевой сценарий redact().
        self.assertEqual(
            worker.redact("Exception: Call to sip:79991234567@10.0.0.1 failed"),
            f"Exception: Call to sip:{MASK_7}@10.0.0.1 failed",
        )

    def test_negative_plain_text_untouched(self):
        self.assertEqual(worker.redact("timeout 30s"), "timeout 30s")

    def test_negative_no_78_start_untouched(self):
        text = "заявка 12345, шаг 3 из 5, ошибка 404"
        self.assertEqual(worker.redact(text), text)

    def test_negative_10_digits_untouched(self):
        # 10 цифр — не РФ-номер (нужно 11), маскировать нельзя.
        text = "код 8 555 123 456"
        self.assertEqual(worker.redact(text), text)

    def test_negative_11_digits_not_starting_78_untouched(self):
        text = "инн 12345678901"
        self.assertEqual(worker.redact(text), text)

    def test_no_adjacent_digits_eaten(self):
        # Гварды (?<!\d)/(?!\d): 12-значная строка не должна маскироваться
        # частично и не должна портить соседние цифры.
        text = "номер 7 (999) 123-45-67!"
        self.assertEqual(worker.redact(text), f"номер {MASK_7}!")


class MaskPhoneTest(unittest.TestCase):
    """mask_phone — явная маска там, где номер известен."""

    def test_formatted_input(self):
        self.assertEqual(worker.mask_phone("+7 (999) 123-45-67"), MASK_7)

    def test_plain_input(self):
        self.assertEqual(worker.mask_phone("79991234567"), MASK_7)

    def test_short_input(self):
        self.assertEqual(worker.mask_phone("123"), "***")

    def test_empty_and_none(self):
        self.assertEqual(worker.mask_phone(""), "***")
        self.assertEqual(worker.mask_phone(None), "***")


if __name__ == "__main__":
    unittest.main()
