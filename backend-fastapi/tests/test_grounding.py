import unittest

from backend_fastapi.grounding import verify_grounding


class GroundingVerificationTests(unittest.TestCase):
    def test_accepts_a_quote_and_citation_found_in_retrieval(self):
        self.assertTrue(verify_grounding(
            "Payment is due within 30 days.",
            ["clause-1"],
            ["clause-1", "clause-2"],
            "Clause 1: Payment is due within 30 days.",
        ))

    def test_rejects_an_answer_without_a_substantive_quote(self):
        self.assertFalse(verify_grounding("", ["clause-1"], ["clause-1"], "Clause text"))

    def test_rejects_a_citation_not_returned_by_retrieval(self):
        self.assertFalse(verify_grounding(
            "Payment is due within 30 days.", ["invented-clause"], ["clause-1"],
            "Clause 1: Payment is due within 30 days.",
        ))

    def test_rejects_a_quote_not_found_in_the_retrieved_text(self):
        self.assertFalse(verify_grounding(
            "The agreement lasts forever.", ["clause-1"], ["clause-1"],
            "Clause 1: Payment is due within 30 days.",
        ))
