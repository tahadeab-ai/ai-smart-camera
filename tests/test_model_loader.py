"""Unit tests for ModelLoader component."""

from pathlib import Path
import pytest

from app.core.model_loader import (
    ModelChecksumMismatchError,
    ModelLoader,
    ModelLoadingError,
)


def test_sha256_calculation(tmp_path: Path):
    """Verify SHA-256 calculation against known content."""
    test_file = tmp_path / "test.bin"
    test_file.write_bytes(b"hello ai smart camera")
    computed_hash = ModelLoader.calculate_sha256(test_file)
    assert computed_hash == "b5f2ef8c95c56a2f7669e5fd1d1ebcf6a1859ed40fd94de3b5271d772b425de0"


def test_manifest_metadata_resolution(tmp_path: Path):
    """Verify metadata resolution from manifest."""
    manifest_file = tmp_path / "manifest.yaml"
    manifest_file.write_text(
        """
version: "1.0.0"
models:
  custom_test:
    name: "Custom YOLO"
    filename: "custom.pt"
    sha256: "dummyhash"
    source: "https://example.com/custom.pt"
    license: "MIT"
"""
    )
    loader = ModelLoader(manifest_path=manifest_file, cache_dir=tmp_path / "weights")
    metadata = loader.get_model_metadata("custom_test")

    assert metadata["name"] == "Custom YOLO"
    assert metadata["filename"] == "custom.pt"
    assert metadata["sha256"] == "dummyhash"


def test_checksum_mismatch_raises(tmp_path: Path, monkeypatch):
    """Verify download_model raises ModelChecksumMismatchError if hash does not match."""
    loader = ModelLoader(manifest_path=tmp_path / "nonexistent.yaml", cache_dir=tmp_path)

    # Mock requests.get returning a dummy payload
    class MockResponse:
        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size=1024):
            yield b"corrupted payload"

    monkeypatch.setattr("requests.get", lambda url, stream, timeout: MockResponse())

    target_file = tmp_path / "model.pt"
    with pytest.raises(ModelChecksumMismatchError):
        loader.download_model(
            url="http://example.com/model.pt",
            destination=target_file,
            expected_sha256="expected_hash_that_does_not_match",
        )
