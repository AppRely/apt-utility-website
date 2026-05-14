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
import { exportTrk } from "@/lib/api/exportTrk";
import { Annotation, TrajectoryFrame, TrajectoryMap, SelectedObjectProps } from "@/types";
import UniqueIdsModal from "@/components/dashboard/UniqueIdsModal";
import {
  LineChart, Line as RechartsLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

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

  // --- Timeline state with overlapping prefetch ---
  const [timelinePoints, setTimelinePoints] = useState<Array<{ frame: number; x: number; y: number; objectId: number }>>([]);
  const [coordinateMode, setCoordinateMode] = useState<"x" | "y" | "xy">("x");
  
  // Track loaded ranges for timeline
  const timelineLoadedRangesRef = useRef<{ start: number; end: number }[]>([]);
  const timelinePendingRef = useRef<Set<string>>(new Set());
  const timelineAbortRef = useRef<AbortController | null>(null);
  const timelineDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const timelineFullyLoadedRef = useRef<boolean>(false); // Stop fetching when fully loaded

  // Timeline constants
  const TIMELINE_FETCH_WINDOW = 450;      // frames per fetch
  const TIMELINE_STEP = 225;              // step for overlapping (half of fetch window)
  const TIMELINE_DISPLAY_WINDOW = 300;    // show ±300 frames
  const TIMELINE_PREFETCH_THRESHOLD = 150; // trigger new fetch when 150 frames from edge
  const TIMELINE_KEEP_WINDOW = 250;       // keep only last 250 frames before current
  const MIN_FRAMES_TO_FETCH = 50;         // if remaining frames less than this, fetch only up to end

  // Memory management constants
  const MAX_ANNOTATION_WINDOW_SECONDS = 120;
  const MAX_TRAJECTORY_SECONDS = 60;
  const ANNO_WINDOW_SECONDS = 6;
  const STAGE_WIDTH = 900;
  const STAGE_HEIGHT = 850;
  const ANNO_THROTTLE_MS = 500;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 10;

  const layerRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const currentAnnoWindowRef = useRef<{ start: number; end: number } | null>(null);
  const lastAnnoLoadTs = useRef<number>(0);
  const nextPrefetchFrameRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  
  const [, forceTrajectoryUpdate] = useState(0);
  const trajectoryUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
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
    { category: "Panels", items: [
      { action: "Open ID Table", key: "M" },
      { action: "Open Shortcuts", key: "?" },
    ] },
  ];
  const OBJECT_COLORS = ["#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF","#FFA500","#800080","#008000","#000080","#FF1493","#00BFFF","#7CFC00","#FFD700","#A52A2A","#DC143C","#4B0082","#8B4513","#2E8B57","#4682B4"];

  const ANNO_PREFETCH_THRESHOLD = useMemo(() => {
    return Math.round((stableFpsRef.current / 100) * ANNO_WINDOW_SECONDS * stableFpsRef.current);
  }, []);
  const [showUniqueModal, setShowUniqueModal] = useState(false);
  const projectName = sessionStorage.getItem("project_name") || undefined;
  const videoName = sessionStorage.getItem("video_name") || undefined;
  const trkFileName = sessionStorage.getItem("trk_file_name") || undefined;

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      if (frameStepTimerRef.current) clearTimeout(frameStepTimerRef.current);
      if (trajectoryUpdateIntervalRef.current) clearInterval(trajectoryUpdateIntervalRef.current);
      if (timelineDebounceRef.current) clearTimeout(timelineDebounceRef.current);
      if (timelineAbortRef.current) timelineAbortRef.current.abort();
    };
  }, []);

  useEffect(() => { setMounted(true); }, []);

  // --- Load session data & FPS ---
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
      console.log(`[FPS LOCK] Original FPS locked at: ${originalFps}`);
    }
    if (storedWidth) setVideoWidth(Number(storedWidth));
    if (storedHeight) setVideoHeight(Number(storedHeight));
    if (storedDuration) setDuration(Number(storedDuration));
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !originalFpsLoadedRef.current) return;
    if (fps !== stableFpsRef.current) {
      console.log(`[FPS ERROR] ⚠️ FPS changed from ${stableFpsRef.current} to ${fps}! Resetting`);
      setFps(stableFpsRef.current);
    }
  }, [fps, mounted]);

  // --- Helper to get total frames safely ---
  const getTotalFrames = useCallback(() => {
    if (duration <= 0 || stableFpsRef.current <= 0) return 0;
    return Math.floor(duration * stableFpsRef.current);
  }, [duration]);

  // --- Merge timeline points ---
  const mergeTimelinePoints = useCallback((newPoints: Array<{ frame: number; x: number; y: number; objectId: number }>) => {
    setTimelinePoints(prev => {
      const map = new Map<string, typeof newPoints[0]>();
      prev.forEach(p => map.set(`${p.frame}-${p.objectId}`, p));
      newPoints.forEach(p => map.set(`${p.frame}-${p.objectId}`, p));
      return Array.from(map.values()).sort((a, b) => a.frame - b.frame);
    });
  }, []);

  // --- Core timeline fetch with overlapping window ---
  const fetchTimelineRange = useCallback(async (start: number, end: number) => {
    if (!projectId) return;
    if (!isFinite(start) || !isFinite(end) || start > end) {
      console.warn(`[Timeline] Invalid range: ${start} - ${end}`);
      return;
    }
    const totalFrames = getTotalFrames();
    if (totalFrames === 0) return;
    const clampedStart = Math.max(0, Math.min(start, totalFrames));
    const clampedEnd = Math.max(0, Math.min(end, totalFrames));
    if (clampedStart > clampedEnd) return;

    const key = `${clampedStart}-${clampedEnd}`;
    if (timelinePendingRef.current.has(key)) return;
    // Check if this range is fully covered by already loaded ranges
    if (timelineLoadedRangesRef.current.some(r => r.start <= clampedStart && r.end >= clampedEnd)) {
      return;
    }

    timelinePendingRef.current.add(key);
    if (timelineAbortRef.current) timelineAbortRef.current.abort();
    const controller = new AbortController();
    timelineAbortRef.current = controller;

    try {
      console.log(`[Timeline] Fetching overlapping range ${clampedStart} to ${clampedEnd}`);
      const data = await getTimelineData(projectId, clampedStart, clampedEnd, controller.signal);
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
        mergeTimelinePoints(points);
        // Merge the new range into loaded ranges
        let newRanges = [...timelineLoadedRangesRef.current, { start: clampedStart, end: clampedEnd }];
        newRanges.sort((a, b) => a.start - b.start);
        const merged = [];
        for (const range of newRanges) {
          if (!merged.length || merged[merged.length-1].end < range.start - 1) {
            merged.push(range);
          } else {
            merged[merged.length-1].end = Math.max(merged[merged.length-1].end, range.end);
          }
        }
        timelineLoadedRangesRef.current = merged;
        
        // Check if we now cover the entire video
        const maxEnd = Math.max(...merged.map(r => r.end), 0);
        if (maxEnd >= totalFrames - 1) {
          timelineFullyLoadedRef.current = true;
          console.log('[Timeline] Fully loaded – stopping further prefetch');
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error(`[Timeline] Error fetching ${clampedStart}-${clampedEnd}:`, err);
      }
    } finally {
      timelinePendingRef.current.delete(key);
      if (timelineAbortRef.current === controller) timelineAbortRef.current = null;
    }
  }, [projectId, mergeTimelinePoints, getTotalFrames]);

  // --- Timeline prefetch with end detection (prevents infinite loops) ---
  useEffect(() => {
    if (!projectId) return;
    const totalFrames = getTotalFrames();
    if (totalFrames === 0) return;
    
    // If we already marked as fully loaded, do nothing
    if (timelineFullyLoadedRef.current) return;

    if (timelineDebounceRef.current) clearTimeout(timelineDebounceRef.current);
    timelineDebounceRef.current = setTimeout(() => {
      // If no data loaded, fetch a window around current frame
      if (timelineLoadedRangesRef.current.length === 0) {
        const centerStart = Math.max(0, currentFrame - TIMELINE_FETCH_WINDOW / 2);
        const centerEnd = Math.min(currentFrame + TIMELINE_FETCH_WINDOW / 2, totalFrames);
        if (centerStart <= centerEnd) {
          fetchTimelineRange(centerStart, centerEnd);
        }
        return;
      }

      // Determine the furthest loaded end and start
      let maxLoadedEnd = -1;
      let minLoadedStart = Infinity;
      for (const range of timelineLoadedRangesRef.current) {
        maxLoadedEnd = Math.max(maxLoadedEnd, range.end);
        minLoadedStart = Math.min(minLoadedStart, range.start);
      }

      // Check if we have reached the end
      if (maxLoadedEnd >= totalFrames - 1) {
        timelineFullyLoadedRef.current = true;
        console.log('[Timeline] Already at video end, stopping prefetch');
        return;
      }

      // Forward prefetch: only if current frame is within threshold of the loaded end
      const distanceToEnd = maxLoadedEnd - currentFrame;
      if (distanceToEnd <= TIMELINE_PREFETCH_THRESHOLD) {
        const remainingFrames = totalFrames - maxLoadedEnd;
        if (remainingFrames <= MIN_FRAMES_TO_FETCH) {
          // Fetch only the remaining frames to the end
          const nextStart = maxLoadedEnd + 1;
          const nextEnd = totalFrames;
          if (nextStart <= nextEnd && !timelineLoadedRangesRef.current.some(r => r.start <= nextStart && r.end >= nextEnd)) {
            fetchTimelineRange(nextStart, nextEnd);
          } else {
            timelineFullyLoadedRef.current = true;
          }
        } else {
          // Normal overlapping fetch
          const nextStart = maxLoadedEnd + 1;
          // Overlap: start from maxLoadedEnd - TIMELINE_STEP + 1
          const overlapStart = Math.max(0, maxLoadedEnd - TIMELINE_STEP + 1);
          const nextEnd = Math.min(overlapStart + TIMELINE_FETCH_WINDOW, totalFrames);
          if (overlapStart <= nextEnd && !timelineLoadedRangesRef.current.some(r => r.start <= overlapStart && r.end >= nextEnd)) {
            fetchTimelineRange(overlapStart, nextEnd);
          }
        }
      }

      // Backward prefetch (only if needed and not at start)
      const distanceToStart = currentFrame - minLoadedStart;
      if (distanceToStart <= TIMELINE_PREFETCH_THRESHOLD && minLoadedStart > 0) {
        const prevEnd = minLoadedStart - 1;
        const overlapEnd = Math.min(totalFrames, minLoadedStart + TIMELINE_STEP - 1);
        const prevStart = Math.max(0, overlapEnd - TIMELINE_FETCH_WINDOW);
        if (prevStart <= prevEnd && !timelineLoadedRangesRef.current.some(r => r.start <= prevStart && r.end >= prevEnd)) {
          fetchTimelineRange(prevStart, prevEnd);
        }
      }
    }, 300);
  }, [currentFrame, projectId, getTotalFrames, fetchTimelineRange]);

  // Reset fully loaded flag when project changes or seek far away
  useEffect(() => {
    if (projectId && timelineLoadedRangesRef.current.length === 0) {
      timelineFullyLoadedRef.current = false;
    }
  }, [projectId]);

  // --- Memory pruning: keep only points within ±TIMELINE_KEEP_WINDOW frames ---
  useEffect(() => {
    if (timelinePoints.length === 0) return;
    const minKeep = currentFrame - TIMELINE_KEEP_WINDOW;
    const maxKeep = currentFrame + TIMELINE_KEEP_WINDOW;
    const filtered = timelinePoints.filter(p => p.frame >= minKeep && p.frame <= maxKeep);
    if (filtered.length !== timelinePoints.length) {
      console.log(`[TIMELINE] Pruned ${timelinePoints.length - filtered.length} points, keeping ±${TIMELINE_KEEP_WINDOW} frames`);
      setTimelinePoints(filtered);
    }
  }, [currentFrame, timelinePoints]);

  // Chart data: only points within display window (±TIMELINE_DISPLAY_WINDOW)
  const filteredTimelinePoints = useMemo(() => {
    const minFrame = currentFrame - TIMELINE_DISPLAY_WINDOW;
    const maxFrame = currentFrame + TIMELINE_DISPLAY_WINDOW;
    return timelinePoints.filter(p => p.frame >= minFrame && p.frame <= maxFrame);
  }, [timelinePoints, currentFrame]);

  const chartData = useMemo(() => {
    const grouped = new Map<number, any>();
    filteredTimelinePoints.forEach(p => {
      if (!grouped.has(p.frame)) grouped.set(p.frame, { frame: p.frame });
      const row = grouped.get(p.frame);
      if (coordinateMode === "x" || coordinateMode === "xy") row[`obj_${p.objectId}_x`] = p.x;
      if (coordinateMode === "y" || coordinateMode === "xy") row[`obj_${p.objectId}_y`] = p.y;
    });
    return Array.from(grouped.values()).sort((a, b) => a.frame - b.frame);
  }, [filteredTimelinePoints, coordinateMode]);

  const uniqueObjectIds = useMemo(() => {
    return Array.from(new Set(filteredTimelinePoints.map(p => p.objectId)));
  }, [filteredTimelinePoints]);

  // Chart click handler
  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const frame = data.activePayload[0].payload.frame;
      const time = frame / stableFpsRef.current;
      handleSeek(time);
    }
  };

  // Tooltip formatter
  const tooltipFormatter = useCallback((
    value: any,
    name: string | number | undefined,
    props: any
  ): [string, string] => {
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

  // --- Annotation helper functions (unchanged, kept from original) ---
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

  const getObjectColor = (id: number) => OBJECT_COLORS[id % OBJECT_COLORS.length];
  
  const togglePlayPause = useCallback(() => {
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => toast({ title: "Click the play button", duration: 1500 }));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [video, toast]);

  // --- Trajectory management (unchanged) ---
  useEffect(() => {
    if (!mounted) return;
    if (trajectoryUpdateIntervalRef.current) clearInterval(trajectoryUpdateIntervalRef.current);
    trajectoryUpdateIntervalRef.current = setInterval(() => {
      const currentTrajMap = trajectoriesRef.current;
      if (currentTrajMap.size > 0) {
        setTrajectoryMap(new Map(currentTrajMap));
        forceTrajectoryUpdate(v => v + 1);
      }
    }, 500);
    return () => { if (trajectoryUpdateIntervalRef.current) clearInterval(trajectoryUpdateIntervalRef.current); };
  }, [mounted]);
  
  const addTrajectoryPoints = useCallback((newTrajectoryFrames: TrajectoryFrame[]) => {
    const MAX_TRAJ_FRAMES = MAX_TRAJECTORY_SECONDS * stableFpsRef.current;
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
  
  // --- Zoom and pan handlers (unchanged) ---
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
    const clampedScale = Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM);
    setCurrentZoom(clampedScale);
    const newPos = { x: pointer.x - mousePointTo.x * clampedScale, y: pointer.y - mousePointTo.y * clampedScale };
    setStageScale({ x: clampedScale, y: clampedScale });
    setStagePos(newPos);
  }, []);
  
  const getCircleRadius = () => Math.max(0.5, 2*(1/currentZoom));
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

  // --- Auto-pan to selected object (unchanged) ---
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
    const stageObjX = mapX(objX);
    const stageObjY = mapY(objY);
    const stage = stageRef.current;
    const currentStageX = stage.x();
    const currentStageY = stage.y();
    const currentScale = stage.scaleX();
    const margin = 80;
    const marginInStage = margin / currentScale;
    const viewportLeft = -currentStageX / currentScale;
    const viewportRight = (STAGE_WIDTH - currentStageX) / currentScale;
    const viewportTop = -currentStageY / currentScale;
    const viewportBottom = (STAGE_HEIGHT - currentStageY) / currentScale;
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
    if (needsPan) {
      setStagePos({ x: currentStageX - targetOffsetX, y: currentStageY - targetOffsetY });
    }
  }, [selectedObjects, currentFrame, annotationMap, currentZoom, autoPanEnabled, isDragging, isPanMode, video]);

  useEffect(() => {
    if (!video || !mounted) return;
    const handleTimeUpdate = () => {
      if (autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) panToSelectedObject();
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [video, mounted, autoPanEnabled, selectedObjects.length, currentZoom, isDragging, isPanMode, panToSelectedObject]);

  useEffect(() => {
    if (autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) {
      setTimeout(() => panToSelectedObject(), 50);
    }
  }, [currentZoom, autoPanEnabled, selectedObjects.length, isDragging, isPanMode, panToSelectedObject]);

  useEffect(() => {
    if (annotationsReady && autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) {
      panToSelectedObject();
    }
  }, [annotationsReady, autoPanEnabled, selectedObjects.length, currentZoom, isDragging, isPanMode, panToSelectedObject]);

  useEffect(() => {
    if (autoPanEnabled && selectedObjects.length === 1 && currentZoom > 1.1 && !isDragging && !isPanMode) {
      panToSelectedObject();
    }
  }, [currentFrame, autoPanEnabled, selectedObjects.length, currentZoom, isDragging, isPanMode, panToSelectedObject]);

  // --- Annotation fetching mutation (unchanged) ---
  const chunkMutation = useMutation({
    mutationFn: async ({ start, end }: { start: number; end: number }) => {
      if (!projectId) return null;
      const key = `${start}-${end}`;
      pendingRangesRef.current.add(key);
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      console.log(`[API DEBUG] Fetching frames ${start} to ${end}`);
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
        setTimeout(() => {
          video.play().then(() => setIsPlaying(true)).catch(err => console.log("[AUTO-PLAY] Could not auto-play:", err));
        }, 100);
      }
    },
    onError: (_, { start, end }) => {
      const key = `${start}-${end}`;
      pendingRangesRef.current.delete(key);
      if (!isFrameStepSequenceRef.current) setIsLoadingAnnotations(false);
    },
  });

  // --- Clean up old annotations (sliding window) ---
  useEffect(() => {
    if (!mounted || annotationMap.size === 0) return;
    const maxFrames = MAX_ANNOTATION_WINDOW_SECONDS * stableFpsRef.current;
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
    if (removedCount > 0) {
      console.log(`[MEMORY] Pruned ${removedCount} old annotations (frame ${currentFrame})`);
      setAnnotationMap(newMap);
    }
  }, [currentFrame, annotationMap, mounted]);

  // --- Clean up old trajectory points ---
  useEffect(() => {
    if (!mounted) return;
    const maxTrajFrames = MAX_TRAJECTORY_SECONDS * stableFpsRef.current;
    const cutoffFrame = Math.max(0, currentFrame - maxTrajFrames);
    let prunedAny = false;

    const originalLength = persistentTrajectoryRef.current.length;
    persistentTrajectoryRef.current = persistentTrajectoryRef.current.filter(t => t.frame_id >= cutoffFrame);
    if (persistentTrajectoryRef.current.length !== originalLength) prunedAny = true;

    for (const [objId, frameMap] of trajectoriesRef.current.entries()) {
      for (const frameId of frameMap.keys()) {
        if (frameId < cutoffFrame) {
          frameMap.delete(frameId);
          prunedAny = true;
        }
      }
      if (frameMap.size === 0) {
        trajectoriesRef.current.delete(objId);
      }
    }

    if (prunedAny) {
      setTrajectoryMap(new Map(trajectoriesRef.current));
      setTrajectoryPointCount(persistentTrajectoryRef.current.length);
      console.log(`[MEMORY] Pruned trajectory points older than frame ${cutoffFrame}`);
    }
  }, [currentFrame, mounted]);

  const objectMutation = useMutation({ mutationFn: ({ projectId, objectId, frameId }: any) => getObjectData(projectId, objectId, frameId) });
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
      const windowFrames = Math.round(ANNO_WINDOW_SECONDS * stableFpsRef.current);
      const totalFrames = Math.floor(video.duration * stableFpsRef.current);
      const windowStart = Math.max(0, frameId);
      const windowEnd = Math.min(frameId + windowFrames, totalFrames);
      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
        chunkMutation.mutate({ start: Math.max(0, windowStart - 600), end: windowEnd });
      } else {
        setIsLoadingAnnotations(false);
      }
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
      console.log(`[STEP BLOCKED] Currently seeking, queuing step ${step}`);
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
    console.log(`[STEP DEBUG] Seek initiated to frame ${newFrame}`);
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

  // --- Optimized handleSeek with far seek detection and memory clearing ---
  const handleSeek = async (time: number) => {
    if (!video) return;
    if (isSeekingRef.current) {
      console.log(`[SEEK BLOCKED] Currently seeking, queuing time ${time}`);
      const targetFrame = Math.round(time * stableFpsRef.current);
      setPendingFrameVisual(targetFrame);
      setTimeout(() => setPendingFrameVisual(null), 500);
      pendingFrameRef.current = targetFrame;
      return;
    }
    const safeTime = Math.min(Math.max(time, 0), video.duration);
    const targetFrame = Math.round(safeTime * stableFpsRef.current);
    if (lastSeekFrameRef.current === targetFrame && Math.abs(lastSeekTimeRef.current - safeTime) < 0.01) {
      console.log(`[SEEK DEBUG] ⏭️ Skipping duplicate seek to frame ${targetFrame}`);
      return;
    }
    lastSeekFrameRef.current = targetFrame;
    lastSeekTimeRef.current = safeTime;
    console.log(`[SEEK DEBUG] Seeking to frame ${targetFrame}`);
    isSeekingRef.current = true;
    pendingFrameRef.current = null;

    // Check if target frame is far from currently loaded annotation ranges
    const isWithinLoadedRange = loadedRangesListRef.current.some(range => targetFrame >= range.start && targetFrame <= range.end);
    if (!isWithinLoadedRange) {
      console.log(`[SEEK] Target frame ${targetFrame} outside loaded ranges, clearing old data.`);
      setAnnotationMap(new Map());
      persistentTrajectoryRef.current = [];
      trajectoriesRef.current = new Map();
      setTrajectoryMap(new Map());
      setTrajectoryPointCount(0);
      clearLoadedRanges();
      // Also reset timeline fully loaded flag when seeking far
      timelineFullyLoadedRef.current = false;
      timelineLoadedRangesRef.current = [];
      setTimelinePoints([]);
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
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * stableFpsRef.current);
    const totalFrames = Math.floor(video.duration * stableFpsRef.current);
    const TRAJECTORY_BUFFER = stableFpsRef.current * 30;
    const windowStart = Math.max(0, targetFrame - TRAJECTORY_BUFFER);
    const windowEnd = Math.min(targetFrame + windowFrames + TRAJECTORY_BUFFER, totalFrames);
    if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
      chunkMutation.mutate({ start: windowStart, end: windowEnd });
    } else {
      setIsLoadingAnnotations(false);
    }
    nextPrefetchFrameRef.current = null;
  };

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

  // --- VIDEO INITIALIZATION (unchanged) ---
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
          console.log(`[SEEKED] Target: ${targetFrame}, Actual: ${actualFrame}`);
          if (targetFrame !== null && actualFrame !== targetFrame) {
            console.log(`[SEEKED] ❌ MISMATCH! Retrying...`);
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
            const windowFrames = Math.round(ANNO_WINDOW_SECONDS * lockedFps);
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
            console.log(`[SEEKED] Processing queued frame: ${queuedFrame}`);
            setTimeout(() => {
              const queuedTime = queuedFrame / lockedFps;
              handleSeek(queuedTime);
            }, 10);
          }
        };
        vid.addEventListener('seeked', handleSeeked);
        vid.onloadedmetadata = async () => {
          console.log(`[VIDEO] Loaded - Duration: ${vid.duration}s, FPS: ${lockedFps}`);
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

  const scale = videoWidth && videoHeight ? Math.min(STAGE_WIDTH/videoWidth, STAGE_HEIGHT/videoHeight) : 1;
  const displayWidth = videoWidth ? videoWidth*scale : STAGE_WIDTH;
  const displayHeight = videoHeight ? videoHeight*scale : STAGE_HEIGHT;
  const offsetX = (STAGE_WIDTH - displayWidth)/2;
  const offsetY = (STAGE_HEIGHT - displayHeight)/2;
  const mapX = (x: number) => offsetX + x*scale;
  const mapY = (y: number) => offsetY + y*scale;

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
      if (isPlaying && now - lastAnnoLoadTs.current > ANNO_THROTTLE_MS) {
        if (currentAnnoWindowRef.current) {
          const totalFrames = Math.floor(duration * stableFpsRef.current);
          const windowSize = Math.round(ANNO_WINDOW_SECONDS * stableFpsRef.current);
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

  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (!video || document.activeElement?.closest(".your-controls-class")) return;
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
        case "KeyM": e.preventDefault(); setShowUniqueModal(prev => !prev); break;
        case "Slash": e.preventDefault(); setShowShortcutModal(prev => !prev); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [video, togglePlayPause, handleSkip, handleFrameStep, handleZoomIn, handleZoomOut, selectedObjects, handleFrameJump, toast, mounted, autoPanEnabled]);

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
      <div className="flex flex-col gap-2 w-full h-full">
        <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2 h-full">
          <div className="relative flex items-center justify-center mb-2 w-full h-[calc(100%-80px)] bg-black">
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
              width={STAGE_WIDTH} 
              height={STAGE_HEIGHT} 
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
                            if (autoPanEnabled && currentZoom > 1.1) {
                              setTimeout(() => panToSelectedObject(), 100);
                            }
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
            <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
              {(stageScale.x*100).toFixed(0)}%
            </div>
            <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm flex gap-2">
              <Button 
                variant={autoPanEnabled ? "default" : "ghost"} 
                size="sm"
                onClick={() => setAutoPanEnabled(!autoPanEnabled)}
                className={`text-[11px] px-2 py-1 ${autoPanEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}
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
                  className="bg-[#3B46A0] text-white text-[13px] px-3 py-2 rounded-[5px] flex items-center gap-2 border-2 border-[#3B46A0] hover:bg-[#3B46A0]" 
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
                onClick={() => setShowUniqueModal(prev => !prev)}
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
            </div>
            <div className="absolute top-2 left-1 text-white px-2 py-1 rounded text-xs">
              Frame: {currentFrame}
            </div>
          </div>
          
          {/* Timeline Chart with overlapping prefetch and end detection */}
          <div className="px-2 py-1 bg-gray-900 rounded-md mt-1">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-300">Object Coordinates Timeline (±{TIMELINE_DISPLAY_WINDOW} frames)</span>
              <div className="flex gap-2">
                <select
                  value={coordinateMode}
                  onChange={(e) => setCoordinateMode(e.target.value as "x" | "y" | "xy")}
                  className="bg-gray-800 text-white text-xs rounded-md px-2 py-1 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="x">X Axis</option>
                  <option value="y">Y Axis</option>
                  <option value="xy">X + Y</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto" style={{ maxWidth: '100%' }}>
              <div style={{ minWidth: '800px', width: '100%' }}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    onClick={handleChartClick}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                      dataKey="frame"
                      type="number"
                      domain={[currentFrame - TIMELINE_DISPLAY_WINDOW, currentFrame + TIMELINE_DISPLAY_WINDOW]}
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
                    <ReferenceLine x={currentFrame} stroke="#ff3333" strokeWidth={1} label={{ value: '▶', position: 'top', fill: '#ff3333', fontSize: 12 }} />
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
                            strokeWidth={1}
                            dot={false}
                            activeDot={false}
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
                            strokeWidth={1}
                            strokeDasharray={coordinateMode === 'xy' ? '4 3' : undefined}
                            dot={false}
                            activeDot={false}
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
          </div>
          
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
      <UniqueIdsModal
        open={showUniqueModal}
        onClose={() => setShowUniqueModal(false)}
        projectId={projectId}
        projectName={projectName}
        videoName={videoName}
        trkFileName={trkFileName}
        onSelectObject={(id, frame) => {
          if (!video || !projectId) return;
          handleFrameJump(frame);
          objectMutation.mutate(
            { projectId, objectId: id, frameId: frame },
            {
              onSuccess: (meta) => {
                setSelectedObjects((prev) => {
                  if (prev.some(obj => obj.object_id === id)) {
                    return prev.filter(obj => obj.object_id !== id);
                  }
                  if (prev.length === 2) {
                    return [
                      prev[0],
                      { object_id: id, frame_id: frame, start_frame: meta.data.start_frame, end_frame: meta.data.end_frame, is_inside: meta.data.is_inside },
                    ];
                  }
                  return [
                    ...prev,
                    { object_id: id, frame_id: frame, start_frame: meta.data.start_frame, end_frame: meta.data.end_frame, is_inside: meta.data.is_inside },
                  ];
                });
              },
            }
          );
        }}
      />
    </>
  );
}