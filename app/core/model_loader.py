"""Model Loader with manifest validation, checksum verification, and runtime fetching."""

import hashlib
import logging
import os
from pathlib import Path
from typing import Any
import requests
import yaml
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class ModelLoadingError(Exception):
    """Raised when model loading, downloading, or verification fails."""
    pass


class ModelChecksumMismatchError(ModelLoadingError):
    """Raised when downloaded model checksum does not match manifest."""
    pass


class ModelLoader:
    """Manages model weights, manifest metadata, automated downloading, and integrity checks."""

    def __init__(
        self,
        manifest_path: str | Path = "models/manifest.yaml",
        cache_dir: str | Path = "models/weights",
    ) -> None:
        self.manifest_path = Path(manifest_path)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.manifest: dict[str, Any] = self._load_manifest()

    def _load_manifest(self) -> dict[str, Any]:
        """Loads and parses the models manifest file."""
        if not self.manifest_path.exists():
            logger.warning("Manifest not found at %s. Proceeding with empty manifest.", self.manifest_path)
            return {"models": {}}
        try:
            with open(self.manifest_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                return data or {"models": {}}
        except Exception as e:
            logger.error("Failed to parse manifest %s: %s", self.manifest_path, e)
            return {"models": {}}

    def get_model_metadata(self, model_name: str) -> dict[str, Any]:
        """Returns metadata for the specified model from the manifest."""
        models = self.manifest.get("models", {})
        if model_name in models:
            return models[model_name]
        return {
            "name": model_name,
            "architecture": "YOLO",
            "filename": f"{model_name}.pt",
            "license": "AGPL-3.0",
            "source": f"Official Ultralytics asset for {model_name}",
        }

    @staticmethod
    def calculate_sha256(file_path: Path) -> str:
        """Computes the SHA-256 hash of a file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def download_model(self, url: str, destination: Path, expected_sha256: str | None = None) -> Path:
        """Downloads model weights from official source with streaming and checksum verification."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp")
        logger.info("Downloading model weights from %s to %s", url, destination)

        try:
            response = requests.get(url, stream=True, timeout=60)
            response.raise_for_status()

            with open(temp_dest, "wb") as f:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)

            if expected_sha256:
                actual_sha256 = self.calculate_sha256(temp_dest)
                if actual_sha256.lower() != expected_sha256.lower():
                    if temp_dest.exists():
                        temp_dest.unlink()
                    raise ModelChecksumMismatchError(
                        f"Checksum mismatch for {destination.name}. Expected: {expected_sha256}, got: {actual_sha256}"
                    )
                logger.info("Checksum verified successfully for %s", destination.name)

            if destination.exists():
                destination.unlink()
            temp_dest.rename(destination)
            return destination
        except Exception as e:
            if temp_dest.exists():
                temp_dest.unlink()
            raise ModelLoadingError(f"Failed to download model from {url}: {e}") from e

    def get_or_download_weights(self, model_name: str) -> Path:
        """Resolves weights path, downloading and verifying if not locally present."""
        metadata = self.get_model_metadata(model_name)
        filename = metadata.get("filename", f"{model_name}.pt")
        target_path = self.cache_dir / filename
        expected_sha256 = metadata.get("sha256")
        source_url = metadata.get("source")

        # 1. Check if already present and valid in cache_dir
        if target_path.exists():
            if expected_sha256:
                actual_sha = self.calculate_sha256(target_path)
                if actual_sha.lower() == expected_sha256.lower():
                    logger.info("Using cached model weights: %s", target_path)
                    return target_path
                else:
                    logger.warning("Cached weights checksum mismatch. Redownloading...")
                    target_path.unlink()
            else:
                return target_path

        # 2. Check if file exists in root or models dir
        for fallback_dir in [Path("."), Path("models")]:
            fallback_file = fallback_dir / filename
            if fallback_file.exists():
                if expected_sha256:
                    actual_sha = self.calculate_sha256(fallback_file)
                    if actual_sha.lower() == expected_sha256.lower():
                        return fallback_file
                else:
                    return fallback_file

        # 3. If source URL provided, download directly
        if source_url and source_url.startswith("http"):
            return self.download_model(source_url, target_path, expected_sha256)

        # 4. Fallback: let Ultralytics resolve official weight
        logger.info("Delegating download of %s to official Ultralytics engine", filename)
        return Path(filename)

    def load(self, model_name: str = "yolov8n", device: str = "cpu") -> tuple[YOLO, dict[str, Any]]:
        """Loads a YOLO model onto the designated device and returns the model and its metadata."""
        try:
            weights_path = self.get_or_download_weights(model_name)
            logger.info("Loading YOLO model %s from %s onto %s", model_name, weights_path, device)
            model = YOLO(str(weights_path))
            # Move to target device if supported
            if device and device != "cpu":
                model.to(device)

            metadata = self.get_model_metadata(model_name)
            # Enhance metadata with loaded class names
            if hasattr(model, "names") and model.names:
                metadata["classes"] = model.names
                metadata["classes_count"] = len(model.names)

            return model, metadata
        except Exception as e:
            logger.error("Failed to load model %s: %s", model_name, e)
            raise ModelLoadingError(f"Unable to load model {model_name}: {e}") from e
