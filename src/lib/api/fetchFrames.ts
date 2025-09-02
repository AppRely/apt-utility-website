// src/lib/api/fetchFrames.ts
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT
import type { APIFRame } from "@/types/apiFrame"

export async function fetchFrames(videoId: number): Promise<APIFRame[]> {
  const res = await fetch(`${API_BASE}/api/v1/videos/${videoId}/frames/`)
  if (!res.ok) {
    throw new Error("Failed to fetch frames")
  }
  const data = await res.json()
  return data.frames
}
