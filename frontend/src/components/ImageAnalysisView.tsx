import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileImage,
  Sliders,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Crosshair,
  Info,
  X,
  Columns,
} from 'lucide-react';
import { ApiClient } from '../api/client';
import { ImageDetectionResponse } from '../types';

export const ImageAnalysisView: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0.25);
  const [iouThreshold, setIouThreshold] = useState<number>(0.45);
  const [filterClassInput, setFilterClassInput] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageDetectionResponse | null>(null);
  const [viewMode, setViewMode] = useState<'annotated' | 'original' | 'split'>('annotated');
  const [splitPos, setSplitPos] = useState<number>(50); // 0 to 100%
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }
    setError(null);
    setSelectedFile(file);
    setResult(null);
    setSelectedDetectionIndex(null);

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleRunInference = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);
    setSelectedDetectionIndex(null);

    const filterClasses = filterClassInput
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    try {
      const data = await ApiClient.detectImage(
        selectedFile,
        confidence,
        iouThreshold,
        filterClasses.length > 0 ? filterClasses : undefined
      );
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Detection failed: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detection-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedDet =
    selectedDetectionIndex !== null && result?.detections[selectedDetectionIndex]
      ? result.detections[selectedDetectionIndex]
      : null;

  return (
    <div className="space-y-6">
      {/* Upload & Parameter Controls Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dropzone / Viewport Area (2 Cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          {!previewUrl ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-sky-500/80 bg-slate-900/60 hover:bg-slate-900 transition rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer min-h-[320px]"
            >
              <div className="p-4 bg-sky-500/10 text-sky-400 rounded-full mb-3">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-white">Upload Test Image</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Drag and drop your image here, or click to browse (supports JPEG, PNG, WebP up to 20MB).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              {/* File Info Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2 text-xs text-slate-300">
                  <FileImage className="w-4 h-4 text-sky-400" />
                  <span className="font-medium truncate max-w-xs">{selectedFile?.name}</span>
                  {naturalSize.width > 0 && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({naturalSize.width}x{naturalSize.height})
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setResult(null);
                      setSelectedDetectionIndex(null);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-400 transition"
                  >
                    Change Image
                  </button>
                </div>
              </div>

              {/* Viewport Display (Adaptive portrait & landscape container) */}
              <div className="relative w-full max-h-[60vh] min-h-[280px] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 select-none">
                {/* 1. Standard Single View (Annotated or Original) */}
                {viewMode !== 'split' && (
                  <div className="relative max-w-full max-h-[60vh] flex items-center justify-center">
                    <img
                      src={result && viewMode === 'annotated' ? result.annotated_image : previewUrl}
                      alt="Object Detection View"
                      className="max-w-full max-h-[60vh] object-contain block"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                      }}
                    />

                    {/* SVG Bounding Box Highlight Overlay */}
                    {selectedDet && naturalSize.width > 0 && naturalSize.height > 0 && (
                      <svg
                        viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      >
                        <rect
                          x={selectedDet.x1}
                          y={selectedDet.y1}
                          width={selectedDet.x2 - selectedDet.x1}
                          height={selectedDet.y2 - selectedDet.y1}
                          fill="rgba(56, 189, 248, 0.25)"
                          stroke="#38bdf8"
                          strokeWidth={Math.max(3, Math.round(naturalSize.width / 200))}
                          strokeDasharray="6 3"
                          className="animate-pulse"
                        />
                      </svg>
                    )}
                  </div>
                )}

                {/* 2. Interactive Split View (Original vs Annotated) */}
                {viewMode === 'split' && result && (
                  <div className="relative w-full h-full max-h-[60vh] min-h-[300px] flex items-center justify-center overflow-hidden">
                    {/* Original image underlay */}
                    <img
                      src={previewUrl}
                      alt="Original"
                      className="max-w-full max-h-[60vh] object-contain select-none"
                    />

                    {/* Annotated image overlay with clip-path */}
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
                      style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
                    >
                      <img
                        src={result.annotated_image}
                        alt="Annotated"
                        className="max-w-full max-h-[60vh] object-contain select-none"
                      />
                    </div>

                    {/* Vertical Divider Line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)] pointer-events-none"
                      style={{ left: `${splitPos}%` }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg text-[10px] font-bold">
                        &harr;
                      </div>
                    </div>

                    {/* Split View Labels */}
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900/80 backdrop-blur text-slate-300 border border-slate-700">
                      Original
                    </span>
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950/80 backdrop-blur text-sky-300 border border-sky-700">
                      YOLO Detections
                    </span>

                    {/* Interactive Split Slider Bar */}
                    <div className="absolute bottom-3 inset-x-8 z-30">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={splitPos}
                        onChange={(e) => setSplitPos(Number(e.target.value))}
                        className="w-full accent-sky-500 bg-slate-900/80 backdrop-blur rounded-lg h-2 cursor-ew-resize"
                      />
                    </div>
                  </div>
                )}

                {/* View Mode Switcher Pills (Bottom Left) */}
                {result && (
                  <div className="absolute bottom-3 left-3 z-30 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl p-1 flex space-x-1 text-xs shadow-lg">
                    <button
                      onClick={() => setViewMode('annotated')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition ${
                        viewMode === 'annotated'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Annotated
                    </button>
                    <button
                      onClick={() => setViewMode('original')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition ${
                        viewMode === 'original'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => setViewMode('split')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center space-x-1 ${
                        viewMode === 'split'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>Split</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Selected Object Detailed Inspector Card */}
              {selectedDet && (
                <div className="bg-sky-950/30 border border-sky-500/40 rounded-xl p-3.5 text-xs animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Crosshair className="w-4 h-4 text-sky-400" />
                      <span className="font-bold text-white text-sm capitalize">{selectedDet.class_name}</span>
                      <span className="bg-emerald-500/20 text-emerald-300 font-mono font-semibold px-2 py-0.5 rounded text-[11px] border border-emerald-500/30">
                        {(selectedDet.confidence * 100).toFixed(1)}% confidence
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 font-mono text-[11px]">
                      <span>Box: [{selectedDet.x1}, {selectedDet.y1}, {selectedDet.x2}, {selectedDet.y2}]</span>
                      <span>Dimensions: {selectedDet.x2 - selectedDet.x1}px &times; {selectedDet.y2 - selectedDet.y1}px</span>
                      <span>Center: ({((selectedDet.x1 + selectedDet.x2) / 2).toFixed(1)}, {((selectedDet.y1 + selectedDet.y2) / 2).toFixed(1)})</span>
                      <span>Area: {((selectedDet.x2 - selectedDet.x1) * (selectedDet.y2 - selectedDet.y1)).toLocaleString()} px&sup2;</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDetectionIndex(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Close inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Controls (1 Col on lg) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-white text-sm">Inference Configuration</h3>
          </div>

          {/* Confidence Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Confidence Threshold</span>
              <span className="text-sky-400 font-mono font-bold">
                {Math.round(confidence * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-full accent-sky-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
            />
          </div>

          {/* IoU Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">IoU Overlap Threshold</span>
              <span className="text-sky-400 font-mono font-bold">
                {Math.round(iouThreshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.90"
              step="0.05"
              value={iouThreshold}
              onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
              className="w-full accent-sky-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
            />
          </div>

          {/* Class Filter */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium block">Class Filter (Optional)</label>
            <input
              type="text"
              placeholder="e.g. person, car, dog"
              value={filterClassInput}
              onChange={(e) => setFilterClassInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Run Inference Button */}
          <button
            onClick={handleRunInference}
            disabled={!selectedFile || isLoading}
            className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition ${
              !selectedFile || isLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-sky-600 to-teal-500 hover:from-sky-500 hover:to-teal-400 text-white shadow-lg shadow-sky-950/60 active:scale-95'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Running YOLO Inference...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Run Object Detection</span>
              </>
            )}
          </button>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Detection Results & Table */}
      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Detection Summary</h3>
              <p className="text-xs text-slate-400">
                Processed in <span className="text-sky-400 font-mono font-bold">{result.latency_ms}ms</span> using model{' '}
                <span className="font-mono text-slate-300">{result.model_name}</span> on{' '}
                <span className="font-mono text-slate-300">{result.device}</span> ({result.detections.length} objects found)
              </p>
            </div>

            <button
              onClick={handleDownloadJson}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3.5 py-2 rounded-xl font-medium transition"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>Export JSON</span>
            </button>
          </div>

          {/* Detections Data Table with Row Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="p-3 bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400 flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <span>Tap or click any row below to highlight its bounding box on the image and inspect detailed object telemetry.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Bounding Box (x1, y1, x2, y2)</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {result.detections.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No objects detected matching the threshold criteria.
                      </td>
                    </tr>
                  ) : (
                    result.detections.map((box, idx) => {
                      const isSelected = selectedDetectionIndex === idx;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedDetectionIndex(isSelected ? null : idx)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-sky-500/20 text-white border-l-4 border-l-sky-400'
                              : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-bold text-sky-300 capitalize">{box.class_name}</td>
                          <td className="px-4 py-2.5 text-emerald-400">
                            {(box.confidence * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-2.5 text-slate-400 text-[11px]">
                            [{box.x1}, {box.y1}, {box.x2}, {box.y2}]
                          </td>
                          <td className="px-4 py-2.5 text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium ${
                                isSelected
                                  ? 'bg-sky-500 text-white'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Inspect'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
