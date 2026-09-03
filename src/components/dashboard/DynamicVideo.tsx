'use client';
import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from "react";
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
  ZoomIn, ZoomOut, Undo, Redo, Target, RefreshCw, Palette,
} from "lucide-react";
import {
  Stage, Layer, Image as KonvaImage, Text, Circle, Group, Rect, Line,
} from "react-konva";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getObjectData } from "@/lib/api/getObjectData";
import { getFrameRangeData } from "@/lib/api/getFrameRangeData";
import { undoAction, redoAction } from "@/lib/api/undoRedo";
import { getActivityLogs } from "@/lib/api/getActivityLogs";
import { getTimelineData } from "@/lib/api/getTimelineData";
import { getUniqueIdsData, UniqueIdsResponse, UniqueIdObject } from "@/lib/api/getUniqueIdsData";
import { exportTrk } from "@/lib/api/exportTrk";
import {
  getTrajectoryClipSuggestions,
  TrajectoryClipSuggestion,
} from "@/lib/api/getTrajectoryClipSuggestions";
import { getTrajectoryGaps, TrajectoryGap } from "@/lib/api/getTrajectoryGaps";
import {
  getTrajectoryLengths,
  TrajectoryLengthOrdering,
} from "@/lib/api/getTrajectoryLengths";
import { getNextBreak, NextBreakError } from "@/lib/api/getNextBreak";
import {
  SYSTEM_GUIDE_STEP_EVENT,
  type SystemGuideStepEventDetail,
} from "@/features/system-guide/events";
import {
  getTrajectoryLinkingSuggestions,
  TrajectoryLinkingSuggestion,
} from "@/lib/api/getTrajectoryLinkingSuggestions";
import {
  getCoordinateDistance,
  NEXT_LINK_MAX_DISTANCE_PX,
  NEXT_LINK_START_THRESHOLD_FRAMES,
} from "@/lib/trajectoryLinking";
import { Annotation, TrajectoryFrame, TrajectoryMap, SelectedObjectProps } from "@/types";
import {
  LineChart, Line as RechartsLine, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceArea, ReferenceLine,
} from "recharts";

type DynamicVideoProps = SelectedObjectProps & {
  clipStartFrame: number | null;
  clipEndFrame: number | null;
  setClipStartFrame: React.Dispatch<React.SetStateAction<number | null>>;
  setClipEndFrame: React.Dispatch<React.SetStateAction<number | null>>;
};

const MIN_PLAYBACK_RATE = 0.1;
const MAX_PLAYBACK_RATE = 16;
const DEFAULT_TIMELINE_HEIGHT = 176;
const MIN_TIMELINE_HEIGHT = 140;
const MIN_VIDEO_HEIGHT = 180;

// Keep normal speed centered while retaining logarithmic control on each side.
const playbackRateToSliderPosition = (rate: number) => {
  const clampedRate = Math.min(Math.max(rate, MIN_PLAYBACK_RATE), MAX_PLAYBACK_RATE);
  if (clampedRate <= 1) {
    return 50 * (Math.log(clampedRate / MIN_PLAYBACK_RATE) / Math.log(1 / MIN_PLAYBACK_RATE));
  }
  return 50 + 50 * (Math.log(clampedRate) / Math.log(MAX_PLAYBACK_RATE));
};

const sliderPositionToPlaybackRate = (position: number) => {
  const clampedPosition = Math.min(Math.max(position, 0), 100);
  const rate = clampedPosition <= 50
    ? MIN_PLAYBACK_RATE * Math.pow(1 / MIN_PLAYBACK_RATE, clampedPosition / 50)
    : Math.pow(MAX_PLAYBACK_RATE, (clampedPosition - 50) / 50);
  return Math.round(rate * 100) / 100;
};

const formatFps = (value: number) => Number(value.toFixed(2)).toString();

// Darker annotation colors remain visible on white/light video backgrounds.
const LIGHT_VIDEO_COLORS = [
  "#B91C1C", "#166534", "#1D4ED8", "#7E22CE", "#BE185D", "#0F766E",
  "#9A3412", "#4338CA", "#3F6212", "#A21CAF", "#0369A1", "#92400E",
  "#6B21A8", "#047857", "#C2410C", "#1E40AF", "#9F1239", "#115E59",
  "#713F12", "#4C1D95", "#065F46", "#991B1B", "#0E7490", "#6D28D9",
];

// Brighter annotation colors remain visible on dark/gray video backgrounds.
const DARK_VIDEO_COLORS = [
  "#FF5252", "#69F0AE", "#40C4FF", "#FFD740", "#E040FB", "#18FFFF",
  "#FFAB40", "#B388FF", "#CCFF90", "#FF80AB", "#80D8FF", "#FFFF8D",
  "#EA80FC", "#64FFDA", "#FF9E80", "#8C9EFF", "#FF8A80", "#A7FFEB",
  "#FFE57F", "#B39DDB", "#00E676", "#FF6E6E", "#84FFFF", "#B2FF59",
];

// ==================== SHARED FRAME MAPPING (UNCLAMPED) ====================
function useFrameMapping(
  containerWidth: number,
  currentFrame: number,
  halfWindow: number,
  leftPadding = 30,
  rightPadding = 30
) {
  const minFrame = currentFrame - halfWindow;
  const maxFrame = currentFrame + halfWindow;
  const plotWidth = Math.max(1, containerWidth - leftPadding - rightPadding);

  const frameToX = useCallback(
    (frame: number) => {
      const frac = (frame - minFrame) / (maxFrame - minFrame);
      const clampedFrac = Math.min(Math.max(frac, 0), 1);
      return leftPadding + clampedFrac * plotWidth;
    },
    [minFrame, maxFrame, plotWidth, leftPadding]
  );

  const xToFrame = useCallback(
    (x: number) => {
      const clampedX = Math.min(Math.max(x, leftPadding), leftPadding + plotWidth);
      const frac = (clampedX - leftPadding) / plotWidth;
      return minFrame + frac * (maxFrame - minFrame);
    },
    [minFrame, maxFrame, plotWidth, leftPadding]
  );

  return { frameToX, xToFrame, minFrame, maxFrame, plotWidth };
}

