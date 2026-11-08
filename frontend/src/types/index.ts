export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class_id: number;
  class_name: string;
  tracker_id?: number | null;
}

export interface DetectionStats {
  total_count: number;
  class_counts: Record<string, number>;
  tracked_count?: number;
  tracked_class_counts?: Record<string, number>;
}

export interface StreamMetadata {
  type: string;
  frame_id: number;
  timestamp: number;
  latency_ms: number;
  fps: number;
  stats: DetectionStats;
  detections: BoundingBox[];
  skipped?: boolean;
  dropped_frames?: number;
  queue_replacements?: number;
  queue_latency_ms?: number;
}

export interface StreamConfig {
  confidence_threshold: number;
  iou_threshold: number;
  filter_classes: string[];
  skip_interval: number;
  return_annotated_frame: boolean;
  jpeg_quality: number;
  enable_tracking?: boolean;
  enable_trails?: boolean;
  trace_length?: number;
  target_fps?: number;
  image_size?: number;
}

export interface ImageDetectionResponse {
  annotated_image: string;
  detections: BoundingBox[];
  stats: DetectionStats;
  latency_ms: number;
  model_name: string;
  device: string;
  image_width: number;
  image_height: number;
}

export interface SystemInfo {
  platform: string;
  python_version: string;
  torch_version: string;
  cuda_available: boolean;
  device: string;
  active_model: string;
  cpu_count: number;
  memory_total_gb?: number;
  memory_available_gb?: number;
  active_stream_count: number;
}

export interface ModelInfo {
  name: string;
  framework: string;
  task: string;
  license: string;
  description: string;
  size_mb: number;
  checksum_sha256: string;
  is_active: boolean;
}

export interface ModelListResponse {
  models: ModelInfo[];
  active_model: string;
}

export type AppViewTab = 'camera' | 'image' | 'video' | 'analytics' | 'system';

export interface SessionAnalyticsData {
  totalFrames: number;
  processedFrames: number;
  droppedFrames: number;
  avgLatencyMs: number;
  avgFps: number;
  classDistribution: Record<string, number>;
  trackedCount: number;
  maxConcurrentTracked: number;
  startTime: number;
}
