# Model Card: AI Smart Camera (YOLOv8 & YOLO11 Nano)

This document follows standardized Model Card guidelines to record the capabilities, intended usage, ethical considerations, and technical limitations of the models deployed in the **AI Smart Camera**.

---

## 1. Model Overview

| Parameter | Specification |
| :--- | :--- |
| **Model Names** | YOLOv8 Nano (`yolov8n`), YOLO11 Nano (`yolo11n`) |
| **Architecture** | Real-Time Convolutional Object Detection (Single-Stage) |
| **Developers / Authors** | Ultralytics Inc. |
| **Release Version** | 8.4.0 |
| **License** | AGPL-3.0 License (Commercial enterprise license available through Ultralytics) |
| **Model Weights Source** | Official Ultralytics GitHub Releases |
| **SHA-256 (yolov8n.pt)** | `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36` |
| **SHA-256 (yolo11n.pt)** | `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1` |

---

## 2. Intended Use

- **Primary Use Case**: Real-time object detection and multi-class counting on live browser-based webcam feeds and static image uploads.
- **Target Environments**: Google Colab (CPU and GPU runtimes), Docker containerized microservices, mobile browsers (iOS Safari, Android Chrome).
- **Domain**: General object detection across 80 common categories (people, vehicles, common domestic animals, household items, electronics).

---

## 3. Training & Dataset

- **Base Dataset**: Microsoft Common Objects in Context (MS COCO) 2017.
- **Classes**: 80 object classes.
- **Class Indices & Taxonomy**: Standard COCO index mapping (`0: person`, `1: bicycle`, `2: car`, ... `79: toothbrush`).

---

## 4. Input & Output Specifications

- **Input Format**: RGB image tensor (3 channels, uint8 values `[0, 255]`).
- **Nominal Input Resolution**: 640 × 640 pixels (dynamically scaled with letterboxing by the inference engine).
- **Default Confidence Threshold**: 0.25 (user-adjustable between 0.05 and 0.95).
- **Non-Maximum Suppression (NMS) IoU Threshold**: 0.45.
- **Output Structure**: Bounding boxes in `[x_min, y_min, x_max, y_max]` pixel coordinates, confidence scores `[0.0, 1.0]`, and integer class IDs mapped to class names.

---

## 5. Performance Characteristics

- **Computational Complexity**: ~3.2M parameters, ~8.7 GFLOPs (`yolov8n`).
- **Memory Footprint**: ~6.2 MB weight file.
- **Observed Inference Latency**:
  - **Google Colab CPU (Intel Xeon / AMD EPYC)**: ~70 - 160 ms per frame.
  - **Google Colab GPU (NVIDIA T4 / L4)**: ~8 - 18 ms per frame.

---

## 6. Limitations & Biases

1. **Occlusion & Low Light**: Small objects and heavily occluded items under dim or high-contrast backlighting may experience degraded recall.
2. **COCO Class Bias**: Detection is strictly limited to the 80 pre-trained COCO categories. Unseen classes will either be missed or classified as the nearest visually similar category.
3. **Motion Blur**: Rapid camera pan on mobile devices can cause transient bounding box flickering.
4. **Safety Disclaimer**: This model is designed for demonstration and general computer vision tasks. It is **not** certified for autonomous navigation, industrial safety-critical cutoff systems, or medical diagnosis.
