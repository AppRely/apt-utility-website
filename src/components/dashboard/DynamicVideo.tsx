"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/hooks/use-toast";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Undo,
  Redo,
} from "lucide-react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text,
  Circle,
  Group,
  Rect,
  Line,
} from "react-konva";
import { extractFramesExact } from "@/lib/ffmpeg/extractFramesFast";
import { loadFFmpeg } from "@/lib/ffmpeg/ffmpeg";
import { useMutation } from "@tanstack/react-query";
import { getObjectData } from "@/lib/api/getObjectData";
import { getFrameRangeData } from "@/lib/api/getFrameRangeData";
import { SelectedObject } from "@/types/selection";
import { undoAction, redoAction } from "@/lib/api/undoRedo";
import { useQuery } from "@tanstack/react-query";
import { getActivityLogs } from "@/lib/api/getActivityLogs";

type Frame = { index: number; src: string };
type Annotation = {
  object_id: number;
  frame_id: number;
  coordinates: [number, number][];
};

type TrajectoryFrame = {
  frame_id: number;
  object_id: number;
  coordinate: [number, number];
};

type TrajectoryMap = Map<number, Map<number, [number, number]>>;

type SelectedObjectProps = {
  selectedObjects: SelectedObject[];
  setSelectedObjects: React.Dispatch<React.SetStateAction<SelectedObject[]>>;
};

const videoBlobCache = new Map<number, Promise<Blob>>();
let videoFetchController: AbortController | null = null;

