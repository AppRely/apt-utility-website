"use client";
import React, { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { Stage, Layer, Image as KonvaImage, Text, Circle } from "react-konva";
import { extractFramesExact } from "@/lib/ffmpeg/extractFramesFast";
import { loadFFmpeg } from "@/lib/ffmpeg/ffmpeg";
import { useMutation } from "@tanstack/react-query";
import { getFrameData } from "@/lib/api/getFrameData";
import { getFrameRangeData } from "@/lib/api/getFrameRangeData";

type Frame = { index: number; src: string };
type Annotation = { object_id: number; coordinates: [number, number][] };

export default function DynamicVideo() {
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

  const layerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extraction control
  const ongoingExtraction = useRef<Promise<Frame[]> | null>(null);
  const extractionAbort = useRef(false);
  const currentTaskType = useRef<"Initial" | "Scroll" | "Slider" | null>(null);
  const lastExtractedChunk = useRef(0);

  const OBJECT_COLORS = [
    "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
    "#FFA500", "#800080", "#008000", "#000080", "#FF1493", "#00BFFF",
    "#7CFC00", "#FFD700", "#A52A2A", "#DC143C", "#4B0082", "#8B4513",
    "#2E8B57", "#4682B4",
  ];

  const getObjectColor = (id: number) => OBJECT_COLORS[id % OBJECT_COLORS.length];

  const videoId = 3;
  const frameDataMutation = useMutation({
    mutationFn: ({ frameNumber }: { frameNumber: number }) =>
      getFrameData(videoId, frameNumber),
  });

  const chunkMutation = useMutation({
    mutationFn: ({ start, end }: { start: number; end: number }) =>
      getFrameRangeData(videoId, start, end),
  });

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const scaleX = videoWidth ? 600 / videoWidth : 1;
  const scaleY = videoHeight ? 600 / videoHeight : 1;

  const getVideoFPS = async (file: File): Promise<number> => {
    const { ffmpeg, fetchFile } = await loadFFmpeg();
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file));
    let fps = 30;
    try {
      await ffmpeg.run("-i", "input.mp4");
      const logs = ffmpeg.log || ffmpeg.logs || [];
      const textLogs = Array.isArray(logs) ? logs.join("\n") : "";
      const match = textLogs.match(/, (\d+(?:\.\d+)?) fps,/);
      if (match) fps = parseFloat(match[1]);
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
    duration: number
  ) => {
    const endSec = startSec + duration;
    const startFrame = Math.round(startSec * fps);
    const endFrame = Math.round(endSec * fps) - 1;

    extractionAbort.current = true;
    if (ongoingExtraction.current) await ongoingExtraction.current;
    extractionAbort.current = false;

    currentTaskType.current = type;
    setLoading(true);
    chunkMutation.mutate({ start: startFrame, end: endFrame });

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

  // Load video from sessionStorage and extract first frames
  useEffect(() => {
    const loadVideoAndFrames = async () => {
      const videoPath = sessionStorage.getItem("videoPath");
      if (!videoPath) return;

      // Fetch video as blob
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

        // Extract first chunk
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

  // Load annotations
  useEffect(() => {
    const loadAnnotations = async () => {
      const res = await fetch("/data.json");
      const data = await res.json();
      setAnnotations(data.objects);
    };
    loadAnnotations();
  }, []);

  // Video playback
  useEffect(() => {
    if (video) video.playbackRate = playbackRate;
  }, [video, playbackRate]);

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

    const handleTimeUpdate = () => setCurrentTime(vid.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      frameDataMutation.mutate({
        frameNumber: video.currentTime ? Math.round(video.currentTime * fps) : 0,
      });
    };

    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("play", handlePlay);
    vid.addEventListener("pause", handlePause);

    return () => {
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("play", handlePlay);
      vid.removeEventListener("pause", handlePause);
    };
  }, [video, frameDataMutation]);

  useEffect(() => {
    if (!video) return;
    if (isPlaying) video.play();
    else video.pause();
  }, [isPlaying]);

  // Seek handler
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
    const duration = Math.min(5, video.duration - startSec);

    const newFrames = await runCancelableExtraction(
      async () => {
        const raw = await extractFramesExact(file, fps, startSec, duration);
        return raw.map((src, i) => ({
          index: Math.round((startSec + i / fps) * fps),
          src,
        }));
      },
      "Slider",
      chunk,
      startSec,
      duration
    );
    setFrames(newFrames);
    lastExtractedChunk.current = chunk;
  };

  // Lazy load frames on scroll
  const handleScroll = async () => {
    if (!file || loading || !video) return;
    const el = containerRef.current;
    if (!el) return;

    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 300) {
      const nextChunk = lastExtractedChunk.current + 1;
      const startSec = nextChunk * 5;
      if (startSec >= video.duration) return;

      const duration = Math.min(5, video.duration - startSec);
      const newFrames = await runCancelableExtraction(
        async () => {
          const raw = await extractFramesExact(file, fps, startSec, duration);
          return raw.map((src, i) => ({
            index: Math.round((startSec + i / fps) * fps),
            src,
          }));
        },
        "Scroll",
        nextChunk,
        startSec,
        duration
      );
      setFrames(newFrames);
      lastExtractedChunk.current = nextChunk;
    }
  };

  const handleSkip = (seconds: number) => {
    if (video) video.currentTime += seconds;
  };

  const handleFullscreen = () => {
    const container = layerRef.current?.getStage()?.container();
    if (container && container.requestFullscreen) container.requestFullscreen();
  };

  const currentFrame = Math.round(currentTime * fps);
  const rulerStart = lastExtractedChunk.current * 5;
  const rulerEnd = Math.min(rulerStart + 5, duration);
  const tickCount = 6;

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Video Player */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2">
        <div className="relative flex items-center justify-center mb-2 w-full h-[600px] bg-black">
          <Stage width={600} height={600}>
            <Layer ref={layerRef}>
              {video && <KonvaImage image={video} width={600} height={600} />}
              {video && <Text text={`Frame: ${currentFrame}`} fontSize={18} fill="white" x={5} y={5} shadowColor="black" />}
              {annotations.map((obj) => {
                const [x, y] = obj.coordinates[0];
                const color = getObjectColor(obj.object_id);
                return (
                  <React.Fragment key={obj.object_id}>
                    <Circle x={x * scaleX} y={y * scaleY} radius={3} fill={color} />
                    <Text x={x * scaleX + 6} y={y * scaleY - 6} text={`${obj.object_id}`} fontSize={12} fill={color} fontStyle="bold" />
                  </React.Fragment>
                );
              })}
            </Layer>
          </Stage>
        </div>

        <Separator />
        <div className="flex flex-col pt-1">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost"><Undo2 /></Button>
            <Button size="icon" variant="ghost"><Redo2 /></Button>
            <Button size="icon" variant="ghost"><Trash2 /></Button>
            <Button size="icon" variant="ghost" onClick={() => handleSkip(-10)}><SkipBack /></Button>
            <Button size="icon" variant="ghost" onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? <Pause /> : <Play />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => handleSkip(10)}><SkipForward /></Button>
            <Slider
              value={[dragTime ?? currentTime]}
              max={duration || 100}
              step={0.01}
              onValueChange={(val) => {
                setDragTime(val[0]);
                video?.pause();
              }}
              onValueCommit={(val) => handleSeek(val[0])}
              className="flex-1"
            />
            <span className="text-xs text-[#5A5A5A] p-2">{formatTime(dragTime ?? currentTime)} / {formatTime(duration)}</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-between text-sm" disabled={!video}>
                  <div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span className="mr-2">Playback speed</span></div>
                  <div className="flex items-center gap-1">{playbackRate}<ChevronRight className="w-3 h-3" /></div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32 bg-[#181818] text-white">
                {[0.25,0.5,0.75,1,1.25,1.5,1.75,2].map(speed => (
                  <DropdownMenuItem key={speed} onClick={() => setPlaybackRate(speed)} className={`cursor-pointer py-1 text-sm ${speed===playbackRate?"font-bold":""}`} disabled={!video}>{speed}x</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="icon" variant="ghost" onClick={handleFullscreen}><Maximize2 /></Button>
          </div>
        </div>
      </Card>

      {/* Frame Strip */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-3 pb-4">
        <div className="text-[13px] text-[#5A5A5A] font-medium pb-3 pl-2 pr-2 pt-1">
          Extracted Frames: {frames.length} | Time: {frames.length>0?`${formatTime(frames[0].index/fps)} - ${formatTime(frames[frames.length-1].index/fps)}`:"0 - 0"} | FPS: {fps || 0} | Total Frames: {video?Math.floor(video.duration*fps):0} | Current Frame: {currentFrame}
        </div>

        {/* Time ruler */}
        <div className="relative w-full h-5 mb-3">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gray-500 ml-2 mr-2"></div>
          <div className="absolute top-0 left-0 right-0 flex justify-between">
            {Array.from({ length: tickCount }, (_, i) => {
              const tickTime = rulerStart + ((rulerEnd - rulerStart)/(tickCount-1))*i;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className={`w-px ${i%2===0?"h-2 bg-gray-500":"h-1 bg-gray-500"}`}></div>
                  <span className="mt-1 text-[10px] text-gray-500">{formatTime(tickTime)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Frame thumbnails */}
        <div className="flex items-center pl-2 pr-1">
          <div className="w-full max-w-[1200px]">
            <div ref={containerRef} onScroll={handleScroll} className="flex-1 flex space-x-4 overflow-x-auto border rounded-lg" style={{height:100}}>
              {frames.map(f => (
                <img
                  key={f.index}
                  src={f.src}
                  alt={`frame-${f.index}`}
                  loading="lazy"
                  className={`h-full rounded-lg shadow-md cursor-pointer ${selectedFrameIndex===f.index?"border-4 border-green-700":""}`}
                  onClick={() => {
                    if(!video) return;
                    video.currentTime = f.index/fps;
                    video.pause();
                    setIsPlaying(false);
                    setSelectedFrameIndex(f.index);
                    setCurrentTime(f.index/fps);
                    frameDataMutation.mutate({ frameNumber: f.index });
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
