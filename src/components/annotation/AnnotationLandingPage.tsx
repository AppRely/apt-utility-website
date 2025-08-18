"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/Button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import CreateProjectModal from "@/components/annotation/CreateProjectModal"

export default function AnnotationLandingPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FB] font-sans">
      {/* Header */}
      <header className="flex justify-between items-center bg-white h-16 px-7 py-9 shadow-sm">
        <div className="bg-[#D9D9D9] text-white text-[16px] font-medium px-8 py-[11px] leading-[21px]">
          Logo
        </div>
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
      </header>

      {/* Body */}
      <main className="flex flex-1 flex-col items-center justify-center text-center">
        <Image
          src="/images/landingPageIcon.svg"
          alt="Annotation Icon"
          width={125}
          height={125}
        />
        <p className="text-[#7B7B7B] text-[24px] font-normal pt-2 pb-3">
          To get started with your annotation project
        </p>
        <Button
          size={null}
          onClick={() => setModalOpen(true)}
          className="bg-[#3B46A0] hover:bg-[#3B46A0] text-[20px] font-normal px-7 py-[11px]"
        >
          <Image
            src="/images/create.svg"
            alt="Create Icon"
            width={18}
            height={18}
          />
          create a new Project
        </Button>
      </main>

      {/* Modal */}
      <CreateProjectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
