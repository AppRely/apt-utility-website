"use client"

import { Card } from "@/components/ui/card"
import Image from "next/image"
import { useQuery } from "@tanstack/react-query"
import { fetchFrames } from "@/lib/api/fetchFrames"
import type { APIFRame } from "@/types/apiFrame"

type Props = {
  selectedFrame: APIFRame | null
  onSelect: (frame: APIFRame) => void
  videoId: number
}

export default function FrameTimeline({ selectedFrame, onSelect, videoId }: Props) {
  const { data: frames, isLoading, isError } = useQuery({
    queryKey: ["frames",2],
    queryFn: () => fetchFrames(2),
  })

  if (isLoading) return <div>Loading frames...</div>
  if (isError) return <div>Failed to load frames</div>

  return (
    <Card className="flex flex-col p-3 border rounded-[7px] overflow-hidden">
      {/* Frame Info */}
      {selectedFrame && (
        <div className="text-[13px] text-[#5A5A5A] font-medium mb-2">
          Frame: {selectedFrame.frame_number}
        </div>
      )}

      {/* Ruler / scale */}
      <div className="relative w-full h-10 mb-2">
        <div className="absolute top-0 left-1.5 right-0 h-[1px] bg-gray-400"></div>
        <div className="absolute top-0 left-0 right-0 flex justify-between">
          {Array.from({ length: 23 }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className={`w-px ${i % 2 === 0 ? "h-3 bg-gray-400" : "h-2 bg-gray-300"}`}></div>
              {i % 2 === 0 && (
                <span className="mt-1 text-[10px] text-gray-500">{i < 10 ? `0${i}` : i}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <Image src="/images/verticalLine.svg" alt="line" width={5} height={50} className="opacity-100 flex-shrink-0" />

        {frames?.map((frame) => (
          <div
            key={frame.frame_number}
            onClick={() => onSelect(frame)}
            className={`relative w-[140px] h-[70px] flex-shrink-0 flex items-center justify-center rounded-[7px] cursor-pointer border overflow-hidden
              ${selectedFrame?.frame_number === frame.frame_number ? "border-green-500 border-[2px]" : "border-[#D9D9D9]"}
            `}
          >
            <Image src={frame.thumbnail} alt={`Frame ${frame.frame_number}`} fill className="object-cover" />
            <span className="absolute bottom-1 left-1 text-[10px] bg-white/70 px-1 rounded text-gray-700">
              Frame {frame.frame_number}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
