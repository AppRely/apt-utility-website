const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type TrajectoryClipSuggestion = {
  start_frame: number;
  end_frame: number;
  peak_frame: number;
  score: number;
  peak_movement: number;
  reason: string;
};

export type TrajectoryClipSuggestionsData = {
  project_id: number;
  object_id: number;
  analyzed_range: { start_frame: number; end_frame: number };
  baseline_movement: number;
  suggestions: TrajectoryClipSuggestion[];
};

export const getTrajectoryClipSuggestions = async (
  projectId: number,
  payload: {
    object_id: number;
    start_frame: number;
    end_frame: number;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<TrajectoryClipSuggestionsData> => {
  const response = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/trajectory-clip-suggestions/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, limit: payload.limit ?? 5 }),
      signal,
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success" || !result?.data) {
    throw new Error(result?.message || "Failed to load trajectory clip suggestions");
  }
  return result.data;
};
