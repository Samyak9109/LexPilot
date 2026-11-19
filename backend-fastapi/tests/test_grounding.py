import unittest
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId

from backend_fastapi.grounding import verify_grounding


class GroundingVerificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_accepts_a_quote_and_citation_found_in_retrieval(self):
        # Mock db with documentclauses collection
        mock_db = MagicMock()
        mock_clause = {
            "_id": ObjectId("507f1f77bcf86cd799439011"),
            "originalText": "Payment is due within 30 days."
        }
        mock_db.documentclauses.find_one = AsyncMock(return_value=mock_clause)

        result = await verify_grounding(
            "Payment is due within 30 days.",
            ["507f1f77bcf86cd799439011"],
            ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
            "Clause 1: Payment is due within 30 days.",
            mock_db
        )
        self.assertTrue(result)

    async def test_rejects_an_answer_without_a_substantive_quote(self):
        mock_db = MagicMock()
        result = await verify_grounding("", ["clause-1"], ["clause-1"], "Clause text", mock_db)
        self.assertFalse(result)

    async def test_rejects_a_citation_not_returned_by_retrieval(self):
        mock_db = MagicMock()
        result = await verify_grounding(
            "Payment is due within 30 days.", ["invented-clause"], ["clause-1"],
            "Clause 1: Payment is due within 30 days.",
            mock_db
        )
        self.assertFalse(result)

    async def test_rejects_a_quote_not_found_in_the_retrieved_text(self):
        mock_db = MagicMock()
        mock_clause = {
            "_id": ObjectId("507f1f77bcf86cd799439011"),
            "originalText": "Payment is due within 30 days."
        }
        mock_db.documentclauses.find_one = AsyncMock(return_value=mock_clause)

        result = await verify_grounding(
            "The agreement lasts forever.", ["507f1f77bcf86cd799439011"], ["507f1f77bcf86cd799439011"],
            "Clause 1: Payment is due within 30 days.",
            mock_db
        )
        self.assertFalse(result)

    async def test_rejects_missing_clause_in_db(self):
        mock_db = MagicMock()
        mock_db.documentclauses.find_one = AsyncMock(return_value=None)

        result = await verify_grounding(
            "Payment is due within 30 days.", ["507f1f77bcf86cd799439011"], ["507f1f77bcf86cd799439011"],
            "Clause 1: Payment is due within 30 days.",
            mock_db
        )
        self.assertFalse(result)
