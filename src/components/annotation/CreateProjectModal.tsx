"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/hooks/use-toast"
import { Button } from "@/components/ui/Button"
import { useState } from "react"
import { z } from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createProject } from "@/lib/api/createProject"
const API_BASE = `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}`;

// ✅ Schema
const projectSchema = z.object({
  projectName: z.string().min(3, "Project name must be at least 3 characters"),
  fileUpload: z
    .custom<FileList>((val) => val instanceof FileList && val.length > 0, {
      message: "File is required",
    })
    .refine(
      (files) => {
        if (!(files instanceof FileList) || files.length === 0) return false
        const allowed = ["avi", "mp4", "mov", "ufmf"]
        const fileExt = files[0].name.split(".").pop()?.toLowerCase()
        return allowed.includes(fileExt ?? "")
      },
      { message: "Only .avi, .mp4, .mov, .ufmf files are allowed" }
    ),
  trackingFile: z.any().optional(),
})

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
}

export default function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState("")
  const [fileUpload, setFileUpload] = useState<FileList | null>(null)
  const [trackingFile, setTrackingFile] = useState<FileList | null>(null)

  const { toast } = useToast()


  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: (formData: FormData) => createProject(formData),
  onSuccess: (data) => {
    toast({
      title: "Project created successfully!",
      variant: "default",
      duration: 2000,
      className: "text-green-600",
    })

    // reset form state
    setErrors({})
    setProjectName("")
    setFileUpload(null)
    setTrackingFile(null)
    onClose()

    // if you keep a "projects list" query, re-fetch it
    queryClient.invalidateQueries({ queryKey: ["projects"] })
  },
  onError: (error: any) => {
    toast({
      title: "Error creating project",
      description: error.message,
      variant: "destructive",
      duration: 2000,
    })
  },
})


  // ✅ Handle submit
  const handleSubmit = async () => {
    const formData = { projectName, fileUpload, trackingFile }
    const result = projectSchema.safeParse(formData)

    if (!result.success) {
      const fieldErrors: { [key: string]: string } = {}
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message
      })
      setErrors(fieldErrors)
      return
    }

      const body = new FormData()
      body.append("project_name", projectName)
      if (fileUpload?.[0]) body.append("video_file", fileUpload[0])
      if (trackingFile?.[0]) body.append("trk_file", trackingFile[0])
      mutation.mutate(body)
    
  }

  // ✅ Helper to clear error for a single field
  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] p-0 rounded-[12px] overflow-hidden">
        {/* Header */}
        <div className="px-8 py-7 border-b-[2px]">
          <DialogHeader>
            <DialogTitle className="text-[#595959] text-[23px] font-medium leading-[14px]">
              Create your project.
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-8 py-5 space-y-7">
          {/* Project Name */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <label className="w-[180px] text-[#595959] text-[18px] font-medium text-left">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value)
                  clearError("projectName")
                }}
                className="flex-1 border-[2px] border-[#D9D9D9] outline-none bg-[#F2F2F27A] rounded-[7px] px-4 py-4 text-sm"
              />
            </div>
            {errors.projectName && (
              <p className="text-red-500 text-sm pl-[195px]">{errors.projectName}</p>
            )}
          </div>

          {/* File Upload */}
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-4">
              <label className="w-[180px] text-[#595959] text-[18px] font-medium text-left pt-5">
                File Upload
              </label>
              <div className="flex-1">
                <div className="relative w-full">
                  <input
                    type="file"
                    id="fileUpload"
                    onChange={(e) => {
                      setFileUpload(e.target.files)
                      clearError("fileUpload")
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="w-full border-[2px] rounded-[7px] border-[#D9D9D9] bg-[#F2F2F27A] px-4 py-4">
                    <label
                      htmlFor="fileUpload"
                      className="text-[#929292] text-[17px] font-medium border-[2px] rounded-[7px] border-[#929292] px-5 py-1 cursor-pointer"
                    >
                      Choose File
                    </label>
                    <span className="text-[#929292] text-[17px] font-medium pl-2">
                      {fileUpload?.[0]?.name ?? "No file chosen"}
                    </span>
                  </div>
                </div>
                <p className="text-[#929292] text-[14px] pt-2">
                  eg., Accept .avi, .mp4, .mov, .ufmf
                </p>
              </div>
            </div>
            {errors.fileUpload && (
              <p className="text-red-500 text-sm pl-[195px]">{errors.fileUpload}</p>
            )}
          </div>

          {/* Tracking File (optional) */}
          <div className="flex items-start gap-4">
            <label className="w-[180px] text-[#595959] text-[18px] font-medium text-left pt-5">
              Upload Tracking file
            </label>
            <div className="flex-1">
              <div className="relative w-full">
                <input
                  type="file"
                  id="trackingFile"
                  onChange={(e) => setTrackingFile(e.target.files)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-full border-[2px] rounded-[7px] border-[#D9D9D9] bg-[#F2F2F27A] px-4 py-4">
                  <label
                    htmlFor="trackingFile"
                    className="text-[#929292] text-[17px] font-medium border-[2px] rounded-[7px] border-[#929292] px-5 py-1 cursor-pointer"
                  >
                    Choose File
                  </label>
                  <span className="text-[#929292] text-[17px] font-medium pl-2">
                    {trackingFile?.[0]?.name ?? "No file chosen"}
                  </span>
                </div>
              </div>
              <p className="text-[#929292] text-[14px] pt-2 pb-2">
                eg., Accept .trk, .json, .csv, .xml
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-7 border-t-[2px] flex justify-end gap-5">
          <Button
            size={null}
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="bg-[#3B46A0] hover:bg-[#3B46A0] border-[2px] text-white text-[22px] px-10 py-2 rounded-[7px] font-normal"
          >
            {mutation.isPending ? "Creating..." : "Create"}
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
