"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Undo2,
  Redo2,
  Trash2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Clock,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Stage, Layer, Image as KonvaImage, Text, Circle, Line } from "react-konva";
import { extractFramesExact } from "@/lib/ffmpeg/extractFramesFast";
import { loadFFmpeg } from "@/lib/ffmpeg/ffmpeg";
import { useMutation } from "@tanstack/react-query";
import { getFrameData } from "@/lib/api/getFrameData";
import { getFrameRangeData } from "@/lib/api/getFrameRangeData";


type Frame = { index: number; src: string };
type Annotation = {
  object_id: number;
  frame_id: number;
  coordinates: [number, number][];
};
type LoadedRange = { start: number; end: number };
type TrajectoryMap = Map<number, Map<number, [number, number]>>;


export default function DynamicVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [videoId, setVideoId] = useState<number | null>(null);

  // ===== TRAJECTORY STATE =====
  const [trajectoryMap, setTrajectoryMap] = useState<TrajectoryMap>(new Map());
  const [showTrajectory, setShowTrajectory] = useState(true);
  const trajectoriesRef = useRef<TrajectoryMap>(new Map());
  // ===== END TRAJECTORY STATE =====

  // ===== ZOOM & PAN STATE =====
  const [stageScale, setStageScale] = useState({ x: 1, y: 1 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  // ===== END ZOOM & PAN STATE =====

  // === Rolling window annotation config ===
  const ANNO_WINDOW_SECONDS = 2;
  const ANNO_THROTTLE_MS = 300;

  const layerRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const ongoingExtraction = useRef<Promise<Frame[]> | null>(null);
  const extractionAbort = useRef(false);
  const currentTaskType = useRef<"Initial" | "Scroll" | "Slider" | null>(null);
  const lastExtractedChunk = useRef(0);

  const [loadedRanges, setLoadedRanges] = useState<LoadedRange[]>([]);
  const loadedRangesRef = useRef<LoadedRange[]>([]);
  loadedRangesRef.current = loadedRanges;

  const lastAnnoLoadTs = useRef<number>(0);

  // ===== ZOOM CONSTANTS =====
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  const ZOOM_SPEED = 1.1;
  // ===== END ZOOM CONSTANTS =====

  const OBJECT_COLORS = [
    "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
    "#FFA500", "#800080", "#008000", "#000080", "#FF1493", "#00BFFF",
    "#7CFC00", "#FFD700", "#A52A2A", "#DC143C", "#4B0082", "#8B4513",
    "#2E8B57", "#4682B4",
  ];
  const getObjectColor = (id: number) =>
    OBJECT_COLORS[id % OBJECT_COLORS.length];


  useEffect(() => {
    const storedId = sessionStorage.getItem("videoId");
    if (storedId) {
      setVideoId(Number(storedId));
    }
  }, []);


  // ===== BUILD TRAJECTORY MAP FROM ANNOTATIONS =====
  useEffect(() => {
    const newMap: TrajectoryMap = new Map();

    annotations.forEach((anno) => {
      if (anno.coordinates.length === 0) return;

      const firstPoint = anno.coordinates[0];

      if (!newMap.has(anno.object_id)) {
        newMap.set(anno.object_id, new Map());
      }

      newMap.get(anno.object_id)!.set(anno.frame_id, firstPoint);
    });

    trajectoriesRef.current = newMap;
    setTrajectoryMap(newMap);
  }, [annotations]);
  // ===== END BUILD TRAJECTORY MAP =====


  // ===== GET TRAJECTORY POINTS UP TO CURRENT FRAME FOR AN OBJECT =====
  const getTrajectoryPointsUpToCurrent = useCallback((objectId: number, upToFrame: number): number[] => {
    const frameTrajectory = trajectoryMap.get(objectId);
    if (!frameTrajectory || frameTrajectory.size < 2) return [];

    const sortedFrames = Array.from(frameTrajectory.keys())
      .sort((a, b) => a - b)
      .filter(frameId => frameId <= upToFrame);

    if (sortedFrames.length < 2) return [];

    const points: number[] = [];
    sortedFrames.forEach((frameId) => {
      const [x, y] = frameTrajectory.get(frameId)!;
      points.push(x, y);
    });

    return points;
  }, [trajectoryMap]);
  // ===== END GET TRAJECTORY POINTS UP TO CURRENT FRAME =====


  // ===== GET ALL UNIQUE OBJECT IDS EVER =====
  const getAllObjectIds = useCallback((): number[] => {
    return Array.from(trajectoryMap.keys()).sort((a, b) => a - b);
  }, [trajectoryMap]);
  // ===== END GET ALL UNIQUE OBJECT IDS =====


  const setCursorStyle = useCallback((cursorStyle: string) => {
    if (stageRef.current) {
      const container = stageRef.current.container();
      if (container) {
        container.style.cursor = cursorStyle;
      }
    }
  }, []);


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

    let direction = e.evt.deltaY > 0 ? 1 : -1;
    if (e.evt.ctrlKey) {
      direction = -direction;
    }

    const newScale = direction > 0
      ? oldScale * ZOOM_SPEED
      : oldScale / ZOOM_SPEED;

    const clampedScale = Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM);

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale({ x: clampedScale, y: clampedScale });
    setStagePos(newPos);
  }, []);


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


  const chunkMutation = useMutation({
    mutationFn: ({ start, end }: { start: number; end: number }) => {
      if (!videoId) return Promise.resolve(null);
      return getFrameRangeData(videoId, start, end);
    },
    onSuccess: (data) => {
      if (!data || !data.objects) return;

      const loadedAnnotations: Annotation[] = [];
      data.objects.forEach((obj: { frames: any[]; object_id: number }) => {
        obj.frames.forEach((f: any) => {
          loadedAnnotations.push({
            object_id: obj.object_id,
            frame_id: f.frame_id,
            coordinates: f.coordinates,
          });
        });
      });

      setAnnotations((prev) => {
        const key = (a: Annotation) => `${a.object_id}-${a.frame_id}`;
        const map = new Map<string, Annotation>();
        prev.forEach((a) => map.set(key(a), a));
        loadedAnnotations.forEach((a) => map.set(key(a), a));
        return Array.from(map.values());
      });

      const start = typeof data.start_frame === "number" ? data.start_frame : 0;
      const end = typeof data.end_frame === "number" ? data.end_frame : start;
      setLoadedRanges((prev) => {
        const merged = mergeAndInsertRange(prev, { start, end });
        return merged;
      });
    },
  });


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


  const getVideoFPS = async (file: File): Promise<number> => {
    const { ffmpeg, fetchFile } = await loadFFmpeg();
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file));
    let fps = 30;
    try {
      await ffmpeg.run("-i", "input.mp4");
      const logs = (ffmpeg as any).log || (ffmpeg as any).logs || [];
      const textLogs = Array.isArray(logs) ? logs.join("\n") : String(logs);
      const match = textLogs.match(/, (\d+(?:\.\d+)?) fps,/);
      if (match) fps = parseFloat(match[1]);
      console.log(`Detected FPS: ${fps}`);
    } catch {
      console.warn("FPS detection failed → fallback 30fps");
    }
    return fps;
  };


  const runCancelableExtraction = async (
    fn: () => Promise<Frame[]>,
    type: "Initial" | "Scroll" | "Slider",
    chunk: number,
    startSec: number,
    durationSec: number
  ) => {
    extractionAbort.current = true;
    if (ongoingExtraction.current) await ongoingExtraction.current;
    extractionAbort.current = false;

    currentTaskType.current = type;
    setLoading(true);

    const promise = (async () => {
      const result = await fn();
      if (extractionAbort.current) return [];
      return result;
    })();

    ongoingExtraction.current = promise;
    const result = await promise;
    ongoingExtraction.current = null;
    currentTaskType.current = null;
    setLoading(false);

    return result;
  };


  useEffect(() => {
    const loadVideoAndFrames = async () => {
      const videoPath = sessionStorage.getItem("videoPath");
      if (!videoPath) return;

      const res = await fetch(videoPath);
      const blob = await res.blob();
      const file = new File([blob], "video.mp4", { type: "video/mp4" });
      setFile(file);

      const vid = document.createElement("video");
      vid.src = URL.createObjectURL(file);
      vid.crossOrigin = "anonymous";
      vid.loop = true;
      vid.muted = true;

      vid.onloadedmetadata = async () => {
        setDuration(vid.duration);
        setVideoWidth(vid.videoWidth);
        setVideoHeight(vid.videoHeight);

        const exactFps = await getVideoFPS(file);
        setFps(exactFps);

        const firstBatch = await runCancelableExtraction(
          async () => {
            const raw = await extractFramesExact(file, exactFps, 0, Math.min(5, vid.duration));
            return raw.map((src, i) => ({ index: i, src }));
          },
          "Initial",
          0,
          0,
          Math.min(5, vid.duration)
        );
        setFrames(firstBatch);
      };

      setVideo(vid);
    };

    loadVideoAndFrames();
  }, []);


  useEffect(() => {
    if (!video || !layerRef.current) return;
    video.play().catch(() => {});
    const update = () => {
      layerRef.current.batchDraw();
      requestAnimationFrame(update);
    };
    update();
  }, [video]);


  useEffect(() => {
    if (!video) return;
    const vid = video;

    const handleTimeUpdate = () => {
      setCurrentTime(vid.currentTime);

      const now = performance.now();
      if (isPlaying && now - lastAnnoLoadTs.current > ANNO_THROTTLE_MS) {
        lastAnnoLoadTs.current = now;
        const frameNumber = Math.round(vid.currentTime * fps);
        loadRollingAnnotationWindow(frameNumber);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
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


  useEffect(() => {
    if (!video) return;
    isPlaying ? video.play() : video.pause();
  }, [isPlaying]);


  const isRangeLoaded = (start: number, end: number) => {
    return loadedRangesRef.current.some(r => start >= r.start && end <= r.end);
  };


  const mergeAndInsertRange = (existing: LoadedRange[], newRange: LoadedRange) => {
    if (existing.length === 0) return [newRange];
    const merged: LoadedRange[] = [];
    let inserted = false;
    const toInsert = { ...newRange };

    const sorted = [...existing].sort((a, b) => a.start - b.start);
    for (const r of sorted) {
      if (r.end + 1 < toInsert.start) {
        merged.push(r);
      } else if (toInsert.end + 1 < r.start) {
        if (!inserted) {
          merged.push(toInsert);
          inserted = true;
        }
        merged.push(r);
      } else {
        toInsert.start = Math.min(toInsert.start, r.start);
        toInsert.end = Math.max(toInsert.end, r.end);
      }
    }
    if (!inserted) merged.push(toInsert);
    return merged;
  };


  const loadRollingAnnotationWindow = (frameNumber: number) => {
    if (!video) return;
    const windowFrames = Math.round(ANNO_WINDOW_SECONDS * fps);
    const totalFrames = Math.floor(video.duration * fps);

    const start = Math.max(0, frameNumber - windowFrames);
    const end = Math.min(totalFrames, frameNumber + windowFrames);

    if (isRangeLoaded(start, end)) return;

    chunkMutation.mutate({ start, end });
  };


  const handleSeek = async (time: number) => {
    if (!video || !file) return;
    const safeTime = Math.min(Math.max(time, 0), video.duration);
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
    setDragTime(null);
    setSelectedFrameIndex(Math.round(safeTime * fps));
    if (!isPlaying) video.play();

    const chunk = Math.floor(safeTime / 5);
    const startSec = chunk * 5;
    if (startSec >= video.duration) return;
    const durationSec = Math.min(5, video.duration - startSec);

    const newFrames = await runCancelableExtraction(
      async () => {
        const raw = await extractFramesExact(file, fps, startSec, durationSec);
        return raw.map((src, i) => ({
          index: Math.round((startSec + i / fps) * fps),
          src,
        }));
      },
      "Slider",
      chunk,
      startSec,
      durationSec
    );
    setFrames(newFrames);
    lastExtractedChunk.current = chunk;

    const seekFrameNumber = Math.round(safeTime * fps);
    loadRollingAnnotationWindow(seekFrameNumber);
  };


  const handleScroll = async () => {
    if (!file || loading || !video) return;
    const el = containerRef.current;
    if (!el) return;

    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 300) {
      const nextChunk = lastExtractedChunk.current + 1;
      const startSec = nextChunk * 5;
      if (startSec >= video.duration) return;
      const durationSec = Math.min(5, video.duration - startSec);

      const newFrames = await runCancelableExtraction(
        async () => {
          const raw = await extractFramesExact(file, fps, startSec, durationSec);
          return raw.map((src, i) => ({
            index: Math.round((startSec + i / fps) * fps),
            src,
          }));
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


  const handleSkip = (seconds: number) => {
    if (video) video.currentTime += seconds;
  };

  const handleFullscreen = () => {
    const container = stageRef.current?.getStage?.()?.container() || stageRef.current?.container?.();
    if (container && container.requestFullscreen) container.requestFullscreen();
  };


  const currentFrame = Math.round(currentTime * fps);
  const rulerStart = lastExtractedChunk.current * 5;
  const rulerEnd = Math.min(rulerStart + 5, duration);
  const tickCount = 6;

  // ===== GET ALL UNIQUE OBJECT IDS (PERSISTENT ACROSS ALL FRAMES) =====
  const allObjectIds = getAllObjectIds();
  // ===== END GET ALL UNIQUE OBJECT IDS =====


  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Video Player */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2">
        <div className="relative flex items-center justify-center mb-2 w-full h-[650px] bg-black">
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
            draggable={false}
          >
            <Layer ref={layerRef}>
              {/* ===== MODIFIED: ADD listening={false} to KonvaImage =====*/}
              {video && <KonvaImage image={video} width={650} height={650} listening={false} />}
              {/* ===== END MODIFIED =====*/}

              {/* ===== ADDED: DRAW ALL OBJECT TRAJECTORIES (PERSISTENT) ===== */}
              {showTrajectory && allObjectIds.map((objectId) => {
                const points = getTrajectoryPointsUpToCurrent(objectId, currentFrame);
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
              {/* ===== END ADDED TRAJECTORY LAYER ===== */}

              <Text text={`Frame: ${currentFrame}`} fontSize={18} fill="white" x={5} y={5} shadowColor="black" />

              {annotations.filter(a => a.frame_id === currentFrame).map(a => {
                const color = getObjectColor(a.object_id);
                return (
                  <React.Fragment key={`${a.object_id}-${a.frame_id}`}>
                    {a.coordinates.map(([x, y], idx) => (
                      <Circle key={`${a.object_id}-${idx}`} x={x * scaleX} y={y * scaleY} radius={2} fill={color} />
                    ))}
                    <Text
                      x={a.coordinates[0][0] * scaleX + 12}
                      y={a.coordinates[0][1] * scaleY - 12}
                      text={`id:${a.object_id}`}
                      fontSize={16}
                      fill={color}
                      fontStyle="bold"
                    />
                  </React.Fragment>
                );
              })}
            </Layer>

          </Stage>

          {/* ZOOM LEVEL DISPLAY */}
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
            {(stageScale.x * 100).toFixed(0)}%
          </div>

          {/* PAN MODE INDICATOR */}
          {isPanMode && (
            <div className="absolute top-2 left-2 bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold">
              🤚 Panning...
            </div>
          )}

          {/* ===== ADDED: TRAJECTORY INDICATOR WITH TOTAL OBJECTS COUNT ===== */}
          <div className="absolute top-12 left-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-xs">
            Trajectory: {showTrajectory ? "✓ ON" : "✗ OFF"} 
          </div>
          {/* ===== END ADDED TRAJECTORY INDICATOR ===== */}
          {/* | Total Objects: {allObjectIds.length} */}
        </div>


        {/* Controls */}
        <Separator />
        <div className="flex flex-col pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="icon" variant="ghost"><Undo2 /></Button>
            <Button size="icon" variant="ghost"><Redo2 /></Button>
            <Button size="icon" variant="ghost"><Trash2 /></Button>
            <Button size="icon" variant="ghost" onClick={() => handleSkip(-10)}><SkipBack /></Button>
            <Button size="icon" variant="ghost" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause /> : <Play />}</Button>
            <Button size="icon" variant="ghost" onClick={() => handleSkip(10)}><SkipForward /></Button>


            <Slider
              value={[dragTime ?? currentTime]}
              max={duration || 100}
              step={0.01}
              onValueChange={(val) => { setDragTime(val[0]); video?.pause(); }}
              onValueCommit={(val) => handleSeek(val[0])}
              className="flex-1 min-w-[200px]"
            />
            <span className="text-xs text-[#5A5A5A] p-2 whitespace-nowrap">
              {formatTime(dragTime ?? currentTime)} / {formatTime(duration)}
            </span>

            {/* ZOOM BUTTONS */}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomOut}
              title="Zoom Out (- or Scroll)"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleResetZoom}
              title="Reset Zoom (1:1)"
            >
              <span className="text-xs font-bold">reset</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomIn}
              title="Zoom In (+ or Scroll)"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>

            {/* ===== ADDED: TRAJECTORY TOGGLE BUTTON ===== */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowTrajectory(!showTrajectory)}
              title="Toggle Trajectory Display"
              className={showTrajectory ? "bg-green-900 bg-opacity-30" : ""}
            >
              <span className="text-xs font-bold">Track</span>
            </Button>
            {/* ===== END TRAJECTORY TOGGLE BUTTON ===== */}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-between text-sm" disabled={!video}>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span className="mr-2">Speed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {playbackRate}<ChevronRight className="w-3 h-3" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32 bg-[#181818] text-white">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                  <DropdownMenuItem
                    key={speed}
                    onClick={() => setPlaybackRate(speed)}
                    className={`cursor-pointer py-1 text-sm ${speed === playbackRate ? "font-bold" : ""}`}
                    disabled={!video}>{speed}x</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>


            <Button size="icon" variant="ghost" onClick={handleFullscreen}><Maximize2 /></Button>
          </div>

          {/* PAN & ZOOM HELP TEXT */}
          <div className="text-[11px] text-[#7A7A7A] mt-2 ml-2">
            💡 Tip: <strong>Left Click + Drag</strong> or <strong>Right Click + Drag</strong> to pan • <strong>Scroll</strong> to zoom • <strong>Pinch</strong> on touch devices • <strong>Path button</strong> to toggle trajectory
          </div>
        </div>
      </Card>


      {/* Frame Strip */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-3 pb-4">
        <div className="text-[13px] text-[#5A5A5A] font-medium pb-3 pl-2 pr-2 pt-1">
          Extracted Frames: {frames.length} | Time:{" "}
          {frames.length > 0 ? `${formatTime(frames[0].index / fps)} - ${formatTime(frames[frames.length - 1].index / fps)}` : "0 - 0"} | FPS: {fps} | Total Frames: {video ? Math.floor(video.duration * fps) : 0} | Current Frame: {currentFrame}
        </div>


        {/* Time ruler */}
        <div className="relative w-full h-5 mb-3">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gray-500 ml-2 mr-2"></div>
          <div className="absolute top-0 left-0 right-0 flex justify-between">
            {Array.from({ length: tickCount }, (_, i) => {
              const tickTime = rulerStart + ((rulerEnd - rulerStart) / (tickCount - 1)) * i;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className={`w-px ${i % 2 === 0 ? "h-2 bg-gray-500" : "h-1 bg-gray-500"}`}></div>
                  <span className="mt-1 text-[10px] text-gray-500">{formatTime(tickTime)}</span>
                </div>
              );
            })}
          </div>
        </div>


        {/* Frame thumbnails */}
        <div className="flex items-center pl-2 pr-1">
          <Image src="/images/verticalLine.svg" alt="line" width={6} height={60} className="opacity-100 flex-shrink-0 mr-2" />
          <div className="w-full max-w-[1200px]">
            <div ref={containerRef} onScroll={handleScroll} className="flex-1 flex space-x-4 overflow-x-auto border rounded-lg" style={{ height: 100 }}>
              {frames.length > 0 ? frames.map(f => (
                <img key={f.index} src={f.src} alt={`frame-${f.index}`} loading="lazy"
                  className={`h-full rounded-lg shadow-md cursor-pointer ${selectedFrameIndex === f.index ? "border-4 border-green-700" : ""}`}
                  onClick={() => {
                    if (!video) return;
                    const frameNo = f.index;
                    video.currentTime = f.index / fps;
                    video.pause();
                    setIsPlaying(false);
                    setSelectedFrameIndex(f.index);
                    setCurrentTime(f.index / fps);
                    sessionStorage.setItem("frameId", frameNo.toString());
                    loadRollingAnnotationWindow(frameNo);
                  }}
                />
              )) : loading ? <div className="flex items-center justify-center w-32 text-blue-500 font-medium">Processing…</div> : null}
              {loading && frames.length > 0 && <div className="flex items-center justify-center w-32 h-full text-blue-500 font-medium">Processing…</div>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}