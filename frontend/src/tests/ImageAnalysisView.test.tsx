import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageAnalysisView } from '../components/ImageAnalysisView';
import { ApiClient } from '../api/client';
import { ImageDetectionResponse } from '../types';

describe('ImageAnalysisView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders upload dropzone initially', () => {
    render(<ImageAnalysisView />);
    expect(screen.getByText(/Upload Test Image/i)).toBeDefined();
    expect(screen.getByText(/Drag and drop your image here/i)).toBeDefined();
  });

  it('handles image selection, executes inference, and supports detection selection & split view', async () => {
    const mockDetectionResult: ImageDetectionResponse = {
      latency_ms: 32,
      model_name: 'yolov8n',
      device: 'cpu',
      image_width: 640,
      image_height: 480,
      stats: {
        total_count: 2,
        class_counts: { person: 1, cat: 1 },
      },
      annotated_image: 'data:image/jpeg;base64,mock-annotated-base64',
      detections: [
        { class_id: 0, class_name: 'person', confidence: 0.94, x1: 50, y1: 50, x2: 200, y2: 400 },
        { class_id: 1, class_name: 'cat', confidence: 0.88, x1: 250, y1: 200, x2: 350, y2: 320 },
      ],
    };

    vi.spyOn(ApiClient, 'detectImage').mockResolvedValue(mockDetectionResult);

    // Mock FileReader
    class MockFileReader {
      result: string = 'data:image/jpeg;base64,mock-original-base64';
      onload: (() => void) | null = null;
      readAsDataURL() {
        if (this.onload) this.onload();
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    render(<ImageAnalysisView />);

    // Create a mock file
    const file = new File(['fake-image-bytes'], 'sample.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    fireEvent.change(fileInput, { target: { files: [file] } });

    // File name should be visible
    expect(await screen.findByText('sample.jpg')).toBeDefined();

    // Trigger Run Object Detection
    const runBtn = screen.getByText(/Run Object Detection/i);
    fireEvent.click(runBtn);

    // Verify detection results appear
    expect(await screen.findByText(/Detection Summary/i)).toBeDefined();
    expect(screen.getByText('person')).toBeDefined();
    expect(screen.getByText('cat')).toBeDefined();

    // Verify View Mode Buttons (Annotated, Original, Split)
    const splitBtn = screen.getByText('Split');
    expect(splitBtn).toBeDefined();

    // Switch to Split View
    fireEvent.click(splitBtn);
    const splitSlider = document.querySelector('input.cursor-ew-resize') as HTMLInputElement;
    expect(splitSlider).toBeDefined();
    expect(splitSlider.value).toBe('50');

    // Click table row to select detection
    const personRow = screen.getByText('person').closest('tr');
    expect(personRow).toBeDefined();
    fireEvent.click(personRow!);

    // Inspector card should now show detailed coordinates & confidence
    expect(await screen.findByText(/94.0% confidence/i)).toBeDefined();
    expect(screen.getByText(/Dimensions: 150px × 350px/i)).toBeDefined();
  });
});
