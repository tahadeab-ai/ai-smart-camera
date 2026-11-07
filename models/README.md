# Model Weights & Licensing Management

This directory contains metadata, manifests, and specifications for computer vision models used in the **AI Smart Camera** application.

## Strict Licensing and Redistribution Policy

In compliance with open-source licensing standards and project guidelines:

1. **No Binary Weights in Git**:
   Binary model weights (`*.pt`, `*.onnx`, `*.engine`) are excluded from Git version control via `.gitignore`.
2. **Third-Party Model Licensing**:
   - The default models (`yolov8n`, `yolo11n`) are developed and distributed by [Ultralytics](https://github.com/ultralytics/ultralytics) under the **AGPL-3.0 License**.
   - Because raw pretrained weights are owned by Ultralytics, they are **never committed into the repository or misrepresented as project-owned assets**.
   - Instead, the application features an automated, verified **Runtime Model Loader** (`app/core/model_loader.py`).
3. **Runtime Verification**:
   - When the application starts, it checks if the model exists in the local cache directory (`./models/weights`).
   - If not present, it securely downloads the weights directly from the official Ultralytics release asset URL recorded in `manifest.yaml`.
   - The file integrity is verified using the SHA-256 checksum defined in `manifest.yaml`.
   - If the checksum does not match (indicating corruption or tampering), the loader raises an explicit validation error.

## Model Manifest Specifications

| Model Identifier | Architecture | Version | Checksum (SHA-256) | Official Source | License |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `yolov8n` | YOLOv8 Nano | 8.4.0 | `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36` | [Ultralytics Releases](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.pt) | AGPL-3.0 |
| `yolo11n` | YOLO11 Nano | 8.4.0 | `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1` | [Ultralytics Releases](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo11n.pt) | AGPL-3.0 |

## Using Custom Weights

If you train a custom model and hold distribution rights:
1. Place the weights file in `models/weights/<your_model>.pt` or attach it to a versioned GitHub Release.
2. Add an entry to `manifest.yaml` with your custom SHA-256 checksum and set `redistribution_permitted: true`.
3. Set `MODEL_NAME=<your_model>` in your environment or `.env` file.
