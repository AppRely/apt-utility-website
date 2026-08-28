const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type TrajectoryLinkingSuggestion = {
  object_id: number;
  score: number;
};

export type TrajectoryLinkingSuggestionsPayload = {
  object_id: number;
  break_start: number;
  break_end: number;
  limit?: number;
};

export const getTrajectoryLinkingSuggestions = async (
  projectId: number,
  payload: TrajectoryLinkingSuggestionsPayload,
): Promise<TrajectoryLinkingSuggestion[]> => {
  const response = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/trajectory-linking-suggestions/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, limit: payload.limit ?? 5 }),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.data) {
    throw new Error(result?.message || "Failed to load trajectory linking suggestions");
  }
  return result.data.suggestions ?? [];
};
