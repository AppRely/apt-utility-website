"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/Button"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { Undo2, Redo2, Trash2, Play, Pause, SkipBack, SkipForward } from "lucide-react"
import { useState } from "react"
import type { Frame } from "@/types/frame"

export default function VideoPanel({ selectedFrame }: { selectedFrame: Frame }) {
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <Card className="flex flex-col flex-1 border rounded-[7px] overflow-hidden">
      {/* Show selected frame image */}
      <div
        className="relative flex items-center justify-center mb-2 w-full h-[320px] overflow-hidden bg-cover"
        style={{ backgroundImage: `url(${selectedFrame.img})` }}
      >
        
      </div>

      <Separator />

      {/* Controls */}
      <div className="flex flex-col">
        <div className="flex items-center">
          <Button size="icon" variant="ghost" className="hover:bg-[white]"><Undo2 /></Button>
          <Button size="icon" variant="ghost" className="hover:bg-[white]"><Redo2/></Button>
          <Button size="icon" variant="ghost" className="hover:bg-[white]"><Trash2/></Button>
          <Button size="icon" variant="ghost" className="hover:bg-[white]"><SkipBack/></Button>
          <Button
            size="icon"
            variant="ghost"
            className="hover:bg-[white]"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause/> : <Play/>}
          </Button>
          <Button size="icon" variant="ghost" className="hover:bg-[white]"><SkipForward /></Button>
          <Slider defaultValue={[40]} max={100} step={1} className="flex-1" />
          <span className="text-xs text-[#5A5A5A] p-4">{selectedFrame.time} / 00:15:22</span>
        </div>
      </div>
    </Card>
  )
}
