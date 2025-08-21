"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import Image from "next/image"
import { Button } from "@/components/ui/Button"
import VideoPanel from "@/components/dashboard/VideoPanel"
import FrameTimeline from "@/components/dashboard/FrameTimeLine"
import type { Frame } from "@/types/frame"

const frames: Frame[] = [
  { id: 1, frame: "128 / 540", time: "00:04:16", fps: 30, img: "/images/frame1.jpg" },
  { id: 2, frame: "200 / 540", time: "00:06:40", fps: 30, img: "/images/frame2.jpg" },
  { id: 3, frame: "300 / 540", time: "00:10:00", fps: 30, img: "/images/frame3.jpg" },
  { id: 4, frame: "400 / 540", time: "00:13:20", fps: 30, img: "/images/frame4.jpg" },
  { id: 5, frame: "500 / 540", time: "00:15:00", fps: 30, img: "/images/frame5.jpg" },
]

export default function AnnotationWorkspace() {
  const [selectedFrame, setSelectedFrame] = useState<Frame>(frames[0])

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <Card className="flex items-center justify-between px-3 py-3 border rounded-[7px]">
        <p className="text-[13px] font-medium">Animal_annotation_recording_mp4</p>
        <div className="flex items-center gap-4">
          <span className="text-xs">1200×720</span>
          <Button variant="outline" size="sm" className="flex items-center text-xs rounded px-2 py-0 hover:bg-[white]">
            75%
            <Image src="/images/downArrow.svg" alt="Down Arrow" width={10} height={7} className="opacity-80" />
          </Button>
        </div>
      </Card>

      <VideoPanel selectedFrame={selectedFrame} />
      <FrameTimeline frames={frames} selectedFrame={selectedFrame} onSelect={setSelectedFrame} />
    </div>
  )
}
