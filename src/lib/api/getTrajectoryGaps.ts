const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type TrajectoryGap = {
  start_frame: number;
  end_frame: number;
  gap: number;
};

export type TrajectoryGapsData = {
  project_id: number;
  object_id: number;
  largest_gap: TrajectoryGap | null;
  gaps: TrajectoryGap[];
};

export const getTrajectoryGaps = async (
  projectId: number,
  objectId: number,
  options?: { minGap?: number; limit?: number; signal?: AbortSignal },
): Promise<TrajectoryGapsData> => {
  const params = new URLSearchParams({
    object_id: String(objectId),
    min_gap: String(options?.minGap ?? 2),
    limit: String(options?.limit ?? 20),
  });
  const response = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/trajectory-gaps/?${params.toString()}`,
    { signal: options?.signal },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success" || !result?.data) {
    throw new Error(result?.message || "Failed to load trajectory gaps");
  }
  return result.data;
};
