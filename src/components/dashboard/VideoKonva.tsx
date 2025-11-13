"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/Button"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import {
  Undo2, Redo2, Trash2,
  Play, Pause, SkipBack, SkipForward, Maximize2
} from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { Stage, Layer, Image as KonvaImage } from "react-konva"
import { extractFramesExact } from "@/lib/ffmpeg/extractFramesFast"
import { loadFFmpeg } from "@/lib/ffmpeg/ffmpeg"

type Frame = { index: number; src: string }

export default function VideoKonva() {
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

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<any>(null)

  // --- Extraction control ---
  const ongoingExtraction = useRef<Promise<Frame[]> | null>(null)
  const extractionAbort = useRef(false)
  const currentTaskType = useRef<"Initial" | "Scroll" | "Slider" | null>(null)
  // --- Track last extracted chunk globally ---
  const lastExtractedChunk = useRef(0)

  // --- Format time ---
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // --- Detect FPS ---
  const getVideoFPS = async (file: File): Promise<number> => {
    const { ffmpeg, fetchFile } = await loadFFmpeg()
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file))
    let fps = 30
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

  // --- Cancelable extraction ---
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
        console.log(`[${type}] Canceled → chunk=${chunk}, ${startSec}s → ${endSec}s`)
        return []
      }
      console.log(`[${type}] Finished → chunk=${chunk}, ${startSec}s → ${endSec}s, frames=${result.length}`)
      return result
    })()

    ongoingExtraction.current = promise
    const result = await promise
    ongoingExtraction.current = null
    currentTaskType.current = null
    setLoading(false)

    return result
  }

  // --- File Upload ---
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
    videoRef.current = vid

    setLoading(true)
    try {
      const exactFps = await getVideoFPS(f)
      setFps(exactFps)

      // Initial 0–5s extraction
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
      setDuration(vid.duration)
    } finally {
      setLoading(false)
    }
  }

  // --- Sync video with isPlaying & currentTime ---
  useEffect(() => {
    if (!videoRef.current) return
    const vid = videoRef.current

    const handleTimeUpdate = () => setCurrentTime(vid.currentTime)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    vid.addEventListener("timeupdate", handleTimeUpdate)
    vid.addEventListener("play", handlePlay)
    vid.addEventListener("pause", handlePause)

    return () => {
      vid.removeEventListener("timeupdate", handleTimeUpdate)
      vid.removeEventListener("play", handlePlay)
      vid.removeEventListener("pause", handlePause)
    }
  }, [videoRef.current])

  useEffect(() => {
    if (!videoRef.current) return
    if (isPlaying) videoRef.current.play()
    else videoRef.current.pause()
  }, [isPlaying])

  // --- Draw video on Konva ---
  useEffect(() => {
    if (!video || !layerRef.current) return
    const layer = layerRef.current
    const drawLoop = () => {
      layer.batchDraw()
      requestAnimationFrame(drawLoop)
    }
    drawLoop()
  }, [video])

  // --- Slider Seek ---
  const handleSeek = async (time: number) => {
    if (!videoRef.current || !file) return

    const safeTime = Math.min(Math.max(time, 0), videoRef.current.duration)
    videoRef.current.currentTime = safeTime
    setCurrentTime(safeTime)
    setDragTime(null)
    setSelectedFrameIndex(Math.round(safeTime * fps))
    if (!isPlaying) videoRef.current.play()

    const chunk = Math.floor(safeTime / 5)
    const startSec = chunk * 5
    if (startSec >= videoRef.current.duration) return

    const duration = Math.min(5, videoRef.current.duration - startSec)
    if (duration <= 0) return

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

  // --- Scroll extraction ---
  const handleScroll = async () => {
    if (!file || loading || !videoRef.current) return
    const el = containerRef.current
    if (!el) return

    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 500) {
      const nextChunk = lastExtractedChunk.current + 1
      const startSec = nextChunk * 5
      if (startSec >= videoRef.current.duration) return

      const duration = Math.min(5, videoRef.current.duration - startSec)
      if (duration <= 0) return

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

  // --- Frame click ---
  const handleFrameClick = (time: number, index: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = time
    videoRef.current.pause()
    setIsPlaying(false)
    setSelectedFrameIndex(index)
    setCurrentTime(time)
    setDragTime(null)
  }

  const handleSkip = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime += seconds
  }

  const handleFullscreen = () => {
    if (videoRef.current) videoRef.current.requestFullscreen()
  }

  const rulerStart = lastExtractedChunk.current * 5
  const rulerEnd = Math.min(rulerStart + 5, duration)
  const tickCount = 6

  return (
    <div className="flex flex-col gap-2 w-full">
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-2">
        <input type="file" accept="video/*" onChange={handleFileChange} className="mb-2" />

        {/* Konva Stage for video */}
        <div className="relative flex items-center justify-center mb-2 w-full h-[320px] bg-black">
          {video && (
            <Stage width={1000} height={320}>
              <Layer ref={layerRef}>
                <KonvaImage
                  image={video}
                  width={1000} //1210,640
                  height={320}
                />
              </Layer>
            </Stage>
          )}
        </div>

        <Separator />
        {/* Controls and slider */}
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
                videoRef.current?.pause()
              }}
              onValueCommit={(val) => handleSeek(val[0])}
              className="flex-1"
            />
            <span className="text-xs text-[#5A5A5A] p-2">{formatTime(dragTime ?? currentTime)} / {formatTime(duration)}</span>
            <Button size="icon" variant="ghost" onClick={handleFullscreen}><Maximize2 /></Button>
          </div>
        </div>
      </Card>

      {/* Frames panel */}
      <Card className="flex flex-col border rounded-[7px] overflow-hidden p-3 pb-4">
        <div className="text-[13px] text-[#5A5A5A] font-medium pb-3 pl-2 pr-2 pt-1">
          Extracted Frames: {frames.length} |
          Time: {frames.length > 0 
              ? formatTime(frames[0].index / fps) + " - " + formatTime(frames[frames.length-1].index / fps)
              : "0 - 0"} |
          FPS: {fps || 0} |
          Total Frames: {video ? Math.floor(video.duration * fps) : 0}
        </div>
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

        <div className="flex items-center pl-2 pr-1">
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
                  onClick={() => handleFrameClick(f.index / fps, f.index)}
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
