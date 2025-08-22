"use client"

import { Card } from "@/components/ui/card"
import Image from "next/image"
import type { Frame } from "@/types/frame"

type Props = {
  frames: Frame[]
  selectedFrame: Frame
  onSelect: (frame: Frame) => void
}

export default function FrameTimeline({ frames, selectedFrame, onSelect }: Props) {
  return (
    <Card className="flex flex-col p-3 border rounded-[7px] overflow-hidden">
      {/* Frame Info */}
      <div className="text-[13px] text-[#5A5A5A] font-medium mb-2">
        Frame: {selectedFrame.frame} | Time: {selectedFrame.time} | FPS: {selectedFrame.fps}
      </div>

      {/* ✅ Ruler / scale (kept intact) */}
      <div className="relative w-full h-10">
        {/* Horizontal line */}
        <div className="absolute top-0 left-1.5 right-0 h-[1px] bg-gray-400"></div>

        {/* Major + minor ticks */}
        <div className="absolute top-0 left-0 right-0 flex justify-between">
          {Array.from({ length: 23 }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              {/* Tick line */}
              <div
                className={`w-px ${i % 2 === 0 ? "h-3 bg-gray-400" : "h-2 bg-gray-300"}`}
              ></div>
              {/* Only show numbers for even ticks */}
              {i % 2 === 0 && (
                <span className="mt-1 text-[10px] text-gray-500">
                  {i < 10 ? `0${i}` : i}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Frames with vertical line before first */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {/* Vertical line image BEFORE first frame */}
        <Image src="/images/verticalLine.svg" alt="line" width={5} height={50} className="opacity-100" />

        {frames.map((frame) => (
          <div
            key={frame.id}
            onClick={() => onSelect(frame)}
            className={`relative w-[140px] h-[70px] flex items-center justify-center rounded-[7px] cursor-pointer border overflow-hidden
              ${selectedFrame.id === frame.id ? "border-green-500 border-[2px]" : "border-[#D9D9D9]"}
            `}
          >
            {/* Background image */}
            <Image src={frame.img} alt={`Frame ${frame.id}`} fill className="object-cover" />

            {/* Overlay label */}
            <span className="absolute bottom-1 left-1 text-[10px] bg-white/70 px-1 rounded text-gray-700">
              Frame {frame.id}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