// ==================== OBJECT RANGES TIMELINE (USES SHARED MAPPING) ====================
const ObjectRangesTimeline = ({
  objects,
  currentFrame,
  onSeek,
  getObjectColor,
  totalFrames,
  halfWindow,
  onWindowChange,
  windowInput,
  setWindowInput,
  showControls = true,
  showXAxisLabels = true,
  compact = false,
  frameToX,
  minFrame,
  maxFrame,
  plotWidth,
  leftPadding,
  rightPadding,
}: {
  objects: { id: number; start_frame: number; end_frame: number }[];
  currentFrame: number;
  onSeek: (frame: number) => void;
  getObjectColor: (id: number) => string;
  totalFrames: number;
  halfWindow: number;
  onWindowChange: (newHalfWindow: number) => void;
  windowInput: string;
  setWindowInput: (val: string) => void;
  showControls?: boolean;
  showXAxisLabels?: boolean;
  compact?: boolean;
  frameToX: (frame: number) => number;
  minFrame: number;
  maxFrame: number;
  plotWidth: number;
  leftPadding: number;
  rightPadding: number;
}) => {
  const chartHeight = compact ? 30 : 60;
  const padding = compact
    ? { left: leftPadding, right: rightPadding, top: 2, bottom: 4 }
    : { left: leftPadding, right: rightPadding, top: 5, bottom: 15 };

  const filteredObjects = useMemo(() => {
    return objects.filter(obj =>
      (obj.start_frame >= minFrame && obj.start_frame <= maxFrame) ||
      (obj.end_frame >= minFrame && obj.end_frame <= maxFrame)
    );
  }, [objects, minFrame, maxFrame]);

  const markerY = padding.top + chartHeight / 2;

  const handlePointClick = (frame: number) => onSeek(frame);

  if (filteredObjects.length === 0) {
    if (compact) {
      return (
        <div className="bg-slate-900 rounded-md p-1 text-xs text-gray-500 text-center h-full flex items-center justify-center w-full">
          No object ranges in window
        </div>
      );
    }
    return (
      <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-2xl p-2 text-sm w-full">
        No object start/end markers in the visible window (frames {Math.round(minFrame)}–{Math.round(maxFrame)}).
        Total objects: {objects.length}. Try increasing the window size.
      </div>
    );
  }

  return (
    <div className={compact ? "relative bg-slate-900 rounded-md h-full w-full" : "bg-slate-900 border border-slate-700 rounded-xl p-2 w-full"}>
      {showControls && (
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <span className="text-xs text-gray-300">Start/End Timeline:</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">Visible frames:</span>
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
                  if (isNaN(newVal) || newVal < 10) newVal = 500;
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
      )}
      <div className="w-full h-full">
        <svg
          viewBox={`0 0 ${plotWidth + padding.left + padding.right} ${chartHeight + padding.top + padding.bottom}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          <rect x={0} y={0} width="100%" height="100%" fill="#1f2937" rx={compact ? "0" : "4"} />
          <line x1={padding.left} y1={markerY} x2={padding.left + plotWidth} y2={markerY} stroke="#374151" strokeWidth="0.5" strokeDasharray="4 2" />
          <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + plotWidth} y2={padding.top + chartHeight} stroke="#6b7280" strokeWidth="1" />
          {showXAxisLabels && (() => {
            const step = Math.max(1, Math.floor((maxFrame - minFrame) / 10));
            const labels = [];
            for (let f = minFrame; f <= maxFrame; f += step) {
              const x = frameToX(f);
              labels.push(
                <text
                  key={`label-${f}`}
                  x={x}
                  y={padding.top + chartHeight + 12}
                  fill="#9ca3af"
                  fontSize="8"
                  textAnchor="middle"
                >
                  {Math.round(f)}
                </text>
              );
            }
            return labels;
          })()}
          {/* Red current-frame line - solid */}
          {!compact && (
            <line
              x1={frameToX(currentFrame)}
              y1={padding.top}
              x2={frameToX(currentFrame)}
              y2={padding.top + chartHeight}
              stroke="#ff3333"
              strokeWidth="1.5"
            />
          )}
          {filteredObjects.map(obj => {
            const color = getObjectColor(obj.id);
            const showStart = obj.start_frame >= minFrame && obj.start_frame <= maxFrame;
            const showEnd = obj.end_frame >= minFrame && obj.end_frame <= maxFrame;
            const isOverlap = showStart && showEnd && Math.abs(obj.start_frame - obj.end_frame) < 5;
            const startX = frameToX(obj.start_frame);
            const endX = frameToX(obj.end_frame);
            const baseY = markerY;
            const startOffsetY = isOverlap ? -8 : 0;
            const endOffsetY = isOverlap ? 8 : 0;

            return (
              <g key={obj.id}>
                {showStart && (
                  <rect
                    x={startX - 5}
                    y={baseY + startOffsetY - 5}
                    width="2"
                    height="10"
                    rx="2"
                    ry="2"
                    fill={color}
                    style={{ cursor: "pointer" }}
                    onClick={() => handlePointClick(obj.start_frame)}
                  >
                    <title>Object {obj.id} - Start frame: {obj.start_frame}</title>
                  </rect>
                )}
                {showEnd && (
                  <rect
                    x={endX - 5}
                    y={baseY + endOffsetY - 5}
                    width="2"
                    height="10"
                    rx="2"
                    ry="2"
                    fill={color}
                    style={{ cursor: "pointer" }}
                    onClick={() => handlePointClick(obj.end_frame)}
                  >
                    <title>Object {obj.id} - End frame: {obj.end_frame}</title>
                  </rect>
                )}
              </g>
            );
          })}
        </svg>
        {compact && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-[#ff3333]"
            style={{
              left: `calc(${leftPadding}px + (100% - ${leftPadding + rightPadding}px) / 2)`,
              transform: 'translateX(-1px)',
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function DynamicVideo({
  selectedObjects,
  setSelectedObjects,
  clipStartFrame,
  clipEndFrame,
  setClipStartFrame,
  setClipEndFrame,
}: DynamicVideoProps) {
  const queryClient = useQueryClient(); // for invalidating queries

  // All state and refs
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
  const breakNavigationHistoryRef = useRef<number[]>([]);
  const breakNavigationObjectRef = useRef<number | null>(null);
  const activeBreakRef = useRef<{
    selectedObjectId: number;
    breakStart: number;
    breakEnd: number;
  } | null>(null);
  const isBreakNavigationPendingRef = useRef(false);
  const suggestionRequestIdRef = useRef(0);
  const [linkingSuggestions, setLinkingSuggestions] = useState<{
    selectedObjectId: number;
    breakStart: number;
    breakEnd: number;
    items: TrajectoryLinkingSuggestion[];
  } | null>(null);
  const [areLinkingSuggestionsLoading, setAreLinkingSuggestionsLoading] = useState(false);

  const stableFpsRef = useRef<number>(40);
  const originalFpsLoadedRef = useRef<boolean>(false);

  const [stageScale, setStageScale] = useState({ x: 1, y: 1 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(1);

  const [zoomIndicatorVisible, setZoomIndicatorVisible] = useState(false);
  const zoomIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [bboxScale, setBboxScale] = useState(1);

  const [skeletonGraph, setSkeletonGraph] = useState<[number, number][]>([]);
  const [showSkeleton, setShowSkeleton] = useState(true);

  const [autoInterpolation, setAutoInterpolation] = useState(false);
  const [isAutoInterpolationPreferenceLoaded, setIsAutoInterpolationPreferenceLoaded] = useState(false);

  useEffect(() => {
    setAutoInterpolation(sessionStorage.getItem("autoInterpolation") === "true");
    setIsAutoInterpolationPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!isAutoInterpolationPreferenceLoaded) return;
    sessionStorage.setItem("autoInterpolation", String(autoInterpolation));
  }, [autoInterpolation, isAutoInterpolationPreferenceLoaded]);

  useEffect(() => {
    if (!mounted) return;
    const stored = sessionStorage.getItem("skeleton_graph");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setSkeletonGraph(parsed);
      } catch (e) {
        console.warn("Failed to parse skeleton_graph", e);
      }
    }
  }, [mounted]);

  const showZoomIndicator = useCallback(() => {
    setZoomIndicatorVisible(true);
    if (zoomIndicatorTimeoutRef.current) clearTimeout(zoomIndicatorTimeoutRef.current);
    zoomIndicatorTimeoutRef.current = setTimeout(() => {
      setZoomIndicatorVisible(false);
    }, 2000);
  }, []);

  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const { toast } = useToast();
  const safeToast = useCallback((...args: Parameters<typeof toast>) => {
    setTimeout(() => toast(...args), 0);
  }, [toast]);

  const [clipSuggestions, setClipSuggestions] = useState<TrajectoryClipSuggestion[]>([]);
  const [areClipSuggestionsLoading, setAreClipSuggestionsLoading] = useState(false);
  const [trajectoryGaps, setTrajectoryGaps] = useState<TrajectoryGap[]>([]);
  const [areTrajectoryGapsLoading, setAreTrajectoryGapsLoading] = useState(false);
  const [activeTrajectoryGap, setActiveTrajectoryGap] = useState<TrajectoryGap | null>(null);
  const trajectoryGapIndexRef = useRef(0);

  useEffect(() => {
    const selected = selectedObjects.length === 1 ? selectedObjects[0] : null;
    trajectoryGapIndexRef.current = 0;
    setActiveTrajectoryGap(null);
    if (!projectId || !selected) {
      setTrajectoryGaps([]);
      setAreTrajectoryGapsLoading(false);
      return;
    }

    const controller = new AbortController();
    setTrajectoryGaps([]);
    setAreTrajectoryGapsLoading(true);
    getTrajectoryGaps(projectId, selected.object_id, {
      minGap: 2,
      limit: 20,
      signal: controller.signal,
    })
      .then(data => {
        if (!controller.signal.aborted) {
          setTrajectoryGaps([...data.gaps].sort((a, b) => b.gap - a.gap));
        }
      })
      .catch((error: Error) => {
        if (controller.signal.aborted || error.name === "AbortError") return;
        setTrajectoryGaps([]);
        safeToast({
          title: "Could not load trajectory gaps",
          description: error.message,
          variant: "destructive",
          duration: 1800,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setAreTrajectoryGapsLoading(false);
      });

    return () => controller.abort();
  }, [projectId, safeToast, selectedObjects]);

  useEffect(() => {
    const selected = selectedObjects.length === 1 ? selectedObjects[0] : null;
    if (
      !projectId ||
      !selected ||
      selected.start_frame === undefined ||
      selected.end_frame === undefined
    ) {
      setClipSuggestions([]);
      setAreClipSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    setClipSuggestions([]);
    setAreClipSuggestionsLoading(true);
    getTrajectoryClipSuggestions(projectId, {
      object_id: selected.object_id,
      start_frame: selected.start_frame,
      end_frame: selected.end_frame,
      limit: 5,
    }, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setClipSuggestions(data.suggestions.slice(0, 5));
      })
      .catch((error: Error) => {
        if (controller.signal.aborted || error.name === "AbortError") return;
        setClipSuggestions([]);
        safeToast({
          title: "Could not load clip suggestions",
          description: error.message,
          variant: "destructive",
          duration: 1800,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setAreClipSuggestionsLoading(false);
      });

    return () => controller.abort();
  }, [projectId, safeToast, selectedObjects]);

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
  const pendingEndMatchObjectRef = useRef<number | null>(null);
  const nextFrameLinkMatchesRef = useRef<{
    sourceObjectId: number;
    matches: UniqueIdObject[];
  } | null>(null);
  const uniqueIdsAbortRef = useRef<AbortController | null>(null);
  const loadedUniqueRangesRef = useRef<{ start: number; end: number }[]>([]);
  const pendingUniqueRangesRef = useRef<Set<string>>(new Set());
  const uniqueDataCacheRef = useRef<Map<string, any[]>>(new Map());
  const nextFrameLinkMatches = useMemo(() => {
    if (selectedObjects.length !== 1) return [];
    const selected = selectedObjects[0];
    const selectedEnd = selected.end_frame ?? selected.start_frame;
    if (selectedEnd === undefined) return [];
    const windowStart = selectedEnd + 1;
    const windowEnd = selectedEnd + NEXT_LINK_START_THRESHOLD_FRAMES;
    const source = uniqueIdsData?.data?.objects.find(object => object.id === selected.object_id);
    if (!source?.end_coordinate) return [];
    return (uniqueIdsData?.data?.objects ?? [])
      .map(object => ({
        ...object,
        linkDistance: getCoordinateDistance(source.end_coordinate, object.start_coordinate),
      }))
      .filter(object =>
        object.id !== selected.object_id &&
        object.start_frame >= windowStart &&
        object.start_frame <= windowEnd &&
        object.linkDistance !== null &&
        object.linkDistance <= NEXT_LINK_MAX_DISTANCE_PX
      )
      .sort((a, b) =>
        a.start_frame - b.start_frame ||
        (a.linkDistance ?? Infinity) - (b.linkDistance ?? Infinity) ||
        a.id - b.id
      )
      .slice(0, 5);
  }, [selectedObjects, uniqueIdsData]);

  useEffect(() => {
    if (selectedObjects.length === 1 && nextFrameLinkMatches.length > 0) {
      nextFrameLinkMatchesRef.current = {
        sourceObjectId: selectedObjects[0].object_id,
        matches: nextFrameLinkMatches,
      };
    }
  }, [nextFrameLinkMatches, selectedObjects]);

  const visibleNextFrameLinkMatches = nextFrameLinkMatches.length > 0
    ? nextFrameLinkMatches
    : selectedObjects.length === 2 &&
        nextFrameLinkMatchesRef.current?.sourceObjectId === selectedObjects[0].object_id &&
        nextFrameLinkMatchesRef.current.matches.some(match => match.id === selectedObjects[1].object_id)
      ? nextFrameLinkMatchesRef.current.matches
      : [];

  useEffect(() => {
    const selected = selectedObjects[0];
    const candidate = nextFrameLinkMatches[0];
    if (
      pendingEndMatchObjectRef.current === null ||
      selectedObjects.length !== 1 ||
      selected?.object_id !== pendingEndMatchObjectRef.current ||
      !candidate
    ) return;

    pendingEndMatchObjectRef.current = null;
    setSelectedObjects([
      selected,
      {
        object_id: candidate.id,
        frame_id: candidate.start_frame,
        start_frame: candidate.start_frame,
        end_frame: candidate.end_frame,
      },
    ]);
    safeToast({
      title: `Object ${candidate.id} selected for linking`,
      description: `Top next match · starts at frame ${candidate.start_frame}`,
      duration: 1800,
    });
  }, [nextFrameLinkMatches, safeToast, selectedObjects, setSelectedObjects]);

  const [timelinePoints, setTimelinePoints] = useState<Array<{ frame: number; x: number; y: number; objectId: number }>>([]);
  const [coordinateMode, setCoordinateMode] = useState<"x" | "y" | "xy" | "skeleton-x" | "skeleton-y" | "skeleton-xy">("x");
  const isSkeletonCoordinateMode = coordinateMode.startsWith("skeleton-");
  const [skeletonTimelinePoints, setSkeletonTimelinePoints] = useState<Array<{
    frame: number;
    objectId: number;
    coordinates: [number, number][];
  }>>([]);
  const [isSkeletonTimelineLoading, setIsSkeletonTimelineLoading] = useState(false);
  const skeletonTimelineAbortRef = useRef<AbortController | null>(null);
  const skeletonTimelineRangeRef = useRef<{ start: number; end: number; objectIds: string } | null>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const [isChartDragging, setIsChartDragging] = useState(false);

  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const [halfWindow, setHalfWindow] = useState(250);
  const [totalVisibleInput, setTotalVisibleInput] = useState("500");

  const [stageWidth, setStageWidth] = useState(900);
  const [stageHeight, setStageHeight] = useState(700);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const timelineResizeRef = useRef({
    isResizing: false,
    startY: 0,
    startHeight: DEFAULT_TIMELINE_HEIGHT,
  });

  const clampTimelineHeight = useCallback((height: number) => {
    const availableHeight = rootContainerRef.current?.clientHeight ?? 0;
    const maxHeight = Math.max(
      MIN_TIMELINE_HEIGHT,
      availableHeight - MIN_VIDEO_HEIGHT - 90,
    );

    return Math.min(Math.max(height, MIN_TIMELINE_HEIGHT), maxHeight);
  }, []);

  const handleTimelineResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      timelineResizeRef.current = {
        isResizing: true,
        startY: event.clientY,
        startHeight: timelineHeight,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [timelineHeight],
  );

  const handleTimelineResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = timelineResizeRef.current;
      if (!resize.isResizing) return;

      setTimelineHeight(
        clampTimelineHeight(resize.startHeight + resize.startY - event.clientY),
      );
    },
    [clampTimelineHeight],
  );

  const handleTimelineResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!timelineResizeRef.current.isResizing) return;
      timelineResizeRef.current.isResizing = false;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released.
      }

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  const resetTimelineHeight = useCallback(() => {
    setTimelineHeight(clampTimelineHeight(DEFAULT_TIMELINE_HEIGHT));
  }, [clampTimelineHeight]);

  useEffect(() => {
    const root = rootContainerRef.current;
    if (!root) return;

    const resizeObserver = new ResizeObserver(() => {
      setTimelineHeight((current) => clampTimelineHeight(current));
    });
    resizeObserver.observe(root);

    return () => {
      resizeObserver.disconnect();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [clampTimelineHeight]);

  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const toolbarOpenedByGuideRef = useRef(false);
  const [showTrajectoryLengths, setShowTrajectoryLengths] = useState(false);
  const [trajectoryLengthOrdering, setTrajectoryLengthOrdering] = useState<TrajectoryLengthOrdering>("length_desc");
  const [videoColorTheme, setVideoColorTheme] = useState<"light" | "dark">("light");
  const [isVideoColorThemePreferenceLoaded, setIsVideoColorThemePreferenceLoaded] = useState(false);
  const objectColorSlotsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const handleGuideStep = (event: Event) => {
      const { selector } = (event as CustomEvent<SystemGuideStepEventDetail>).detail;
      const isWorkspaceMenuStep = selector?.startsWith('[data-system-guide="menu-') ?? false;

      if (isWorkspaceMenuStep) {
        toolbarOpenedByGuideRef.current = true;
        setIsToolbarOpen(true);
      } else if (toolbarOpenedByGuideRef.current) {
        toolbarOpenedByGuideRef.current = false;
        setIsToolbarOpen(false);
      }
    };

    document.addEventListener(SYSTEM_GUIDE_STEP_EVENT, handleGuideStep);
    return () => document.removeEventListener(SYSTEM_GUIDE_STEP_EVENT, handleGuideStep);
  }, []);

  useEffect(() => {
    setVideoColorTheme(sessionStorage.getItem("videoColorTheme") === "dark" ? "dark" : "light");
    setIsVideoColorThemePreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!isVideoColorThemePreferenceLoaded) return;
    sessionStorage.setItem("videoColorTheme", videoColorTheme);
  }, [videoColorTheme, isVideoColorThemePreferenceLoaded]);

  const [trajectoryFrames, setTrajectoryFrames] = useState(100);
  const [labelOffsetScale, setLabelOffsetScale] = useState(1);
  const [textSizeScale, setTextSizeScale] = useState(1);

  // ========== Shared frame mapping with measured padding ==========
  const [timelineWidth, setTimelineWidth] = useState(800);
  const [measuredPadding, setMeasuredPadding] = useState({ left: 60, right: 30 });

  // Measure timeline container width
  useEffect(() => {
    if (!timelineContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setTimelineWidth(width);
    });
    ro.observe(timelineContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const getObjectColor = useCallback((id: number) => {
    const colors = videoColorTheme === "light" ? LIGHT_VIDEO_COLORS : DARK_VIDEO_COLORS;
    let colorSlot = objectColorSlotsRef.current.get(id);
    if (colorSlot === undefined) {
      colorSlot = objectColorSlotsRef.current.size % colors.length;
      objectColorSlotsRef.current.set(id, colorSlot);
    }
    return colors[colorSlot];
  }, [videoColorTheme]);

  const getTotalFrames = useCallback(() => {
    if (duration <= 0 || stableFpsRef.current <= 0) return 0;
    return Math.floor(duration * stableFpsRef.current);
  }, [duration]);

  const trajectoryLengthsQuery = useQuery({
    queryKey: ["trajectoryLengths", projectId, trajectoryLengthOrdering],
    queryFn: ({ signal }) => getTrajectoryLengths(projectId!, {
      ordering: trajectoryLengthOrdering,
      minLength: 1,
      maxLength: Math.max(1, getTotalFrames() + 1),
      signal,
    }),
    enabled: Boolean(projectId && showTrajectoryLengths && getTotalFrames() > 0),
    staleTime: 30_000,
  });

  const [objectPage, setObjectPage] = useState(0);
  const pageSize = 10;

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

  // Numeric shortcuts apply only to objects whose transformed bounding box is
  // currently visible after zooming and panning the stage.
  const objectsInCurrentFrame = useMemo(() => {
    const objects: { id: number; color: string }[] = [];
    for (const anno of annotationMap.values()) {
      if (anno.frame_id !== currentFrame || anno.coordinates.length === 0) continue;

      const transformedXs = anno.coordinates.map(([x]) => stagePos.x + mapX(x) * stageScale.x);
      const transformedYs = anno.coordinates.map(([, y]) => stagePos.y + mapY(y) * stageScale.y);
      const minX = Math.min(...transformedXs);
      const maxX = Math.max(...transformedXs);
      const minY = Math.min(...transformedYs);
      const maxY = Math.max(...transformedYs);
      const isVisible = maxX >= 0 && minX <= stageWidth && maxY >= 0 && minY <= stageHeight;

      if (isVisible) objects.push({ id: anno.object_id, color: getObjectColor(anno.object_id) });
    }
    return objects.sort((a, b) => a.id - b.id);
  }, [annotationMap, currentFrame, getObjectColor, mapX, mapY, stageHeight, stagePos.x, stagePos.y, stageScale.x, stageScale.y, stageWidth]);

  const visibleObjectIdsKey = useMemo(
    () => objectsInCurrentFrame.map(object => object.id).join(","),
    [objectsInCurrentFrame]
  );
  const totalPages = Math.ceil(objectsInCurrentFrame.length / pageSize);
  const currentPageObjects = objectsInCurrentFrame.slice(objectPage * pageSize, (objectPage + 1) * pageSize);

  useEffect(() => {
    setObjectPage(0);
  }, [currentFrame, visibleObjectIdsKey]);

  const getCircleRadius = () => Math.max(0.5, 1*(1/currentZoom));
  const getTrajectoryWidth = () => Math.max(0.5, 2*(1/currentZoom));
  const getIdFontSize = () => (14 * textSizeScale) * (1 / currentZoom);
  const getBBoxStrokeWidth = () => Math.max(1, 4*(1/currentZoom));
  const getLabelOffset = () => (8 * labelOffsetScale) * (1 / currentZoom);
  const getSkeletonWidth = () => Math.max(0.8, 0.8 * (1 / currentZoom));

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
    const allObjects: any[] = [];
    for (const objects of uniqueDataCacheRef.current.values()) {
      allObjects.push(...objects);
    }
    const uniqueMap = new Map<number, any>();
    for (const obj of allObjects) {
      const normalized = {
        id: obj.object_id,
        start_frame: obj.start_frame,
        end_frame: obj.end_frame,
        start_coordinate: obj.start_coordinate,
        end_coordinate: obj.end_coordinate,
        N_frame: obj.N_frame,
        trk_len: obj.trk_len,
      };
      if (!uniqueMap.has(normalized.id) || normalized.end_frame > uniqueMap.get(normalized.id)!.end_frame) {
        uniqueMap.set(normalized.id, normalized);
      }
    }
    setUniqueIdsData({
      status: "success",
      data: { project_id: projectId!, objects: Array.from(uniqueMap.values()) },
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

  // ===== Refresh state =====
  const [refreshKey, setRefreshKey] = useState(0);

  // ===== Annotation helpers =====
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

  // ===== Annotation chunk fetch =====
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
        loadedAnnotations.push({ object_id: obj.object_id, frame_id: f.frame_id, coordinates: f.coordinates, average: f.average,});
          if (f.average?.length === 2) newTrajectoryFrames.push({frame_id: f.frame_id, object_id: obj.object_id, coordinate: f.average,}); });
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
  const ANNO_PREFETCH_THRESHOLD = useMemo(() => Math.round((stableFpsRef.current / 100) * 6 * stableFpsRef.current), []);

  // ===== Other effects =====
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
    const currentFrameNum = currentDisplayFrameRef.current;
    const cutoff = Math.max(0, currentFrameNum - trajectoryFrames);
    persistentTrajectoryRef.current = persistentTrajectoryRef.current.filter(t => t.frame_id >= cutoff);
    newTrajectoryFrames.forEach(traj => {
      if (traj.frame_id >= cutoff) {
        persistentTrajectoryRef.current.push(traj);
        if (!trajectoriesRef.current.has(traj.object_id)) trajectoriesRef.current.set(traj.object_id, new Map());
        trajectoriesRef.current.get(traj.object_id)!.set(traj.frame_id, traj.coordinate);
      }
    });
    setTrajectoryPointCount(persistentTrajectoryRef.current.length);
  }, [trajectoryFrames]);

  const getTrajectoryPointsUpToCurrent = useCallback((objectId: number, upToFrame: number): number[] => {
    const frameTrajectory = trajectoryMap.get(objectId);
    if (!frameTrajectory || frameTrajectory.size < 2) return [];
    const windowStart = Math.max(0, upToFrame - trajectoryFrames);
    const sortedFrames = Array.from(frameTrajectory.keys()).sort((a,b)=>a-b).filter(
      fid => fid >= windowStart && fid <= upToFrame
    );
    if (sortedFrames.length < 2) return [];
    const points: number[] = [];
    sortedFrames.forEach(fid => { const [x,y] = frameTrajectory.get(fid)!; points.push(x,y); });
    return points;
  }, [trajectoryMap, trajectoryFrames]);

  const getAllObjectIds = useCallback(() => Array.from(trajectoryMap.keys()).sort((a,b)=>a-b), [trajectoryMap]);
  const setCursorStyle = useCallback((cursor: string) => { if (stageRef.current) stageRef.current.container().style.cursor = cursor; }, []);

  // ===== Undo / Redo & Activity Logs =====
  const activityLogsQuery = useQuery({ queryKey: ["activity-logs", projectId], queryFn: () => getActivityLogs(projectId!), enabled: !!projectId && mounted });
  const exportMutation = useMutation({
    mutationFn: () => exportTrk(projectId!),
    onMutate: () => { setIsExporting(true); setDownloadUrl(null); },
    onSuccess: (response) => { setDownloadUrl(response.data.download_url); setTrkVersion(response.data.trk_version); setIsExporting(false); safeToast({ title: "Export Completed", duration: 1500 }); },
    onError: () => { setIsExporting(false); setDownloadUrl(null); safeToast({ title: "Export Failed", variant: "destructive", duration: 1500 }); },
  });

  // ===== NEW: State and mutations for undo/redo loading dialog =====
  const [isUndoRedoLoading, setIsUndoRedoLoading] = useState(false);

  const undoMutation = useMutation({
    mutationFn: () => undoAction(projectId!),
    onMutate: () => setIsUndoRedoLoading(true),
    onSuccess: () => {
      safeToast({ title: "Undo successful", duration: 1500 });
      if (video) window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: currentDisplayFrameRef.current } }));
    },
    onError: () => safeToast({ title: "Undo failed", variant: "destructive", duration: 1500 }),
    onSettled: () => setIsUndoRedoLoading(false),
  });

  const redoMutation = useMutation({
    mutationFn: () => redoAction(projectId!),
    onMutate: () => setIsUndoRedoLoading(true),
    onSuccess: () => {
      safeToast({ title: "Redo successful", duration: 1500 });
      if (video) window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: currentDisplayFrameRef.current } }));
    },
    onError: () => safeToast({ title: "Redo failed", variant: "destructive", duration: 1500 }),
    onSettled: () => setIsUndoRedoLoading(false),
  });

  // ===== REFRESH FUNCTION =====
  const handleRefresh = useCallback(() => {
    // Invalidate React Query caches
    queryClient.invalidateQueries({ queryKey: ["activity-logs"] });

    // Clear annotations and trajectories
    setAnnotationMap(new Map());
    persistentTrajectoryRef.current = [];
    trajectoriesRef.current = new Map();
    setTrajectoryMap(new Map());
    setTrajectoryPointCount(0);
    clearLoadedRanges();
    loadedRangesKeyRef.current.clear();
    pendingRangesRef.current.clear();

    // Clear unique IDs cache
    loadedUniqueRangesRef.current = [];
    pendingUniqueRangesRef.current.clear();
    uniqueDataCacheRef.current.clear();
    setUniqueIdsData(null);

    // Clear timeline points
    setTimelinePoints([]);

    // Trigger refetch of activity logs
    activityLogsQuery.refetch();

    // Increment refresh key to trigger effects that depend on it
    setRefreshKey(prev => prev + 1);

    // Force re-fetch annotations for current window
    const totalFrames = getTotalFrames();
    if (totalFrames > 0 && projectId) {
      const windowFrames = Math.round(6 * stableFpsRef.current);
      const windowStart = Math.max(0, currentFrame - windowFrames);
      const windowEnd = Math.min(currentFrame + windowFrames, totalFrames);
      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
        chunkMutation.mutate({ start: windowStart, end: windowEnd });
      }
    }

    safeToast({ title: "Data refreshed", duration: 1500 });
  }, [queryClient, projectId, currentFrame, getTotalFrames, chunkMutation, isRangeAlreadyLoading, safeToast, activityLogsQuery, clearLoadedRanges]);

  // ===== Unique IDs effects with refreshKey dependency =====
  useEffect(() => {
    if (!projectId) return;
    const totalFrames = getTotalFrames();
    if (totalFrames === 0) return;
    pruneUniqueRanges(currentFrame, halfWindow * 3);
    const isCovered = loadedUniqueRangesRef.current.some(range => currentFrame >= range.start && currentFrame <= range.end);
    if (isCovered) return;
    const buffer = Math.max(250, Math.round(halfWindow * 0.5));
    let start = Math.max(0, currentFrame - halfWindow - buffer);
    let end = Math.min(currentFrame + halfWindow + buffer, totalFrames);
    fetchUniqueRange(start, end);
  }, [projectId, currentFrame, getTotalFrames, halfWindow, pruneUniqueRanges, fetchUniqueRange, refreshKey]);

  useEffect(() => {
    loadedUniqueRangesRef.current = [];
    pendingUniqueRangesRef.current.clear();
    uniqueDataCacheRef.current.clear();
    setUniqueIdsData(null);
  }, [halfWindow]);

  useEffect(() => {
    const handleOperationComplete = () => {
      loadedUniqueRangesRef.current = [];
      pendingUniqueRangesRef.current.clear();
      uniqueDataCacheRef.current.clear();
      setUniqueIdsData(null);
      setTimelinePoints([]);
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener("operationComplete", handleOperationComplete);
    return () => window.removeEventListener("operationComplete", handleOperationComplete);
  }, []);

  // ===== Timeline data with refreshKey dependency =====
  useEffect(() => {
    if (!projectId || selectedObjects.length === 0) {
      setTimelinePoints([]);
      return;
    }
    const fetchTimeline = async () => {
      const totalFrames = getTotalFrames();
      if (totalFrames <= 0) {
        setTimelinePoints([]);
        return;
      }
      const buffer = Math.max(250, Math.round(halfWindow * 0.5));
      let startFrame = Math.max(0, currentFrame - halfWindow - buffer);
      let endFrame = Math.min(currentFrame + halfWindow + buffer, totalFrames);
      if (startFrame > endFrame) [startFrame, endFrame] = [endFrame, startFrame];
      if (startFrame === endFrame) endFrame = Math.min(totalFrames, endFrame + 1);
      const objectIds = selectedObjects.map(obj => obj.object_id).filter(id => id != null).join(',');
      if (!objectIds) {
        setTimelinePoints([]);
        return;
      }
      try {
        const data = await getTimelineData(projectId, startFrame, endFrame, objectIds);
        if (data && data.f) {
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
        } else {
          setTimelinePoints([]);
        }
      } catch (err) {
        console.error("[Timeline] Fetch error:", err);
        setTimelinePoints([]);
      }
    };
    fetchTimeline();
  }, [projectId, selectedObjects, currentFrame, getTotalFrames, halfWindow, refreshKey]);

  // ---- MODIFIED: chartData now includes every frame in the visible window with nulls ----
  const uniqueObjectIds = useMemo(() => Array.from(new Set(timelinePoints.map(p => p.objectId))), [timelinePoints]);

  // Use measured padding (falls back to hardcoded 60/30 if measurement hasn't run yet)
  const { frameToX, minFrame, maxFrame, plotWidth } = useFrameMapping(
    timelineWidth,
    currentFrame,
    halfWindow,
    measuredPadding.left,
    measuredPadding.right
  );

  const clipDisplayEnd = clipEndFrame ?? currentFrame;
  const clipRangeMin = clipStartFrame === null ? null : Math.min(clipStartFrame, clipDisplayEnd);
  const clipRangeMax = clipStartFrame === null ? null : Math.max(clipStartFrame, clipDisplayEnd);
  const visibleClipStart = clipRangeMin === null ? null : Math.max(clipRangeMin, minFrame);
  const visibleClipEnd = clipRangeMax === null ? null : Math.min(clipRangeMax, maxFrame);
  const hasVisibleClipRange = visibleClipStart !== null && visibleClipEnd !== null && visibleClipStart <= visibleClipEnd;
  const visibleGapStart = activeTrajectoryGap === null ? null : Math.max(activeTrajectoryGap.start_frame, minFrame);
  const visibleGapEnd = activeTrajectoryGap === null ? null : Math.min(activeTrajectoryGap.end_frame, maxFrame);
  const hasVisibleTrajectoryGap = visibleGapStart !== null && visibleGapEnd !== null && visibleGapStart <= visibleGapEnd;

  const selectedTimelineObjectIds = useMemo(
    () => selectedObjects.map(object => object.object_id).sort((a, b) => a - b).join(","),
    [selectedObjects]
  );

  // Skeleton coordinates are loaded separately and only while Skeleton mode is active.
  // This keeps the existing mean-coordinate timeline and playback loading untouched.
  useEffect(() => {
    if (!isSkeletonCoordinateMode || !projectId || !selectedTimelineObjectIds) {
      skeletonTimelineAbortRef.current?.abort();
      skeletonTimelineAbortRef.current = null;
      skeletonTimelineRangeRef.current = null;
      setSkeletonTimelinePoints([]);
      if (isSkeletonTimelineLoading) setIsSkeletonTimelineLoading(false);
      return;
    }

    const totalFrames = getTotalFrames();
    if (totalFrames <= 0) return;
    const requestKey = `${selectedTimelineObjectIds}|${refreshKey}`;
    const visibleStart = Math.max(0, Math.floor(minFrame));
    const visibleEnd = Math.min(totalFrames, Math.ceil(maxFrame));
    const loaded = skeletonTimelineRangeRef.current;
    if (
      loaded &&
      loaded.objectIds === requestKey &&
      visibleStart >= loaded.start &&
      visibleEnd <= loaded.end
    ) return;

    const buffer = Math.max(100, Math.floor(halfWindow / 2));
    const requestStart = Math.max(0, visibleStart - buffer);
    const requestEnd = Math.min(totalFrames, visibleEnd + buffer);
    const controller = new AbortController();
    skeletonTimelineAbortRef.current?.abort();
    skeletonTimelineAbortRef.current = controller;
    skeletonTimelineRangeRef.current = {
      start: requestStart,
      end: requestEnd,
      objectIds: requestKey,
    };
    setIsSkeletonTimelineLoading(true);

    const selectedIdSet = new Set(selectedTimelineObjectIds.split(",").map(Number));
    getFrameRangeData(projectId, requestStart, requestEnd, controller.signal)
      .then(response => {
        if (!response || controller.signal.aborted) return;
        const payload = response.data ?? response;
        const objects = payload.objects ?? [];
        const points: Array<{ frame: number; objectId: number; coordinates: [number, number][] }> = [];

        objects.forEach((object: any) => {
          const objectId = Number(object.object_id);
          if (!selectedIdSet.has(objectId)) return;
          const frames = object.frames ?? (payload.frame_number !== undefined
            ? [{ frame_number: payload.frame_number, coordinates: object.coordinates }]
            : []);
          frames.forEach((frameData: any) => {
            const frame = Number(frameData.frame_id ?? frameData.frame_number);
            const coordinates = Array.isArray(frameData.coordinates)
              ? frameData.coordinates.filter((point: unknown): point is [number, number] =>
                  Array.isArray(point) && point.length >= 2 &&
                  Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
                  .map(([x, y]: [number, number]) => [Number(x), Number(y)] as [number, number])
              : [];
            if (Number.isFinite(frame) && coordinates.length > 0) {
              points.push({ frame, objectId, coordinates });
            }
          });
        });
        setSkeletonTimelinePoints(points);
      })
      .catch(error => {
        if (error?.name !== "AbortError") {
          console.error("[Skeleton Timeline] Fetch error:", error);
          setSkeletonTimelinePoints([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSkeletonTimelineLoading(false);
      });
  }, [getTotalFrames, halfWindow, isSkeletonCoordinateMode, isSkeletonTimelineLoading, maxFrame, minFrame, projectId, refreshKey, selectedTimelineObjectIds]);

  useEffect(() => () => skeletonTimelineAbortRef.current?.abort(), []);

  const chartData = useMemo(() => {
    if (timelinePoints.length === 0) return [];

    const frameMin = Math.floor(minFrame);
    const frameMax = Math.floor(maxFrame);
    // Build array of all frames from min to max
    const allFrames: number[] = [];
    for (let f = frameMin; f <= frameMax; f++) {
      allFrames.push(f);
    }

    // Initialize map with nulls for each object & coordinate
    const dataMap = new Map<number, any>();
    allFrames.forEach(f => {
      const row: any = { frame: f };
      uniqueObjectIds.forEach(id => {
        if (coordinateMode === "x" || coordinateMode === "xy") {
          row[`obj_${id}_x`] = null;
        }
        if (coordinateMode === "y" || coordinateMode === "xy") {
          row[`obj_${id}_y`] = null;
        }
      });
      dataMap.set(f, row);
    });

    // Overwrite with actual data where available
    timelinePoints.forEach(p => {
      const row = dataMap.get(p.frame);
      if (row) {
        if (coordinateMode === "x" || coordinateMode === "xy") {
          row[`obj_${p.objectId}_x`] = p.x;
        }
        if (coordinateMode === "y" || coordinateMode === "xy") {
          row[`obj_${p.objectId}_y`] = p.y;
        }
      }
    });

    return Array.from(dataMap.values()).sort((a, b) => a.frame - b.frame);
  }, [timelinePoints, coordinateMode, minFrame, maxFrame, uniqueObjectIds]);

  const skeletonSeries = useMemo(() => {
    const keys = new Map<string, { objectId: number; pointIndex: number }>();
    skeletonTimelinePoints.forEach(point => {
      point.coordinates.forEach((_, pointIndex) => {
        const key = `${point.objectId}-${pointIndex}`;
        if (!keys.has(key)) keys.set(key, { objectId: point.objectId, pointIndex });
      });
    });
    return Array.from(keys.values());
  }, [skeletonTimelinePoints]);

  const skeletonChartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    skeletonTimelinePoints.forEach(point => {
      if (point.frame < minFrame || point.frame > maxFrame) return;
      const row = rows.get(point.frame) ?? { frame: point.frame };
      point.coordinates.forEach(([x, y], pointIndex) => {
        row[`obj_${point.objectId}_point_${pointIndex}_x`] = x;
        row[`obj_${point.objectId}_point_${pointIndex}_y`] = y;
      });
      rows.set(point.frame, row);
    });
    return Array.from(rows.values()).sort((a, b) => a.frame - b.frame);
  }, [maxFrame, minFrame, skeletonTimelinePoints]);

  // ===== MEASURE actual axis offset and update measuredPadding =====
  useLayoutEffect(() => {
    if (!timelineContainerRef.current) return;
    const container = timelineContainerRef.current;

    const measure = () => {
      const axisLine = container.querySelector('.recharts-xAxis .recharts-cartesian-axis-line');
      if (!axisLine) return;
      const axisRect = (axisLine as SVGLineElement).getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const left = axisRect.left - containerRect.left;
      const right = containerRect.right - axisRect.right;

      // Uncomment for debugging:
      // console.log('Measured padding:', { left, right, containerWidth: containerRect.width });

      setMeasuredPadding(prev =>
        (Math.abs(prev.left - left) > 0.5 || Math.abs(prev.right - right) > 0.5)
          ? { left, right }
          : prev
      );
    };

    // Measure immediately, then on any resize or DOM change that could affect layout.
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);

    const mo = new MutationObserver(measure);
    mo.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [timelineWidth, currentFrame, halfWindow]); // re-measure when the frame range changes

  // ===== Cleanup old annotations =====
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

  // Keep only the configured trailing trajectory window cached.
  useEffect(() => {
    if (!mounted) return;
    const cutoffFrame = Math.max(0, currentFrame - trajectoryFrames);
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
  }, [currentFrame, mounted, trajectoryFrames]);

  // ===== Undo/Redo and operations =====
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

  // ===== Frame stepping =====
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
    pendingFrameRef.current = newFrame;
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
    pendingFrameRef.current = targetFrame;

    currentDisplayFrameRef.current = targetFrame;
    setCurrentFrame(targetFrame);
    setCurrentTime(safeTime);
    setSelectedFrameIndex(targetFrame);

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
      setDragTime(null);
      setIsLoadingAnnotations(false);
      setAnnotationsReady(true);
      isSeekingRef.current = false;
      return;
    }

    video.pause();
    setIsPlaying(false);
    video.currentTime = safeTime;
    setDragTime(null);
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

  // Convert using the rendered width so responsive SVG scaling cannot offset frames.
  const clientXToTimelineFrame = useCallback((clientX: number) => {
    if (!timelineContainerRef.current) return;
    const container = timelineContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const mouseX = clientX - containerRect.left;
    const renderedPlotWidth = Math.max(
      1,
      containerRect.width - measuredPadding.left - measuredPadding.right
    );
    const clampedX = Math.min(
      Math.max(mouseX, measuredPadding.left),
      measuredPadding.left + renderedPlotWidth
    );
    const fraction = (clampedX - measuredPadding.left) / renderedPlotWidth;
    return Math.round(minFrame + fraction * (maxFrame - minFrame));
  }, [maxFrame, measuredPadding.left, measuredPadding.right, minFrame]);

  const seekFromChartMouse = useCallback((clientX: number) => {
    const frame = clientXToTimelineFrame(clientX);
    if (frame === undefined) return;
    const targetTime = frame / stableFpsRef.current;
    handleSeek(targetTime);
    return frame;
  }, [clientXToTimelineFrame, handleSeek]);

  // ===== FIXED: mouse-move effect using container-relative coords and correct hit-testing =====
  useEffect(() => {
    if (!timelineContainerRef.current) return;
    const container = timelineContainerRef.current;

    const onMouseDown = (e: MouseEvent) => {
      const svg = (e.target as Element)?.closest?.('svg');
      if (!svg || !container.contains(svg)) return;
      e.preventDefault();
      setIsChartDragging(true);
      setHoverFrame(null);
      setHoverPos(null);
    };

    const onMouseMove = (e: MouseEvent) => {
      const svg = (e.target as Element)?.closest?.('svg');
      if (!svg || !container.contains(svg)) {
        setHoverFrame(null);
        setHoverPos(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      if (!isChartDragging) {
        const frame = clientXToTimelineFrame(e.clientX);
        setHoverFrame(frame ?? null);
        setHoverPos({ x: mouseX, y: mouseY });
      } else {
        seekFromChartMouse(e.clientX);
      }
    };

    const onMouseUp = () => setIsChartDragging(false);

    const onMouseLeave = () => {
      setHoverFrame(null);
      setHoverPos(null);
    };

    const onClick = (e: MouseEvent) => {
      const svg = (e.target as Element)?.closest?.('svg');
      if (!svg || !container.contains(svg)) return;
      const frame = seekFromChartMouse(e.clientX);
      if (frame !== undefined) {
        safeToast({ title: `Jumped to frame ${frame}`, duration: 1500 });
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('click', onClick);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('click', onClick);
    };
  }, [clientXToTimelineFrame, seekFromChartMouse, isChartDragging, safeToast]);

  const togglePlayPause = useCallback(() => {
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => safeToast({ title: "Click the play button", duration: 1500 }));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [video, safeToast]);

  // ===== Stage interactions =====
  const handleResetZoom = useCallback(() => {
    setStageScale({x:1,y:1});
    setStagePos({x:0,y:0});
    setCurrentZoom(1);
    setCursorStyle("grab");
    showZoomIndicator();
  }, [showZoomIndicator]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    let direction = e.evt.deltaY > 0 ? -1 : 1;
    if (e.evt.ctrlKey) direction = -direction;
    if (direction < 0 && oldScale <= 1.3) {      //At or below 130% zoom, Zoom Out resets directly to the normal 1× view. Above 130% zoom, Zoom Out decreases normally.
      handleResetZoom();
      return;
    }
    const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;
    const clampedScale = Math.min(Math.max(newScale, 1), 10);
    setCurrentZoom(clampedScale);
    const newPos = { x: pointer.x - mousePointTo.x * clampedScale, y: pointer.y - mousePointTo.y * clampedScale };
    setStageScale({ x: clampedScale, y: clampedScale });
    setStagePos(newPos);
    showZoomIndicator();
  }, [handleResetZoom, showZoomIndicator]);

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
  const handleZoomIn = () => {
    const ns = Math.min(stageScale.x * 1.1, 10);
    setStageScale({x:ns,y:ns});
    setCurrentZoom(ns);
    showZoomIndicator();
  };
  const handleZoomOut = useCallback(() => {
    if (stageScale.x <= 1.3) {
      handleResetZoom();
      return;
    }
    const ns = Math.max(stageScale.x / 1.1, 1);
    setStageScale({x:ns,y:ns});
    setCurrentZoom(ns);
    showZoomIndicator();
  }, [stageScale.x, handleResetZoom, showZoomIndicator]);
  // Auto‑pan
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
    let targetStageX = currentStageX;
    let targetStageY = currentStageY;

    if (stageObjX < viewportLeft + marginInStage || stageObjX > viewportRight - marginInStage) {
      needsPan = true;
      targetStageX = -stageObjX * currentScale + stageWidth / 2;
    }
    if (stageObjY < viewportTop + marginInStage || stageObjY > viewportBottom - marginInStage) {
      needsPan = true;
      targetStageY = -stageObjY * currentScale + stageHeight / 2;
    }

    if (needsPan) {
      const tolerance = 20;
      if (Math.abs(targetStageX - currentStageX) < tolerance && Math.abs(targetStageY - currentStageY) < tolerance) return;
      setStagePos({ x: targetStageX, y: targetStageY });
    }
  }, [selectedObjects, currentFrame, annotationMap, autoPanEnabled, isDragging, isPanMode, video, offsetX, offsetY, scale, stageWidth, stageHeight, currentZoom]);

  const objectMutation = useMutation({ 
    mutationFn: ({ projectId, objectId, frameId }: any) => getObjectData(projectId, objectId, frameId) 
  });

  const selectObjectForSlot = useCallback((objectId: number, slotIndex: 0 | 1) => {
    if (!projectId) return;
    if (slotIndex === 1 && selectedObjects.length === 0) {
      safeToast({ title: "Select a first object before selecting a second", duration: 1500 });
      return;
    }
    const alreadySelectedInOtherSlot = selectedObjects.some(
      (obj, idx) => idx !== slotIndex && obj.object_id === objectId
    );
    if (alreadySelectedInOtherSlot) {
      safeToast({ title: `Object ${objectId} is already selected in the other slot`, duration: 1500 });
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
          safeToast({ title: `Object ${objectId} set as ${slotIndex === 0 ? 'primary' : 'secondary'} selection`, duration: 1500 });
          if (autoPanEnabled && currentZoom > 1.1 && slotIndex === 0) {
            setTimeout(() => panToSelectedObject(), 100);
          }
        },
        onError: () => safeToast({ title: `Failed to select object ${objectId}`, variant: "destructive", duration: 1500 })
      }
    );
  }, [selectedObjects, projectId, currentFrame, objectMutation, setSelectedObjects, autoPanEnabled, currentZoom, panToSelectedObject, safeToast]);

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

  // ===== Responsive stage sizing =====
  const updateStageSize = useCallback(() => {
    if (!videoContainerRef.current) return;
    const container = videoContainerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    let newWidth = containerWidth;
    let newHeight = containerHeight;

    if (videoWidth && videoHeight) {
      const aspectRatio = videoWidth / videoHeight;
      let w = containerWidth;
      let h = w / aspectRatio;
      if (h > containerHeight) {
        h = containerHeight;
        w = h * aspectRatio;
      }
      newWidth = w;
      newHeight = h;
    } else {
      newWidth = containerWidth;
      newHeight = containerHeight;
    }

    setStageWidth(newWidth);
    setStageHeight(newHeight);
  }, [videoWidth, videoHeight]);

  useLayoutEffect(() => {
    updateStageSize();
  }, [updateStageSize]);

  useEffect(() => {
    if (!videoContainerRef.current) return;
    const container = videoContainerRef.current;
    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(container);
    window.addEventListener('resize', updateStageSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateStageSize);
    };
  }, [updateStageSize]);

  // Video loading
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
          const targetFrame = pendingFrameRef.current;
          if (targetFrame !== null) {
            const frame = targetFrame;
            isSeekingRef.current = false;
            pendingFrameRef.current = null;
            currentDisplayFrameRef.current = frame;
            setCurrentFrame(frame);
            setCurrentTime(vid.currentTime);
            setSelectedFrameIndex(frame);
            if (layerRef.current) layerRef.current.batchDraw();
            if (!isFrameLoaded(frame)) {
              const windowFrames = Math.round(6 * lockedFps);
              const totalFrames = Math.floor(vid.duration * lockedFps);
              const windowStart = Math.max(0, frame - 50);
              const windowEnd = Math.min(frame + windowFrames, totalFrames);
              if (!isFrameStepSequenceRef.current) setIsLoadingAnnotations(true);
              chunkMutation.mutate({ start: windowStart, end: windowEnd });
            } else {
              setAnnotationsReady(true);
              setIsLoadingAnnotations(false);
            }
            return;
          }
          const actualFrame = Math.round(vid.currentTime * lockedFps);
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
          const storedFrame = sessionStorage.getItem("frameId");
          const initialFrame = storedFrame ? parseInt(storedFrame, 10) : 0;
          setCurrentFrame(initialFrame);
          currentDisplayFrameRef.current = initialFrame;
          chunkMutation.mutate({ start: 0, end: 150 });
        };
        vid.onerror = () => safeToast({ title: "Error loading video", variant: "destructive", duration: 1500 });
        setVideo(vid);
      } catch (error) {
        safeToast({ title: "Failed to load video", variant: "destructive", duration: 1500 });
      }
    };
    loadVideo();
  }, [mounted, originalFpsLoadedRef.current]);

  // ===== NEW: undo/redo mutations moved up, but we keep the keyboard shortcuts here =====
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      const isDialogOpen = sessionStorage.getItem("dialogOpen") === "true";
      if (isDialogOpen) {return;}
      if (e.ctrlKey && e.key === "z" && canUndo) { e.preventDefault(); undoMutation.mutate(); }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z")) && canRedo) { e.preventDefault(); redoMutation.mutate(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canUndo, canRedo, mounted, undoMutation, redoMutation]);

  // ===== NEW: Keyboard shortcut for refresh (Ctrl+R) =====
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      const isDialogOpen = sessionStorage.getItem("dialogOpen") === "true";
      if (isDialogOpen) return;
      // Check for Ctrl+R (or Cmd+R on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        handleRefresh();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mounted, handleRefresh]);

  const formatTime = (time: number) => `${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,"0")}`;
  
  useEffect(() => { if(video && mounted) video.playbackRate = playbackRate; }, [video, playbackRate, mounted]);
  useEffect(() => { if(!video || !layerRef.current || !mounted) return; let id: number; const update = () => { layerRef.current?.batchDraw(); id = requestAnimationFrame(update); }; update(); return () => cancelAnimationFrame(id); }, [video, mounted]);

  // timeupdate handler
  useEffect(() => {
    if (!video || !mounted) return;
    const vid = video;
    const handleTimeUpdate = () => {
      const newFrame = Math.round(vid.currentTime * stableFpsRef.current);
      if (!isSeekingRef.current || pendingFrameRef.current === null) {
        currentDisplayFrameRef.current = newFrame;
        setCurrentFrame(newFrame);
        setCurrentTime(vid.currentTime);
      }
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
    return () => {
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("play", handlePlay);
      vid.removeEventListener("pause", handlePause);
    };
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
          safeToast({ title: `Switched ${position === 0 ? 'primary' : 'secondary'} object to ID ${nextId}`, duration: 1500 });
        },
        onError: () => safeToast({ title: `Failed to switch to object ${nextId}`, variant: "destructive", duration: 1500 }),
      }
    );
  }, [getAllObjectIdList, selectedObjects, uniqueIdsData, projectId, objectMutation, setSelectedObjects, handleFrameJump, safeToast]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!mounted) return;
    const keydownHandler = (e: KeyboardEvent) => {
      const isDialogOpen = sessionStorage.getItem("dialogOpen") === "true";
      if (isDialogOpen) { return; }
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
  const [showObjectSelection, setShowObjectSelection] = useState(false);
  const shortcuts = [
    // ===== NEW: General category with Refresh =====
    { category: "General", items: [
      { action: "Refresh Data", key: "Ctrl+R" },
    ] },
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
      { action: "Go to End / select next link match", key: "E" },
      { action: "Next largest trajectory gap", key: "G" },
      { action: "Previous break boundary", key: "," },
      { action: "Next break boundary", key: "." },
    ] },
    { category: "View", items: [
      { action: "Zoom In", key: "=" },
      { action: "Zoom Out", key: "-" },
      { action: "Toggle Trajectory", key: "T" },
      { action: "Auto Pan (edge only)", key: "A" },
      { action: "Toggle BBox Scale 3×", key: "Z" },
      { action: "Toggle Skeleton", key: "K" },
    ] },
    { category: "Selection", items: [
      { action: "Select as first object", key: "0-9" },
      { action: "Select as second object", key: "Ctrl+0-9" },
      { action: "Cycle first selected object", key: "Tab" },
      { action: "Cycle second selected object", key: "CapsLock" },
      { action: "Clear clip range / object selection", key: "Backspace" },
      { action: "Next page (if >10 objects)", key: "Shift" },
    ] },
    { category: "Panels", items: [
      { action: "Open ID Table", key: "M" },
      { action: "Open Shortcuts", key: "?" },
      { action: "Open Confusion Table", key: "C" },
      { action: "Toggle Object Selection", key: "O" },
    ] },
    {
      category: "Operations",
      items: [
        { action: "Capture Clip Start / End", key: "Ctrl+C" },
        { action: "Clip Selected Range", key: "X" },
        { action: "Link Objects", key: "L" },
        { action: "Swap Objects", key: "W" },
        { action: "Break Object", key: "B" },
        { action: "Delete Object", key: "D" },
        { action: "Interpolate", key: "I" },
        { action: "Recalculate Confusion", key: "R" },
      ]
    },
  ];

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

  const loadLinkingSuggestions = useCallback((
    selectedObjectId: number,
    breakStart: number,
    breakEnd: number,
    objectStart?: number,
  ) => {
    if (!projectId) return;
    // A break at frame 0/the object's first frame has no preceding segment to link.
    if (breakStart <= 0 || (objectStart !== undefined && breakStart <= objectStart)) {
      suggestionRequestIdRef.current += 1;
      setLinkingSuggestions(null);
      setAreLinkingSuggestionsLoading(false);
      return;
    }
    const requestId = ++suggestionRequestIdRef.current;
    setAreLinkingSuggestionsLoading(true);
    setLinkingSuggestions({ selectedObjectId, breakStart, breakEnd, items: [] });
    getTrajectoryLinkingSuggestions(projectId, {
      object_id: selectedObjectId,
      break_start: breakStart,
      break_end: breakEnd,
      limit: 5,
    })
      .then(items => {
        if (suggestionRequestIdRef.current !== requestId) return;
        setLinkingSuggestions({ selectedObjectId, breakStart, breakEnd, items });
      })
      .catch((error: Error) => {
        if (suggestionRequestIdRef.current !== requestId) return;
        setLinkingSuggestions(null);
        safeToast({
          title: "Could not load linking suggestions",
          description: error.message,
          variant: "destructive",
          duration: 1800,
        });
      })
      .finally(() => {
        if (suggestionRequestIdRef.current === requestId) {
          setAreLinkingSuggestionsLoading(false);
        }
      });
  }, [projectId, safeToast]);

  useEffect(() => {
    const selectedObjectId = selectedObjects[0]?.object_id;
    if (linkingSuggestions && linkingSuggestions.selectedObjectId !== selectedObjectId) {
      suggestionRequestIdRef.current += 1;
      setLinkingSuggestions(null);
      setAreLinkingSuggestionsLoading(false);
    }
  }, [selectedObjects, linkingSuggestions]);

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

  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      const isDialogOpen = sessionStorage.getItem("dialogOpen") === "true";
      if (isDialogOpen) {return;}
      if (!video) return;
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);

      if (e.key === "Backspace") {
        if (isInputFocused) return;
        e.preventDefault();
        if (clipStartFrame !== null) {
          setClipStartFrame(null);
          setClipEndFrame(null);
          safeToast({ title: "Clip range cleared", duration: 1000 });
          return;
        }
        if (selectedObjects.length === 2) {
          setSelectedObjects(prev => prev.slice(0, 1));
          safeToast({ title: "Cleared second object", duration: 1000 });
        } else if (selectedObjects.length === 1) {
          setSelectedObjects([]);
          safeToast({ title: "Cleared all selected objects", duration: 1000 });
        }
        return;
      }

      const key = e.key;
      if (/^[0-9]$/.test(key) && !e.altKey && !e.metaKey) {
        if (isInputFocused) return;
        e.preventDefault();
        const numeric = parseInt(key, 10);
        const idx = numeric === 0 ? 9 : numeric - 1;
        let effectivePage = objectPage;
        const pageStart = effectivePage * pageSize;
        const targetIndex = pageStart + idx;
        if (targetIndex < objectsInCurrentFrame.length) {
          const targetObj = objectsInCurrentFrame[targetIndex];
          const slot = e.ctrlKey ? 1 : 0;
          selectObjectForSlot(targetObj.id, slot);
        } else if (objectsInCurrentFrame.length > 0) {
          safeToast({ title: `No object assigned to key ${key} on this page`, duration: 1000 });
        }
        return;
      }

      if (e.key === "Shift" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (totalPages > 1) {
          setObjectPage(prev => (prev + 1) % totalPages);
          safeToast({ title: `Page ${((objectPage+1) % totalPages) + 1} of ${totalPages}`, duration: 1000 });
        }
        return;
      }

      switch (e.code) {
        case "Space": case "KeyP": e.preventDefault(); togglePlayPause(); break;
        case "ArrowLeft": e.preventDefault(); handleFrameStep(-1); break;
        case "ArrowRight": e.preventDefault(); handleFrameStep(1); break;
        case "ArrowUp": e.preventDefault(); if (e.shiftKey) setPlaybackRate(r => Math.min(16, +(r+0.1).toFixed(2))); else handleFrameStep(10); break;
        case "ArrowDown": e.preventDefault(); if (e.shiftKey) setPlaybackRate(r => Math.max(MIN_PLAYBACK_RATE, +(r-0.1).toFixed(2))); else handleFrameStep(-10); break;
        case "Equal": e.preventDefault(); handleZoomIn(); break;
        case "Minus": e.preventDefault(); handleZoomOut(); break;
        case "KeyT": e.preventDefault(); setShowTrajectory(p => !p); break;
        case "KeyA": e.preventDefault(); setAutoPanEnabled(p => !p); safeToast({ title: `Auto-pan ${!autoPanEnabled ? "enabled" : "disabled"}`, duration: 1000 }); break;
        case "KeyZ":
          e.preventDefault();
          setBboxScale(prev => {
            const newScale = prev === 1 ? 3 : 1;
            safeToast({ title: `Bounding box scale: ${newScale}×`, duration: 1000 });
            return newScale;
          });
          break;
        case "KeyK":
          e.preventDefault();
          setShowSkeleton(prev => {
            const newState = !prev;
            safeToast({ title: `Skeleton ${newState ? "ON" : "OFF"}`, duration: 1000 });
            return newState;
          });
          break;
        case "KeyS": e.preventDefault(); if(selectedObjects.length) { const obj = selectedObjects[selectedObjects.length-1]; if(obj.start_frame !== undefined) handleFrameJump(obj.start_frame); else safeToast({ title: "Start frame not available", duration: 1500 }); } else safeToast({ title: "No object selected", duration: 1500 }); break;
        case "KeyE": {
          e.preventDefault();
          if (!selectedObjects.length) {
            safeToast({ title: "No object selected", duration: 1500 });
            break;
          }
          const obj = selectedObjects.length === 1
            ? selectedObjects[0]
            : selectedObjects[selectedObjects.length - 1];
          if (obj.end_frame === undefined) {
            safeToast({ title: "End frame not available", duration: 1500 });
            break;
          }
          if (selectedObjects.length === 1) {
            const candidate = nextFrameLinkMatches[0];
            if (candidate) {
              pendingEndMatchObjectRef.current = null;
              setSelectedObjects([
                obj,
                {
                  object_id: candidate.id,
                  frame_id: candidate.start_frame,
                  start_frame: candidate.start_frame,
                  end_frame: candidate.end_frame,
                },
              ]);
              safeToast({
                title: `Object ${candidate.id} selected for linking`,
                description: `Top next match · starts at frame ${candidate.start_frame}`,
                duration: 1800,
              });
            } else {
              pendingEndMatchObjectRef.current = obj.object_id;
            }
          } else {
            pendingEndMatchObjectRef.current = null;
          }
          handleFrameJump(obj.end_frame);
          break;
        }
        case "KeyG": {
          if (isInputFocused || e.ctrlKey || e.altKey || e.metaKey) break;
          e.preventDefault();
          if (selectedObjects.length !== 1) {
            safeToast({ title: "Select one object to browse its gaps", duration: 1500 });
            break;
          }
          if (areTrajectoryGapsLoading) {
            safeToast({ title: "Trajectory gaps are still loading", duration: 1200 });
            break;
          }
          if (trajectoryGaps.length === 0) {
            safeToast({ title: "No trajectory gaps found", duration: 1500 });
            break;
          }
          const gapIndex = trajectoryGapIndexRef.current % trajectoryGaps.length;
          const gap = trajectoryGaps[gapIndex];
          trajectoryGapIndexRef.current = (gapIndex + 1) % trajectoryGaps.length;
          setActiveTrajectoryGap(gap);
          handleFrameJump(gap.start_frame);
          safeToast({
            title: `Gap ${gapIndex + 1} of ${trajectoryGaps.length} · ${gap.gap} frames`,
            description: `${gap.start_frame} → ${gap.end_frame}`,
            duration: 1800,
          });
          break;
        }
        case "Period": {
          if (isInputFocused || e.ctrlKey || e.altKey || e.metaKey) break;
          e.preventDefault();
          const selected = selectedObjects[0];
          if (!selected || !projectId) {
            safeToast({ title: "Select an object to find its next break", duration: 1500 });
            break;
          }
          if (isBreakNavigationPendingRef.current) break;
          if (breakNavigationObjectRef.current !== selected.object_id) {
            breakNavigationHistoryRef.current = [];
            breakNavigationObjectRef.current = selected.object_id;
            activeBreakRef.current = null;
          }
          const activeBreak = activeBreakRef.current;
          if (
            activeBreak?.selectedObjectId === selected.object_id &&
            currentFrame >= activeBreak.breakStart &&
            currentFrame < activeBreak.breakEnd
          ) {
            breakNavigationHistoryRef.current.push(currentFrame);
            handleFrameJump(activeBreak.breakEnd);
            safeToast({
              title: `Break end: ${activeBreak.breakEnd}`,
              description: `Range ${activeBreak.breakStart}–${activeBreak.breakEnd}`,
              duration: 1500,
            });
            break;
          }
          isBreakNavigationPendingRef.current = true;
          const breakSearchFrame = activeBreak?.selectedObjectId === selected.object_id &&
            currentFrame >= activeBreak.breakEnd
            ? currentFrame + 1
            : currentFrame;
          getNextBreak(projectId, selected.object_id, breakSearchFrame)
            .then(nextBreak => {
              activeBreakRef.current = {
                selectedObjectId: selected.object_id,
                breakStart: nextBreak.break_start,
                breakEnd: nextBreak.break_end,
              };
              loadLinkingSuggestions(
                selected.object_id,
                nextBreak.break_start,
                nextBreak.break_end,
                selected.start_frame,
              );
              if (nextBreak.break_start !== currentFrame) {
                breakNavigationHistoryRef.current.push(currentFrame);
              }
              handleFrameJump(nextBreak.break_start);
              safeToast({
                title: `Break start: ${nextBreak.break_start}`,
                description: `Object ${nextBreak.object_id} · End ${nextBreak.break_end}`,
                duration: 1800,
              });
            })
            .catch((error: Error) => {
              const objectEnd = selected.end_frame;
              const hasNoMoreBreaks = error instanceof NextBreakError && error.status < 500;
              if (hasNoMoreBreaks && objectEnd !== undefined && currentFrame !== objectEnd) {
                breakNavigationHistoryRef.current.push(currentFrame);
                activeBreakRef.current = null;
                handleFrameJump(objectEnd);
                safeToast({
                  title: `Object end: ${objectEnd}`,
                  description: `No more breaks for object ${selected.object_id}`,
                  duration: 1800,
                });
                return;
              }
              safeToast({
                title: hasNoMoreBreaks ? "Break navigation complete" : "Break navigation failed",
                description: error.message,
                variant: hasNoMoreBreaks ? "default" : "destructive",
                duration: 1800,
              });
            })
            .finally(() => { isBreakNavigationPendingRef.current = false; });
          break;
        }
        case "Comma": {
          if (isInputFocused || e.ctrlKey || e.altKey || e.metaKey) break;
          e.preventDefault();
          const selected = selectedObjects[0];
          if (!selected || breakNavigationObjectRef.current !== selected.object_id) {
            safeToast({ title: "No previous break in this session", duration: 1500 });
            break;
          }
          const previousFrame = breakNavigationHistoryRef.current.pop();
          if (previousFrame === undefined) {
            safeToast({ title: "No previous break in this session", duration: 1500 });
            break;
          }
          handleFrameJump(previousFrame);
          break;
        }
        case "KeyM": e.preventDefault(); openUniqueIdsPopup(); break;
        case "KeyC":
          if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            openConfusionPopup();
          }
          break;
        case "Slash": e.preventDefault(); setShowShortcutModal(prev => !prev); break;
        case "KeyO": e.preventDefault(); setShowObjectSelection(prev => !prev); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [video, togglePlayPause, handleSkip, handleFrameStep, handleZoomIn, handleZoomOut, selectedObjects, handleFrameJump, safeToast, mounted, autoPanEnabled, openUniqueIdsPopup, openConfusionPopup, objectsInCurrentFrame, objectPage, totalPages, pageSize, selectObjectForSlot, bboxScale, clipStartFrame, setClipStartFrame, setClipEndFrame, currentFrame, projectId, loadLinkingSuggestions, nextFrameLinkMatches, setSelectedObjects, areTrajectoryGapsLoading, trajectoryGaps]);

  // shortcutMap based on currentPageObjects
  const shortcutMap = useMemo(() => {
    const map = new Map<number, string>();
    currentPageObjects.forEach((obj, idx) => {
      const key = idx === 9 ? '0' : (idx + 1).toString();
      map.set(obj.id, key);
    });
    return map;
  }, [currentPageObjects]);

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
      {/* ===== EXPORT LOADING OVERLAY ===== */}
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Exporting TRK file…</span>
          </div>
        </div>
      )}

      {/* ===== NEW: UNDO/REDO LOADING OVERLAY ===== */}
      {isUndoRedoLoading && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Processing undo/redo…</span>
          </div>
        </div>
      )}

      {/* Main container – full viewport, no scroll */}
      <div ref={rootContainerRef} className="h-full min-h-0 overflow-hidden flex flex-col gap-1 p-2 bg-slate-100">
        <Card className="flex-1 flex flex-col border rounded-[7px] overflow-hidden p-2 min-h-0">
          {/* Video container – takes all remaining vertical space */}
          <div
            data-system-guide="video-canvas"
            ref={videoContainerRef}
            className="relative flex items-center justify-center w-full bg-black rounded-lg flex-1 min-h-0 overflow-hidden"
          >
            <div className="absolute top-2 left-2 z-50 text-xs">
              <div className="rounded bg-black/80 px-2 py-1 font-mono text-green-400">
                FPS: {stableFpsRef.current} | Frame: {currentFrame} | Time: {currentTime.toFixed(3)}s
                {isSeekingRef.current && " 🔄 SEEKING"}
                {pendingFrameVisual !== null && ` ⏳ PENDING: ${pendingFrameVisual}`}
                {isLoadingAnnotations && " 📥 LOADING"}
                {autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && " 🎯 AUTO-PAN"}
                {bboxScale !== 1 && ` 🔍 BBox ${bboxScale}×`}
                {showSkeleton && skeletonGraph.length > 0 && " 🦴 SKELETON"}
                {autoInterpolation && " 🔄 AUTO-INTERP"}
              </div>
              {linkingSuggestions &&
                currentFrame >= linkingSuggestions.breakStart &&
                currentFrame < linkingSuggestions.breakEnd && (
                  <div className="mt-2 w-72 rounded-xl border border-white/10 bg-black/75 px-3 py-2 font-sans text-white shadow-md">
                    <div className="mb-1.5 text-xs font-semibold text-white">
                      Top Matches
                    </div>
                    {areLinkingSuggestionsLoading ? (
                      <div className="text-slate-400">Loading...</div>
                    ) : linkingSuggestions.items.length > 0 ? (
                      <div className="space-y-0.5">
                        {linkingSuggestions.items.slice(0, 5).map((suggestion, index) => {
                          const isSelectedMatch = selectedObjects[1]?.object_id === suggestion.object_id;
                          return (
                            <button
                              key={suggestion.object_id}
                              type="button"
                              aria-label={`Select object ${suggestion.object_id} as Object 2`}
                              aria-pressed={isSelectedMatch}
                              disabled={objectMutation.isPending}
                              onClick={() => selectObjectForSlot(suggestion.object_id, 1)}
                              className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/20 disabled:cursor-wait ${
                                isSelectedMatch
                                  ? "bg-white/25 text-white"
                                  : index === 0
                                    ? "bg-white/15 text-white"
                                    : "text-white/85"
                              }`}
                            >
                              <span className="text-white/55">{String(index + 1).padStart(2, "0")}</span>
                              <span>{suggestion.object_id}</span>
                              <span>{(suggestion.score * 100).toFixed(1)}%</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-slate-400">None found</div>
                    )}
                  </div>
                )}
              {visibleNextFrameLinkMatches.length > 0 && !(
                linkingSuggestions &&
                currentFrame >= linkingSuggestions.breakStart &&
                currentFrame < linkingSuggestions.breakEnd
              ) && (
                <div className="mt-2 w-72 rounded-xl border border-white/10 bg-black/75 px-3 py-2 font-sans text-white shadow-md">
                  <div className="mb-1.5 text-xs font-semibold text-white">Next Link Matches</div>
                  <div className="space-y-0.5">
                    {visibleNextFrameLinkMatches.map((candidate, index) => {
                      const isSelectedMatch = selectedObjects[1]?.object_id === candidate.id;
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          aria-label={`Select object ${candidate.id} as Object 2`}
                          aria-pressed={isSelectedMatch}
                          onClick={() => {
                            const primaryObject = selectedObjects[0];
                            if (!primaryObject) return;
                            setSelectedObjects([
                              primaryObject,
                              {
                                object_id: candidate.id,
                                frame_id: candidate.start_frame,
                                start_frame: candidate.start_frame,
                                end_frame: candidate.end_frame,
                              },
                            ]);
                            safeToast({
                              title: `Object ${candidate.id} selected for linking`,
                              description: `Starts at frame ${candidate.start_frame}`,
                              duration: 1500,
                            });
                          }}
                          className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/20 ${
                            isSelectedMatch
                              ? "bg-white/25 text-white"
                              : index === 0
                                ? "bg-white/15 text-white"
                                : "text-white/85"
                          }`}
                        >
                          <span className="text-white/55">{String(index + 1).padStart(2, "0")}</span>
                          <span>ID {candidate.id}</span>
                          <span>Frame {candidate.start_frame}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 text-[11px] text-white/60">Select a match, then press L to link</div>
                </div>
              )}
              {selectedObjects.length === 1 && (areClipSuggestionsLoading || clipSuggestions.length > 0) && (
                <div className="mt-2 w-72 rounded-xl border border-white/10 bg-black/75 px-3 py-2 font-sans text-white shadow-md">
                  <div className="mb-1.5 text-xs font-semibold">Clip Suggestions</div>
                  {areClipSuggestionsLoading ? (
                    <div className="text-white/60">Analyzing trajectory…</div>
                  ) : (
                    <div className="space-y-0.5">
                      {clipSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.start_frame}-${suggestion.end_frame}`}
                          type="button"
                          className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/20 ${
                            index === 0 ? "bg-white/15 text-white" : "text-white/85"
                          }`}
                          onClick={() => {
                            setClipStartFrame(suggestion.start_frame);
                            setClipEndFrame(suggestion.end_frame);
                            handleFrameJump(suggestion.peak_frame);
                            safeToast({
                              title: `Clip range ${suggestion.start_frame}–${suggestion.end_frame} selected`,
                              description: `Peak movement at frame ${suggestion.peak_frame}`,
                              duration: 1600,
                            });
                          }}
                        >
                          <span className="text-white/50">{String(index + 1).padStart(2, "0")}</span>
                          <span>{suggestion.start_frame}–{suggestion.end_frame}</span>
                          <span>{(suggestion.score * 100).toFixed(1)}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 text-[11px] text-white/55">Select a range to preview its peak frame</div>
                </div>
              )}
            </div>
            
            {/* ===== UPDATED: Annotation loading indicator (top‑right corner) ===== */}
            {isLoadingAnnotations && !isFrameStepSequenceRef.current && (
              <div className="absolute top-2 right-2 bg-black/80 text-white px-3 py-1.5 rounded-md flex items-center gap-2 z-50 text-xs">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading annotations…</span>
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
                  const points = getTrajectoryPointsUpToCurrent(oid, currentFrame);
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
                  const shortcutKey = shortcutMap.get(a.object_id);
                  const labelText = `${a.object_id}${!isPlaying && shortcutKey ? ` : (${shortcutKey})` : ''}`;

                  const mappedCoords = a.coordinates.map(([x, y]) => ({
                    x: mapX(x),
                    y: mapY(y),
                  }));

                  return (
                    <Group 
                      key={`${a.object_id}-${a.frame_id}-${annotationIndex}`}
                      onClick={(e) => {
                        const objectId = a.object_id;
                        // Check if this object is already selected
                        const existingIndex = selectedObjects.findIndex(obj => obj.object_id === objectId);
                        if (existingIndex !== -1) {
                          // Remove it from selection
                          setSelectedObjects(prev => prev.filter((_, idx) => idx !== existingIndex));
                          safeToast({ title: `Object ${objectId} removed from selection`, duration: 1500 });
                          return;
                        }
                        // Not selected, add it to the appropriate slot
                        const slot = e.evt.ctrlKey ? 1 : 0;
                        selectObjectForSlot(objectId, slot);
                      }}
                    >
                      {showSkeleton && skeletonGraph.length > 0 && (
                        <>
                          {skeletonGraph.map(([idx1, idx2], edgeIndex) => {
                            if (idx1 < mappedCoords.length && idx2 < mappedCoords.length) {
                              const p1 = mappedCoords[idx1];
                              const p2 = mappedCoords[idx2];
                              return (
                                <Line
                                  key={`skeleton-${a.object_id}-${a.frame_id}-${edgeIndex}`}
                                  points={[p1.x, p1.y, p2.x, p2.y]}
                                  stroke={color}
                                  strokeWidth={getSkeletonWidth()}
                                  opacity={0.8}
                                  lineCap="round"
                                  lineJoin="round"
                                />
                              );
                            }
                            return null;
                          })}
                        </>
                      )}

                      {a.coordinates.map(([x, y], idx) => (
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
                        text={labelText}
                        fontSize={getIdFontSize()} 
                        fill={color} 
                        fontStyle="bold" 
                        shadowColor="transparent"
                      />

                      {isSelected && (() => {
                        const centerX = (minX + maxX) / 2;
                        const centerY = (minY + maxY) / 2;
                        const halfWidth = (boxWidth / 2) * bboxScale;
                        const halfHeight = (boxHeight / 2) * bboxScale;
                        const pad = 5;
                        return (
                          <Rect 
                            x={centerX - halfWidth - pad} 
                            y={centerY - halfHeight - pad} 
                            width={halfWidth * 2 + 2 * pad} 
                            height={halfHeight * 2 + 2 * pad} 
                            stroke={color} 
                            strokeWidth={getBBoxStrokeWidth()} 
                            cornerRadius={4} 
                            dash={[6,4]} 
                          />
                        );
                      })()}
                    </Group>
                  );
                })}
              </Layer>
            </Stage>
            
            {showObjectSelection && objectsInCurrentFrame.length > 0 && (
              <div className="absolute bottom-20 left-2 bg-black/80 text-white p-3 rounded-lg z-50 backdrop-blur-sm pointer-events-none">
                <div className="text-xs font-mono mb-2">
                  Visible objects ({objectPage+1}/{totalPages || 1})
                  {totalPages > 1 && (
                    <span className="ml-2 text-yellow-400">
                      (Press <kbd>Shift</kbd> to cycle pages – {totalPages - (objectPage+1)} page{totalPages - (objectPage+1) > 1 ? 's' : ''} remaining)
                    </span>
                  )}
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
                    Press <kbd>Shift</kbd> to go to next page ({totalPages - (objectPage+1)} page{totalPages - (objectPage+1) > 1 ? 's' : ''} left)
                  </div>
                )}
                <div className="text-[10px] text-yellow-400 mt-2 text-center">
                  💡 <kbd>Ctrl</kbd>+0-9: select as second object
                </div>
              </div>
            )}

            {zoomIndicatorVisible && (
              <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg text-slate-700 px-3 py-1 rounded-xl text-sm font-medium transition-opacity duration-300">
                {(stageScale.x*100).toFixed(0)}%
              </div>
            )}

            {showTrajectoryLengths && (
              <div className="absolute right-3 top-16 z-40 flex max-h-[70%] w-80 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/80 p-3 font-sans text-white shadow-xl backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Browse by Trajectory Length</div>
                  <button
                    type="button"
                    onClick={() => setShowTrajectoryLengths(false)}
                    className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label="Close trajectory lengths"
                  >
                    ×
                  </button>
                </div>
                <select
                  value={trajectoryLengthOrdering}
                  onChange={event => setTrajectoryLengthOrdering(event.target.value as TrajectoryLengthOrdering)}
                  className="mb-2 rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-white"
                >
                  <option value="length_desc">Longest to Shortest</option>
                  <option value="length_asc">Shortest to Longest</option>
                </select>
                {trajectoryLengthsQuery.isLoading ? (
                  <div className="py-4 text-center text-xs text-white/60">Loading trajectories…</div>
                ) : trajectoryLengthsQuery.isError ? (
                  <div className="py-4 text-center text-xs text-red-300">
                    {trajectoryLengthsQuery.error instanceof Error
                      ? trajectoryLengthsQuery.error.message
                      : "Could not load trajectories"}
                  </div>
                ) : trajectoryLengthsQuery.data?.trajectories.length ? (
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                    {trajectoryLengthsQuery.data.trajectories.map((trajectory, index) => (
                      <button
                        key={trajectory.object_id}
                        type="button"
                        onClick={() => {
                          setSelectedObjects([{
                            object_id: trajectory.object_id,
                            frame_id: trajectory.first_frame,
                            start_frame: trajectory.first_frame,
                            end_frame: trajectory.last_frame,
                          }]);
                          handleFrameJump(trajectory.first_frame);
                          safeToast({
                            title: `Object ${trajectory.object_id} selected`,
                            description: `${trajectory.length} frames · ${trajectory.first_frame}–${trajectory.last_frame}`,
                            duration: 1600,
                          });
                        }}
                        className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/85 hover:bg-white/15"
                      >
                        <span className="text-white/45">{String(index + 1).padStart(2, "0")}</span>
                        <span>ID {trajectory.object_id}</span>
                        <span>{trajectory.length} frames</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-white/60">No trajectories found.</div>
                )}
              </div>
            )}
            
            <div className="pointer-events-none absolute inset-y-3 right-3 z-50 flex flex-col items-end">
              <Button
                data-system-guide="workspace-menu-trigger"
                variant="ghost"
                size="sm"
                onClick={() => setIsToolbarOpen(!isToolbarOpen)}
                className="pointer-events-auto h-10 w-10 flex-shrink-0 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl hover:bg-white/100 text-xl font-bold"
              >
                ☰
              </Button>

              {isToolbarOpen && (
                <div
                  data-system-guide-scroll-container
                  className="pointer-events-auto mt-2 flex max-h-[calc(100%-3rem)] w-64 flex-col gap-1 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-2xl backdrop-blur-lg animate-in slide-in-from-top-2 duration-200"
                >
                  <button
                    data-system-guide="menu-auto-pan"
                    onClick={() => {
                      setAutoPanEnabled(!autoPanEnabled);
                      safeToast({ title: `Auto-pan ${!autoPanEnabled ? "enabled" : "disabled"}`, duration: 1000 });
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      autoPanEnabled 
                        ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" 
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Target className="w-4 h-4" />
                    <span>Auto-pan {autoPanEnabled ? "ON" : "OFF"}</span>
                  </button>

                  <button
                    data-system-guide="menu-colors"
                    onClick={() => {
                      const nextTheme = videoColorTheme === "light" ? "dark" : "light";
                      setVideoColorTheme(nextTheme);
                      safeToast({
                        title: `${nextTheme === "light" ? "Light" : "Dark"} video color palette`,
                        duration: 1000,
                      });
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-100"
                    title="Switch annotation colors for the video background"
                  >
                    <Palette className="h-4 w-4" />
                    <span>{videoColorTheme === "light" ? "Light video colors" : "Dark video colors"}</span>
                  </button>

                  <button
                    data-system-guide="menu-skeleton"
                    onClick={() => {
                      setShowSkeleton(!showSkeleton);
                      safeToast({ title: `Skeleton ${!showSkeleton ? "ON" : "OFF"}`, duration: 1000 });
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      showSkeleton 
                        ? "bg-purple-50 text-purple-700 hover:bg-purple-100" 
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <span className="text-lg">🦴</span>
                    <span>Skeleton {showSkeleton ? "ON" : "OFF"}</span>
                  </button>

                  <button
                    data-system-guide="menu-auto-interpolation"
                    onClick={() => {
                      setAutoInterpolation(!autoInterpolation);
                      safeToast({ title: `Auto-interpolation ${!autoInterpolation ? "enabled" : "disabled"}`, duration: 1000 });
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      autoInterpolation 
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100" 
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <span className="text-lg">⟳</span>
                    <span>Auto Interpolation {autoInterpolation ? "ON" : "OFF"}</span>
                  </button>

                  <div className="border-t border-slate-200 my-1" />

                  <div data-system-guide="menu-trajectory-length" className="flex items-center gap-2 px-3 py-1">
                    <span className="text-xs text-slate-600">Trajectory (frames):</span>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      step="1"
                      value={trajectoryFrames}
                      onChange={(e) => setTrajectoryFrames(Number(e.target.value))}
                      className="w-16 h-7 bg-white border border-slate-300 rounded text-xs px-2"
                    />
                  </div>
                  <div data-system-guide="menu-label-offset" className="flex items-center gap-2 px-3 py-1">
                    <span className="text-xs text-slate-600">Label offset:</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={labelOffsetScale}
                      onChange={(e) => setLabelOffsetScale(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-xs text-slate-500 w-8">{labelOffsetScale.toFixed(1)}</span>
                  </div>
                  <div data-system-guide="menu-text-size" className="flex items-center gap-2 px-3 py-1">
                    <span className="text-xs text-slate-600">Text size:</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={textSizeScale}
                      onChange={(e) => setTextSizeScale(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-xs text-slate-500 w-8">{textSizeScale.toFixed(1)}</span>
                  </div>
                  <div className="border-t border-slate-200 my-1" />

                  {downloadUrl ? (
                    <button
                      data-system-guide="menu-export"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = downloadUrl;
                        link.download = `project_${projectId}_v${trkVersion}.trk`;
                        link.click();
                        setDownloadUrl(null);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-all"
                    >
                      <span>⬇</span>
                      <span>Download TRK</span>
                    </button>
                  ) : (
                    <button
                      data-system-guide="menu-export"
                      onClick={() => exportMutation.mutate()}
                      disabled={!projectId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50"
                    >
                      <span>↗</span>
                      <span>Export TRK</span>
                    </button>
                  )}

                  <div className="border-t border-slate-200 my-1" />

                  {/* Refresh button */}
                  <button
                    data-system-guide="menu-refresh"
                    onClick={handleRefresh}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh Data (Ctrl+R)</span>
                  </button>

                  <button
                    data-system-guide="menu-unique-ids"
                    onClick={openUniqueIdsPopup}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-all text-slate-700"
                  >
                    <span className="font-bold">i</span>
                    <span>Unique IDs</span>
                  </button>

                  <button
                    data-system-guide="menu-trajectory-lengths"
                    onClick={() => {
                      setShowTrajectoryLengths(true);
                      setIsToolbarOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100"
                  >
                    <span>↕</span>
                    <span>Browse by Length</span>
                  </button>

                  <button
                    data-system-guide="menu-object-selection"
                    onClick={() => setShowObjectSelection(!showObjectSelection)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-all text-slate-700"
                  >
                    <span>📋</span>
                    <span>Object Selection</span>
                  </button>

                  <button
                    data-system-guide="menu-shortcuts"
                    onClick={() => setShowShortcutModal(true)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-all text-slate-700"
                  >
                    <span>⌨</span>
                    <span>Shortcuts</span>
                  </button>

                  <button
                    data-system-guide="menu-confusion"
                    onClick={openConfusionPopup}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-all text-slate-700"
                  >
                    <span>🔀</span>
                    <span>Confusion</span>
                  </button>
                </div>
              )}
            </div>
            
            <div className="absolute top-2 left-1 text-white px-2 py-1 rounded text-xs">
              Frame: {currentFrame}
            </div>
          </div>
          
          <Separator className="my-1" />
          
          {/* Controls row – fixed height, no shrink */}
          <div data-system-guide="video-controls" className="flex items-center gap-2 flex-wrap flex-shrink-0 py-1">
            <Button 
              data-system-guide="control-undo"
              size="icon" 
              variant="ghost" 
              onClick={() => undoMutation.mutate()} 
              disabled={!canUndo || !projectId || isUndoRedoLoading}
            >
              <Undo className="w-4 h-4" />
            </Button>
            <Button 
              data-system-guide="control-redo"
              size="icon" 
              variant="ghost" 
              onClick={() => redoMutation.mutate()} 
              disabled={!canRedo || !projectId || isUndoRedoLoading}
            >
              <Redo className="w-4 h-4" />
            </Button>
            <Button data-system-guide="control-previous-frame" size="icon" variant="ghost" onClick={() => handleFrameStep(-1)}>
              <SkipBack />
            </Button>
            <Button data-system-guide="control-play" size="icon" variant="ghost" onClick={togglePlayPause} disabled={!video}>
              {isPlaying ? <Pause /> : <Play />}
            </Button>
            <Button data-system-guide="control-next-frame" size="icon" variant="ghost" onClick={() => handleFrameStep(1)}>
              <SkipForward />
            </Button>
            <Slider 
              data-system-guide="control-seek"
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
            <Button data-system-guide="control-zoom-out" size="icon" variant="ghost" onClick={handleZoomOut}>
              <ZoomOut className="w-3 h-3" />
            </Button>
            <Button data-system-guide="control-zoom-reset" size="sm" variant="ghost" onClick={handleResetZoom} className="px-2 text-xs font-semibold">
              Reset
            </Button>
            <Button data-system-guide="control-zoom-in" size="icon" variant="ghost" onClick={handleZoomIn}>
              <ZoomIn className="w-3 h-3" />
            </Button>
            <Button data-system-guide="control-track" size="sm" variant={showTrajectory ? "default" : "ghost"} onClick={() => setShowTrajectory(!showTrajectory)} className="px-2 text-xs font-semibold">
              Track
            </Button>

            {/* Speed popup */}
            <div className="relative">
              <button data-system-guide="control-speed" className="flex items-center gap-1 text-xs px-2 py-1 rounded" onClick={() => setShowSpeed(v=>!v)}>
                <Clock className="w-4 h-4" />
                <span>{playbackRate.toFixed(2).replace(/\.00$/,"")}x</span>
                <ChevronRight className={`w-3 h-3 transition-transform ${showSpeed?"rotate-90":""}`} />
              </button>
              {showSpeed && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#212121] border border-[#3a3a3a] rounded-xl px-5 py-4 shadow-2xl z-50"
                  style={{ width: '280px' }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-white text-xs font-medium">Playback speed</span>
                    <div className="text-right">
                      <div className="text-white text-xs font-bold">{playbackRate.toFixed(2).replace(/\.00$/, '')}x</div>
                      <div className="text-blue-300 text-[10px]">{formatFps(fps * playbackRate)} FPS</div>
                    </div>
                  </div>
                  <div className="mb-3 text-[10px] text-gray-400">Source: {formatFps(fps)} FPS</div>

                  <div className="relative w-full h-10 flex items-start pt-2">
                    <div className="absolute left-0 right-0 top-2 h-1.5 bg-[#3a3a3a] rounded-full" />
                    <div
                      className="absolute left-0 top-2 h-1.5 bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${playbackRateToSliderPosition(playbackRate)}%`,
                      }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={playbackRateToSliderPosition(playbackRate)}
                      onChange={(e) => setPlaybackRate(sliderPositionToPlaybackRate(parseFloat(e.target.value)))}
                      className="playback-speed-range absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                      style={{ margin: 0, padding: 0 }}
                    />
                    <div
                      className="absolute w-5 h-5 bg-blue-500 rounded-full border-2 border-white pointer-events-none"
                      style={{
                        left: `${playbackRateToSliderPosition(playbackRate)}%`,
                        transform: 'translateX(-50%)',
                        top: '0.5rem',
                        marginTop: '-10px',
                      }}
                    />
                    <div className="absolute left-0 right-0 top-2 pointer-events-none">
                      {[0.1, 0.25, 0.5, 1, 2, 4, 8, 16].map((speed, index, speeds) => (
                        <div
                          key={speed}
                          className="absolute top-0"
                          style={{
                            left: `${playbackRateToSliderPosition(speed)}%`,
                          }}
                        >
                          <span className="block h-2 w-px bg-gray-500" />
                          <span
                            className="absolute top-2 whitespace-nowrap text-[9px] text-gray-400"
                            style={{
                              transform: index === 0
                                ? 'translateX(0)'
                                : index === speeds.length - 1
                                  ? 'translateX(-100%)'
                                  : 'translateX(-50%)',
                            }}
                          >
                            {speed}x
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 mt-4 gap-2">
                    {[0.1, 0.25, 0.5, 1, 2, 4, 8, 16].map((speed) => {
                      const isActive = Math.abs(playbackRate - speed) < 0.05;
                      return (
                        <button
                          key={speed}
                          onClick={() => setPlaybackRate(speed)}
                          className={`min-w-0 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#3a3a3a] text-gray-300 hover:bg-[#4a4a4a]'
                          }`}
                        >
                          {speed}x
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-center text-[10px] text-gray-500 mt-1">Normal</div>
                </div>
              )}
            </div>

            {/* Frame input */}
            <div data-system-guide="control-frame-jump" className="flex items-center gap-1 ml-1">
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
          </div>

          <div
            role="separator"
            aria-label="Resize video and timeline. Double-click to reset."
            aria-orientation="horizontal"
            aria-valuemin={MIN_TIMELINE_HEIGHT}
            aria-valuenow={Math.round(timelineHeight)}
            tabIndex={0}
            title="Drag to resize · Double-click to reset"
            onPointerDown={handleTimelineResizeStart}
            onPointerMove={handleTimelineResizeMove}
            onPointerUp={handleTimelineResizeEnd}
            onPointerCancel={handleTimelineResizeEnd}
            onDoubleClick={resetTimelineHeight}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              const change = event.key === "ArrowUp" ? 16 : -16;
              setTimelineHeight((current) => clampTimelineHeight(current + change));
            }}
            className="group relative h-2 w-full shrink-0 touch-none cursor-row-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div className="absolute left-1/2 top-1/2 h-1 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-500" />
          </div>

          {/* Unified timeline */}
          <div
            data-system-guide="trajectory-timeline"
            className="flex w-full flex-shrink-0 flex-col overflow-hidden rounded-md bg-gray-900"
            style={{ height: `${timelineHeight}px` }}
          >
            <div className="flex justify-between items-center mb-1 flex-wrap gap-2 flex-shrink-0 px-2 py-1">
              <span className="text-xs text-gray-300">
                Object Timelines
                {selectedObjects.length > 0 && ` (selected: ${selectedObjects.map(o => o.object_id).join(', ')})`}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={coordinateMode}
                  onChange={(e) => setCoordinateMode(e.target.value as "x" | "y" | "xy" | "skeleton-x" | "skeleton-y" | "skeleton-xy")}
                  className="bg-gray-800 text-white text-xs rounded-md px-2 py-1 border border-gray-600"
                  disabled={selectedObjects.length === 0}
                >
                  <option value="x">X Axis</option>
                  <option value="y">Y Axis</option>
                  <option value="xy">X + Y</option>
                  <option value="skeleton-x">Skeleton X</option>
                  <option value="skeleton-y">Skeleton Y</option>
                  <option value="skeleton-xy">Skeleton X + Y</option>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">Visible frames:</span>
                  <input
                    type="number"
                    min="10"
                    max={getTotalFrames()}
                    step="10"
                    value={totalVisibleInput}
                    onChange={(e) => setTotalVisibleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        let newVal = parseInt(totalVisibleInput, 10);
                        const total = getTotalFrames();
                        if (isNaN(newVal) || newVal < 10) newVal = 500;
                        newVal = Math.min(Math.max(newVal, 10), total);
                        setHalfWindow(Math.floor(newVal / 2));
                        setTotalVisibleInput(newVal.toString());
                      }
                    }}
                    className="w-20 h-7 bg-gray-800 text-white text-xs rounded-md px-2 border border-gray-600"
                  />
                  <button
                    onClick={() => {
                      let newVal = parseInt(totalVisibleInput, 10);
                      const total = getTotalFrames();
                      if (isNaN(newVal) || newVal < 10) newVal = 500;
                      newVal = Math.min(Math.max(newVal, 10), total);
                      setHalfWindow(Math.floor(newVal / 2));
                      setTotalVisibleInput(newVal.toString());
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded-md"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 gap-0 w-full overflow-hidden" ref={timelineContainerRef}>
              {/* Trajectory chart */}
              <div className="flex-1 min-h-0 relative w-full">
                <div className="w-full h-full cursor-grab active:cursor-grabbing">
                  {/* FIX: removed minWidth so both charts share exact pixel width */}
                  <div style={{ width: '100%', height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={selectedObjects.length === 0
                          ? [{ frame: currentFrame }]
                          : isSkeletonCoordinateMode
                            ? (skeletonChartData.length > 0 ? skeletonChartData : [{ frame: currentFrame }])
                            : (chartData.length > 0 ? chartData : [{ frame: currentFrame }])}
                        margin={{ top: 5, right: 30, bottom: 5, left: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        {hasVisibleTrajectoryGap && (
                          <ReferenceArea
                            x1={visibleGapStart!}
                            x2={visibleGapEnd!}
                            fill="#f59e0b"
                            fillOpacity={0.22}
                            stroke="#fbbf24"
                            strokeOpacity={0.9}
                            label={{
                              value: `${activeTrajectoryGap!.gap} frame gap`,
                              position: "insideTop",
                              fill: "#fde68a",
                              fontSize: 10,
                            }}
                          />
                        )}
                        {hasVisibleClipRange && (
                          <ReferenceArea
                            x1={visibleClipStart!}
                            x2={visibleClipEnd!}
                            fill="#8b5cf6"
                            fillOpacity={0.18}
                            stroke="#a78bfa"
                            strokeOpacity={0.7}
                          />
                        )}
                        {/* FIX: solid center line */}
                        <ReferenceLine
                          x={currentFrame}
                          stroke="#ff3333"
                          strokeWidth={2}
                        />
                        <XAxis
                          type="number"
                          dataKey="frame"
                          domain={[minFrame, maxFrame]}
                          tickCount={Math.floor((maxFrame - minFrame) / 50) + 1}
                          allowDataOverflow={true}
                          scale="linear"
                          padding={{ left: 0, right: 0 }}
                          interval={0}
                          tick={{ fill: '#ccc', fontSize: 10 }}
                          tickFormatter={(frame) => frame.toString()}
                          label={{ value: 'Frame', position: 'insideBottom', offset: -5, fill: '#aaa', fontSize: 10 }}
                        />
                        <YAxis
                          width={30}
                          axisLine={false}
                          tickMargin={0}
                          tick={{ fill: '#ccc', fontSize: 8 }}
                          domain={[0, 'auto']}
                          label={{
                            value: coordinateMode === 'x' ? 'X' : coordinateMode === 'y' ? 'Y' : coordinateMode === 'skeleton-x' ? 'Points X' : coordinateMode === 'skeleton-y' ? 'Points Y' : 'X/Y',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#aaa',
                            fontSize: 10,
                          }}
                        />
                        {!isSkeletonCoordinateMode && selectedObjects.length > 0 && uniqueObjectIds.map((objectId) => {
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
                              />
                            );
                          }
                          return lines;
                        })}
                        {isSkeletonCoordinateMode && selectedObjects.length > 0 && skeletonSeries.flatMap(({ objectId, pointIndex }) => {
                          const color = `hsl(${(objectId * 47 + pointIndex * 23) % 360} 75% 60%)`;
                          const lines = [];
                          if (coordinateMode === "skeleton-x" || coordinateMode === "skeleton-xy") {
                            lines.push(<RechartsLine
                              key={`${objectId}-${pointIndex}-skeleton-x`}
                              type="linear"
                              dataKey={`obj_${objectId}_point_${pointIndex}_x`}
                              name={`Object ${objectId} Point ${pointIndex + 1} X`}
                              stroke={color}
                              strokeWidth={1}
                              dot={false}
                              isAnimationActive={false}
                            />);
                          }
                          if (coordinateMode === "skeleton-y" || coordinateMode === "skeleton-xy") {
                            lines.push(<RechartsLine
                              key={`${objectId}-${pointIndex}-skeleton-y`}
                              type="linear"
                              dataKey={`obj_${objectId}_point_${pointIndex}_y`}
                              name={`Object ${objectId} Point ${pointIndex + 1} Y`}
                              stroke={color}
                              strokeWidth={1}
                              strokeDasharray="3 2"
                              dot={false}
                              isAnimationActive={false}
                            />);
                          }
                          return lines;
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {isSkeletonTimelineLoading && isSkeletonCoordinateMode ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="inline-flex items-center text-xs text-gray-300 bg-slate-900/80 px-3 py-1 rounded">
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading skeleton points…
                    </span>
                  </div>
                ) : selectedObjects.length === 0 || (isSkeletonCoordinateMode ? skeletonChartData.length === 0 : timelinePoints.length === 0) ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-gray-400 bg-slate-900/80 px-3 py-1 rounded">
                      {selectedObjects.length === 0
                        ? 'Select an object to see its trajectory'
                        : 'No trajectory data for selected object(s)'}
                    </span>
                  </div>
                ) : null}

                {hoverFrame !== null && hoverPos && (
                  <div
                    className="absolute pointer-events-none bg-black/80 text-white text-xs px-2 py-1 rounded shadow-lg border border-white/20"
                    style={{
                      left: hoverPos.x - 10,
                      top: hoverPos.y < 32 ? hoverPos.y + 12 : hoverPos.y - 10,
                      transform: hoverPos.y < 32 ? 'translateX(-100%)' : 'translate(-100%, -100%)',
                      zIndex: 100,
                    }}
                  >
                    Frame: {hoverFrame}
                  </div>
                )}
              </div>

              {/* Object ranges timeline */}
              <div className="flex-shrink-0 w-full" style={{ height: '40px' }}>
                {isLoadingUnique ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 bg-slate-900 rounded-md w-full">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading object ranges…
                  </div>
                ) : uniqueIdsData && uniqueIdsData.data?.objects?.length > 0 ? (
                  <ObjectRangesTimeline
                    objects={uniqueIdsData.data.objects.map(obj => ({
                      id: obj.id,
                      start_frame: obj.start_frame,
                      end_frame: obj.end_frame,
                    }))}
                    currentFrame={currentFrame}
                    onSeek={handleFrameJump}
                    getObjectColor={getObjectColor}
                    totalFrames={getTotalFrames()}
                    halfWindow={halfWindow}
                    onWindowChange={(newHalf) => {
                      setHalfWindow(newHalf);
                      setTotalVisibleInput((newHalf * 2).toString());
                    }}
                    windowInput={totalVisibleInput}
                    setWindowInput={setTotalVisibleInput}
                    showControls={false}
                    showXAxisLabels={false}
                    compact={true}
                    frameToX={frameToX}
                    minFrame={minFrame}
                    maxFrame={maxFrame}
                    plotWidth={plotWidth}
                    leftPadding={measuredPadding.left}
                    rightPadding={measuredPadding.right}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 bg-slate-900 rounded-md w-full">
                    No object ranges loaded
                  </div>
                )}
              </div>
            </div>
          </div>
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
