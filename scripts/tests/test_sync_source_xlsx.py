import zipfile
from pathlib import Path

from sync_source_xlsx import excel_lockfile, validate_xlsx, fmt_size


def make_xlsx(path: Path, with_xml=True, entries=True):
    with zipfile.ZipFile(path, "w") as z:
        if entries:
            z.writestr("[Content_Types].xml" if with_xml else "data.bin", b"<xml/>" if with_xml else b"\x00")


class TestExcelLockfile:
    def test_prefixes_dollar_tilde(self):
        p = Path("/some/dir/MetroAreas.xlsx")
        assert excel_lockfile(p) == Path("/some/dir/~$MetroAreas.xlsx")

    def test_preserves_parent_directory(self):
        p = Path("/a/b/c/Workbook.xlsx")
        assert excel_lockfile(p).parent == p.parent


class TestValidateXlsx:
    def test_valid_xlsx_passes(self, tmp_path):
        f = tmp_path / "Metro.xlsx"
        make_xlsx(f)
        ok, reason = validate_xlsx(f)
        assert ok is True
        assert reason == ""

    def test_empty_zip_fails(self, tmp_path):
        f = tmp_path / "Empty.xlsx"
        with zipfile.ZipFile(f, "w"):
            pass
        ok, reason = validate_xlsx(f)
        assert ok is False
        assert "no entries" in reason

    def test_zip_without_xml_parts_fails(self, tmp_path):
        f = tmp_path / "NoXml.xlsx"
        make_xlsx(f, with_xml=False)
        ok, reason = validate_xlsx(f)
        assert ok is False
        assert "no .xml parts" in reason

    def test_truncated_file_is_not_a_valid_zip(self, tmp_path):
        f = tmp_path / "Truncated.xlsx"
        f.write_bytes(b"PK\x03\x04not a real zip body")
        ok, reason = validate_xlsx(f)
        assert ok is False
        assert "not a complete zip archive" in reason

    def test_missing_file_fails(self, tmp_path):
        f = tmp_path / "DoesNotExist.xlsx"
        ok, reason = validate_xlsx(f)
        assert ok is False


class TestFmtSize:
    def test_formats_megabytes(self):
        assert fmt_size(1024 * 1024) == "1.00 MB"

    def test_formats_fractional_megabytes(self):
        assert fmt_size(int(1.5 * 1024 * 1024)) == "1.50 MB"

    def test_zero_bytes(self):
        assert fmt_size(0) == "0.00 MB"
