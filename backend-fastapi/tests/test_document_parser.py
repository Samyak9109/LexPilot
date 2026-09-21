import unittest
from io import BytesIO
from zipfile import ZipFile

from fastapi import HTTPException

from backend_fastapi.document_parser import extract_document_text


def docx_with_text(text: str) -> bytes:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>'
    )
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("word/document.xml", xml)
    return output.getvalue()


class DocumentParserTests(unittest.TestCase):
    def test_extracts_text_from_a_docx_upload(self):
        self.assertEqual(extract_document_text("contract.docx", docx_with_text("Payment is due.")), "Payment is due.")

    def test_rejects_an_empty_docx(self):
        with self.assertRaises(HTTPException) as raised:
            extract_document_text("contract.docx", docx_with_text(""))
        self.assertEqual(raised.exception.status_code, 422)

    def test_rejects_an_unsupported_extension(self):
        with self.assertRaises(HTTPException) as raised:
            extract_document_text("contract.txt", b"text")
        self.assertEqual(raised.exception.status_code, 400)
