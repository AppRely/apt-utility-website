"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/Button"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { Undo2, Redo2, Trash2, Play, Pause, SkipBack, SkipForward, Maximize2 } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchVideoStream } from "@/lib/api/fetchVideo"
import type { Frame } from "@/types/frame"

export default function VideoPanel({ selectedFrame }: { selectedFrame: Frame }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Fetch video stream from API
  const { data: videoUrl, isLoading, isError } = useQuery({
    queryKey: ["videoStream", 2],
    queryFn: () => fetchVideoStream(2),
  })

  // Handle play / pause toggle
  useEffect(() => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.play()
    } else {
      videoRef.current.pause()
    }
  }, [isPlaying])

  // Format time helper
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // Handlers
  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
    }
  }

  const handleFullscreen = () => {
    if (videoRef.current) {
      videoRef.current.requestFullscreen()
    }
  }

  return (
    <Card className="flex flex-col flex-1 border rounded-[7px] overflow-hidden">
      {/* Video Player */}
      <div className="relative flex items-center justify-center mb-2 w-full h-[320px] bg-black">
        {isLoading && <p className="text-white">Loading video...</p>}
        {isError && <p className="text-red-500">Error loading video</p>}
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            controls={false}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          />
        )}
      </div>

      <Separator />

      {/* Controls */}
      <div className="flex flex-col px-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost"><Undo2 /></Button>
          <Button size="icon" variant="ghost"><Redo2/></Button>
          <Button size="icon" variant="ghost"><Trash2/></Button>

          {/* Skip Back */}
          <Button size="icon" variant="ghost" onClick={() => handleSkip(-10)}>
            <SkipBack />
          </Button>

          {/* Play / Pause */}
          <Button size="icon" variant="ghost" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause /> : <Play />}
          </Button>

          {/* Skip Forward */}
          <Button size="icon" variant="ghost" onClick={() => handleSkip(10)}>
            <SkipForward />
          </Button>

          {/* Progress Slider */}
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={(val) => {
              if (videoRef.current) {
                videoRef.current.currentTime = val[0]
                setCurrentTime(val[0]) // keep UI in sync while dragging
              }
            }}
            className="flex-1"
          />

          {/* Time Display */}
          <span className="text-xs text-[#5A5A5A] p-2">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Fullscreen */}
          <Button size="icon" variant="ghost" onClick={handleFullscreen}>
            <Maximize2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}
