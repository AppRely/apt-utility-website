"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/Button"
import { useState } from "react"

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
}

export default function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState("")

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] p-0 rounded-[12px] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-8 py-7 border-b-[2px]">
          <DialogHeader>
            <DialogTitle className="text-[#595959] text-[23px] font-medium leading-[14px]">
              Create your project.
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Modal Body */}
        <div className="px-8 py-5 space-y-7">
          
          {/* Project Name */}
          <div className="flex items-center gap-4">
            <label className="w-[180px] text-[#595959] text-[18px] font-medium text-left">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="flex-1 border-[2px] border-[#D9D9D9] outline-none bg-[#F2F2F27A] rounded-[7px] px-4 py-4 text-sm"
            />
          </div>

          {/* File Upload */}
          <div className="flex items-start gap-4">
            <label className="w-[180px] text-[#595959] text-[18px] font-medium text-left pt-5">
              File Upload
            </label>
            <div className="flex-1">
              <div className="relative w-full">
                <input
                  type="file"
                  id="fileUpload"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-full border-[2px] rounded-[7px] border-[#D9D9D9] bg-[#F2F2F27A] px-4 py-4">
                  <label
                    htmlFor="fileUpload"
                    className="text-[#929292] text-[17px] font-medium border-[2px] rounded-[7px] border-[#929292] px-5 py-1"
                  >
                    Choose File
                  </label>
                  <span className="text-[#929292] text-[17px] font-medium pl-2">
                    No file chosen
                  </span>
                </div>
              </div>
              <p className="text-[#929292] text-[14px] pt-2">
                eg., Accept .mp4, .mkv, .avi, .mov
              </p>
            </div>
          </div>

          {/* Upload Tracking File */}
          <div className="flex items-start gap-4">
            <label className="w-[180px] text-[#595959] text-[18px] font-medium text-left pt-5">
              Upload Tracking file
            </label>
            <div className="flex-1">
              <div className="relative w-full">
                <input
                  type="file"
                  id="trackingFile"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-full border-[2px] rounded-[7px] border-[#D9D9D9] bg-[#F2F2F27A] px-4 py-4">
                  <label
                    htmlFor="trackingFile"
                    className="text-[#929292] text-[17px] font-medium border-[2px] rounded-[7px] border-[#929292] px-5 py-1"
                  >
                    Choose File
                  </label>
                  <span className="text-[#929292] text-[17px] font-medium pl-2">
                    No file chosen
                  </span>
                </div>
              </div>
              <p className="text-[#929292] text-[14px] pt-2 pb-2">
                eg., Accept .trk, .json, .csv, .xml
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-7 border-t-[2px] flex justify-end gap-5">
          <Button
            size={null}
            className="bg-[#3B46A0] hover:bg-[#3B46A0] border-[2px] text-white text-[22px] px-10 py-2 rounded-[7px] font-normal"
          >
            Create
          </Button>
          <Button
            variant="ghost"
            size={null}
            onClick={onClose}
            className="text-[#BDBDBD] hover:bg-[white] hover:-text-[#BDBDBD] text-[22px] px-10 rounded-[7px] border-[2px] font-normal"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
