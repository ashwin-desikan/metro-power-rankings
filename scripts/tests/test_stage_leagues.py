import os
import time
import zipfile

import pytest

from conftest import load_module_from_path

stage_leagues = load_module_from_path("stage_leagues", "stage-leagues.py")


class TestEnvVarFor:
    def test_uppercases_and_suffixes(self):
        assert stage_leagues.env_var_for("nba") == "NBA_SOURCE_XLSX"
        assert stage_leagues.env_var_for("nfl") == "NFL_SOURCE_XLSX"


class TestValidateEocd:
    def test_valid_zip_passes(self, tmp_path):
        f = tmp_path / "NBA.xlsx"
        with zipfile.ZipFile(f, "w") as z:
            z.writestr("part.xml", b"<xml/>")
        assert stage_leagues.validate_eocd(f) is True

    def test_truncated_file_fails(self, tmp_path):
        f = tmp_path / "Truncated.xlsx"
        f.write_bytes(b"PK\x03\x04not a real zip")
        assert stage_leagues.validate_eocd(f) is False

    def test_missing_file_fails(self, tmp_path):
        assert stage_leagues.validate_eocd(tmp_path / "missing.xlsx") is False


class TestExcelLockfileStatus:
    def test_no_lockfile_present(self, tmp_path):
        src = tmp_path / "NBA.xlsx"
        src.write_bytes(b"data")
        lock, active = stage_leagues.excel_lockfile_status(src)
        assert lock is None
        assert active is False

    def test_fresh_lockfile_is_active(self, tmp_path):
        src = tmp_path / "NBA.xlsx"
        src.write_bytes(b"data")
        lock_path = tmp_path / "~$NBA.xlsx"
        lock_path.write_bytes(b"lock")
        # Lockfile written after the source: Excel currently has it open.
        os.utime(lock_path, (time.time() + 10, time.time() + 10))
        lock, active = stage_leagues.excel_lockfile_status(src)
        assert lock == lock_path
        assert active is True

    def test_stale_lockfile_is_not_active(self, tmp_path):
        src = tmp_path / "NBA.xlsx"
        src.write_bytes(b"data")
        lock_path = tmp_path / "~$NBA.xlsx"
        lock_path.write_bytes(b"lock")
        old = time.time() - 1000
        os.utime(lock_path, (old, old))
        lock, active = stage_leagues.excel_lockfile_status(src)
        assert lock == lock_path
        assert active is False


class TestCandidateSources:
    def test_per_workbook_env_var_takes_priority(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NBA_SOURCE_XLSX", str(tmp_path / "custom-nba.xlsx"))
        monkeypatch.delenv("WORKBOOK_SOURCE_DIR", raising=False)
        cands = stage_leagues.candidate_sources("nba")
        assert cands[0] == tmp_path / "custom-nba.xlsx"

    def test_shared_dir_env_var_used_when_no_per_workbook_var(self, tmp_path, monkeypatch):
        monkeypatch.delenv("NBA_SOURCE_XLSX", raising=False)
        monkeypatch.setenv("WORKBOOK_SOURCE_DIR", str(tmp_path))
        cands = stage_leagues.candidate_sources("nba")
        assert cands[0] == tmp_path / "NBA.xlsx"

    def test_unknown_short_name_raises(self):
        with pytest.raises(KeyError):
            stage_leagues.candidate_sources("cricket")


class TestFindSource:
    def test_returns_none_when_nothing_exists(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NBA_SOURCE_XLSX", str(tmp_path / "does-not-exist.xlsx"))
        monkeypatch.delenv("WORKBOOK_SOURCE_DIR", raising=False)
        # Path.home() reads HOME on POSIX and USERPROFILE on Windows, so
        # setting only HOME left this test passing in CI and failing on the
        # Windows dev machine, where the fallback found the real
        # ~/OneDrive/Excel Files/NBA.xlsx. Redirect both.
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.setenv("USERPROFILE", str(tmp_path))
        assert stage_leagues.find_source("nba") is None

    def test_finds_env_var_source_when_present(self, tmp_path, monkeypatch):
        src = tmp_path / "custom-nba.xlsx"
        src.write_bytes(b"data")
        monkeypatch.setenv("NBA_SOURCE_XLSX", str(src))
        monkeypatch.delenv("WORKBOOK_SOURCE_DIR", raising=False)
        assert stage_leagues.find_source("nba") == src.resolve()
