import unittest

from backend_fastapi.segmentation import segment_document


class SegmentationTests(unittest.TestCase):
    def test_preserves_exact_offsets_for_each_paragraph(self):
        text = "1. Payment\nPayment is due in 30 days.\n\n2. Termination\nEither party may terminate."

        segments = segment_document(text)

        self.assertEqual([segment["text"] for segment in segments], [
            "1. Payment\nPayment is due in 30 days.",
            "2. Termination\nEither party may terminate.",
        ])
        for segment in segments:
            start, end = segment["source_span"]
            self.assertEqual(text[start:end], segment["text"])

    def test_combines_short_heading_with_its_following_paragraph(self):
        text = "CONFIDENTIALITY\n\nThe receiving party must protect confidential information."

        segments = segment_document(text)

        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["text"], text)
