import unittest

from textbook_pinyin_decoding import FONT_NAME, FONT_SHA256, decode_page, decode_span


class VerifiedPinyinDecodingTests(unittest.TestCase):
    def test_complete_visually_reviewed_tone_chart(self):
        self.assertEqual(decode_span(FONT_NAME, 'Q W A S\nT Y G H\nE R D F\nU I J K\nO P L M\nN B V C', FONT_SHA256),
                         'ā á ǎ à\nō ó ǒ ò\nē é ě è\nī í ǐ ì\nū ú ǔ ù\nǖ ǘ ǚ ǜ')

    def test_normal_english_capitals_and_other_fonts_are_unchanged(self):
        for font in ['Arial', 'CenturyGothic', 'ABCDEF+CenturyGothic', 'Fake-HanyuXi-JZ', 'BAD+HanyuXi-JZ']:
            self.assertEqual(decode_span(font, 'QWAS XYZ A4 PDF ü ī\t\n', None), 'QWAS XYZ A4 PDF ü ī\t\n')

    def test_only_real_pdf_subset_prefix_is_accepted(self):
        self.assertEqual(decode_span('QEWHCG+HanyuXi-JZ', 'bQ', FONT_SHA256), 'bā')
        self.assertEqual(decode_span('prefix+HanyuXi-JZ', 'bQ', FONT_SHA256), 'bQ')

    def test_unverified_font_program_is_rejected_even_with_the_same_name(self):
        for digest in [None, '0' * 64]:
            with self.assertRaisesRegex(ValueError, 'font program'):
                decode_span(FONT_NAME, 'bQ', digest)

    def test_unknown_capitals_are_rejected_instead_of_guessed(self):
        for char in ['X', 'Z']:
            with self.assertRaisesRegex(ValueError, 'Unknown encoded'):
                decode_span(FONT_NAME, 'a' + char, FONT_SHA256)

    def test_same_capital_is_decoded_only_in_verified_font_spans(self):
        lines = [[{'font': FONT_NAME, 'text': 'bQ'}, {'font': 'Arial', 'text': ' PDF QWAS'}],
                 [{'font': 'ABCDEF+' + FONT_NAME, 'text': 'nV lB\t'}]]
        actual, counts = decode_page('bQ PDF QWAS\nnV lB\t\n', lines, {FONT_NAME: FONT_SHA256})
        self.assertEqual(actual, 'bā PDF QWAS\nnǚ lǘ\t\n')
        self.assertEqual(counts, {'Q': 1, 'V': 1, 'B': 1})

    def test_missing_or_reordered_text_is_rejected(self):
        lines = [[{'font': 'Arial', 'text': 'first'}], [{'font': 'Arial', 'text': 'second'}]]
        for original in ['second\nfirst\n', 'first\nsecond\nextra\n', 'first second\n']:
            with self.assertRaisesRegex(ValueError, 'complete legacy page'):
                decode_page(original, lines, {})

    def test_empty_page_and_correct_unicode_remain_byte_stable(self):
        self.assertEqual(decode_page('', [], {}), ('', {}))
        text = '  ā á ǎ à ü ī 汉字 123\t'
        self.assertEqual(decode_page(text + '\n', [[{'font': FONT_NAME, 'text': text}]], {FONT_NAME: FONT_SHA256}), (text + '\n', {}))


if __name__ == '__main__':
    unittest.main()
