import Image from "next/image"
import { Button } from "@/components/ui/Button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import Sidebar from "@/components/dashboard/Sidebar"
import MainContent from "@/components/dashboard/MainContent"
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
      <main className="flex flex-1 overflow-hidden pl-3 pt-3 pr-3 gap-3">
        <Sidebar />
        <MainContent/>
      </main>
    </div>
  )
}
