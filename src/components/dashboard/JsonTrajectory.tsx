"use client" 
import React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/Button"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import {
  Undo2, Redo2, Trash2,
  Play, Pause, SkipBack, SkipForward, Maximize2
} from "lucide-react"
import Image from "next/image"
import { useState, useRef, useEffect } from "react"
import { Stage, Layer, Image as KonvaImage, Text, Circle, Line } from "react-konva"
import { extractFramesExact } from "@/lib/ffmpeg/extractFramesFast"
import { loadFFmpeg } from "@/lib/ffmpeg/ffmpeg"
import { useMutation } from "@tanstack/react-query";
import { dummyApiCall } from "@/lib/api/dummy";

type Frame = { index: number; src: string }
type Annotation = { frame: number; x: number; y: number; track: number }

export default function JsonTrajectory() {
  const [file, setFile] = useState<File | null>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [fps, setFps] = useState(30)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  const [videoWidth, setVideoWidth] = useState<number | null>(null)
  const [videoHeight, setVideoHeight] = useState<number | null>(null)


  const layerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // --- Extraction control ---
  const ongoingExtraction = useRef<Promise<Frame[]> | null>(null)
  const extractionAbort = useRef(false)
  const currentTaskType = useRef<"Initial" | "Scroll" | "Slider" | null>(null)
  const lastExtractedChunk = useRef(0)

  const dummyMutation = useMutation({
    mutationFn: dummyApiCall,
    onSuccess: () => console.log("Dummy API called!"),
    onError: (err) => console.error("Dummy API error:", err),
  });

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const getVideoFPS = async (file: File): Promise<number> => {
    const { ffmpeg, fetchFile } = await loadFFmpeg()
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file))
    let fps = 30
    let width = 0;
    let height = 0;
    try {
      await ffmpeg.run("-i", "input.mp4")
      const logs = ffmpeg.log || ffmpeg.logs || []
      const textLogs = Array.isArray(logs) ? logs.join("\n") : ""
      const match = textLogs.match(/, (\d+(?:\.\d+)?) fps,/)
      if (match) fps = parseFloat(match[1])
    } catch {
      console.warn("FPS detection failed → fallback 30fps")
    }
    return fps
  }

  const runCancelableExtraction = async (
    fn: () => Promise<Frame[]>,
    type: "Initial" | "Scroll" | "Slider",
    chunk: number,
    startSec: number,
    duration: number
  ) => {
    const endSec = startSec + duration
    extractionAbort.current = true
    if (ongoingExtraction.current) await ongoingExtraction.current
    extractionAbort.current = false

    currentTaskType.current = type
    setLoading(true)
    console.log(`[${type}] Start extraction → chunk=${chunk}, ${startSec}s → ${endSec}s`)

    const promise = (async () => {
      const result = await fn()
      if (extractionAbort.current) {
        console.log(`[${type}] Canceled → chunk=${chunk}`)
        return []
      }
      console.log(`[${type}] Finished → chunk=${chunk}, frames=${result.length}`)
      return result
    })()

    ongoingExtraction.current = promise
    const result = await promise
    ongoingExtraction.current = null
    currentTaskType.current = null
    setLoading(false)

    return result
  }

    useEffect(() => {
    const loadAnnotations = async () => {
        try {
        const res = await fetch("/response.json")
        if (!res.ok) throw new Error("response.json not found")

        const data = await res.json()
        const annotations: Annotation[] = []

        const originalWidth = videoWidth || 1920
      const originalHeight = videoHeight || 1080

        const canvasWidth = 1000
        const canvasHeight = 320

        const scaleX = canvasWidth / originalWidth
        const scaleY = canvasHeight / originalHeight

        data.trk_data.forEach((trackPair: any, trackIdx: number) => {
            const xCoords = trackPair[0][0] || []
            const yCoords = trackPair[1][0] || []
            const len = Math.min(xCoords.length, yCoords.length)

            for (let i = 0; i < len; i++) {
            const x = xCoords[i]
            const y = yCoords[i]
            if (x != null && y != null) {
                annotations.push({
                frame: i,
                x: x * scaleX,  
                y: y * scaleY,  
                track: trackIdx + 1
                })
            }
            }
        })

        setAnnotations(annotations)
        console.log("Loaded and scaled JSON annotations:", annotations.length)
        } catch (err) {
        console.error("Failed to load response.json:", err)
        setAnnotations([])
        }
    }

    loadAnnotations()
    }, [])


  //Video file handling
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

    setFile(f)
    setFrames([])
    lastExtractedChunk.current = 0

    const vid = document.createElement("video")
    vid.src = URL.createObjectURL(f)
    vid.crossOrigin = "anonymous"
    vid.loop = true
    vid.muted = true
    setVideo(vid)
    vid.onloadedmetadata = () => {
        setDuration(vid.duration)
        setVideoWidth(vid.videoWidth)
        setVideoHeight(vid.videoHeight)
        console.log(`Video resolution: ${vid.videoWidth}x${vid.videoHeight}`)
    }


    setLoading(true)
    try {
      const exactFps = await getVideoFPS(f)
      setFps(exactFps)

      const firstBatch = await runCancelableExtraction(
        async () => {
          const raw = await extractFramesExact(f, exactFps, 0, Math.min(5, vid.duration))
          return raw.map((src, i) => ({ index: i, src }))
        },
        "Initial",
        0,
        0,
        Math.min(5, vid.duration)
      )
      setFrames(firstBatch)
    } finally {
      setLoading(false)
    }
  }

  //Draw loop
  useEffect(() => {
    if (!video || !layerRef.current) return
    video.play().catch(() => {})
    const update = () => {
      layerRef.current.batchDraw()
      requestAnimationFrame(update)
    }
    update()
  }, [video])

  //Video state tracking
  useEffect(() => {
    if (!video) return
    const vid = video

    const handleTimeUpdate = () => setCurrentTime(vid.currentTime)
    const handlePlay = () => setIsPlaying(true)
    // const handlePause = () => setIsPlaying(false)
    const handlePause = () => {
      setIsPlaying(false);
      dummyMutation.mutate(); // call dummy API
    };

    vid.addEventListener("timeupdate", handleTimeUpdate)
    vid.addEventListener("play", handlePlay)
    vid.addEventListener("pause", handlePause)

    return () => {
      vid.removeEventListener("timeupdate", handleTimeUpdate)
      vid.removeEventListener("play", handlePlay)
      vid.removeEventListener("pause", handlePause)
    }
  }, [video,dummyMutation])

  useEffect(() => {
    if (!video) return
    if (isPlaying) video.play()
    else video.pause()
  }, [isPlaying])

  //Seek handler
  const handleSeek = async (time: number) => {
    if (!video || !file) return
    const safeTime = Math.min(Math.max(time, 0), video.duration)
    video.currentTime = safeTime
    setCurrentTime(safeTime)
    setDragTime(null)
    setSelectedFrameIndex(Math.round(safeTime * fps))
    if (!isPlaying) video.play()

    const chunk = Math.floor(safeTime / 5)
    const startSec = chunk * 5
    if (startSec >= video.duration) return
    const duration = Math.min(5, video.duration - startSec)

    const newFrames = await runCancelableExtraction(
      async () => {
        const raw = await extractFramesExact(file, fps, startSec, duration)
        return raw.map((src, i) => ({
          index: Math.round((startSec + i / fps) * fps),
          src,
        }))
      },
      "Slider",
      chunk,
      startSec,
      duration
    )
    setFrames(newFrames)
    lastExtractedChunk.current = chunk
  }

  //Frame scrolling (lazy load)
  const handleScroll = async () => {
    if (!file || loading || !video) return
    const el = containerRef.current
    if (!el) return

    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 300) {
      const nextChunk = lastExtractedChunk.current + 1
      const startSec = nextChunk * 5
      if (startSec >= video.duration) return

      const duration = Math.min(5, video.duration - startSec)
      const newFrames = await runCancelableExtraction(
        async () => {
          const raw = await extractFramesExact(file, fps, startSec, duration)
          return raw.map((src, i) => ({
            index: Math.round((startSec + i / fps) * fps),
            src,
          }))
        },
        "Scroll",
        nextChunk,
        startSec,
        duration
      )
      setFrames(newFrames)
      lastExtractedChunk.current = nextChunk
    }
  }

  const handleSkip = (seconds: number) => {
    if (video) video.currentTime += seconds
  }

