# Development & Testing Guide

This guide describes how to configure, develop, test, and contribute to the **AI Smart Camera** project.

---

## 1. Development Principles

- **Zero Local Execution Mandate**: All execution, inference testing, and Docker builds are performed remotely in Google Colab or GitHub Actions to protect local host isolation.
- **Strict Linting & Typing**: Code must pass `ruff check .` and unit tests in `pytest`.
- **Decoupled Architecture**: Computer vision algorithms must remain strictly independent of UI presentation code.

---

## 2. Environment Setup (Remote / Colab / Container)

When working inside a cloud development environment (such as Google Colab):

```bash
# Clone repository
git clone https://github.com/tahadeab-ai/ai-smart-camera.git
cd ai-smart-camera

# Install development dependencies
pip install -r requirements-dev.txt
```

---

## 3. Running Code Quality Tools

### Linting with Ruff
```bash
ruff check .
```

### Automatic Code Formatting with Ruff
```bash
ruff format .
```

### Running the Test Suite
```bash
pytest -v tests/
```

### Test Coverage Reporting
```bash
pytest -v tests/ --cov=app --cov-report=term-missing
```

---

## 4. Test Suite Structure

The test suite in `tests/` verifies all core components:

| Test Module | Coverage Scope |
| :--- | :--- |
| `test_model_loader.py` | SHA-256 integrity, manifest resolution, checksum mismatch handling. |
| `test_detector.py` | Empty detections, confidence filtering, class filtering, and Supervision conversion. |
| `test_annotator.py` | Input scene validation, drawing verification, bounding box rendering. |
| `test_counter.py` | Total counts, per-class counts, markdown formatting for Gradio tables. |

Unit tests mock tensor predictions when testing downstream logic, ensuring tests execute quickly and reliably on CI runners without network or GPU dependencies.