async function fetchVideoBlob(videoId: number, apiUrl: string): Promise<Blob> {
  if (videoBlobCache.has(videoId)) {
    console.log(`Using cached blob for video ${videoId}`);
    return videoBlobCache.get(videoId)!;
  }

  if (videoFetchController) {
    videoFetchController.abort();
  }

  videoFetchController = new AbortController();

  console.log(`Fetching video blob for ${videoId}...`);
  const startTime = performance.now();

  const promise = (async () => {
    try {
      const res = await fetch(apiUrl, {
        signal: videoFetchController!.signal,
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch video: ${res.statusText}`);
      }

      const blob = await res.blob();
      const endTime = performance.now();

      return blob;
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log(`Video fetch cancelled`);
      }
      throw err;
    }
  })();

  videoBlobCache.set(videoId, promise);

  return promise;
}

export default function DynamicVideo({
  selectedObjects,
  setSelectedObjects,
}: SelectedObjectProps) {
  const [file, setFile] = useState<File | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [videoId, setVideoId] = useState<number | null>(null);

  const [annotationsReady, setAnnotationsReady] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false);

  const [wasPlayingBeforeSeek, setWasPlayingBeforeSeek] = useState(false); //

  const [stageScale, setStageScale] = useState({ x: 1, y: 1 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);

  const persistentTrajectoryRef = useRef<TrajectoryFrame[]>([]);
  const [trajectoryMap, setTrajectoryMap] = useState<TrajectoryMap>(new Map());
  const trajectoriesRef = useRef<TrajectoryMap>(new Map());
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [trajectoryPointCount, setTrajectoryPointCount] = useState(0);

  const ANNO_WINDOW_SECONDS = 5;
  const ANNO_PREFETCH_THRESHOLD = Math.round((80 / 100) * ANNO_WINDOW_SECONDS * 30);
  const ANNO_THROTTLE_MS = 500;
  const INITIAL_FRAME_DURATION = 2; // Load only 2 seconds initially
  const FRAME_CHUNK_DURATION = 2; // Duration for each frame chunk

  const layerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const ongoingExtraction = useRef<Promise<Frame[]> | null>(null);
  const extractionAbort = useRef(false);
  const currentTaskType = useRef<"Initial" | "Scroll" | "Slider" | null>(null);
  const lastExtractedChunk = useRef(0);

  const currentAnnoWindowRef = useRef<{ start: number; end: number } | null>(
    null
  );
  const lastAnnoLoadTs = useRef<number>(0);
  const nextPrefetchFrameRef = useRef<number | null>(null);

  const loadedRangesRef = useRef<Set<string>>(new Set());
  const pendingRangesRef = useRef<Set<string>>(new Set());

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  const ZOOM_SPEED = 1.1;

  const { toast } = useToast();
  const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
  const [frameInput, setFrameInput] = useState("");

  const [showSpeed, setShowSpeed] = useState(false);

  const OBJECT_COLORS = [
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
    "#FFA500",
    "#800080",
    "#008000",
    "#000080",
    "#FF1493",
    "#00BFFF",
    "#7CFC00",
    "#FFD700",
    "#A52A2A",
    "#DC143C",
    "#4B0082",
    "#8B4513",
    "#2E8B57",
    "#4682B4",
  ];

  
  const isRangeAlreadyLoading = (start: number, end: number): boolean => {
    const key = `${start}-${end}`;
    
    
    if (loadedRangesRef.current.has(key)) return true;
    if (pendingRangesRef.current.has(key)) return true;
    
    for (const pendingKey of pendingRangesRef.current) {
      const [pStart, pEnd] = pendingKey.split('-').map(Number);
      if (!(end <= pStart || start >= pEnd)) {
        console.log(`Range [${start}, ${end}] overlaps with pending [${pStart}, ${pEnd}]`);
        return true;
      }
    }

    return false;
  };


  const getObjectColor = (id: number) =>
    OBJECT_COLORS[id % OBJECT_COLORS.length];

  const togglePlayPause = useCallback(() => {
    if (!video) return;

    if (video.paused) {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          console.log("▶️ Video playing");
        })
        .catch((error) => {
          console.warn("  Autoplay prevented:", error);
          toast({
            title: "Click the play button to start video",
            description: "Some browsers require user interaction",
            variant: "default",
          });
        });
    } else {
      video.pause();
      setIsPlaying(false);
      console.log("⏸️ Video paused");
    }
  }, [video, toast]);

  useEffect(() => {
    const storedId =
      typeof window !== "undefined"
        ? sessionStorage.getItem("projectId")
        : null;
    if (storedId) {
      setVideoId(Number(storedId));
    }
  }, []);

  useEffect(() => {
    if (annotationsReady && video && video.paused) {
      video.play();
    }
  }, [annotationsReady, video]);

  // BUILD TRAJECTORY MAP
  useEffect(() => {
    const newMap: TrajectoryMap = new Map();
    persistentTrajectoryRef.current.forEach((traj) => {
      if (!newMap.has(traj.object_id)) {
        newMap.set(traj.object_id, new Map());
      }
      newMap.get(traj.object_id)!.set(traj.frame_id, traj.coordinate);
    });
    trajectoriesRef.current = newMap;
    setTrajectoryMap(newMap);
  }, [persistentTrajectoryRef.current.length]);

  // GET TRAJECTORY POINTS UP TO CURRENT FRAME
  const getTrajectoryPointsUpToCurrent = useCallback(
    (objectId: number, upToFrame: number): number[] => {
      const frameTrajectory = trajectoryMap.get(objectId);
      if (!frameTrajectory || frameTrajectory.size < 2) return [];

      // const twoMinFrames = 2 * 60 * fps; // 7200 frames at 30fps
      const twoMinFrames = 60 * fps;
      const cutoffFrame = Math.max(0, upToFrame - twoMinFrames);

      const sortedFrames = Array.from(frameTrajectory.keys())
        .sort((a, b) => a - b)
        .filter((frameId) => frameId >= cutoffFrame && frameId <= upToFrame);

      if (sortedFrames.length < 2) return [];

      const points: number[] = [];
      sortedFrames.forEach((frameId) => {
        const [x, y] = frameTrajectory.get(frameId)!;
        points.push(x, y);
      });

      return points;
    },
    [trajectoryMap, fps]
  );

  // GET ALL OBJECT IDS
  const getAllObjectIds = useCallback((): number[] => {
    return Array.from(trajectoryMap.keys()).sort((a, b) => a - b);
  }, [trajectoryMap]);

  // SET CURSOR STYLE
  const setCursorStyle = useCallback((cursorStyle: string) => {
    if (stageRef.current) {
      const container = stageRef.current.container();
      if (container) {
        container.style.cursor = cursorStyle;
      }
    }
  }, []);

  // ZOOM WHEEL HANDLER
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    if (!stageRef.current) return;

    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    let direction = e.evt.deltaY > 0 ? -1 : 1;
    if (e.evt.ctrlKey) {
      direction = -direction;
    }

    const newScale =
      direction > 0 ? oldScale * ZOOM_SPEED : oldScale / ZOOM_SPEED;
    const clampedScale = Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM);

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale({ x: clampedScale, y: clampedScale });
    setStagePos(newPos);
  }, []);

  // MOUSE DOWN HANDLER
  const handleMouseDown = (e: any) => {
    if (e.evt.button === 0 || e.evt.button === 2) {
      if (e.target === e.target.getStage()) {
        setIsPanMode(true);
        setIsDragging(true);
        lastMousePosRef.current = {
          x: e.evt.clientX,
          y: e.evt.clientY,
        };
        setCursorStyle("grabbing");
      }
    }
  };

  //   MOUSE MOVE HANDLER
  const handleMouseMove = (e: any) => {
    if (!stageRef.current) return;

    if (isDragging && isPanMode) {
      setCursorStyle("grabbing");

      const currentX = e.evt.clientX;
      const currentY = e.evt.clientY;

      const deltaX = currentX - lastMousePosRef.current.x;
      const deltaY = currentY - lastMousePosRef.current.y;

      setStagePos((prevPos) => ({
        x: prevPos.x + deltaX,
        y: prevPos.y + deltaY,
      }));

      lastMousePosRef.current = {
        x: currentX,
        y: currentY,
      };
    } else {
      if (e.target === e.target.getStage()) {
        setCursorStyle("grab");
      } else {
        setCursorStyle("default");
      }
    }
  };

  // MOUSE UP HANDLER
  const handleMouseUp = () => {
    setIsDragging(false);
    setIsPanMode(false);
    setCursorStyle("grab");
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setIsPanMode(false);
    setCursorStyle("default");
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
  };

  const handleTouchMove = useCallback((e: any) => {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (!stageRef.current) return;

    const stage = stageRef.current;

    if (!touch1 || !touch2) return;

    const rect = stage.container().getBoundingClientRect();
    const p1 = {
      x: touch1.clientX - rect.left,
      y: touch1.clientY - rect.top,
    };
    const p2 = {
      x: touch2.clientX - rect.left,
      y: touch2.clientY - rect.top,
    };

    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const oldScale = stage.scaleX();

    if (!(stage as any).lastDist) {
      (stage as any).lastDist = dist;
      return;
    }

    const scale = oldScale * (dist / (stage as any).lastDist);
    const clampedScale = Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM);

    const centerX = (p1.x + p2.x) / 2;
    const centerY = (p1.y + p2.y) / 2;

    const mousePointTo = {
      x: (centerX - stage.x()) / oldScale,
      y: (centerY - stage.y()) / oldScale,
    };

    const newPos = {
      x: centerX - mousePointTo.x * clampedScale,
      y: centerY - mousePointTo.y * clampedScale,
    };

    setStageScale({ x: clampedScale, y: clampedScale });
    setStagePos(newPos);
    (stage as any).lastDist = dist;
  }, []);

  const handleTouchEnd = () => {
    if (stageRef.current) {
      (stageRef.current as any).lastDist = 0;
    }
  };

  const handleZoomIn = () => {
    const newScale = Math.min(stageScale.x * ZOOM_SPEED, MAX_ZOOM);
    setStageScale({ x: newScale, y: newScale });
  };

  const handleZoomOut = () => {
    const newScale = Math.max(stageScale.x / ZOOM_SPEED, MIN_ZOOM);
    setStageScale({ x: newScale, y: newScale });
  };

  const handleResetZoom = () => {
    setStageScale({ x: 1, y: 1 });
    setStagePos({ x: 0, y: 0 });
    setCursorStyle("grab");
  };



  useEffect(() => {
    const handleLinkingComplete = (event: any) => {
      const { frameId } = event.detail;

      if (!video) return;

      // 1. Clear current annotations and trajectory data
      setAnnotations([]);
      persistentTrajectoryRef.current = [];
      trajectoriesRef.current = new Map();
      setTrajectoryMap(new Map());
      setTrajectoryPointCount(0);

      // 2. Set loading state
      setIsLoadingAnnotations(true);

      // 3. Refetch annotation and trajectory data for current window
      const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
      const totalFramesCount = Math.floor(video.duration * fps);
      const windowStart = Math.max(0, frameId);
      const windowEnd = Math.min(frameId + windowFrames, totalFramesCount);

      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
      chunkMutation.mutate({ start: Math.max(0, windowStart), end: windowEnd });
    } else {
      console.log(`Skipping [${windowStart}-${windowEnd}] - already loading/loaded`);
      setIsLoadingAnnotations(false);
    }
        };

    window.addEventListener("operationComplete", handleLinkingComplete);

    return () => {
      window.removeEventListener("operationComplete", handleLinkingComplete);
    };
  }, [video, fps]);

  const projectId = Number(
    typeof window !== "undefined" ? sessionStorage.getItem("projectId") : null
  );
  const chunkMutation = useMutation({
    mutationFn: async ({ start, end }: { start: number; end: number }) => {
      if (!projectId) return Promise.resolve(null);

      const key = `${start}-${end}`;
      pendingRangesRef.current.add(key);
      console.log(`Fetching [${start}-${end}]`);

      return getFrameRangeData(projectId, start, end);
    },

    onSuccess: (data, variables) => {
      const { start, end } = variables;
      const key = `${start}-${end}`;
      if (!data) {
        pendingRangesRef.current.delete(key);
        console.log("  No data returned from mutation");
        return;
      }

      console.log(data);
      

      const loadedAnnotations: Annotation[] = [];
      const newTrajectoryFrames: TrajectoryFrame[] = [];
      data = data.data;
      data.objects?.forEach((obj: { frames: any[]; object_id: number }) => {
        obj.frames.forEach((f: any) => {
          loadedAnnotations.push({
            object_id: obj.object_id,
            frame_id: f.frame_id,
            coordinates: f.coordinates,
          });

          if (f.coordinates && f.coordinates.length > 0) {
            newTrajectoryFrames.push({
              frame_id: f.frame_id,
              object_id: obj.object_id,
              coordinate: f.coordinates[0],
            });
          }
        });
      });

      // merge annotations, still avoid duplicates per (object_id, frame_id)
      setAnnotations((prev) => {
        const existingIds = new Set(
          prev.map((a) => `${a.object_id}-${a.frame_id}`)
        );
        const newOnes = loadedAnnotations.filter(
          (a) => !existingIds.has(`${a.object_id}-${a.frame_id}`)
        );
        return [...prev, ...newOnes];
      });

      // update trajectory list
      persistentTrajectoryRef.current = [
        ...persistentTrajectoryRef.current,
        ...newTrajectoryFrames,
      ];
      setTrajectoryPointCount(persistentTrajectoryRef.current.length);

      const startFrame =
        typeof data.start_frame === "number" ? data.start_frame : start;
      const endFrame =
        typeof data.end_frame === "number" ? data.end_frame : end;
      currentAnnoWindowRef.current = { start: startFrame, end: endFrame };
      
      pendingRangesRef.current.delete(key);
      loadedRangesRef.current.add(key);

      setIsLoadingAnnotations(false);
      setAnnotationsReady(true);

      console.log(
        `Annotations loaded for ${key} (${loadedAnnotations.length} new)`
      );
    },

    onError: (error, variables) => {
      const { start, end } = variables;
      const key = `${start}-${end}`;
      pendingRangesRef.current.delete(key);
      setIsLoadingAnnotations(false);
      console.error(`Failed to load annotations for ${key}:`, error);
    },
  });

  const objectMutation = useMutation({
    mutationFn: ({
      projectId,
      objectId,
      frameId,
    }: {
      projectId: number;
      objectId: number;
      frameId: number;
    }) => getObjectData(projectId, objectId, frameId),
  });

  const activityLogsQuery = useQuery({
    queryKey: ["activity-logs", projectId],
    queryFn: () => getActivityLogs(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });

  const undoCount = activityLogsQuery.data?.data?.total_undo_can_perform ?? 0;

  const totalLength = activityLogsQuery.data?.data?.total_length ?? 0;

  const redoCount = totalLength - undoCount;

  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  //OPTIMIZED: DIRECT API URL + LAZY FRAME EXTRACTION
  useEffect(() => {
    const loadVideoAndFrames = async () => {
      const projectId =
        typeof window !== "undefined"
          ? sessionStorage.getItem("projectId")
          : null;

      if (!projectId) return;

      try {
        console.log("  Starting optimized video load...");
        const startTime = performance.now();

        //Use direct API URL
        const apiUrl = `${API_BASE}/api/v1/videos/${projectId}/project-stream/`;

        const vid = document.createElement("video");
        vid.crossOrigin = "anonymous";
        vid.src = apiUrl;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true; // Important for mobile compatibility

        vid.onloadedmetadata = async () => {
          console.log("  Video metadata loaded");
          setDuration(vid.duration);

          // Get FPS (Optimized - no FFmpeg)
          const exactFps = await getVideoFPS(vid);
          setFps(exactFps);
          setVideoWidth(vid.videoWidth);
          setVideoHeight(vid.videoHeight);

          // STEP 1: Extract only FIRST 2 SECONDS immediately (Fast UI)
          const firstBatch = await runCancelableExtraction(
            async () => {
              console.log("Extracting initial frames (2 sec)...");
              return await extractFramesFromVideo(
                vid,
                0,
                INITIAL_FRAME_DURATION
              );
            },
            "Initial",
            0,
            0,
            INITIAL_FRAME_DURATION
          );
          setFrames(firstBatch);
          console.log(`Initial frames loaded: ${firstBatch.length} frames`);

          //STEP 2: Fetch initial annotations (Non-blocking)
          const initialStart = 0;
          const initialEnd = Math.min(
            Math.round(ANNO_WINDOW_SECONDS * exactFps),
            Math.floor(vid.duration * exactFps)
          );

          console.log(
            `Fetching initial annotations: ${initialStart}-${initialEnd}`
          );
          setIsLoadingAnnotations(true);
          chunkMutation.mutate({ start: Math.max(0, initialStart), end: initialEnd });

          const endTime = performance.now();
          console.log(
            `Total setup time: ${((endTime - startTime) / 1000).toFixed(2)}s`
          );
        };

        vid.onerror = () => {
          // console.error("Video load error");
          toast({
            title: "Error loading video",
            variant: "destructive",
          });
        };

        // FIXED: Set video state after it's fully loaded
        setVideo(vid);
        setVideoId(Number(videoId));
      } catch (error) {
        console.error("Failed to load video:", error);
        toast({
          title: "Failed to load video",
          variant: "destructive",
        });
      }
    };

    loadVideoAndFrames();
  }, []);

  const undoMutation = useMutation({
    mutationFn: () => undoAction(projectId),
    onSuccess: () => {
      toast({
        title: "Undo successful",
        description: "Reverted last action",
        duration: 1500,
        className: "text-green-600",
      });
      if (!video) return;
      const vid = video;
      const frameId = Math.round(vid.currentTime * fps);

      activityLogsQuery.refetch(); // refresh counts
      window.dispatchEvent(
        new CustomEvent("operationComplete", {
          detail: { frameId: Number(frameId) },
        })
      );
    },
    onError: (error) => {
      console.error("Undo failed", error);
      toast({
        title: "Undo failed",
        description: "Unable to undo the last action",
        variant: "destructive",
      });
    },
  });

  const redoMutation = useMutation({
    mutationFn: () => redoAction(projectId),
    onSuccess: () => {
      toast({
        title: "Redo successful",
        description: "Reapplied last undone action",
        duration: 1500,
        className: "text-green-600",
      });
      if (!video) return;
      const vid = video;
      const frameId = Math.round(vid.currentTime * fps);
      activityLogsQuery.refetch(); // refresh counts
      window.dispatchEvent(
        new CustomEvent("operationComplete", {
          detail: { frameId: Number(frameId) },
        })
      );
    },
    onError: (error) => {
      console.error("Redo failed", error);
      toast({
        title: "Redo failed",
        description: "Unable to redo the last action",
        variant: "destructive",
      });
    },
  });

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z" && canUndo) {
        e.preventDefault();
        undoMutation.mutate();
      }

      if (
        e.ctrlKey &&
        (e.key === "y" || (e.shiftKey && e.key === "Z")) &&
        canRedo
      ) {
        e.preventDefault();
        redoMutation.mutate();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canUndo, canRedo]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (video) video.playbackRate = playbackRate;
  }, [video, playbackRate]);

  const scaleX = videoWidth ? 650 / videoWidth : 1;
  const scaleY = videoHeight ? 650 / videoHeight : 1;

  // OPTIMIZED: SKIP FFmpeg FPS DETECTION (Use default 30 FPS)
  const getVideoFPS = async (
    file: File | HTMLVideoElement
  ): Promise<number> => {
    // If HTMLVideoElement, try to get FPS from it
    if (file instanceof HTMLVideoElement) {
      try {
        const fps = (file as any).frameRate || 30;
        sessionStorage.setItem("fps", fps);
        return fps;
      } catch {
        return 30;
      }
    }

    // For File, use default 30 FPS (Fastest - no overhead)
    return 30;
  };

  // CANCELABLE EXTRACTION WITH EARLY ABORT
  const runCancelableExtraction = async (
    fn: () => Promise<Frame[]>,
    type: "Initial" | "Scroll" | "Slider",
    chunk: number,
    startSec: number,
    durationSec: number
  ) => {
    extractionAbort.current = true;
    if (ongoingExtraction.current) {
      console.log(`Aborting ongoing ${currentTaskType.current} extraction`);
      await ongoingExtraction.current;
    }
    extractionAbort.current = false;

    currentTaskType.current = type;
    setLoading(true);

    const promise = (async () => {
      const result = await fn();
      if (extractionAbort.current) {
        console.log(`Extraction aborted: ${type}`);
        return [];
      }
      return result;
    })();

    ongoingExtraction.current = promise;
    const result = await promise;
    ongoingExtraction.current = null;
    currentTaskType.current = null;
    setLoading(false);

    return result;
  };

  // EXTRACT FRAMES FROM VIDEO
  const extractFramesFromVideo = async (
    videoElement: HTMLVideoElement,
    startSec: number,
    durationSec: number
  ): Promise<Frame[]> => {
    try {
      // Create a video element for frame extraction
      const tempVideo = document.createElement("video");
      tempVideo.src = videoElement.src;
      tempVideo.crossOrigin = "anonymous";

      // Wait for video to load
      await new Promise((resolve, reject) => {
        tempVideo.onloadedmetadata = resolve;
        tempVideo.onerror = reject;
      });

      // Create canvas for frame capture
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return [];

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const frames: Frame[] = [];
      const frameInterval = 1 / fps;

      // Extract frames at FPS rate
      for (let i = 0; i < durationSec * fps; i++) {
        const currentSec = startSec + i * frameInterval;
        tempVideo.currentTime = currentSec;

        await new Promise((resolve) => {
          tempVideo.onseeked = () => {
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            frames.push({
              index: Math.round(currentSec * fps),
              src: dataUrl,
            });
            resolve(null);
          };
        });
      }

      return frames;
    } catch (error) {
      console.error("Error extracting frames:", error);
      return [];
    }
  };

  // CONTINUOUS CANVAS RENDERING
  useEffect(() => {
    if (!video || !layerRef.current) return;
    const update = () => {
      layerRef.current.batchDraw();
      requestAnimationFrame(update);
    };
    update();
  }, [video]);

  // VIDEO EVENT HANDLERS
  useEffect(() => {
    if (!video) return;
    const vid = video;

    const handleTimeUpdate = () => {
      setCurrentTime(vid.currentTime);

      // PREFETCH NEXT ANNOTATION WINDOW (Only when playing)
      const now = performance.now();
      if (isPlaying && now - lastAnnoLoadTs.current > ANNO_THROTTLE_MS) {
        const frameNumber = Math.round(vid.currentTime * fps);

        if (currentAnnoWindowRef.current) {
          const totalFrames = Math.floor(vid.duration * fps);
          const windowSize = Math.round(ANNO_WINDOW_SECONDS * fps);
          const prefetchPoint =
            currentAnnoWindowRef.current.start + ANNO_PREFETCH_THRESHOLD;

          const nextStart = frameNumber;
          const nextEnd = Math.min(frameNumber + windowSize, totalFrames);
          if (
            frameNumber >= prefetchPoint &&
            frameNumber + windowSize <= totalFrames &&
            // nextPrefetchFrameRef.current !== frameNumber
            !isRangeAlreadyLoading(nextStart, nextEnd)
          ) {
            nextPrefetchFrameRef.current = frameNumber;

            

            // Check if already loading
            const key = `${nextStart}-${nextEnd}`;
            if (!loadedRangesRef.current.has(key)) {
              console.log(
                `Progressive prefetch: frames ${nextStart}-${nextEnd}`
              );
              chunkMutation.mutate({ start: Math.max(0, nextStart), end: nextEnd });
              lastAnnoLoadTs.current = now;
            }
          }
        }
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      console.log("Video started playing");
    };

    const handlePause = () => {
      setIsPlaying(false);
      console.log("Video paused");
      if (!video) return;
      const frameNumber = Math.round(video.currentTime * fps);
      sessionStorage.setItem("frameId", frameNumber.toString());
    };

    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("play", handlePlay);
    vid.addEventListener("pause", handlePause);

    return () => {
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("play", handlePlay);
      vid.removeEventListener("pause", handlePause);
    };
  }, [video, fps, isPlaying]);

  const controlsRef = useRef(null);

  // FIXED: Simplified playback control
  useEffect(() => {
    if (!video) return;

    // Just sync UI state with video state
    const updatePlayState = () => {
      setIsPlaying(!video.paused);
    };

    video.addEventListener("play", updatePlayState);
    video.addEventListener("pause", updatePlayState);

    return () => {
      video.removeEventListener("play", updatePlayState);
      video.removeEventListener("pause", updatePlayState);
    };
  }, [video]);

  //  OPTIMIZED: SEEK HANDLER WITH SMART ANNOTATION FETCHING
  const handleSeek = async (time: number) => {
    if (!video) return;

    const safeTime = Math.min(Math.max(time, 0), video.duration);
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
    setDragTime(null);
    setSelectedFrameIndex(Math.round(safeTime * fps));
    loadedRangesRef.current.clear();

    //  Remember if was playing, then pause
    const wasPlaying = !video.paused;
    setWasPlayingBeforeSeek(wasPlaying);

    if (wasPlaying) {
      video.pause();
      setIsPlaying(false);
    }

    setAnnotationsReady(false);
    setIsLoadingAnnotations(true);

    // Fetch annotations for the new position window
    const seekFrameNumber = Math.round(safeTime * fps);
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const totalFrames = Math.floor(video.duration * fps);

    const windowStart = Math.max(0, seekFrameNumber);
    const windowEnd = Math.min(seekFrameNumber + windowFrames, totalFrames);

    setIsLoadingAnnotations(true);
    if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
      chunkMutation.mutate({ start: Math.max(0, windowStart-60), end: windowEnd });
    } else {
      console.log(`Skipping [${windowStart}-${windowEnd}] - already loading/loaded`);
      setIsLoadingAnnotations(false);
    }
    nextPrefetchFrameRef.current = null;

    //Extract frames for the seeked position
    const chunk = Math.floor(safeTime / FRAME_CHUNK_DURATION);
    const startSec = chunk * FRAME_CHUNK_DURATION;
    if (startSec >= video.duration) return;
    const durationSec = Math.min(
      FRAME_CHUNK_DURATION,
      video.duration - startSec
    );

    const newFrames = await runCancelableExtraction(
      async () => {
        return await extractFramesFromVideo(video, startSec, durationSec);
      },
      "Slider",
      chunk,
      startSec,
      durationSec
    );
    setFrames(newFrames);
    lastExtractedChunk.current = chunk;
  };

  // SLIDER DRAG HANDLER
  const handleSliderChange = (val: number[]) => {
    const time = val[0];
    setDragTime(time);
    loadedRangesRef.current.clear();

    if (video && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }

    setAnnotationsReady(false);
    setIsLoadingAnnotations(true);

        };

  

  // // SCROLL HANDLER FOR FRAME STRIP
  const handleScroll = async () => {
    if (loading || !video) return;
    const el = containerRef.current;
    if (!el) return;

    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 300) {
      const nextChunk = lastExtractedChunk.current + 1;
      const startSec = nextChunk * FRAME_CHUNK_DURATION;
      if (startSec >= video.duration) return;
      const durationSec = Math.min(
        FRAME_CHUNK_DURATION,
        video.duration - startSec
      );

      const newFrames = await runCancelableExtraction(
        async () => {
          return await extractFramesFromVideo(video, startSec, durationSec);
        },
        "Scroll",
        nextChunk,
        startSec,
        durationSec
      );
      setFrames(newFrames);
      lastExtractedChunk.current = nextChunk;
    }
  };

  // SKIP HANDLER
  const handleSkip = (seconds: number) => {
    if (!video) return;
    loadedRangesRef.current.clear();

    const newTime = Math.min(
      Math.max(video.currentTime + seconds, 0),
      video.duration
    );

    video.currentTime = newTime;
    setCurrentTime(newTime);

    const newFrame = Math.round(newTime * fps);
    setSelectedFrameIndex(newFrame);
    sessionStorage.setItem("frameId", newFrame.toString());

    // Only fetch annotations without frame extraction
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const totalFrames = Math.floor(video.duration * fps);

    const windowStart = Math.max(0, newFrame);
    const windowEnd = Math.min(newFrame + windowFrames, totalFrames);

    const key = `${windowStart}-${windowEnd}`;
    if (!loadedRangesRef.current.has(key)) {
      console.log(
        `  Skip: fetching annotations for ${windowStart}-${windowEnd}`
      );
      setIsLoadingAnnotations(true);
      if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
        chunkMutation.mutate({ start: Math.max(0, windowStart-60), end: windowEnd });
      } else {
        console.log(`Skipping [${windowStart}-${windowEnd}] - already loading/loaded`);
        setIsLoadingAnnotations(false);
      }
          }
        };

  const handleFrameStep = (direction: 1 | -1) => {
    if (video) {
      const currentFrame = Math.round(video.currentTime * fps);
      const nextFrame = Math.min(
        Math.max(currentFrame + direction, 0),
        Math.floor(video.duration * fps)
      );
      const nextTime = nextFrame / fps;

      video.currentTime = nextTime;
      setCurrentTime(nextTime);
      setSelectedFrameIndex(nextFrame);

      sessionStorage.setItem("frameId", nextFrame.toString());
    }
  };

  // HANDLE FRAME CLICK
  const handleFrameClick = async (frame: Frame) => {
    if (!video) return;

    // Remember if playing, then pause and seek
    const wasPlaying = !video.paused;
    setWasPlayingBeforeSeek(wasPlaying);

    if (wasPlaying) {
      video.pause();
      setIsPlaying(false);
    }

    const frameTime = frame.index / fps;
    video.currentTime = frameTime;
    setCurrentTime(frameTime);
    setSelectedFrameIndex(frame.index);
    sessionStorage.setItem("frameId", frame.index.toString());

    // Fetch annotations for clicked frame
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const totalFrames = Math.floor(video.duration * fps);
    const windowStart = Math.max(0, frame.index);
    const windowEnd = Math.min(frame.index + windowFrames, totalFrames);

    setIsLoadingAnnotations(true);
    chunkMutation.mutate({
     start: Math.max(0, windowStart),
      end: windowEnd,
    });
  };
  

  // handle frame jump
  const handleFrameJump = async (targetFrame: number) => {
    if (!video) return;
    loadedRangesRef.current.clear();

    // Clamp frame to valid range
    const totalFrames = Math.floor(video.duration * fps);
    const safeFrame = Math.min(Math.max(targetFrame, 0), totalFrames);
    const safeTime = safeFrame / fps;

    // Remember if was playing, then pause
    const wasPlaying = !video.paused;
    setWasPlayingBeforeSeek(wasPlaying);

    if (wasPlaying) {
      video.pause();
      setIsPlaying(false);
    }

    requestAnimationFrame(() => {
      if (wasPlaying && video) {
        video.play();
        setIsPlaying(true);
      }
    });

    // Seek to frame
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
    setSelectedFrameIndex(safeFrame);
    sessionStorage.setItem("frameId", safeFrame.toString());

    // FETCH ANNOTATIONS 
    const seekFrameNumber = safeFrame;
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const windowStart = Math.max(0, seekFrameNumber);
    const windowEnd = Math.min(seekFrameNumber + windowFrames, totalFrames);

    console.log(
      `Jump to frame ${safeFrame} (${formatTime(safeTime)}): loading frames ${windowStart}-${windowEnd}`
    );
    setIsLoadingAnnotations(true);
    if (!isRangeAlreadyLoading(windowStart, windowEnd)) {
      chunkMutation.mutate({ start: Math.max(0, windowStart-60), end: windowEnd });
    } else {
      console.log(`Skipping [${windowStart}-${windowEnd}] - already loading/loaded`);
      setIsLoadingAnnotations(false);
    }
    nextPrefetchFrameRef.current = null;

    // Extract frames for the seeked position
    const chunk = Math.floor(safeTime / FRAME_CHUNK_DURATION);
    const startSec = chunk * FRAME_CHUNK_DURATION;
    if (startSec >= video.duration) return;
    const durationSec = Math.min(
      FRAME_CHUNK_DURATION,
      video.duration - startSec
    );

    const newFrames = await runCancelableExtraction(
      async () => {
        return await extractFramesFromVideo(video, startSec, durationSec);
      },
      "Slider",
      chunk,
      startSec,
      durationSec
    );
    setFrames(newFrames);
    lastExtractedChunk.current = chunk;

    setFrameInput(""); // Clear input
  };

  const currentFrame = Math.round(currentTime * fps);
  const rulerStart = lastExtractedChunk.current * FRAME_CHUNK_DURATION;
  const rulerEnd = Math.min(rulerStart + FRAME_CHUNK_DURATION, duration);
  const tickCount = 6;

  const allObjectIds = getAllObjectIds();
  const PAN_STEP = 20;

  // Add this useEffect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs / controls
      if (!video || document.activeElement?.closest(".your-controls-class"))
        return;

      switch (e.code) {
        case "Space":
        case "KeyP": // play / pause
          e.preventDefault();
          togglePlayPause();
          break;

        case "ArrowLeft": // -10s
          e.preventDefault();
          handleFrameStep?.(-1);
          break;

        case "ArrowRight": // +10s
          e.preventDefault();
          handleFrameStep?.(1);
          break;

        case "KeyJ": // -5s
          e.preventDefault();
          handleSkip(-5);
          break;

        case "KeyL": // +5s
          e.preventDefault();
          handleSkip(5);
          break;

        // case "Period": // next frame
        //   e.preventDefault();
        //   handleFrameStep?.(1);
        //   break;

        // case "Comma": // previous frame
        //   e.preventDefault();
        //   handleFrameStep?.(-1);
        //   break;

        case "ArrowUp": // faster
          e.preventDefault();
          setPlaybackRate((r) => Math.min(16, +(r + 0.25).toFixed(2)));
          break;

        case "ArrowDown": // slower
          e.preventDefault();
          setPlaybackRate((r) => Math.max(0.25, +(r - 0.25).toFixed(2)));
          break;

        // case "Digit0": // go to start
        //   e.preventDefault();
        //   handleSeek?.(0);
        //   break;

        case "Equal":
          //        if (e.key === "+") {
          e.preventDefault();
          handleZoomIn?.();
          break;

        case "Minus":
          e.preventDefault();
          handleZoomOut?.();
          break;

        // case "Numpad4":
        //   e.preventDefault();
        //   setStagePos((prev) => ({ x: prev.x + PAN_STEP, y: prev.y }));
        //   break;

        // case "Numpad6":
        //   e.preventDefault();
        //   setStagePos((prev) => ({ x: prev.x - PAN_STEP, y: prev.y }));
        //   break;

        // case "Numpad2":
        //   e.preventDefault();
        //   setStagePos((prev) => ({ x: prev.x, y: prev.y + PAN_STEP }));
        //   break;

        // case "Numpad8":
        //   e.preventDefault();
        //   setStagePos((prev) => ({ x: prev.x, y: prev.y - PAN_STEP }));
        //   break;

        // case "Numpad5":
        //   e.preventDefault();
        //   handleResetZoom?.();
        //   break;

        case "KeyT":
          e.preventDefault();
          setShowTrajectory((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    video,
    togglePlayPause,
    handleSkip,
    handleSeek,
    handleFrameStep,
    setPlaybackRate,
  ]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2">
        {/* VIDEO CANVAS AREA */}
        <div className="relative flex items-center justify-center mb-2 w-full h-[650px] bg-black">
          {isLoadingAnnotations && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 rounded-lg">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4 mx-auto"></div>
                <p className="text-white text-lg font-semibold">
                  Loading annotations...
                </p>
                <p className="text-gray-300 text-sm mt-2">
                  Frame: {currentFrame}
                </p>
              </div>
            </div>
          )}

          <Stage
            ref={stageRef}
            width={650}
            height={650}
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
            draggable={false}>
            <Layer ref={layerRef}>
              {video && (
                <KonvaImage
                  image={video}
                  width={650}
                  height={650}
                  listening={false}
                />
              )}

              {/* TRAJECTORY LINES */}
              {showTrajectory &&
                allObjectIds.map((objectId) => {
                  const points = getTrajectoryPointsUpToCurrent(
                    objectId,
                    currentFrame
                  );
                  if (points.length < 2) return null;

                  return (
                    <Line
                      key={`trajectory-${objectId}`}
                      points={points.map((p, idx) => {
                        return idx % 2 === 0 ? p * scaleX : p * scaleY;
                      })}
                      stroke={getObjectColor(objectId)}
                      strokeWidth={2}
                      opacity={0.6}
                      lineCap="round"
                      lineJoin="round"
                    />
                  );
                })}

              {/* ANNOTATIONS FOR CURRENT FRAME */}
              {annotations
                .filter((a) => a.frame_id === currentFrame)
                .map((a) => {
                  const color = getObjectColor(a.object_id);

                  const isSelected = selectedObjects.some(
                    (obj) => obj.object_id === a.object_id
                  );

                  const xs = a.coordinates.map((c) => c[0] * scaleX);
                  const ys = a.coordinates.map((c) => c[1] * scaleY);

                  const minX = Math.min(...xs);
                  const minY = Math.min(...ys);
                  const maxX = Math.max(...xs);
                  const maxY = Math.max(...ys);

                  const boxWidth = maxX - minX;
                  const boxHeight = maxY - minY;

                  return (
                    <Group
                      key={`${a.object_id}-${a.frame_id}`}
                      onClick={() => {
                        const alreadySelected = selectedObjects.find(
                          (obj) => obj.object_id === a.object_id
                        );

                        if (alreadySelected) {
                          toast({
                            title: "Object is already selected!",
                            description: "",
                            variant: "default",
                            duration: 1000,
                          });
                          return;
                        }

                        if (selectedObjects.length >= 2) {
                          console.log("  Maximum 2 selections allowed");
                          toast({
                            title: "  Maximum 2 selections allowed.",
                            description: "",
                            variant: "default",
                            duration: 1000,
                          });
                          return;
                        }

                        if (!projectId) {
                          console.log("Project ID not available");
                          return;
                        }

                        objectMutation.mutate(
                          {
                            projectId: Number(projectId),
                            objectId: a.object_id,
                            frameId: a.frame_id,
                          },
                          {
                            onSuccess: (meta) => {
                              const newSelection = {
                                object_id: a.object_id,
                                frame_id: a.frame_id,
                                start_frame: meta.data.start_frame,
                                end_frame: meta.data.end_frame,
                                is_inside: meta.data.is_inside,
                              };

                              setSelectedObjects((prev) => [
                                ...prev,
                                newSelection,
                              ]);

                              toast({
                                title: "Object selected",
                                description: `Object ID: ${a.object_id}`,
                                variant: "default",
                                duration: 1000,
                              });

                              console.log("Object selected:", newSelection);
                            },
                          }
                        );
                      }}>
                      {a.coordinates.map(([x, y], idx) => (
                        <Circle
                          key={`${a.object_id}-${idx}`}
                          x={x * scaleX}
                          y={y * scaleY}
                          radius={2}
                          fill={color}
                        />
                      ))}

                      <Text
                        x={a.coordinates[0][0] * scaleX + 12}
                        y={a.coordinates[0][1] * scaleY - 12}
                        text={`id:${a.object_id}`}
                        fontSize={16}
                        fill={color}
                        fontStyle="bold"
                        shadowColor="black"
                        shadowBlur={2}
                      />

                      {isSelected && (
                        <Rect
                          x={minX - 5}
                          y={minY - 5}
                          width={boxWidth + 10}
                          height={boxHeight + 10}
                          stroke={color}
                          strokeWidth={2}
                          cornerRadius={4}
                          dash={[6, 4]}
                        />
                      )}
                    </Group>
                  );
                })}
            </Layer>
          </Stage>

          {/* ZOOM LEVEL INDICATOR */}
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
            {(stageScale.x * 100).toFixed(0)}%
          </div>

          {/* FRAME NUMBER DISPLAY */}
          <div className="absolute top-2 left-1 text-[24px] text-white px-2 py-1 rounded text-xs">
            Frame: {currentFrame}
          </div>

          {/* TRAJECTORY STATUS */}
          <div className="absolute top-8 left-1 text-[24px] text-white px-2 py-1 rounded text-xs">
            Trajectory: {showTrajectory ? "✓ ON" : "✗ OFF"}
          </div>

          {/* PAN MODE INDICATOR */}
          {isPanMode && (
            <div className="absolute top-14 left-2 bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold">
              🤚 Panning...
            </div>
          )}
        </div>

        <Separator />
        <div className="flex flex-col pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => undoMutation.mutate()}
              disabled={!canUndo || !projectId || undoMutation.isPending}
              title="Undo">
              <Undo className="w-4 h-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => redoMutation.mutate()}
              disabled={!canRedo || !projectId || redoMutation.isPending}
              title="Redo">
              <Redo className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleFrameStep(-1)}
              title="Previous Frame">
              <SkipBack />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={togglePlayPause}
              disabled={!video}
              title="Play/Pause">
              {isPlaying ? <Pause /> : <Play />}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleFrameStep(1)}
              title="Next Frame">
              <SkipForward />
            </Button>

            <Slider
              value={[dragTime ?? currentTime]}
              max={duration || 100}
              step={0.01}
              onValueChange={handleSliderChange}
              onValueCommit={(val) => {handleSeek(val[0]) 
                setDragTime(null);}}
              className="flex-1 min-w-[240px]"
            />

            <span className="text-[11px] text-[#5A5A5A] px-2 whitespace-nowrap tabular-nums">
              {formatTime(dragTime ?? currentTime)} / {formatTime(duration)}
            </span>

            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomOut}
              title="Zoom Out">
              <ZoomOut className="w-3 h-3" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetZoom}
              title="Reset Zoom"
              className="px-2 text-xs font-semibold">
              Reset
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomIn}
              title="Zoom In">
              <ZoomIn className="w-3 h-3" />
            </Button>

            <Button
              size="sm"
              variant={showTrajectory ? "default" : "ghost"}
              onClick={() => setShowTrajectory(!showTrajectory)}
              title="Toggle Trajectory"
              className="px-2 text-xs font-semibold">
              Track
            </Button>

            {/* Frame jump */}
            <div className="flex items-center gap-1 ml-1">
              <span className="text-[11px] text-[#5A5A5A] whitespace-nowrap">
                Frame
              </span>
              <Input
                type="number"
                placeholder="0"
                min="0"
                max={
                  video?.duration ? Math.floor(video.duration * fps) : undefined
                }
                className="w-20 h-8 text-xs px-2"
                value={frameInput}
                onChange={(e) => setFrameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const frame = parseInt(e.currentTarget.value, 10);
                    if (!isNaN(frame)) handleFrameJump(frame);
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  const frame = parseInt(frameInput, 10);
                  if (!isNaN(frame)) handleFrameJump(frame);
                }}
                title="Jump to Frame"
                className="h-8 w-8">
                <SkipForward className="w-3 h-3" />
              </Button>
            </div>

            {/* Playback speed */}
            <div className="relative">
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-neutral-800 transition-colors"
                title="Playback Speed"
                onClick={() => setShowSpeed((v) => !v)}>
                <Clock className="w-4 h-4" />
                <span>{playbackRate.toFixed(2).replace(/\.00$/, "")}x</span>
                <ChevronRight
                  className={`w-3 h-3 transition-transform ${showSpeed ? "rotate-90" : ""}`}
                />
              </button>

              {showSpeed && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col items-center bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 w-16 z-50 shadow-xl">
                  <div className="text-white text-[11px] mb-1 font-bold">
                    {playbackRate.toFixed(2).replace(/\.00$/, "")}x
                  </div>

                  <div className="relative h-32 flex items-center">
                    <input
                      type="range"
                      min="0.25"
                      max="16"
                      step="0.25"
                      value={playbackRate}
                      onChange={(e) =>
                        setPlaybackRate(parseFloat(e.target.value))
                      }
                      className="absolute top-0 left-1/2 -translate-x-1/2 h-32 w-6 appearance-none bg-transparent
                    [writing-mode:vertical-lr] [direction:rtl]"
                      style={{
                        background: `linear-gradient(to top,
              #3b82f6 0%,
              #3b82f6 ${((playbackRate - 0.25) / (16 - 0.25)) * 100}%,
              #374151 ${((playbackRate - 0.25) / (16 - 0.25)) * 100}%,
              #374151 100%)`,
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/*   FRAME STRIP SECTION */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-3 pb-4">
        {/*   STATS BAR */}
        <div className="text-[13px] text-[#5A5A5A] font-medium pb-3 pl-2 pr-2 pt-1">
          Frames: {frames.length} | Time:{" "}
          {frames.length > 0
            ? `${formatTime(frames[0].index / fps)} - ${formatTime(frames[frames.length - 1].index / fps)}`
            : "0 - 0"}{" "}
          | FPS: {fps} | Total: {video ? Math.floor(video.duration * fps) : 0} |
          Current: {currentFrame}
        </div>

        {/*   RULER */}
        <div className="relative w-full h-5 mb-3">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gray-500 ml-2 mr-2"></div>
          <div className="absolute top-0 left-0 right-0 flex justify-between">
            {Array.from({ length: tickCount }, (_, i) => {
              const tickTime =
                rulerStart + ((rulerEnd - rulerStart) / (tickCount - 1)) * i;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div
                    className={`w-px ${
                      i % 2 === 0 ? "h-2 bg-gray-500" : "h-1 bg-gray-500"
                    }`}></div>
                  <span className="mt-1 text-[10px] text-gray-500">
                    {formatTime(tickTime)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/*   FRAME STRIP */}
        <div className="flex items-center pl-2 pr-1">
          <Image
            src="/images/verticalLine.svg"
            alt="line"
            width={6}
            height={60}
            className="opacity-100 flex-shrink-0 mr-2"
          />
          <div className="w-full max-w-[1200px]">
            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="flex-1 flex space-x-4 overflow-x-auto border rounded-lg"
              style={{ height: 100 }}>
              {frames.length > 0 ? (
                frames.map((f) => (
                  <img
                    key={f.index}
                    src={f.src}
                    alt={`Frame ${f.index}`}
                    className={`h-full flex-shrink-0 cursor-pointer hover:opacity-75 transition ${
                      selectedFrameIndex === f.index
                        ? "border-2 border-blue-500"
                        : ""
                    }`}
                    onClick={() => handleFrameClick(f)}
                  />
                ))
              ) : (
                <div className="flex items-center justify-center w-full h-full text-gray-400">
                  Loading frames...
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
