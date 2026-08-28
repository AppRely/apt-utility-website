const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type TrajectoryLengthOrdering = "length_desc" | "length_asc";

export type TrajectoryLength = {
  object_id: number;
  first_frame: number;
  last_frame: number;
  length: number;
};

export type TrajectoryLengthsData = {
  project_id: number;
  ordering: TrajectoryLengthOrdering;
  trajectories: TrajectoryLength[];
};

export const getTrajectoryLengths = async (
  projectId: number,
  options: {
    ordering: TrajectoryLengthOrdering;
    minLength?: number;
    maxLength?: number;
    signal?: AbortSignal;
  },
): Promise<TrajectoryLengthsData> => {
  const params = new URLSearchParams({ ordering: options.ordering });
  if (options.minLength !== undefined) params.set("min_length", String(options.minLength));
  if (options.maxLength !== undefined) params.set("max_length", String(options.maxLength));

  const response = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/trajectory-lengths/?${params.toString()}`,
    { signal: options.signal },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success" || !result?.data?.trajectories) {
    throw new Error(result?.message || "Failed to load trajectory lengths");
  }
  return result.data;
};
