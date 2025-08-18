"use client"

import Image from "next/image"
import { Button } from "@/components/ui/Button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function Dashboard() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FB] font-sans">
      {/* Header */}
      <header className="flex justify-between items-center bg-white h-16 px-7 py-9 shadow-sm">
        <div className="bg-[#D9D9D9] text-white text-[16px] font-medium px-8 py-[11px] leading-[21px]">
          Logo
        </div>
        <div className="flex items-center gap-6">
          <Button
            // variant="default"
            className="bg-[#3B46A0] text-white text-[13px] px-3 py-2 rounded-[5px] flex items-center gap-2 border-2 border-[#3B46A0] hover:bg-[#3B46A0]"
          >
            <Image src="/images/rightArrow.svg" alt="Right Arrow" width={15} height={15} />
            Export
            <Image src="/images/exportDownArrow.svg" alt="Export Down Arrow" width={13} height={7} />
          </Button>
          <div className="flex items-center gap-2">
            <Avatar className="w-[34px] h-[34px]">
              <AvatarFallback className="bg-[#F3B56E] text-white text-[16px] font-medium leading-[12px]">
                M
              </AvatarFallback>
            </Avatar>
            <Image
              src="/images/downArrow.svg"
              alt="Down Arrow"
              width={13}
              height={7}
              className="opacity-80"
            />
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex flex-1 overflow-hidden pl-5 pt-3 pr-5 gap-5">
        {/* Sidebar */}
        <Card className="border rounded-[7px] text-sm">
          <CardHeader className="flex flex-row items-center gap-3 p-3 pb-0">
            <div className="bg-[#D9D9D9] h-10 w-10 rounded" />
            <div>
              <h2 className="text-[#595959] text-[16px] font-medium">Animal Annotation</h2>
              <p className="text-[#9F9F9F] text-[12px]">PROJECT</p>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-2"></span>
                <span className="text-[#404040] text-[13px]">object_annotation_recording.mp4</span>
            </div>
            <div className="flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></span>
                <span className="text-[#404040] text-[13px]">object_annotation.trk</span>
            </div>
          </CardContent>
          <Separator />
          <CardContent className="p-3 pt-2">
            <p className="text-[#494949] text-[13px] leading-[13px] font-medium pt-2 pb-2">Frame #30</p>
            <p className="text-[#5A5A5A] text-[13px] leading-[13px]font-medium">Frame: 128 / 540</p>
            <p className="text-[#5A5A5A] text-[13px] leading-[13px]font-medium">Time: 00:04:16 | FPS: 30</p>
          </CardContent>
          <Separator />
          <CardContent className="p-3">
            <p className="text-[#494949] text-[13px] leading-[13px] pt-2 pb-3 font-medium">Objects</p>

            <Card className="border border-[#D9D9D9] border-[1px] rounded-[7px] p-3 mb-3">
              <div className="flex items-center pb-1">
                <span className="w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
                <span className="font-semibold text-[13px] leading-[13px]">Object 1: Mouse</span>
                <span className="ml-auto text-[#A2A2A2] font-medium text-[13px] leading-[13px]">ID 112</span>
              </div>
              <p className="text-[#5A5A5A] text-[13px]">Trajectory 1:</p>
              <p className="text-[#5A5A5A] pl-3 text-[13px] font-medium">Color: Blue</p>
              <p className="text-[#5A5A5A] pl-3 text-[13px] font-medium">Frame: 10 → 20</p>
            </Card>

            <Card className="border border-[#D9D9D9] border-[1px] rounded-[7px] p-3">
              <div className="flex items-center pb-1">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                <span className="font-semibold text-[13px] leading-[13px]">Object 1: Mouse</span>
                <span className="ml-auto text-[#A2A2A2] font-medium text-[13px] leading-[13px]">ID 113</span>
              </div>
              <p className="text-[#5A5A5A] text-[13px]">Trajectory 2:</p>
              <p className="text-[#5A5A5A] pl-3 text-[13px] font-medium">Color: Red</p>
              <p className="text-[#5A5A5A] pl-3 text-[13px] font-medium">Frame: 21 → 30</p>
            </Card>
          </CardContent>

          <CardContent className="flex gap-2 p-3 pt-2">
            <Button className="bg-[#4B84EE] border-[2px] text-white text-[13px] px-3 py-2 border rounded-[7px] flex items-center gap-1 hover:bg-[#4B84EE]">
              <Image src="/images/swap.svg" alt="Swap" width={15} height={15} /> Swap
            </Button>
            <Button className="bg-[#DD524C] text-white border-[2px] text-[13px] px-3 py-2 border rounded-[7px] flex items-center gap-1 hover:bg-[#DD524C]">
              <Image src="/images/break.svg" alt="Break" width={15} height={15} /> Break
            </Button>
            <Button className="bg-[#5EC16A] border-[2px] text-white text-[13px] px-3 py-2 border rounded-[7px] flex items-center gap-1 hover:bg-[#5EC16A]">
              <Image src="/images/link.svg" alt="Link" width={15} height={15} /> Link
            </Button>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
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

          <Card className="flex items-center justify-between px-4 py-3 rounded-[7px]">
          </Card>
          <Card className="flex items-center justify-between px-4 py-3 rounded-[7px]">
          </Card>

          {/* <Card className="rounded-[7px] mt-2">
            <Image src="/images/videoImage.svg" alt="Video Image" width={5} height={5} className="px-1 py-1 pb-4 w-full" />
            <Image src="/images/playIcon.svg" alt="Play Icon" width={15} height={15} className="pb-2" />
          </Card> */}
        </div>
      </main>
    </div>
  )
}
