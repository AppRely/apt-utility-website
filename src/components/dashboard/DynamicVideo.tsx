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
  ZoomIn, ZoomOut, Undo, Redo,
} from "lucide-react";
import {
  Stage, Layer, Image as KonvaImage, Text, Circle, Group, Rect, Line,
} from "react-konva";
import { useMutation } from "@tanstack/react-query";
import { getObjectData } from "@/lib/api/getObjectData";
import { getFrameRangeData } from "@/lib/api/getFrameRangeData";
import { undoAction, redoAction } from "@/lib/api/undoRedo";
import { useQuery } from "@tanstack/react-query";
import { getActivityLogs } from "@/lib/api/getActivityLogs";
import { exportTrk } from "@/lib/api/exportTrk";
import { Frame, Annotation, TrajectoryFrame, TrajectoryMap, SelectedObjectProps } from "@/types";

export default function DynamicVideo({ selectedObjects, setSelectedObjects }: SelectedObjectProps) {
  // Mounted state for hydration - initialize as false
  const [mounted, setMounted] = useState(false);
  
  // Video states - initialize with default values, not from sessionStorage
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
  
  // Annotation states
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsReady, setAnnotationsReady] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(true);
  
  // Canvas states
  const [stageScale, setStageScale] = useState({ x: 1, y: 1 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  
  // Trajectory states
  const persistentTrajectoryRef = useRef<TrajectoryFrame[]>([]);
  const [trajectoryMap, setTrajectoryMap] = useState<TrajectoryMap>(new Map());
  const trajectoriesRef = useRef<TrajectoryMap>(new Map());
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [trajectoryPointCount, setTrajectoryPointCount] = useState(0);
  
  // UI states
  const [frameInput, setFrameInput] = useState("");
  const [showSpeed, setShowSpeed] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [trkVersion, setTrkVersion] = useState(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Range tracking
  const loadedRangesListRef = useRef<{ start: number; end: number }[]>([]);
  const pendingRangesRef = useRef<Set<string>>(new Set());
  const loadedRangesKeyRef = useRef<Set<string>>(new Set());

  // Constants
  const ANNO_WINDOW_SECONDS = 6;
  const ANNO_PREFETCH_THRESHOLD = Math.round((30 / 100) * ANNO_WINDOW_SECONDS * 30);
  const STAGE_WIDTH = 900;
  const STAGE_HEIGHT = 850;
  const ANNO_THROTTLE_MS = 500;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 10;

  // Refs
  const layerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const currentAnnoWindowRef = useRef<{ start: number; end: number } | null>(null);
  const lastAnnoLoadTs = useRef<number>(0);
  const nextPrefetchFrameRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { toast } = useToast();
  const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
  const OBJECT_COLORS = ["#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF","#FFA500","#800080","#008000","#000080","#FF1493","#00BFFF","#7CFC00","#FFD700","#A52A2A","#DC143C","#4B0082","#8B4513","#2E8B57","#4682B4"];

  // Handle mounting - this ensures client-only code runs after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load data from sessionStorage only after mounting
  useEffect(() => {
    if (!mounted) return;
    
    const storedProjectId = sessionStorage.getItem("projectId");
    const storedFps = sessionStorage.getItem("fps");
    const storedWidth = sessionStorage.getItem("width");
    const storedHeight = sessionStorage.getItem("height");
    const storedDuration = sessionStorage.getItem("duration");
    
    if (storedProjectId) setProjectId(Number(storedProjectId));
    if (storedFps) setFps(Number(storedFps));
    if (storedWidth) setVideoWidth(Number(storedWidth));
    if (storedHeight) setVideoHeight(Number(storedHeight));
    if (storedDuration) setDuration(Number(storedDuration));
  }, [mounted]);

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
    console.log(`[RANGE ADDED] ${start}-${end} → merged:`, JSON.stringify(merged));
  }, []);

  const clearLoadedRanges = useCallback(() => {
    loadedRangesListRef.current = [];
    loadedRangesKeyRef.current.clear();
    console.log(`[RANGES CLEARED]`);
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

  // Trajectory sliding window (last 2 minutes)
  useEffect(() => {
    if (!mounted) return;
    const MAX_TRAJECTORY_FRAMES = 30 * fps;
    const now = Math.round((video?.currentTime || 0) * fps);
    const cutoffFrame = Math.max(0, now - MAX_TRAJECTORY_FRAMES);
    const filteredTraj = persistentTrajectoryRef.current.filter(traj => traj.frame_id >= cutoffFrame);
    if (filteredTraj.length !== persistentTrajectoryRef.current.length) persistentTrajectoryRef.current = filteredTraj;
    const newMap: TrajectoryMap = new Map();
    persistentTrajectoryRef.current.forEach(traj => {
      if (!newMap.has(traj.object_id)) newMap.set(traj.object_id, new Map());
      newMap.get(traj.object_id)!.set(traj.frame_id, traj.coordinate);
    });
    trajectoriesRef.current = newMap;
    setTrajectoryMap(newMap);
  }, [persistentTrajectoryRef.current.length, fps, video?.currentTime, mounted]);

  const getTrajectoryPointsUpToCurrent = useCallback((objectId: number, upToFrame: number): number[] => {
    const frameTrajectory = trajectoryMap.get(objectId);
    if (!frameTrajectory || frameTrajectory.size < 2) return [];
    const twoMinFrames = 2 * 60 * fps;
    const cutoffFrame = Math.max(0, upToFrame - twoMinFrames);
    const sortedFrames = Array.from(frameTrajectory.keys()).sort((a,b)=>a-b).filter(fid => fid >= cutoffFrame && fid <= upToFrame);
    if (sortedFrames.length < 2) return [];
    const points: number[] = [];
    sortedFrames.forEach(fid => { const [x,y] = frameTrajectory.get(fid)!; points.push(x,y); });
    return points;
  }, [trajectoryMap, fps]);

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

  const chunkMutation = useMutation({
    mutationFn: async ({ start, end }: { start: number; end: number }) => {
      if (!projectId) return null;
      const key = `${start}-${end}`;
      pendingRangesRef.current.add(key);

      //  CANCEL previous request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      console.log(`[CANCEL PREVIOUS + NEW API] ${start}-${end}`);
      return getFrameRangeData(projectId, start, end, controller.signal);
    },
    onSuccess: (data, { start, end }) => {
      if (!data) return; // ignore cancelled response
      const key = `${start}-${end}`;
      if (!data) { pendingRangesRef.current.delete(key); return; }
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
      setAnnotations(prev => {
        const existingIds = new Set(prev.map(a => `${a.object_id}-${a.frame_id}`));
        const newOnes = loadedAnnotations.filter(a => !existingIds.has(`${a.object_id}-${a.frame_id}`));
        return [...prev, ...newOnes];
      });
      const MAX_TRAJ_FRAMES = 2 * 60 * fps;
      const currentFrameNum = video ? Math.round(video.currentTime * fps) : 0;
      const cutoff = Math.max(0, currentFrameNum - MAX_TRAJ_FRAMES);
      const filteredNewTraj = newTrajectoryFrames.filter(t => t.frame_id >= cutoff);
      persistentTrajectoryRef.current = [...persistentTrajectoryRef.current, ...filteredNewTraj].filter(t => t.frame_id >= cutoff);
      setTrajectoryPointCount(persistentTrajectoryRef.current.length);
      const startFrame = typeof data.start_frame === "number" ? data.start_frame : start;
      const endFrame = typeof data.end_frame === "number" ? data.end_frame : end;
      currentAnnoWindowRef.current = { start: startFrame, end: endFrame };
      pendingRangesRef.current.delete(key);
      setIsLoadingAnnotations(false);
      setAnnotationsReady(true);
      
      // Auto-play video when initial annotations load
      if (!initialLoadComplete && video && video.paused && mounted) {
        setInitialLoadComplete(true);
        setTimeout(() => {
          video.play().then(() => {
            setIsPlaying(true);
            console.log("[AUTO-PLAY] Video started playing after initial annotation load");
          }).catch(err => {
            console.log("[AUTO-PLAY] Could not auto-play:", err);
          });
        }, 100);
      }
    },
    onError: (_, { start, end }) => {
      const key = `${start}-${end}`;
      pendingRangesRef.current.delete(key);
      setIsLoadingAnnotations(false);
    },
  });

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
      setAnnotations([]);
      persistentTrajectoryRef.current = [];
      trajectoriesRef.current = new Map();
      setTrajectoryMap(new Map());
      setTrajectoryPointCount(0);
      clearLoadedRanges();
      setIsLoadingAnnotations(true);
      const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
      const totalFrames = Math.floor(video.duration * fps);
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
  }, [video, fps, activityLogsQuery, mounted]);

  const undoCount = activityLogsQuery.data?.data?.total_undo_can_perform ?? 0;
  const totalLength = activityLogsQuery.data?.data?.total_length ?? 0;
  const redoCount = totalLength - undoCount;
  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted]);

  const scale = videoWidth && videoHeight ? Math.min(STAGE_WIDTH/videoWidth, STAGE_HEIGHT/videoHeight) : 1;
  const displayWidth = videoWidth ? videoWidth*scale : STAGE_WIDTH;
  const displayHeight = videoHeight ? videoHeight*scale : STAGE_HEIGHT;
  const offsetX = (STAGE_WIDTH - displayWidth)/2;
  const offsetY = (STAGE_HEIGHT - displayHeight)/2;
  const mapX = (x: number) => offsetX + x*scale;
  const mapY = (y: number) => offsetY + y*scale;

  const undoMutation = useMutation({
    mutationFn: () => undoAction(projectId!),
    onSuccess: () => { toast({ title: "Undo successful", duration: 1500 }); if(video) window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Math.round(video.currentTime*fps) } })); },
    onError: () => toast({ title: "Undo failed", variant: "destructive", duration: 1500 }),
  });
  
  const redoMutation = useMutation({
    mutationFn: () => redoAction(projectId!),
    onSuccess: () => { toast({ title: "Redo successful", duration: 1500 }); if(video) window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Math.round(video.currentTime*fps) } })); },
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
      setCurrentTime(vid.currentTime);
      const now = performance.now();
      if (isPlaying && now - lastAnnoLoadTs.current > ANNO_THROTTLE_MS) {
        const frameNumber = Math.round(vid.currentTime * fps);
        if (currentAnnoWindowRef.current) {
          const totalFrames = Math.floor(duration * fps);
          const windowSize = Math.round(ANNO_WINDOW_SECONDS * fps);
          const prefetchPoint = currentAnnoWindowRef.current.start + ANNO_PREFETCH_THRESHOLD;
          const nextStart = frameNumber;
          const nextEnd = Math.min(frameNumber + windowSize, totalFrames);
          if (frameNumber >= prefetchPoint && frameNumber + windowSize <= totalFrames && !isRangeAlreadyLoading(nextStart, nextEnd)) {
            if (!loadedRangesKeyRef.current.has(`${nextStart}-${nextEnd}`)) {
              chunkMutation.mutate({ start: Math.max(0, nextStart), end: nextEnd });
              lastAnnoLoadTs.current = now;
            }
          }
        }
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => { setIsPlaying(false); if(video) sessionStorage.setItem("frameId", Math.round(video.currentTime*fps).toString()); };
    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("play", handlePlay);
    vid.addEventListener("pause", handlePause);
    return () => { vid.removeEventListener("timeupdate", handleTimeUpdate); vid.removeEventListener("play", handlePlay); vid.removeEventListener("pause", handlePause); };
  }, [video, fps, isPlaying, duration, mounted]);

  const handleSeek = async (time: number) => {
    if (!video) return;
    const safeTime = Math.min(Math.max(time, 0), video.duration);
    const targetFrame = Math.round(safeTime * fps);

    if (isFrameLoaded(targetFrame)) {
      console.log(`[SEEK] Frame ${targetFrame} already loaded, seeking without fetch`);
      video.pause();
      setIsPlaying(false);
      video.currentTime = safeTime;
      setCurrentTime(safeTime);
      setDragTime(null);
      setSelectedFrameIndex(targetFrame);
      setIsLoadingAnnotations(false);
      setAnnotationsReady(true);
      return;
    }

    console.log(`[SEEK] Frame ${targetFrame} not loaded, clearing and fetching`);
    video.pause();
    setIsPlaying(false);
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
    setDragTime(null);
    setSelectedFrameIndex(targetFrame);
    clearLoadedRanges();
    setAnnotationsReady(false);
    setIsLoadingAnnotations(true);

    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const totalFrames = Math.floor(video.duration * fps);
    const windowStart = Math.max(0, targetFrame - 50);
    const windowEnd = Math.min(targetFrame + windowFrames, totalFrames);
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
    setAnnotationsReady(false);
    setIsLoadingAnnotations(true);
  };

  const handleSkip = (seconds: number) => {
    if (!video) return;
    const newTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration);
    video.currentTime = newTime;
    setCurrentTime(newTime);
    const newFrame = Math.round(newTime * fps);
    setSelectedFrameIndex(newFrame);
    sessionStorage.setItem("frameId", newFrame.toString());
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const totalFrames = Math.floor(video.duration * fps);
    const windowStart = Math.max(0, newFrame - 50);
    const windowEnd = Math.min(newFrame + windowFrames, totalFrames);
    if (!isFrameLoaded(newFrame)) {
      setIsLoadingAnnotations(true);
      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
        chunkMutation.mutate({ start: windowStart, end: windowEnd });
      } else {
        setIsLoadingAnnotations(false);
      }
    }
  };

  const handleFrameStep = useCallback((step: number) => {
    if (!video) return;
    const currentFrameNum = Math.round(video.currentTime * fps);
    let nextFrame = Math.min(Math.max(currentFrameNum + step, 0), Math.floor(video.duration * fps));
    if (Math.abs(step) > 1) nextFrame = Math.min(Math.max(nextFrame, 0), Math.floor(video.duration * fps));
    const nextTime = nextFrame / fps;

    const alreadyLoaded = isFrameLoaded(nextFrame);
    console.log(`[FRAME STEP] step=${step}, current=${currentFrameNum}, next=${nextFrame}, loaded=${alreadyLoaded}`);

    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setSelectedFrameIndex(nextFrame);
    sessionStorage.setItem("frameId", nextFrame.toString());

    if (!alreadyLoaded && !isLoadingAnnotations) {
      console.log(`[FRAME STEP] Frame ${nextFrame} not loaded, fetching`);
      const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
      const totalFrames = Math.floor(video.duration * fps);
      const windowStart = Math.max(0, nextFrame - 50);
      const windowEnd = Math.min(nextFrame + windowFrames, totalFrames);
      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
        setIsLoadingAnnotations(true);
        chunkMutation.mutate({ start: windowStart, end: windowEnd });
      }
    } else {
      console.log(`[FRAME STEP] Frame ${nextFrame} already loaded, skipping fetch`);
      setIsLoadingAnnotations(false);
    }
  }, [video, fps, isLoadingAnnotations, chunkMutation, isFrameLoaded]);

  const handleFrameJump = async (targetFrame: number) => {
    if (!video) return;
    const totalFrames = Math.floor(video.duration * fps);
    const safeFrame = Math.min(Math.max(targetFrame, 0), totalFrames);
    const safeTime = safeFrame / fps;
    video.pause();
    setIsPlaying(false);
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
    setSelectedFrameIndex(safeFrame);
    sessionStorage.setItem("frameId", safeFrame.toString());
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const windowStart = Math.max(0, safeFrame - 50);
    const windowEnd = Math.min(safeFrame + windowFrames, totalFrames);
    setIsLoadingAnnotations(true);
    if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
      chunkMutation.mutate({ start: windowStart, end: windowEnd });
    } else {
      setIsLoadingAnnotations(false);
    }
    nextPrefetchFrameRef.current = null;
    setFrameInput("");
  };

  const currentFrame = Math.round(currentTime * fps);
  const currentFrameAnnotations = useMemo(() => annotations.filter(a => a.frame_id === currentFrame), [annotations, currentFrame]);
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
        case "KeyS": e.preventDefault(); if(selectedObjects.length) { const obj = selectedObjects[selectedObjects.length-1]; if(obj.start_frame !== undefined) handleFrameJump(obj.start_frame); else toast({ title: "Start frame not available", duration: 1500 }); } else toast({ title: "No object selected", duration: 1500 }); break;
        case "KeyE": e.preventDefault(); if(selectedObjects.length) { const obj = selectedObjects[selectedObjects.length-1]; if(obj.end_frame !== undefined) handleFrameJump(obj.end_frame); else toast({ title: "End frame not available", duration: 1500 }); } else toast({ title: "No object selected", duration: 1500 }); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [video, togglePlayPause, handleSkip, handleFrameStep, handleZoomIn, handleZoomOut, selectedObjects, handleFrameJump, toast, mounted]);

  // Show loading state while mounting to prevent hydration errors
  // This ensures server and client render the exact same thing initially
  if (!mounted) {
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
            {isLoadingAnnotations && (
              <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4 mx-auto"></div>
                  <p className="text-white text-lg font-semibold">Loading annotations...</p>
                  <p className="text-gray-300 text-sm mt-2">Frame: {currentFrame}</p>
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
                {/* Fixed: Added unique keys for annotations to prevent duplicate key error */}
                {currentFrameAnnotations.map((a, annotationIndex) => {
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
            <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
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
            </div>
            <div className="absolute top-2 left-1 text-[24px] text-white px-2 py-1 rounded text-xs">
              Frame: {currentFrame}
            </div>
            <div className="absolute top-8 left-1 text-[24px] text-white px-2 py-1 rounded text-xs">
              Trajectory: {showTrajectory ? "✓ ON" : "✗ OFF"}
            </div>
            {isPanMode && (
              <div className="absolute top-14 left-2 bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold">
                🤚 Panning...
              </div>
            )}
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
                  max={video?.duration ? Math.floor(video.duration*fps) : undefined} 
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
    </>
  );
}


