import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileImage,
  Sliders,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
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

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }
    setError(null);
    setSelectedFile(file);
    setResult(null);

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

  return (
    <div className="space-y-6">
      {/* Upload & Parameter Controls Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dropzone (2 Cols on lg) */}
        <div className="lg:col-span-2">
          {!previewUrl ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-sky-500/80 bg-slate-900/60 hover:bg-slate-900 transition rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer min-h-[280px]"
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
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2 text-xs text-slate-300">
                  <FileImage className="w-4 h-4 text-sky-400" />
                  <span className="font-medium truncate max-w-xs">{selectedFile?.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setResult(null);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-400 transition"
                  >
                    Change Image
                  </button>
                </div>
              </div>

              {/* Viewport Display */}
              <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
                {result && viewMode === 'annotated' ? (
                  <img
                    src={result.annotated_image}
                    alt="Annotated Result"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Original Preview"
                    className="w-full h-full object-contain"
                  />
                )}

                {/* View Mode Switcher Pills */}
                {result && (
                  <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg p-1 flex space-x-1 text-xs">
                    <button
                      onClick={() => setViewMode('annotated')}
                      className={`px-2.5 py-1 rounded font-medium transition ${
                        viewMode === 'annotated'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Annotated
                    </button>
                    <button
                      onClick={() => setViewMode('original')}
                      className={`px-2.5 py-1 rounded font-medium transition ${
                        viewMode === 'original'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Original
                    </button>
                  </div>
                )}
              </div>
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
            <label className="text-xs text-slate-400 font-medium block">Class Filter</label>
            <input
              type="text"
              placeholder="e.g. person, car"
              value={filterClassInput}
              onChange={(e) => setFilterClassInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Run Inference Button */}
          <button
            onClick={handleRunInference}
            disabled={!selectedFile || isLoading}
            className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition ${
              !selectedFile || isLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/30'
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
                <span className="font-mono text-slate-300">{result.device}</span>
              </p>
            </div>

            <button
              onClick={handleDownloadJson}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3.5 py-2 rounded-lg font-medium transition"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>Export JSON</span>
            </button>
          </div>

          {/* Detections Data Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Bounding Box (x1, y1, x2, y2)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {result.detections.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        No objects detected matching the threshold criteria.
                      </td>
                    </tr>
                  ) : (
                    result.detections.map((box, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-sky-300">{box.class_name}</td>
                        <td className="px-4 py-2.5 text-emerald-400">
                          {(box.confidence * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-[11px]">
                          [{box.x1}, {box.y1}, {box.x2}, {box.y2}]
                        </td>
                      </tr>
                    ))
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
