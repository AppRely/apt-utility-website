'use client';
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  Play, Pause, SkipBack, SkipForward, Clock, ChevronRight,
  ZoomIn, ZoomOut, Undo, Redo, Target,
} from "lucide-react";
import {
  Stage, Layer, Image as KonvaImage, Text, Circle, Group, Rect, Line,
} from "react-konva";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getObjectData } from "@/lib/api/getObjectData";
import { getFrameRangeData } from "@/lib/api/getFrameRangeData";
import { undoAction, redoAction } from "@/lib/api/undoRedo";
import { getActivityLogs } from "@/lib/api/getActivityLogs";
import { getTimelineData } from "@/lib/api/getTimelineData";
import { getUniqueIdsData, UniqueIdsResponse, UniqueIdObject } from "@/lib/api/getUniqueIdsData";
import { exportTrk } from "@/lib/api/exportTrk";
import { Annotation, TrajectoryFrame, TrajectoryMap, SelectedObjectProps } from "@/types";
import {
  LineChart, Line as RechartsLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ==================== TIMELINE 2– SHOW ALL OBJECTS ====================
const ObjectRangesTimeline = ({
  objects,
  currentFrame,
  onSeek,
  getObjectColor,
  totalFrames,
  visibleWindow,
  onWindowChange,
  windowInput,
  setWindowInput,
}: {
  objects: UniqueIdObject[];
  currentFrame: number;
  onSeek: (frame: number) => void;
  getObjectColor: (id: number) => string;
  totalFrames: number;
  visibleWindow: number;
  onWindowChange: (newWindow: number) => void;
  windowInput: string;
  setWindowInput: (val: string) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [, forceRedraw] = useState(0);

  const minFrame = useMemo(() => Math.max(0, currentFrame - visibleWindow), [currentFrame, visibleWindow]);
  const maxFrame = useMemo(() => Math.min(totalFrames, currentFrame + visibleWindow), [currentFrame, visibleWindow, totalFrames]);

  useEffect(() => {
    console.log(`[Timeline2] Visible frames: ${minFrame} to ${maxFrame} (total=${totalFrames}, current=${currentFrame})`);
  }, [minFrame, maxFrame, currentFrame, totalFrames]);

  const filteredObjects = useMemo(() => {
    return objects.filter(obj =>
      (obj.start_frame >= minFrame && obj.start_frame <= maxFrame) ||
      (obj.end_frame >= minFrame && obj.end_frame <= maxFrame)
    );
  }, [objects, minFrame, maxFrame]);

  const [chartWidth, setChartWidth] = useState(800);
  const chartHeight = 80;
  const padding = { left: 20, right: 20, top: 5, bottom: 15 };

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const newWidth = entries[0].contentRect.width - padding.left - padding.right;
      setChartWidth(Math.max(100, newWidth));
      forceRedraw(prev => prev + 1);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [padding.left, padding.right]);

  const getX = useCallback((frame: number) => {
    if (maxFrame === minFrame) return 0;
    return ((frame - minFrame) / (maxFrame - minFrame)) * chartWidth;
  }, [minFrame, maxFrame, chartWidth]);

  const markerY = padding.top + chartHeight / 2;

  useEffect(() => {
    if (!scrollContainerRef.current || filteredObjects.length === 0) return;
    const container = scrollContainerRef.current;
    const svg = container.querySelector("svg");
    if (!svg) return;
    const currentX = getX(currentFrame);
    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const targetScrollLeft = currentX + svgRect.left - containerRect.left - containerRect.width / 2;
    container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: "smooth" });
  }, [currentFrame, getX, filteredObjects.length]);

  const handlePointClick = (frame: number) => onSeek(frame);

  if (filteredObjects.length === 0) {
    return (
      <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-2xl">
        No object start/end markers in the visible window (frames {minFrame}–{maxFrame}).
        Total objects: {objects.length}. Try increasing the window size.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl">
      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <span className="text-xs text-gray-300">Start/End Timeline:</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Window (frames):</span>
            <input
              type="number"
              min="10"
              max={totalFrames}
              step="10"
              value={windowInput}
              onChange={(e) => setWindowInput(e.target.value)}
              className="w-20 h-7 bg-gray-800 text-white text-xs rounded-md px-2 border border-gray-600"
            />
            <button
              onClick={() => {
                let newVal = parseInt(windowInput, 10);
                if (isNaN(newVal)) newVal = 1000;
                newVal = Math.min(Math.max(newVal, 10), totalFrames);
                onWindowChange(Math.floor(newVal / 2));
                setWindowInput(newVal.toString());
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded-md transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
      <div ref={scrollContainerRef} className="overflow-x-auto" style={{ maxWidth: "100%" }}>
        <div ref={containerRef} style={{ width: "100%", minWidth: `${chartWidth + padding.left + padding.right}px` }}>
          <svg width={chartWidth + padding.left + padding.right} height={chartHeight + padding.top + padding.bottom}>
            <rect x={0} y={0} width="100%" height="100%" fill="#1f2937" rx="4" />
            <line x1={padding.left} y1={markerY} x2={padding.left + chartWidth} y2={markerY} stroke="#374151" strokeWidth="0.5" strokeDasharray="4 2" />
            <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight} stroke="#6b7280" strokeWidth="1" />
            {(() => {
              const step = Math.max(1, Math.floor((maxFrame - minFrame) / 10));
              const labels = [];
              for (let f = minFrame; f <= maxFrame; f += step) {
                const x = padding.left + getX(f);
                labels.push(<text key={`label-${f}`} x={x} y={padding.top + chartHeight + 12} fill="#9ca3af" fontSize="8" textAnchor="middle">{f}</text>);
              }
              return labels;
            })()}
            {currentFrame >= minFrame && currentFrame <= maxFrame && (
              <line x1={padding.left + getX(currentFrame)} y1={padding.top} x2={padding.left + getX(currentFrame)} y2={padding.top + chartHeight} stroke="#ff3333" strokeWidth="1.5" strokeDasharray="4 2" />
            )}
            {filteredObjects.map(obj => {
            const color = getObjectColor(obj.id);
            const showStart = obj.start_frame >= minFrame && obj.start_frame <= maxFrame;
            const showEnd = obj.end_frame >= minFrame && obj.end_frame <= maxFrame;
            const isOverlap = showStart && showEnd && Math.abs(obj.start_frame - obj.end_frame) < 5;
            const startX = padding.left + getX(obj.start_frame);
            const endX = padding.left + getX(obj.end_frame);
            const baseY = markerY;
            const startOffsetY = isOverlap ? -8 : 0;
            const endOffsetY = isOverlap ? 8 : 0;

            return (
              <g key={obj.id}>
                {showStart && (
                  <>
                    <rect
                      x={startX - 5}
                      y={baseY + startOffsetY - 5}
                      width="6"
                      height="10"
                      rx="2"
                      ry="2"
                      fill={color}
                      stroke="#fff"
                      strokeWidth="1"
                      style={{ cursor: "pointer" }}
                      onClick={() => handlePointClick(obj.start_frame)}
                    >
                      <title>Object {obj.id} - Start frame: {obj.start_frame}</title>
                    </rect>
                  </>
                )}
                {showEnd && (
                  <>
                    <rect
                      x={endX - 5}
                      y={baseY + endOffsetY - 5}
                      width="6"
                      height="10"
                      rx="2"
                      ry="2"
                      fill={color}
                      stroke="#fff"
                      strokeWidth="1.5"
                      style={{ cursor: "pointer" }}
                      onClick={() => handlePointClick(obj.end_frame)}
                    >
                      <title>Object {obj.id} - End frame: {obj.end_frame}</title>
                    </rect>
                  </>
                )}
              </g>
            );
          })}
        </svg>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function DynamicVideo({ selectedObjects, setSelectedObjects }: SelectedObjectProps) {
  const [mounted, setMounted] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const [annotationMap, setAnnotationMap] = useState<Map<string, Annotation>>(new Map());
  const [annotationsReady, setAnnotationsReady] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(true);
  
  const isFrameStepRef = useRef(false);
  const isFrameStepSequenceRef = useRef(false);
  const frameStepTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const isSeekingRef = useRef(false);
  const pendingFrameRef = useRef<number | null>(null);
  const [pendingFrameVisual, setPendingFrameVisual] = useState<number | null>(null);
  
  const [currentFrame, setCurrentFrame] = useState(0);
  const currentDisplayFrameRef = useRef<number>(0);
  
  const lastSeekFrameRef = useRef<number>(-1);
  const lastSeekTimeRef = useRef<number>(-1);
  const sliderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const stableFpsRef = useRef<number>(40);
  const originalFpsLoadedRef = useRef<boolean>(false);
  
  const [stageScale, setStageScale] = useState({ x: 1, y: 1 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(1);

  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const { toast } = useToast();
  
  const [autoPanEnabled, setAutoPanEnabled] = useState(true);
  const lastPanFrameRef = useRef<number>(-1);
  
  const persistentTrajectoryRef = useRef<TrajectoryFrame[]>([]);
  const [trajectoryMap, setTrajectoryMap] = useState<TrajectoryMap>(new Map());
  const trajectoriesRef = useRef<TrajectoryMap>(new Map());
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [trajectoryPointCount, setTrajectoryPointCount] = useState(0);
  
  const [frameInput, setFrameInput] = useState("");
  const [showSpeed, setShowSpeed] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [trkVersion, setTrkVersion] = useState(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const loadedRangesListRef = useRef<{ start: number; end: number }[]>([]);
  const pendingRangesRef = useRef<Set<string>>(new Set());
  const loadedRangesKeyRef = useRef<Set<string>>(new Set());

  const [uniqueIdsData, setUniqueIdsData] = useState<UniqueIdsResponse | null>(null);
  const [isLoadingUnique, setIsLoadingUnique] = useState(false);
  const uniqueIdsAbortRef = useRef<AbortController | null>(null);
  const loadedUniqueRangesRef = useRef<{ start: number; end: number }[]>([]);
  const pendingUniqueRangesRef = useRef<Set<string>>(new Set());
  const uniqueDataCacheRef = useRef<Map<string, UniqueIdObject[]>>(new Map());

  const [timelinePoints, setTimelinePoints] = useState<Array<{ frame: number; x: number; y: number; objectId: number }>>([]);
  const [coordinateMode, setCoordinateMode] = useState<"x" | "y" | "xy">("x");
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const [isChartDragging, setIsChartDragging] = useState(false);
  const [timelineWindow, setTimelineWindow] = useState(300);
  const [timelineWindowInput, setTimelineWindowInput] = useState("300");

  const [timeline2Window, setTimeline2Window] = useState(1000);
  const [timeline2WindowInput, setTimeline2WindowInput] = useState("1000");

  const [stageWidth, setStageWidth] = useState(900);
  const [stageHeight, setStageHeight] = useState(700);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  // ========== Helper functions (defined early) ==========
  const getObjectColor = useCallback((id: number) => {
    const colors = ["#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF","#FFA500","#800080","#008000","#000080","#FF1493","#00BFFF","#7CFC00","#FFD700","#A52A2A","#DC143C","#4B0082","#8B4513","#2E8B57","#4682B4"];
    return colors[id % colors.length];
  }, []);

  const getTotalFrames = useCallback(() => {
    if (duration <= 0 || stableFpsRef.current <= 0) return 0;
    return Math.floor(duration * stableFpsRef.current);
  }, [duration]);

  // ==================== Numeric Shortcut System ====================
  const [objectPage, setObjectPage] = useState(0);
  const pageSize = 10;

  const objectsInCurrentFrame = useMemo(() => {
    const objects: { id: number; color: string }[] = [];
    for (const [key, anno] of annotationMap.entries()) {
      if (anno.frame_id === currentFrame) {
        objects.push({ id: anno.object_id, color: getObjectColor(anno.object_id) });
      }
    }
    return objects.sort((a, b) => a.id - b.id);
  }, [annotationMap, currentFrame, getObjectColor]);

  const totalPages = Math.ceil(objectsInCurrentFrame.length / pageSize);
  const currentPageObjects = objectsInCurrentFrame.slice(
    objectPage * pageSize,
    (objectPage + 1) * pageSize
  );

  useEffect(() => {
    setObjectPage(0);
  }, [currentFrame]);
  // ==================== End Numeric Shortcut ====================

  // Geometry & helpers
  const scale = useMemo(() => {
    if (videoWidth && videoHeight) return Math.min(stageWidth / videoWidth, stageHeight / videoHeight);
    return 1;
  }, [videoWidth, videoHeight, stageWidth, stageHeight]);

  const displayWidth = useMemo(() => (videoWidth ? videoWidth * scale : stageWidth), [videoWidth, scale, stageWidth]);
  const displayHeight = useMemo(() => (videoHeight ? videoHeight * scale : stageHeight), [videoHeight, scale, stageHeight]);
  const offsetX = useMemo(() => (stageWidth - displayWidth) / 2, [stageWidth, displayWidth]);
  const offsetY = useMemo(() => (stageHeight - displayHeight) / 2, [stageHeight, displayHeight]);

  const mapX = useCallback((x: number) => offsetX + x * scale, [offsetX, scale]);
  const mapY = useCallback((y: number) => offsetY + y * scale, [offsetY, scale]);

  // Unique IDs helpers
  const isUniqueRangeLoaded = useCallback((start: number, end: number): boolean => {
    return loadedUniqueRangesRef.current.some(range => start >= range.start && end <= range.end);
  }, []);
  const isUniqueRangeLoading = useCallback((start: number, end: number): boolean => {
    const key = `${start}-${end}`;
    if (pendingUniqueRangesRef.current.has(key)) return true;
    for (const pendingKey of pendingUniqueRangesRef.current) {
      const [pStart, pEnd] = pendingKey.split("-").map(Number);
      if (!(end <= pStart || start >= pEnd)) return true;
    }
    return false;
  }, []);
  const addUniqueLoadedRange = useCallback((start: number, end: number) => {
    let newRanges = [...loadedUniqueRangesRef.current, { start, end }];
    newRanges.sort((a, b) => a.start - b.start);
    const merged: typeof newRanges = [];
    for (const range of newRanges) {
      if (merged.length === 0 || merged[merged.length-1].end < range.start - 1) {
        merged.push(range);
      } else {
        merged[merged.length-1].end = Math.max(merged[merged.length-1].end, range.end);
      }
    }
    loadedUniqueRangesRef.current = merged;
  }, []);
  const mergeUniqueCacheIntoState = useCallback(() => {
    const allObjects: UniqueIdObject[] = [];
    for (const objects of uniqueDataCacheRef.current.values()) {
      allObjects.push(...objects);
    }
    const uniqueMap = new Map<number, UniqueIdObject>();
    for (const obj of allObjects) {
      if (!uniqueMap.has(obj.id) || obj.end_frame > uniqueMap.get(obj.id)!.end_frame) {
        uniqueMap.set(obj.id, obj);
      }
    }
    const objectsArray = Array.from(uniqueMap.values());
    setUniqueIdsData({
      status: "success",
      data: {
        project_id: projectId!,
        objects: objectsArray,
      },
    });
  }, [projectId]);
  const pruneUniqueRanges = useCallback((currentFrameNum: number, keepWindow: number) => {
    const minKeep = currentFrameNum - keepWindow;
    const maxKeep = currentFrameNum + keepWindow;
    let changed = false;
    loadedUniqueRangesRef.current = loadedUniqueRangesRef.current.filter(range => {
      if (range.end < minKeep || range.start > maxKeep) {
        const key = `${range.start}-${range.end}`;
        if (uniqueDataCacheRef.current.has(key)) {
          uniqueDataCacheRef.current.delete(key);
          changed = true;
        }
        return false;
      }
      return true;
    });
    if (changed) mergeUniqueCacheIntoState();
  }, [mergeUniqueCacheIntoState]);
  const fetchUniqueRange = useCallback((startFrame: number, endFrame: number) => {
    if (!projectId) return;
    const rangeKey = `${startFrame}-${endFrame}`;
    if (isUniqueRangeLoaded(startFrame, endFrame)) return;
    if (isUniqueRangeLoading(startFrame, endFrame)) return;
    pendingUniqueRangesRef.current.add(rangeKey);
    if (uniqueIdsAbortRef.current) uniqueIdsAbortRef.current.abort();
    const controller = new AbortController();
    uniqueIdsAbortRef.current = controller;
    setIsLoadingUnique(true);
    getUniqueIdsData(projectId, startFrame, endFrame, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (data?.data?.objects) {
          uniqueDataCacheRef.current.set(rangeKey, data.data.objects);
          addUniqueLoadedRange(startFrame, endFrame);
          mergeUniqueCacheIntoState();
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) console.error("[UniqueIDs] Fetch error:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          pendingUniqueRangesRef.current.delete(rangeKey);
          setIsLoadingUnique(false);
        }
      });
  }, [projectId, isUniqueRangeLoaded, isUniqueRangeLoading, addUniqueLoadedRange, mergeUniqueCacheIntoState]);

  // Main effect for unique IDs
  useEffect(() => {
    if (!projectId) return;
    const totalFrames = getTotalFrames();
    if (totalFrames === 0) return;
    pruneUniqueRanges(currentFrame, timeline2Window * 3);
    const isCovered = loadedUniqueRangesRef.current.some(range => currentFrame >= range.start && currentFrame <= range.end);
    if (isCovered) return;
    const halfWindow = timeline2Window;
    let start = Math.max(0, currentFrame - halfWindow);
    let end = Math.min(currentFrame + halfWindow, totalFrames);
    fetchUniqueRange(start, end);
  }, [projectId, currentFrame, getTotalFrames, timeline2Window, pruneUniqueRanges, fetchUniqueRange]);

  useEffect(() => {
    loadedUniqueRangesRef.current = [];
    pendingUniqueRangesRef.current.clear();
    uniqueDataCacheRef.current.clear();
    setUniqueIdsData(null);
  }, [timeline2Window]);

  useEffect(() => {
    const handleOperationComplete = () => {
      loadedUniqueRangesRef.current = [];
      pendingUniqueRangesRef.current.clear();
      uniqueDataCacheRef.current.clear();
      setUniqueIdsData(null);
    };
    window.addEventListener("operationComplete", handleOperationComplete);
    return () => window.removeEventListener("operationComplete", handleOperationComplete);
  }, []);

  // Annotation helpers
  const isRangeAlreadyLoading = (start: number, end: number): boolean => {
    const key = `${start}-${end}`;
    if (loadedRangesKeyRef.current.has(key)) return true;
    if (pendingRangesRef.current.has(key)) return true;
    for (const pendingKey of pendingRangesRef.current) {
      const [pStart, pEnd] = pendingKey.split("-").map(Number);
      if (!(end <= pStart || start >= pEnd)) return true;
    }
    return false;
  };
  const isFrameLoaded = useCallback((frame: number): boolean => {
    return loadedRangesListRef.current.some(range => frame >= range.start && frame <= range.end);
  }, []);
  const addLoadedRange = useCallback((start: number, end: number) => {
    let newRanges = [...loadedRangesListRef.current, { start, end }];
    newRanges.sort((a, b) => a.start - b.start);
    const merged: typeof newRanges = [];
    for (const range of newRanges) {
      if (merged.length === 0 || merged[merged.length-1].end < range.start - 1) {
        merged.push(range);
      } else {
        merged[merged.length-1].end = Math.max(merged[merged.length-1].end, range.end);
      }
    }
    loadedRangesListRef.current = merged;
  }, []);
  const clearLoadedRanges = useCallback(() => {
    loadedRangesListRef.current = [];
    loadedRangesKeyRef.current.clear();
  }, []);

  // Timeline data (unchanged)
  useEffect(() => {
    if (!projectId || selectedObjects.length === 0) {
      setTimelinePoints([]);
      return;
    }
    const fetchTimeline = async () => {
      const totalFrames = getTotalFrames();
      if (totalFrames === 0) return;
      const startFrame = Math.max(0, currentFrame - timelineWindow);
      const endFrame = Math.min(currentFrame + timelineWindow, totalFrames);
      const objectIds = selectedObjects.map(obj => obj.object_id).join(',');
      try {
        const data = await getTimelineData(projectId, startFrame, endFrame, objectIds);
        if (data?.f) {
          const points: Array<{ frame: number; x: number; y: number; objectId: number }> = [];
          Object.entries(data.f).forEach(([frameStr, objects]: any) => {
            const frame = Number(frameStr);
            Object.entries(objects).forEach(([objectIdStr, coords]: any) => {
              if (Array.isArray(coords) && coords.length >= 2) {
                points.push({ frame, x: coords[0], y: coords[1], objectId: Number(objectIdStr) });
              }
            });
          });
          setTimelinePoints(points);
        } else setTimelinePoints([]);
      } catch (err) {
        console.error("[Timeline] Fetch error:", err);
        setTimelinePoints([]);
      }
    };
    fetchTimeline();
  }, [projectId, selectedObjects, currentFrame, getTotalFrames, timelineWindow]);

  const chartData = useMemo(() => {
    if (timelinePoints.length === 0) return [];
    const grouped = new Map<number, any>();
    timelinePoints.forEach(p => {
      if (!grouped.has(p.frame)) grouped.set(p.frame, { frame: p.frame });
      const row = grouped.get(p.frame);
      if (coordinateMode === "x" || coordinateMode === "xy") row[`obj_${p.objectId}_x`] = p.x;
      if (coordinateMode === "y" || coordinateMode === "xy") row[`obj_${p.objectId}_y`] = p.y;
    });
    return Array.from(grouped.values()).sort((a, b) => a.frame - b.frame);
  }, [timelinePoints, coordinateMode]);

  const uniqueObjectIds = useMemo(() => Array.from(new Set(timelinePoints.map(p => p.objectId))), [timelinePoints]);

  const seekFromChartMouse = useCallback((clientX: number) => {
    if (!timelineContainerRef.current || timelinePoints.length === 0) return;
    const svg = timelineContainerRef.current.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const chartWidth = rect.width;
    if (chartWidth <= 0) return;
    let relativeX = (clientX - rect.left) / chartWidth;
    relativeX = Math.min(Math.max(relativeX, 0), 1);
    const frames = timelinePoints.map(p => p.frame);
    const minFrame = Math.min(...frames);
    const maxFrame = Math.max(...frames);
    const frame = Math.round(minFrame + relativeX * (maxFrame - minFrame));
    const targetTime = frame / stableFpsRef.current;
    handleSeek(targetTime);
  }, [timelinePoints]);

  useEffect(() => {
    if (!timelineContainerRef.current || selectedObjects.length === 0) return;
    const container = timelineContainerRef.current;
    const onMouseDown = (e: MouseEvent) => {
      const svg = container.querySelector('svg');
      if (!svg || !svg.contains(e.target as Node)) return;
      e.preventDefault();
      setIsChartDragging(true);
      seekFromChartMouse(e.clientX);
    };
    const onMouseMove = (e: MouseEvent) => { if (isChartDragging) seekFromChartMouse(e.clientX); };
    const onMouseUp = () => setIsChartDragging(false);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [selectedObjects.length, seekFromChartMouse, isChartDragging]);

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const frame = data.activePayload[0].payload.frame;
      handleSeek(frame / stableFpsRef.current);
    }
  };

  const tooltipFormatter = useCallback((value: any, name: string | number | undefined) => {
    if (name === undefined) return [String(value), ""];
    const safeName = String(name);
    const match = safeName.match(/obj_(\d+)(?:_(x|y))?/);
    if (!match) return [String(value), safeName];
    const objId = match[1];
    const coordType = match[2] || (coordinateMode === "x" ? "x" : coordinateMode === "y" ? "y" : null);
    if (coordType === "x") return [`X: ${Number(value).toFixed(2)}`, `Object ${objId}`];
    if (coordType === "y") return [`Y: ${Number(value).toFixed(2)}`, `Object ${objId}`];
    return [Number(value).toFixed(2), `Object ${objId}`];
  }, [coordinateMode]);

  const ANNO_PREFETCH_THRESHOLD = useMemo(() => Math.round((stableFpsRef.current / 100) * 6 * stableFpsRef.current), []);
  const projectName = sessionStorage.getItem("project_name") || undefined;
  const videoName = sessionStorage.getItem("video_name") || undefined;
  const trkFileName = sessionStorage.getItem("trk_file_name") || undefined;

  // Cleanup
  useEffect(() => {
    return () => {
      if (frameStepTimerRef.current) clearTimeout(frameStepTimerRef.current);
      if (trajectoryUpdateIntervalRef.current) clearInterval(trajectoryUpdateIntervalRef.current);
    };
  }, []);
  useEffect(() => { setMounted(true); }, []);

  // Load session data
  useEffect(() => {
    if (!mounted) return;
    const storedProjectId = sessionStorage.getItem("projectId");
    const storedFps = sessionStorage.getItem("fps");
    const storedWidth = sessionStorage.getItem("width");
    const storedHeight = sessionStorage.getItem("height");
    const storedDuration = sessionStorage.getItem("duration");
    if (storedProjectId) setProjectId(Number(storedProjectId));
    if (storedFps && !originalFpsLoadedRef.current) {
      const originalFps = Number(storedFps);
      stableFpsRef.current = originalFps;
      setFps(originalFps);
      originalFpsLoadedRef.current = true;
    }
    if (storedWidth) setVideoWidth(Number(storedWidth));
    if (storedHeight) setVideoHeight(Number(storedHeight));
    if (storedDuration) setDuration(Number(storedDuration));
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !originalFpsLoadedRef.current) return;
    if (fps !== stableFpsRef.current) setFps(stableFpsRef.current);
  }, [fps, mounted]);

  const handleSeek = async (time: number) => {
    if (!video) return;
    if (isSeekingRef.current) {
      const targetFrame = Math.round(time * stableFpsRef.current);
      setPendingFrameVisual(targetFrame);
      setTimeout(() => setPendingFrameVisual(null), 500);
      pendingFrameRef.current = targetFrame;
      return;
    }
    const safeTime = Math.min(Math.max(time, 0), video.duration);
    const targetFrame = Math.round(safeTime * stableFpsRef.current);
    if (lastSeekFrameRef.current === targetFrame && Math.abs(lastSeekTimeRef.current - safeTime) < 0.01) return;
    lastSeekFrameRef.current = targetFrame;
    lastSeekTimeRef.current = safeTime;
    isSeekingRef.current = true;
    pendingFrameRef.current = null;

    const isWithinLoadedRange = loadedRangesListRef.current.some(range => targetFrame >= range.start && range.end >= targetFrame);
    if (!isWithinLoadedRange) {
      setAnnotationMap(new Map());
      persistentTrajectoryRef.current = [];
      trajectoriesRef.current = new Map();
      setTrajectoryMap(new Map());
      setTrajectoryPointCount(0);
      clearLoadedRanges();
    }

    if (isFrameLoaded(targetFrame)) {
      video.pause();
      setIsPlaying(false);
      video.currentTime = safeTime;
      setCurrentTime(safeTime);
      setDragTime(null);
      setSelectedFrameIndex(targetFrame);
      currentDisplayFrameRef.current = targetFrame;
      setCurrentFrame(targetFrame);
      setIsLoadingAnnotations(false);
      setAnnotationsReady(true);
      isSeekingRef.current = false;
      return;
    }

    video.pause();
    setIsPlaying(false);
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
    setDragTime(null);
    setSelectedFrameIndex(targetFrame);
    currentDisplayFrameRef.current = targetFrame;
    setCurrentFrame(targetFrame);
    clearLoadedRanges();
    setAnnotationsReady(false);
    if (!isFrameStepSequenceRef.current) setIsLoadingAnnotations(true);
    const windowFrames = Math.round(6 * stableFpsRef.current);
    const totalFrames = Math.floor(video.duration * stableFpsRef.current);
    const TRAJECTORY_BUFFER = stableFpsRef.current * 30;
    const windowStart = Math.max(0, targetFrame - TRAJECTORY_BUFFER);
    const windowEnd = Math.min(targetFrame + windowFrames + TRAJECTORY_BUFFER, totalFrames);
    if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
      chunkMutation.mutate({ start: windowStart, end: windowEnd });
    } else {
      setIsLoadingAnnotations(false);
    }
  };

  const togglePlayPause = useCallback(() => {
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => toast({ title: "Click the play button", duration: 1500 }));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [video, toast]);

  const trajectoryUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (trajectoryUpdateIntervalRef.current) clearInterval(trajectoryUpdateIntervalRef.current);
    trajectoryUpdateIntervalRef.current = setInterval(() => {
      const currentTrajMap = trajectoriesRef.current;
      if (currentTrajMap.size > 0) setTrajectoryMap(new Map(currentTrajMap));
    }, 500);
    return () => { if (trajectoryUpdateIntervalRef.current) clearInterval(trajectoryUpdateIntervalRef.current); };
  }, [mounted]);
  
  const addTrajectoryPoints = useCallback((newTrajectoryFrames: TrajectoryFrame[]) => {
    const MAX_TRAJ_FRAMES = 60 * stableFpsRef.current;
    const currentFrameNum = currentDisplayFrameRef.current;
    const cutoff = Math.max(0, currentFrameNum - MAX_TRAJ_FRAMES);
    persistentTrajectoryRef.current = persistentTrajectoryRef.current.filter(t => t.frame_id >= cutoff);
    newTrajectoryFrames.forEach(traj => {
      if (traj.frame_id >= cutoff) {
        persistentTrajectoryRef.current.push(traj);
        if (!trajectoriesRef.current.has(traj.object_id)) trajectoriesRef.current.set(traj.object_id, new Map());
        trajectoriesRef.current.get(traj.object_id)!.set(traj.frame_id, traj.coordinate);
      }
    });
    setTrajectoryPointCount(persistentTrajectoryRef.current.length);
  }, []);

  const getTrajectoryPointsUpToCurrent = useCallback((objectId: number, upToFrame: number): number[] => {
    const frameTrajectory = trajectoryMap.get(objectId);
    if (!frameTrajectory || frameTrajectory.size < 2) return [];
    const twoMinFrames = 2 * 60 * stableFpsRef.current;
    const cutoffFrame = Math.max(0, upToFrame - twoMinFrames);
    const sortedFrames = Array.from(frameTrajectory.keys()).sort((a,b)=>a-b).filter(fid => fid >= cutoffFrame && fid <= upToFrame);
    if (sortedFrames.length < 2) return [];
    const points: number[] = [];
    sortedFrames.forEach(fid => { const [x,y] = frameTrajectory.get(fid)!; points.push(x,y); });
    return points;
  }, [trajectoryMap]);

  const getAllObjectIds = useCallback(() => Array.from(trajectoryMap.keys()).sort((a,b)=>a-b), [trajectoryMap]);
  const setCursorStyle = useCallback((cursor: string) => { if (stageRef.current) stageRef.current.container().style.cursor = cursor; }, []);
  
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    let direction = e.evt.deltaY > 0 ? -1 : 1;
    if (e.evt.ctrlKey) direction = -direction;
    const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;
    const clampedScale = Math.min(Math.max(newScale, 1), 10);
    setCurrentZoom(clampedScale);
    const newPos = { x: pointer.x - mousePointTo.x * clampedScale, y: pointer.y - mousePointTo.y * clampedScale };
    setStageScale({ x: clampedScale, y: clampedScale });
    setStagePos(newPos);
  }, []);
  
  const getCircleRadius = () => Math.max(0.5, 1*(1/currentZoom));
  const getTrajectoryWidth = () => Math.max(0.5, 2*(1/currentZoom));
  const getIdFontSize = () => Math.max(6, 12*(1/currentZoom));
  const getBBoxStrokeWidth = () => Math.max(0.5, 2*(1/currentZoom));
  const getLabelOffset = () => 8*(1/currentZoom);
  
  const handleMouseDown = (e: any) => {
    if (e.evt.button === 0 || e.evt.button === 2) {
      if (e.target === e.target.getStage()) {
        setIsPanMode(true);
        setIsDragging(true);
        lastMousePosRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        setCursorStyle("grabbing");
      }
    }
  };
  
  const handleMouseMove = (e: any) => {
    if (!stageRef.current) return;
    if (isDragging && isPanMode) {
      setCursorStyle("grabbing");
      const deltaX = e.evt.clientX - lastMousePosRef.current.x;
      const deltaY = e.evt.clientY - lastMousePosRef.current.y;
      setStagePos(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      lastMousePosRef.current = { x: e.evt.clientX, y: e.evt.clientY };
    } else {
      setCursorStyle(e.target === e.target.getStage() ? "grab" : "default");
    }
  };
  
  const handleMouseUp = () => { setIsDragging(false); setIsPanMode(false); setCursorStyle("grab"); };
  const handleMouseLeave = () => { setIsDragging(false); setIsPanMode(false); setCursorStyle("default"); };
  const handleContextMenu = (e: any) => e.evt.preventDefault();
  const handleTouchMove = useCallback((e: any) => {}, []);
  const handleTouchEnd = () => {};
  const handleZoomIn = () => { const ns = Math.min(stageScale.x * 1.1, 10); setStageScale({x:ns,y:ns}); setCurrentZoom(ns); };
  const handleZoomOut = () => { const ns = Math.max(stageScale.x / 1.1, 1); setStageScale({x:ns,y:ns}); setCurrentZoom(ns); };
  const handleResetZoom = () => { setStageScale({x:1,y:1}); setStagePos({x:0,y:0}); setCurrentZoom(1); setCursorStyle("grab"); };

  const panToSelectedObject = useCallback(() => {
    if (!autoPanEnabled || selectedObjects.length !== 1 || currentZoom <= 1.1 || isDragging || isPanMode) return;
    if (!stageRef.current || !video) return;
    const selectedObjectId = selectedObjects[0]?.object_id;
    if (!selectedObjectId) return;
    const currentAnnotation = Array.from(annotationMap.values()).find(
      anno => anno.object_id === selectedObjectId && anno.frame_id === currentFrame
    );
    if (!currentAnnotation?.coordinates?.length) return;
    if (lastPanFrameRef.current === currentFrame) return;
    lastPanFrameRef.current = currentFrame;
    const objX = currentAnnotation.coordinates[0][0];
    const objY = currentAnnotation.coordinates[0][1];
    const stageObjX = offsetX + objX * scale;
    const stageObjY = offsetY + objY * scale;
    const stage = stageRef.current;
    const currentStageX = stage.x();
    const currentStageY = stage.y();
    const currentScale = stage.scaleX();
    const margin = 80;
    const marginInStage = margin / currentScale;
    const viewportLeft = -currentStageX / currentScale;
    const viewportRight = (stageWidth - currentStageX) / currentScale;
    const viewportTop = -currentStageY / currentScale;
    const viewportBottom = (stageHeight - currentStageY) / currentScale;
    let needsPan = false;
    let targetOffsetX = 0, targetOffsetY = 0;
    if (stageObjX < viewportLeft + marginInStage) {
      targetOffsetX = (stageObjX - (viewportLeft + marginInStage)) * currentScale;
      needsPan = true;
    } else if (stageObjX > viewportRight - marginInStage) {
      targetOffsetX = (stageObjX - (viewportRight - marginInStage)) * currentScale;
      needsPan = true;
    }
    if (stageObjY < viewportTop + marginInStage) {
      targetOffsetY = (stageObjY - (viewportTop + marginInStage)) * currentScale;
      needsPan = true;
    } else if (stageObjY > viewportBottom - marginInStage) {
      targetOffsetY = (stageObjY - (viewportBottom - marginInStage)) * currentScale;
      needsPan = true;
    }
    if (needsPan) setStagePos({ x: currentStageX - targetOffsetX, y: currentStageY - targetOffsetY });
  }, [selectedObjects, currentFrame, annotationMap, currentZoom, autoPanEnabled, isDragging, isPanMode, video, offsetX, offsetY, scale, stageWidth, stageHeight]);

  const objectMutation = useMutation({ 
    mutationFn: ({ projectId, objectId, frameId }: any) => getObjectData(projectId, objectId, frameId) 
  });

  // Slot-based selection: replaces the object in the given slot (0 = first, 1 = second)
  const selectObjectForSlot = useCallback((objectId: number, slotIndex: 0 | 1) => {
  if (!projectId) return;

  // Prevent selecting second object if no first object exists
  if (slotIndex === 1 && selectedObjects.length === 0) {
    toast({ title: "Select a first object before selecting a second", duration: 1500 });
    return;
  }

  // Prevent the same object from being in both slots
  const alreadySelectedInOtherSlot = selectedObjects.some(
    (obj, idx) => idx !== slotIndex && obj.object_id === objectId
  );
  if (alreadySelectedInOtherSlot) {
    toast({ title: `Object ${objectId} is already selected in the other slot`, duration: 1500 });
    return;
  }

  objectMutation.mutate(
    { projectId: Number(projectId), objectId, frameId: currentFrame },
    {
      onSuccess: (meta) => {
        setSelectedObjects(prev => {
          const newSelection = [...prev];
          newSelection[slotIndex] = {
            object_id: objectId,
            frame_id: currentFrame,
            start_frame: meta.data.start_frame,
            end_frame: meta.data.end_frame,
            is_inside: meta.data.is_inside,
          };
          return newSelection.slice(0, 2);
        });
        toast({ title: `Object ${objectId} set as ${slotIndex === 0 ? 'primary' : 'secondary'} selection`, duration: 1500 });
        if (autoPanEnabled && currentZoom > 1.1 && slotIndex === 0) {
          setTimeout(() => panToSelectedObject(), 100);
        }
      },
      onError: () => toast({ title: `Failed to select object ${objectId}`, variant: "destructive", duration: 1500 })
    }
  );
}, [selectedObjects, projectId, currentFrame, objectMutation, setSelectedObjects, autoPanEnabled, currentZoom, panToSelectedObject, toast]);



  // Auto-pan effects (unchanged)
  useEffect(() => {
    if (!video || !mounted) return;
    const handleTimeUpdate = () => {
      if (autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) panToSelectedObject();
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [video, mounted, autoPanEnabled, selectedObjects.length, currentZoom, isDragging, isPanMode, panToSelectedObject]);

  useEffect(() => {
    if (autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) setTimeout(() => panToSelectedObject(), 50);
  }, [currentZoom, autoPanEnabled, selectedObjects.length, isDragging, isPanMode, panToSelectedObject]);

  useEffect(() => {
    if (annotationsReady && autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) panToSelectedObject();
  }, [annotationsReady, autoPanEnabled, selectedObjects.length, currentZoom, isDragging, isPanMode, panToSelectedObject]);

  useEffect(() => {
    if (autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) panToSelectedObject();
  }, [currentFrame, autoPanEnabled, selectedObjects.length, currentZoom, isDragging, isPanMode, panToSelectedObject]);

  const chunkMutation = useMutation({
    mutationFn: async ({ start, end }: { start: number; end: number }) => {
      if (!projectId) return null;
      const key = `${start}-${end}`;
      pendingRangesRef.current.add(key);
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      return getFrameRangeData(projectId, start, end, controller.signal);
    },
    onSuccess: (data, { start, end }) => {
      if (!data) return;
      const key = `${start}-${end}`;
      pendingRangesRef.current.delete(key);
      addLoadedRange(start, end);
      loadedRangesKeyRef.current.add(key);
      const loadedAnnotations: Annotation[] = [];
      const newTrajectoryFrames: TrajectoryFrame[] = [];
      data.objects?.forEach((obj: { frames: any[]; object_id: number }) => {
        obj.frames.forEach((f: any) => {
          loadedAnnotations.push({ object_id: obj.object_id, frame_id: f.frame_id, coordinates: f.coordinates });
          if (f.coordinates?.length) newTrajectoryFrames.push({ frame_id: f.frame_id, object_id: obj.object_id, coordinate: f.coordinates[0] });
        });
      });
      setAnnotationMap(prev => {
        const newMap = new Map(prev);
        loadedAnnotations.forEach(anno => {
          const key = `${anno.object_id}-${anno.frame_id}`;
          if (!newMap.has(key)) newMap.set(key, anno);
        });
        return newMap;
      });
      addTrajectoryPoints(newTrajectoryFrames);
      const startFrame = typeof data.start_frame === "number" ? data.start_frame : start;
      const endFrame = typeof data.end_frame === "number" ? data.end_frame : end;
      currentAnnoWindowRef.current = { start: startFrame, end: endFrame };
      if (!isFrameStepSequenceRef.current) setIsLoadingAnnotations(false);
      setAnnotationsReady(true);
      if (!initialLoadComplete && video && video.paused && mounted) {
        setInitialLoadComplete(true);
        setTimeout(() => video.play().then(() => setIsPlaying(true)).catch(() => {}), 100);
      }
    },
    onError: (_, { start, end }) => {
      const key = `${start}-${end}`;
      pendingRangesRef.current.delete(key);
      if (!isFrameStepSequenceRef.current) setIsLoadingAnnotations(false);
    },
  });

  const abortRef = useRef<AbortController | null>(null);
  const currentAnnoWindowRef = useRef<{ start: number; end: number } | null>(null);
  const lastAnnoLoadTs = useRef<number>(0);

  useEffect(() => {
    if (!mounted || annotationMap.size === 0) return;
    const maxFrames = 120 * stableFpsRef.current;
    const minFrame = currentFrame - maxFrames;
    const maxFrame = currentFrame + maxFrames;
    let removedCount = 0;
    const newMap = new Map(annotationMap);
    for (const [key, anno] of annotationMap.entries()) {
      if (anno.frame_id < minFrame || anno.frame_id > maxFrame) {
        newMap.delete(key);
        removedCount++;
      }
    }
    if (removedCount > 0) setAnnotationMap(newMap);
  }, [currentFrame, annotationMap, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const maxTrajFrames = 60 * stableFpsRef.current;
    const cutoffFrame = Math.max(0, currentFrame - maxTrajFrames);
    let prunedAny = false;
    persistentTrajectoryRef.current = persistentTrajectoryRef.current.filter(t => t.frame_id >= cutoffFrame);
    for (const [objId, frameMap] of trajectoriesRef.current.entries()) {
      for (const frameId of frameMap.keys()) if (frameId < cutoffFrame) { frameMap.delete(frameId); prunedAny = true; }
      if (frameMap.size === 0) trajectoriesRef.current.delete(objId);
    }
    if (prunedAny) {
      setTrajectoryMap(new Map(trajectoriesRef.current));
      setTrajectoryPointCount(persistentTrajectoryRef.current.length);
    }
  }, [currentFrame, mounted]);

  const activityLogsQuery = useQuery({ queryKey: ["activity-logs", projectId], queryFn: () => getActivityLogs(projectId!), enabled: !!projectId && mounted });
  const exportMutation = useMutation({
    mutationFn: () => exportTrk(projectId!),
    onMutate: () => { setIsExporting(true); setDownloadUrl(null); },
    onSuccess: (response) => { setDownloadUrl(response.data.download_url); setTrkVersion(response.data.trk_version); setIsExporting(false); toast({ title: "Export Completed", duration: 1500 }); },
    onError: () => { setIsExporting(false); setDownloadUrl(null); toast({ title: "Export Failed", variant: "destructive", duration: 1500 }); },
  });

  useEffect(() => {
    if (!mounted) return;
    const handleLinkingComplete = (event: any) => {
      const { frameId } = event.detail;
      if (!video) return;
      activityLogsQuery.refetch();
      setAnnotationMap(new Map());
      persistentTrajectoryRef.current = [];
      trajectoriesRef.current = new Map();
      setTrajectoryMap(new Map());
      setTrajectoryPointCount(0);
      clearLoadedRanges();
      setIsLoadingAnnotations(true);
      const windowFrames = Math.round(6 * stableFpsRef.current);
      const totalFrames = Math.floor(video.duration * stableFpsRef.current);
      const windowStart = Math.max(0, frameId);
      const windowEnd = Math.min(frameId + windowFrames, totalFrames);
      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
        chunkMutation.mutate({ start: Math.max(0, windowStart - 600), end: windowEnd });
      } else setIsLoadingAnnotations(false);
    };
    window.addEventListener("operationComplete", handleLinkingComplete);
    return () => window.removeEventListener("operationComplete", handleLinkingComplete);
  }, [video, activityLogsQuery, mounted]);

  const undoCount = activityLogsQuery.data?.data?.total_undo_can_perform ?? 0;
  const totalLength = activityLogsQuery.data?.data?.total_length ?? 0;
  const redoCount = totalLength - undoCount;
  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  const handleFrameStep = useCallback((step: number, baseFrame?: number) => {
    if (!video) return;
    if (frameStepTimerRef.current) clearTimeout(frameStepTimerRef.current);
    isFrameStepRef.current = true;
    isFrameStepSequenceRef.current = true;
    frameStepTimerRef.current = setTimeout(() => {
      isFrameStepRef.current = false;
      isFrameStepSequenceRef.current = false;
    }, 500);
    const currentFps = stableFpsRef.current;
    let currentFrameNum = baseFrame !== undefined ? baseFrame : currentDisplayFrameRef.current;
    if (isSeekingRef.current) {
      setPendingFrameVisual(currentFrameNum + step);
      setTimeout(() => setPendingFrameVisual(null), 500);
      pendingFrameRef.current = currentFrameNum + step;
      return;
    }
    const totalFrames = Math.floor(video.duration * currentFps);
    let newFrame = currentFrameNum + step;
    newFrame = Math.min(Math.max(newFrame, 0), totalFrames);
    if (newFrame === currentFrameNum) {
      isFrameStepRef.current = false;
      isFrameStepSequenceRef.current = false;
      return;
    }
    const newTime = newFrame / currentFps;
    isSeekingRef.current = true;
    pendingFrameRef.current = null;
    currentDisplayFrameRef.current = newFrame;
    setCurrentFrame(newFrame);
    video.currentTime = newTime;
    setCurrentTime(newTime);
    setSelectedFrameIndex(newFrame);
    sessionStorage.setItem("frameId", newFrame.toString());
    setIsLoadingAnnotations(false);
    setAnnotationsReady(true);
  }, [video]);

  const handleSliderChange = (val: number[]) => {
    setDragTime(val[0]);
    if (video && !video.paused) { video.pause(); setIsPlaying(false); }
    if (sliderTimeoutRef.current) clearTimeout(sliderTimeoutRef.current);
    sliderTimeoutRef.current = setTimeout(() => {
      if (!isFrameStepSequenceRef.current) {
        setAnnotationsReady(false);
        setIsLoadingAnnotations(true);
      }
    }, 100);
  };

  const handleSkip = (seconds: number) => {
    if (!video) return;
    const newTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration);
    handleSeek(newTime);
  };

  const handleFrameJump = async (targetFrame: number) => {
    if (!video) return;
    const totalFrames = Math.floor(video.duration * stableFpsRef.current);
    const safeFrame = Math.min(Math.max(targetFrame, 0), totalFrames);
    const safeTime = safeFrame / stableFpsRef.current;
    video.pause();
    setIsPlaying(false);
    handleSeek(safeTime);
    setFrameInput("");
  };

  // Dynamic stage resize
  useEffect(() => {
    if (!rootContainerRef.current) return;
    const updateStageSize = () => {
      const rect = rootContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const availableHeight = window.innerHeight - rect.top - 280;
      const newHeight = Math.min(Math.max(availableHeight, 300), 600);
      const newWidth = Math.min(rect.width - 32, 1200);
      setStageWidth(newWidth);
      setStageHeight(newHeight);
    };
    updateStageSize();
    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(rootContainerRef.current);
    window.addEventListener('resize', updateStageSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateStageSize);
    };
  }, []);

  // Video initialization
  const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
  useEffect(() => {
    if (!mounted || !originalFpsLoadedRef.current) return;
    const loadVideo = async () => {
      const pid = sessionStorage.getItem("projectId");
      if (!pid) return;
      try {
        const vid = document.createElement("video");
        vid.crossOrigin = "anonymous";
        vid.src = `${API_BASE}/api/v1/videos/${pid}/project-stream/`;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        const lockedFps = stableFpsRef.current;
        const handleSeeked = () => {
          const actualTime = vid.currentTime;
          const actualFrame = Math.round(actualTime * lockedFps);
          const targetFrame = pendingFrameRef.current;
          if (targetFrame !== null && actualFrame !== targetFrame) {
            vid.currentTime = targetFrame / lockedFps;
            return;
          }
          isSeekingRef.current = false;
          currentDisplayFrameRef.current = actualFrame;
          setCurrentFrame(actualFrame);
          setCurrentTime(vid.currentTime);
          setSelectedFrameIndex(actualFrame);
          if (layerRef.current) layerRef.current.batchDraw();
          if (!isFrameLoaded(actualFrame)) {
            const windowFrames = Math.round(6 * lockedFps);
            const totalFrames = Math.floor(vid.duration * lockedFps);
            const windowStart = Math.max(0, actualFrame - 50);
            const windowEnd = Math.min(actualFrame + windowFrames, totalFrames);
            if (!isFrameStepSequenceRef.current) setIsLoadingAnnotations(true);
            chunkMutation.mutate({ start: windowStart, end: windowEnd });
          } else {
            setAnnotationsReady(true);
            setIsLoadingAnnotations(false);
          }
          if (pendingFrameRef.current !== null) {
            const queuedFrame = pendingFrameRef.current;
            pendingFrameRef.current = null;
            setTimeout(() => handleSeek(queuedFrame / lockedFps), 10);
          }
        };
        vid.addEventListener('seeked', handleSeeked);
        vid.onloadedmetadata = async () => {
          setIsLoadingAnnotations(true);
          setInitialLoadComplete(false);
          chunkMutation.mutate({ start: 0, end: 150 });
        };
        vid.onerror = () => toast({ title: "Error loading video", variant: "destructive", duration: 1500 });
        setVideo(vid);
      } catch (error) {
        toast({ title: "Failed to load video", variant: "destructive", duration: 1500 });
      }
    };
    loadVideo();
  }, [mounted, originalFpsLoadedRef.current]);

  const undoMutation = useMutation({
    mutationFn: () => undoAction(projectId!),
    onSuccess: () => { toast({ title: "Undo successful", duration: 1500 }); if(video) window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: currentDisplayFrameRef.current } })); },
    onError: () => toast({ title: "Undo failed", variant: "destructive", duration: 1500 }),
  });
  
  const redoMutation = useMutation({
    mutationFn: () => redoAction(projectId!),
    onSuccess: () => { toast({ title: "Redo successful", duration: 1500 }); if(video) window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: currentDisplayFrameRef.current } })); },
    onError: () => toast({ title: "Redo failed", variant: "destructive", duration: 1500 }),
  });

  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z" && canUndo) { e.preventDefault(); undoMutation.mutate(); }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z")) && canRedo) { e.preventDefault(); redoMutation.mutate(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canUndo, canRedo, mounted]);

  const formatTime = (time: number) => `${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,"0")}`;
  
  useEffect(() => { if(video && mounted) video.playbackRate = playbackRate; }, [video, playbackRate, mounted]);
  useEffect(() => { if(!video || !layerRef.current || !mounted) return; let id: number; const update = () => { layerRef.current?.batchDraw(); id = requestAnimationFrame(update); }; update(); return () => cancelAnimationFrame(id); }, [video, mounted]);

  useEffect(() => {
    if (!video || !mounted) return;
    const vid = video;
    const handleTimeUpdate = () => {
      const newFrame = Math.round(vid.currentTime * stableFpsRef.current);
      currentDisplayFrameRef.current = newFrame;
      setCurrentFrame(newFrame);
      setCurrentTime(vid.currentTime);
      const now = performance.now();
      if (isPlaying && now - lastAnnoLoadTs.current > 500) {
        if (currentAnnoWindowRef.current) {
          const totalFrames = Math.floor(duration * stableFpsRef.current);
          const windowSize = Math.round(6 * stableFpsRef.current);
          const prefetchPoint = currentAnnoWindowRef.current.start + ANNO_PREFETCH_THRESHOLD;
          const nextStart = newFrame;
          const nextEnd = Math.min(newFrame + windowSize, totalFrames);
          if (newFrame >= prefetchPoint && newFrame + windowSize <= totalFrames && !isRangeAlreadyLoading(nextStart, nextEnd)) {
            if (!loadedRangesKeyRef.current.has(`${nextStart}-${nextEnd}`)) {
              chunkMutation.mutate({ start: Math.max(0, nextStart), end: nextEnd });
              lastAnnoLoadTs.current = now;
            }
          }
        }
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => { setIsPlaying(false); sessionStorage.setItem("frameId", currentDisplayFrameRef.current.toString()); };
    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("play", handlePlay);
    vid.addEventListener("pause", handlePause);
    return () => { vid.removeEventListener("timeupdate", handleTimeUpdate); vid.removeEventListener("play", handlePlay); vid.removeEventListener("pause", handlePause); };
  }, [video, isPlaying, duration, mounted, ANNO_PREFETCH_THRESHOLD]);

  const allObjectIds = getAllObjectIds();

  const getAllObjectIdList = useCallback(() => {
    if (!uniqueIdsData) return [];
    return (uniqueIdsData.data?.objects ?? []).map(obj => obj.id).sort((a, b) => a - b);
  }, [uniqueIdsData]);

  const cycleSelectedObject = useCallback((position: 0 | 1) => {
    const allIds = getAllObjectIdList();
    if (allIds.length === 0) return;
    if (selectedObjects.length === 0) return;
    if (position === 1 && selectedObjects.length < 2) return;
    const currentObj = selectedObjects[position];
    const currentId = currentObj.object_id;
    const currentIndex = allIds.indexOf(currentId);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % allIds.length;
    const nextId = allIds[nextIndex];
    const objData = uniqueIdsData?.data?.objects?.find(obj => obj.id === nextId);
    if (!objData) return;
    const jumpFrame = objData.start_frame;
    if (!projectId) return;
    objectMutation.mutate(
      { projectId, objectId: nextId, frameId: jumpFrame },
      {
        onSuccess: (meta) => {
          setSelectedObjects(prev => {
            const newSelection = [...prev];
            newSelection[position] = {
              object_id: nextId,
              frame_id: jumpFrame,
              start_frame: meta.data.start_frame,
              end_frame: meta.data.end_frame,
              is_inside: meta.data.is_inside,
            };
            return newSelection;
          });
          handleFrameJump(jumpFrame);
          toast({ title: `Switched ${position === 0 ? 'primary' : 'secondary'} object to ID ${nextId}`, duration: 1500 });
        },
        onError: () => toast({ title: `Failed to switch to object ${nextId}`, variant: "destructive", duration: 1500 }),
      }
    );
  }, [getAllObjectIdList, selectedObjects, uniqueIdsData, projectId, objectMutation, setSelectedObjects, handleFrameJump, toast]);

  useEffect(() => {
    if (!mounted) return;
    const keydownHandler = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab') {
        if (selectedObjects.length > 0) { e.preventDefault(); cycleSelectedObject(0); }
      } else if (e.code === 'CapsLock') {
        if (selectedObjects.length === 2) { e.preventDefault(); cycleSelectedObject(1); }
      }
    };
    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
  }, [mounted, selectedObjects.length, cycleSelectedObject]);

  const [showShortcutModal, setShowShortcutModal] = useState(false);
  const shortcuts = [
    { category: "Playback", items: [
      { action: "Play / Pause", key: "Space / P" },
      { action: "Next Frame", key: "→" },
      { action: "Previous Frame", key: "←" },
      { action: "Skip +5 sec", key: "L" },
      { action: "Skip -5 sec", key: "J" },
    ] },
    { category: "Navigation", items: [
      { action: "Jump +10 frames", key: "↑" },
      { action: "Jump -10 frames", key: "↓" },
      { action: "Go to Start", key: "S" },
      { action: "Go to End", key: "E" },
    ] },
    { category: "View", items: [
      { action: "Zoom In", key: "=" },
      { action: "Zoom Out", key: "-" },
      { action: "Toggle Trajectory", key: "T" },
      { action: "Auto Pan", key: "A" },
    ] },
    { category: "Selection", items: [
      { action: "Select as first object", key: "0-9" },
      { action: "Select as second object", key: "Ctrl+0-9" },
      { action: "Cycle first selected object", key: "Tab" },
      { action: "Cycle second selected object", key: "CapsLock" },
      { action: "Clear selection of object", key: "Backspace" },
      { action: "Next page (if >10 objects)", key: "Shift+0-9" },
    ] },
    { category: "Panels", items: [
      { action: "Open ID Table", key: "M" },
      { action: "Open Shortcuts", key: "?" },
      { action: "Open Confusion Table", key: "C" },
    ] },
  ];

  // --- Popup openers ---
  const openUniqueIdsPopup = useCallback(() => {
    if (!projectId) return;
    const url = `/popup/unique-ids?projectId=${projectId}`;
    const features = "width=1000,height=700,resizable=yes,scrollbars=yes";
    window.open(url, "_blank", features);
  }, [projectId]);

  const openConfusionPopup = useCallback(() => {
    if (!projectId) return;
    const url = `/popup/confusion?projectId=${projectId}`;
    const features = "width=1200,height=700,resizable=yes,scrollbars=yes";
    window.open(url, "_blank", features);
  }, [projectId]);

  // --- Message listener for popup -> main communication ---
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "UNIQUE_SELECT") {
        const { frame } = event.data;
        if (frame !== undefined) handleFrameJump(frame);
      } else if (event.data.type === "CONFUSION_JUMP") {
        handleFrameJump(event.data.frame);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleFrameJump]);

  // ========== KEYBOARD HANDLER (numeric shortcuts with slot selection) ==========
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (!video || document.activeElement?.closest(".your-controls-class")) return;

      // Backspace: clear selection
      // Inside the useEffect for keyboard shortcuts, at the start of the handler:
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);

      // Then, for Backspace:
      if (e.key === "Backspace") {
        if (isInputFocused) return;   // allow normal deletion in inputs
        e.preventDefault();
        if (selectedObjects.length === 2) {
          setSelectedObjects(prev => prev.slice(0, 1));
          toast({ title: "Cleared second object", duration: 1000 });
        } else if (selectedObjects.length === 1) {
          setSelectedObjects([]);
          toast({ title: "Cleared all selected objects", duration: 1000 });
        }
        return;
      }

      const key = e.key;
      if (/^[0-9]$/.test(key) && !e.altKey && !e.metaKey) {
        const activeEl = document.activeElement;
        // Allow typing in input/textarea fields
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
          return;
        }
        e.preventDefault();
        const numeric = parseInt(key, 10);
        const idx = numeric === 0 ? 9 : numeric - 1;  // 0 → index 9, 1→0, ..., 9→8

        let effectivePage = objectPage;
        if (e.shiftKey && totalPages > 1) {
          effectivePage = (objectPage + 1) % totalPages;
        }
        const pageStart = effectivePage * pageSize;
        const targetIndex = pageStart + idx;

        if (targetIndex < objectsInCurrentFrame.length) {
          const targetObj = objectsInCurrentFrame[targetIndex];
          // Determine slot: Ctrl for slot 1 (second), no modifier for slot 0 (first)
          const slot = e.ctrlKey ? 1 : 0;
          selectObjectForSlot(targetObj.id, slot);
        } else if (objectsInCurrentFrame.length > 0) {
          toast({ title: `No object assigned to key ${key} on this page`, duration: 1000 });
        }
        return;
      }

      // Existing keyboard shortcuts (Space, arrows, etc.) – unchanged
      switch (e.code) {
        case "Space": case "KeyP": e.preventDefault(); togglePlayPause(); break;
        case "ArrowLeft": e.preventDefault(); handleFrameStep(-1); break;
        case "ArrowRight": e.preventDefault(); handleFrameStep(1); break;
        case "KeyJ": e.preventDefault(); handleSkip(-5); break;
        case "KeyL": e.preventDefault(); handleSkip(5); break;
        case "ArrowUp": e.preventDefault(); if (e.shiftKey) setPlaybackRate(r => Math.min(16, +(r+0.1).toFixed(2))); else handleFrameStep(10); break;
        case "ArrowDown": e.preventDefault(); if (e.shiftKey) setPlaybackRate(r => Math.max(0.1, +(r-0.1).toFixed(2))); else handleFrameStep(-10); break;
        case "Equal": e.preventDefault(); handleZoomIn(); break;
        case "Minus": e.preventDefault(); handleZoomOut(); break;
        case "KeyT": e.preventDefault(); setShowTrajectory(p => !p); break;
        case "KeyA": e.preventDefault(); setAutoPanEnabled(p => !p); toast({ title: `Auto-pan ${!autoPanEnabled ? "enabled" : "disabled"}`, duration: 1000 }); break;
        case "KeyS": e.preventDefault(); if(selectedObjects.length) { const obj = selectedObjects[selectedObjects.length-1]; if(obj.start_frame !== undefined) handleFrameJump(obj.start_frame); else toast({ title: "Start frame not available", duration: 1500 }); } else toast({ title: "No object selected", duration: 1500 }); break;
        case "KeyE": e.preventDefault(); if(selectedObjects.length) { const obj = selectedObjects[selectedObjects.length-1]; if(obj.end_frame !== undefined) handleFrameJump(obj.end_frame); else toast({ title: "End frame not available", duration: 1500 }); } else toast({ title: "No object selected", duration: 1500 }); break;
        case "KeyM": e.preventDefault(); openUniqueIdsPopup(); break;
        case "KeyC": e.preventDefault(); openConfusionPopup(); break;
        case "Slash": e.preventDefault(); setShowShortcutModal(prev => !prev); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [video, togglePlayPause, handleSkip, handleFrameStep, handleZoomIn, handleZoomOut, selectedObjects, handleFrameJump, toast, mounted, autoPanEnabled, openUniqueIdsPopup, openConfusionPopup, objectsInCurrentFrame, objectPage, totalPages, pageSize, selectObjectForSlot]);

  if (!mounted || !originalFpsLoadedRef.current) {
    return (
      <div className="flex flex-col gap-2 w-full h-full">
        <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2 h-full">
          <div className="relative flex items-center justify-center mb-2 w-full h-full bg-black rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4 mx-auto"></div>
              <p className="text-white text-lg font-semibold">Loading video player...</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Exporting TRK file…</span>
          </div>
        </div>
      )}
      <div ref={rootContainerRef} className="flex flex-col gap-2 w-full h-full">
        <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2 h-auto">
          <div className="relative flex items-center justify-center mb-2 w-full bg-black">
            <div className="absolute top-2 left-2 bg-black bg-opacity-80 text-green-400 px-2 py-1 rounded text-xs z-50 font-mono">
              FPS: {stableFpsRef.current} | Frame: {currentFrame} | Time: {currentTime.toFixed(3)}s
              {isSeekingRef.current && " 🔄 SEEKING"}
              {pendingFrameVisual !== null && ` ⏳ PENDING: ${pendingFrameVisual}`}
              {isLoadingAnnotations && " 📥 LOADING"}
              {autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && " 🎯 AUTO-PAN"}
            </div>
            
            {isLoadingAnnotations && !isFrameStepSequenceRef.current && (
              <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4 mx-auto"></div>
                  <p className="text-white text-lg font-semibold">Loading annotations...</p>
                </div>
              </div>
            )}
            
            <Stage 
              ref={stageRef} 
              width={stageWidth} 
              height={stageHeight} 
              scaleX={stageScale.x} 
              scaleY={stageScale.y} 
              x={stagePos.x} 
              y={stagePos.y} 
              onWheel={handleWheel} 
              onMouseDown={handleMouseDown} 
              onMouseMove={handleMouseMove} 
              onMouseUp={handleMouseUp} 
              onMouseLeave={handleMouseLeave} 
              onContextMenu={handleContextMenu} 
              onTouchMove={handleTouchMove} 
              onTouchEnd={handleTouchEnd} 
              draggable={false}
            >
              <Layer ref={layerRef}>
                {video && (
                  <KonvaImage 
                    image={video} 
                    x={offsetX} 
                    y={offsetY} 
                    width={displayWidth} 
                    height={displayHeight} 
                    listening={false} 
                  />
                )}
                {showTrajectory && allObjectIds.map(oid => {
                  const points = getTrajectoryPointsUpToCurrent(oid, currentFrame+50);
                  if(points.length < 2) return null;
                  return (
                    <Line 
                      key={`traj-${oid}`} 
                      points={points.map((p,i)=> i%2===0 ? mapX(p) : mapY(p))} 
                      stroke={getObjectColor(oid)} 
                      strokeWidth={getTrajectoryWidth()} 
                      opacity={0.6} 
                      lineCap="round" 
                      lineJoin="round" 
                    />
                  );
                })}
                {Array.from(annotationMap.values())
                  .filter(a => a.frame_id === currentFrame)
                  .map((a, annotationIndex) => {
                  const color = getObjectColor(a.object_id);
                  const isSelected = selectedObjects.some(obj => obj.object_id === a.object_id);
                  const xs = a.coordinates.map(([x])=>mapX(x));
                  const ys = a.coordinates.map(([,y])=>mapY(y));
                  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
                  const boxWidth = maxX-minX, boxHeight = maxY-minY;
                  return (
                    <Group 
                      key={`${a.object_id}-${a.frame_id}-${annotationIndex}`}
                      onClick={() => {
                        if(selectedObjects.some(obj => obj.object_id === a.object_id)) { 
                          toast({ title: "Object already selected", duration: 1500 }); 
                          return; 
                        }
                        if(selectedObjects.length >= 2) { 
                          toast({ title: "Maximum 2 selections allowed", duration: 1500 }); 
                          return; 
                        }
                        if(!projectId) return;
                        objectMutation.mutate({ 
                          projectId: Number(projectId), 
                          objectId: a.object_id, 
                          frameId: a.frame_id 
                        }, { 
                          onSuccess: (meta) => { 
                            setSelectedObjects(prev => [...prev, { 
                              object_id: a.object_id, 
                              frame_id: a.frame_id, 
                              start_frame: meta.data.start_frame, 
                              end_frame: meta.data.end_frame, 
                              is_inside: meta.data.is_inside 
                            }]); 
                            toast({ title: "Object selected", description: `ID: ${a.object_id}`, duration: 1500 });
                            if (autoPanEnabled && currentZoom > 1.1) setTimeout(() => panToSelectedObject(), 100);
                          } 
                        });
                      }}
                    >
                      {a.coordinates.map(([x,y], idx) => (
                        <Circle 
                          key={`circle-${a.object_id}-${a.frame_id}-${idx}`}
                          x={mapX(x)} 
                          y={mapY(y)} 
                          radius={getCircleRadius()} 
                          fill={color} 
                        />
                      ))}
                      <Text 
                        x={mapX(a.coordinates[0][0])+getLabelOffset()} 
                        y={mapY(a.coordinates[0][1])-getLabelOffset()} 
                        text={`id:${a.object_id}`} 
                        fontSize={getIdFontSize()} 
                        fill={color} 
                        fontStyle="bold" 
                        shadowColor="black" 
                        shadowBlur={2} 
                      />
                      {isSelected && (
                        <Rect 
                          x={minX-5} 
                          y={minY-5} 
                          width={boxWidth+10} 
                          height={boxHeight+10} 
                          stroke={color} 
                          strokeWidth={getBBoxStrokeWidth()} 
                          cornerRadius={4} 
                          dash={[6,4]} 
                        />
                      )}
                    </Group>
                  );
                })}
              </Layer>
            </Stage>
            
            {/* Shortcut Panel (visible only when paused) */}
            {!isPlaying && objectsInCurrentFrame.length > 0 && (
              <div className="absolute bottom-20 left-2 bg-black/80 text-white p-3 rounded-lg z-50 backdrop-blur-sm pointer-events-none">
                <div className="text-xs font-mono mb-2">
                  Objects in frame ({objectPage+1}/{totalPages || 1})
                  {totalPages > 1 && <span className="ml-2 text-yellow-400">(Shift+0‑9 to change page)</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="font-bold text-yellow-300 text-xs">Key</div>
                  <div className="font-bold text-yellow-300 text-xs">Object</div>
                  {currentPageObjects.map((obj, idx) => {
                    const keyLabel = idx === 9 ? '0' : (idx+1).toString();
                    return (
                      <React.Fragment key={obj.id}>
                        <div className="font-mono font-bold text-yellow-300">{keyLabel}</div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: obj.color }} />
                          <span>ID {obj.id}</span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="text-[10px] text-gray-400 mt-2 text-center">
                    Page {objectPage+1} of {totalPages}
                  </div>
                )}
                <div className="text-[10px] text-yellow-400 mt-2 text-center">
                  💡 Ctrl+0-9: select as second obj
                </div>
              </div>
            )}


            <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg text-slate-700 px-3 py-1 rounded-xl text-sm font-medium">
              {(stageScale.x*100).toFixed(0)}%
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl">
              <Button 
                variant={autoPanEnabled ? "default" : "ghost"} 
                size="sm"
                onClick={() => setAutoPanEnabled(!autoPanEnabled)}
                className={`h-10 px-4 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md ${autoPanEnabled ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}                
                title="Auto-pan to selected object when zoomed in (Press 'A' key)"
              >
                <Target className="w-3 h-3 mr-1" />
                {autoPanEnabled ? "Auto-Pan ON" : "Auto-Pan OFF"}
              </Button>
              {downloadUrl ? (
                <Button 
                  className="bg-green-600 text-white text-[13px] px-3 py-2 rounded-[5px] flex items-center gap-2 hover:bg-green-600" 
                  onClick={() => { 
                    const link = document.createElement("a"); 
                    link.href = downloadUrl; 
                    link.download = `project_${projectId}_v${trkVersion}.trk`; 
                    link.click(); 
                    setDownloadUrl(null); 
                  }}
                >
                  <Image src="/images/download.svg" alt="Download" width={15} height={15} /> 
                  Download TRK 
                  <Image src="/images/downArrow.svg" alt="Down Arrow" width={13} height={7} />
                </Button>
              ) : (
                <Button 
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white h-10 px-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
                  disabled={!projectId} 
                  onClick={() => exportMutation.mutate()}
                >
                  <Image src="/images/rightArrow.svg" alt="Right Arrow" width={15} height={15} /> 
                  Export 
                  <Image src="/images/exportDownArrow.svg" alt="Export Down Arrow" width={13} height={7} />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={openUniqueIdsPopup}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-md hover:shadow-lg transition-all duration-200 rounded-full"
              >
                i
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowShortcutModal(true)}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all duration-200 rounded-full"
              >
                ?
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={openConfusionPopup}
                className="bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-lg transition-all duration-200 rounded-full"
              >
                C
              </Button>
            </div>
            <div className="absolute top-2 left-1 text-white px-2 py-1 rounded text-xs">
              Frame: {currentFrame}
            </div>
          </div>
          
          {/* VIDEO CONTROLS (unchanged) */}
          <Separator />
          <div className="flex flex-col pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="icon" variant="ghost" onClick={() => undoMutation.mutate()} disabled={!canUndo || !projectId}>
                <Undo className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => redoMutation.mutate()} disabled={!canRedo || !projectId}>
                <Redo className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => handleFrameStep(-1)}>
                <SkipBack />
              </Button>
              <Button size="icon" variant="ghost" onClick={togglePlayPause} disabled={!video}>
                {isPlaying ? <Pause /> : <Play />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => handleFrameStep(1)}>
                <SkipForward />
              </Button>
              <Slider 
                value={[dragTime ?? currentTime]} 
                max={duration || 100} 
                step={0.01} 
                onValueChange={handleSliderChange} 
                onValueCommit={(val) => { handleSeek(val[0]); setDragTime(null); }} 
                className="flex-1 min-w-[240px]" 
              />
              <span className="text-[11px] text-[#5A5A5A] px-2 whitespace-nowrap tabular-nums">
                {formatTime(dragTime ?? currentTime)} / {formatTime(duration)}
              </span>
              <Button size="icon" variant="ghost" onClick={handleZoomOut}>
                <ZoomOut className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleResetZoom} className="px-2 text-xs font-semibold">
                Reset
              </Button>
              <Button size="icon" variant="ghost" onClick={handleZoomIn}>
                <ZoomIn className="w-3 h-3" />
              </Button>
              <Button size="sm" variant={showTrajectory ? "default" : "ghost"} onClick={() => setShowTrajectory(!showTrajectory)} className="px-2 text-xs font-semibold">
                Track
              </Button>
              <div className="flex items-center gap-1 ml-1">
                <span className="text-[11px] text-[#5A5A5A] whitespace-nowrap">Frame</span>
                <Input 
                  type="number" 
                  placeholder="0" 
                  min="0" 
                  max={video?.duration ? Math.floor(video.duration * stableFpsRef.current) : undefined} 
                  className="w-20 h-8 text-xs px-2" 
                  value={frameInput} 
                  onChange={(e) => setFrameInput(e.target.value)} 
                  onKeyDown={(e) => { 
                    if(e.key==="Enter"){ 
                      const f=parseInt(e.currentTarget.value,10); 
                      if(!isNaN(f)) handleFrameJump(f); 
                    } 
                  }} 
                />
                <Button size="icon" variant="ghost" onClick={() => { const f=parseInt(frameInput,10); if(!isNaN(f)) handleFrameJump(f); }} className="h-8 w-8">
                  <SkipForward className="w-3 h-3" />
                </Button>
              </div>
              <div className="relative">
                <button className="flex items-center gap-1 text-xs px-2 py-1 rounded" onClick={() => setShowSpeed(v=>!v)}>
                  <Clock className="w-4 h-4" />
                  <span>{playbackRate.toFixed(2).replace(/\.00$/,"")}x</span>
                  <ChevronRight className={`w-3 h-3 transition-transform ${showSpeed?"rotate-90":""}`} />
                </button>
                {showSpeed && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col items-center bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 w-16 z-50 shadow-xl">
                    <div className="text-white text-[11px] mb-1 font-bold">
                      {playbackRate.toFixed(2).replace(/\.00$/,"")}x
                    </div>
                    <div className="relative h-32 flex items-center">
                      <input 
                        type="range" 
                        min="0.1" 
                        max="16" 
                        step="0.1" 
                        value={playbackRate} 
                        onChange={(e)=>setPlaybackRate(parseFloat(e.target.value))} 
                        className="absolute top-0 left-1/2 -translate-x-1/2 h-32 w-6 appearance-none bg-transparent [writing-mode:vertical-lr] [direction:rtl]" 
                        style={{ 
                          background: `linear-gradient(to top, #3b82f6 0%, #3b82f6 ${((playbackRate-0.1)/(16-0.1))*100}%, #374151 ${((playbackRate-0.1)/(16-0.1))*100}%, #374151 100%)`, 
                          borderRadius:"999px" 
                        }} 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TIMELINE 1: SELECTED OBJECTS COORDINATES */}
          {selectedObjects.length > 0 && timelinePoints.length > 0 && (
            <div className="px-2 py-1 bg-gray-900 rounded-md mt-2">
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <span className="text-xs text-gray-300">
                  Object Coordinates Timeline (selected: {selectedObjects.map(o => o.object_id).join(', ')})
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={coordinateMode}
                    onChange={(e) => setCoordinateMode(e.target.value as "x" | "y" | "xy")}
                    className="bg-gray-800 text-white text-xs rounded-md px-2 py-1 border border-gray-600"
                  >
                    <option value="x">X Axis</option>
                    <option value="y">Y Axis</option>
                    <option value="xy">X + Y</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">Window:</span>
                    <input
                      type="number"
                      min="10"
                      max={getTotalFrames()}
                      step="10"
                      value={timelineWindowInput}
                      onChange={(e) => setTimelineWindowInput(e.target.value)}
                      className="w-20 h-7 bg-gray-800 text-white text-xs rounded-md px-2 border border-gray-600"
                    />
                    <button
                      onClick={() => {
                        let newVal = parseInt(timelineWindowInput, 10);
                        const total = getTotalFrames();
                        if (isNaN(newVal)) newVal = 300;
                        newVal = Math.min(Math.max(newVal, 10), total);
                        setTimelineWindow(newVal/2);
                        setTimelineWindowInput(newVal.toString());
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded-md"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
              <div 
                ref={timelineContainerRef}
                className="overflow-x-auto cursor-grab active:cursor-grabbing"
                style={{ maxWidth: '100%' }}
              >
                <div style={{ minWidth: '800px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      onClick={handleChartClick}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis
                        dataKey="frame"
                        type="number"
                        domain={['auto', 'auto']}
                        tick={{ fill: '#ccc', fontSize: 10 }}
                        tickFormatter={(frame) => frame.toString()}
                        label={{ value: 'Frame', position: 'insideBottom', offset: -5, fill: '#aaa', fontSize: 10 }}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fill: '#ccc', fontSize: 10 }}
                        label={{
                          value: coordinateMode === 'x' ? 'X Coordinate' : coordinateMode === 'y' ? 'Y Coordinate' : 'X / Y',
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#aaa',
                          fontSize: 10,
                        }}
                      />
                      <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => `Frame: ${label}`} />
                      <ReferenceLine x={currentFrame} stroke="#ff3333" strokeWidth={2} label={{ value: '▶ Current', position: 'top', fill: '#ff3333', fontSize: 11 }} />
                      {uniqueObjectIds.map((objectId) => {
                        const color = getObjectColor(objectId);
                        const lines = [];
                        if (coordinateMode === 'x' || coordinateMode === 'xy') {
                          lines.push(
                            <RechartsLine
                              key={`${objectId}-x`}
                              type="linear"
                              dataKey={`obj_${objectId}_x`}
                              stroke={color}
                              strokeWidth={1.5}
                              dot={false}
                              activeDot={{ r: 4, fill: color }}
                              isAnimationActive={false}
                              connectNulls
                            />
                          );
                        }
                        if (coordinateMode === 'y' || coordinateMode === 'xy') {
                          lines.push(
                            <RechartsLine
                              key={`${objectId}-y`}
                              type="linear"
                              dataKey={`obj_${objectId}_y`}
                              stroke={color}
                              strokeWidth={1.5}
                              strokeDasharray={coordinateMode === 'xy' ? '4 3' : undefined}
                              dot={false}
                              activeDot={{ r: 4, fill: color }}
                              isAnimationActive={false}
                              connectNulls
                            />
                          );
                        }
                        return lines;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="text-center text-xs text-gray-400 mt-1">
                💡 Click or drag chart to seek | Adjust window size
              </div>
            </div>
          )}

          {/* TIMELINE 2: ALL OBJECTS START/END */}
          {isLoadingUnique && !uniqueIdsData && (
            <div className="px-2 py-1 bg-gray-800 rounded-md mt-2 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              <span>Loading object start/end data...</span>
            </div>
          )}
          {!isLoadingUnique && (!uniqueIdsData || (uniqueIdsData.data?.objects?.length ?? 0) === 0) && (
            <div className="px-2 py-1 bg-gray-800 rounded-md mt-2 text-center text-xs text-gray-400">
              No objects found in the current frame window.
            </div>
          )}
          {uniqueIdsData && (uniqueIdsData.data?.objects?.length ?? 0) > 0 && (
            <ObjectRangesTimeline
              objects={uniqueIdsData.data.objects!}
              currentFrame={currentFrame}
              onSeek={handleFrameJump}
              getObjectColor={getObjectColor}
              totalFrames={getTotalFrames()}
              visibleWindow={timeline2Window}
              onWindowChange={setTimeline2Window}
              windowInput={timeline2WindowInput}
              setWindowInput={setTimeline2WindowInput}
            />
          )}
        </Card>
      </div>
      {showShortcutModal && (
        <div className="fixed inset-0 z-50 flex justify-end items-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowShortcutModal(false)}
          />
          <div className="relative w-[400px] max-h-[80vh] mr-4 bg-white rounded-xl shadow-xl flex flex-col animate-slide-in">
            <div className="flex justify-between items-center p-3 border-b">
              <p className="font-semibold text-sm">Keyboard Shortcuts</p>
              <Button size="sm" onClick={() => setShowShortcutModal(false)}>Close</Button>
            </div>
            <div className="overflow-y-auto p-3 space-y-4">
              {shortcuts.map((group, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-gray-500 mb-2">{group.category}</p>
                  <div className="space-y-1">
                    {group.items.map((item, j) => (
                      <div key={j} className="flex justify-between px-3 py-2 bg-gray-50 rounded">
                        <span className="text-sm">{item.action}</span>
                        <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded">{item.key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}