//   const handleFullscreen = () => {
//     if (video) video.requestFullscreen()
//   }

    const handleFullscreen = () => {
        const container = layerRef.current?.getStage()?.container()
        if (container && container.requestFullscreen) {
            container.requestFullscreen()
        }
    }


  const currentFrame = Math.round(currentTime * fps)
  const tracks = Array.from(new Set(annotations.map(a => a.track)))
  const colors = ["red", "blue", "lime", "orange", "purple", "cyan"]

  const rulerStart = lastExtractedChunk.current * 5
  const rulerEnd = Math.min(rulerStart + 5, duration)
  const tickCount = 6

  return (
    <div className="flex flex-col gap-2 w-full">
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2">
        <input type="file" accept="video/*" onChange={handleFileChange} className="mb-2" />
        <div className="relative flex items-center justify-center mb-2 w-full h-[320px] bg-black">
          <Stage width={1000} height={320}>
            <Layer ref={layerRef}>
              {video && <KonvaImage image={video} width={1000} height={320} />}

              {video && (
                <>
                  {/*Multi-trajectory rendering */}
                  {tracks.map((track, idx) => {
                    const color = colors[idx % colors.length]
                    const trackPoints = annotations
                      .filter(a => a.track === track && a.frame <= currentFrame)
                      .flatMap(a => [a.x, a.y])

                    const currentTrackPoints = annotations.filter(
                      a => a.track === track && a.frame === currentFrame
                    )

                    return (
                      <React.Fragment key={track}>
                        {trackPoints.length > 2 && (
                          <Line
                            points={trackPoints}
                            stroke={color}
                            strokeWidth={2}
                            lineCap="round"
                            lineJoin="round"
                            opacity={0.8}
                          />
                        )}

                        {annotations
                          .filter(a => a.track === track && a.frame <= currentFrame)
                          .map((a, i) => (
                            <Circle
                              key={i}
                              x={a.x}
                              y={a.y}
                              radius={4}
                              fill={color}
                              stroke="white"
                              strokeWidth={0.5}
                            />
                          ))}

                        {currentTrackPoints.map((a, i) => (
                          <Circle
                            key={`current-${i}`}
                            x={a.x}
                            y={a.y}
                            radius={6}
                            fill="yellow"
                            stroke="white"
                            strokeWidth={1.5}
                          />
                        ))}
                      </React.Fragment>
                    )
                  })}

                  <Text
                    text={`Frame: ${currentFrame}`}
                    fontSize={22}
                    fill="white"
                    x={20}
                    y={20}
                    shadowColor="black"
                  />
                </>
              )}
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
                setDragTime(val[0])
                video?.pause()
              }}
              onValueCommit={(val) => handleSeek(val[0])}
              className="flex-1"
            />
            <span className="text-xs text-[#5A5A5A] p-2">
              {formatTime(dragTime ?? currentTime)} / {formatTime(duration)}
            </span>
            <Button size="icon" variant="ghost" onClick={handleFullscreen}><Maximize2 /></Button>
          </div>
        </div>
      </Card>

      {/* ==== Frame Strip ==== */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-3 pb-4">
        <div className="text-[13px] text-[#5A5A5A] font-medium pb-3 pl-2 pr-2 pt-1">
          Extracted Frames: {frames.length} |
          Time: {frames.length > 0
            ? `${formatTime(frames[0].index / fps)} - ${formatTime(frames[frames.length - 1].index / fps)}`
            : "0 - 0"} |
          FPS: {fps || 0} |
          Total Frames: {video ? Math.floor(video.duration * fps) : 0} |
          Current Frame: {currentFrame}
        </div>

        {/* Time ruler */}
        <div className="relative w-full h-5 mb-3">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gray-500 ml-2 mr-2"></div>
          <div className="absolute top-0 left-0 right-0 flex justify-between">
            {Array.from({ length: tickCount }, (_, i) => {
              const tickTime = rulerStart + ((rulerEnd - rulerStart) / (tickCount - 1)) * i
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className={`w-px ${i % 2 === 0 ? "h-2 bg-gray-500" : "h-1 bg-gray-500"}`}></div>
                  <span className="mt-1 text-[10px] text-gray-500">{formatTime(tickTime)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Frame thumbnails */}
        <div className="flex items-center pl-2 pr-1">
          <Image src="/images/verticalLine.svg" alt="line" width={6} height={60} className="opacity-100 flex-shrink-0 mr-2" />
          <div className="w-full max-w-[1200px]">
            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="flex-1 flex space-x-4 overflow-x-auto border rounded-lg"
              style={{ height: 100 }}
            >
              {frames.length > 0 ? frames.map((f) => (
                <img
                  key={f.index}
                  src={f.src}
                  alt={`frame-${f.index}`}
                  loading="lazy"
                  className={`h-full rounded-lg shadow-md cursor-pointer ${selectedFrameIndex === f.index ? "border-4 border-green-700" : ""}`}
                  onClick={() => {
                    if (!video) return
                    video.currentTime = f.index / fps
                    video.pause()
                    setIsPlaying(false)
                    setSelectedFrameIndex(f.index)
                    setCurrentTime(f.index / fps)
                    dummyMutation.mutate();
                  }}
                />
              )) : loading ? (
                <div className="flex items-center justify-center w-32 text-blue-500 font-medium">Processing…</div>
              ) : null}
              {loading && frames.length > 0 && (
                <div className="flex items-center justify-center w-32 h-full text-blue-500 font-medium">Processing…</div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}