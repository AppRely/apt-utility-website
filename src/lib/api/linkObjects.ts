import { getActiveObjectRange } from "./getObjectData";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const linkObjects = async (
  projectId: number,
  payload: {
    object_1_id: number;
    object_1_start: number;
    object_1_end: number;
    object_2_id: number;
    object_2_start: number;
    object_2_end: number;
    operation: 'link' | 'overlap';
    preferred_object?: number;
  }
) => {
  // Selections can come from a windowed video cache. Resolve full track
  // lifecycles before linking instead of using the loaded window boundaries.
  const [first, second] = await Promise.all([
    getActiveObjectRange(projectId, payload.object_1_id, payload.object_1_start),
    getActiveObjectRange(projectId, payload.object_2_id, payload.object_2_start),
  ]);
  const fullRangePayload = {
    ...payload,
    object_1_start: first.start_frame,
    object_1_end: first.end_frame,
    object_2_start: second.start_frame,
    object_2_end: second.end_frame,
  };

  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/link-objects/`,
    {
      method: "PUT",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fullRangePayload),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Failed to link objects");
  }

  return res.json();
};