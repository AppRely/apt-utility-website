const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

type InterpolatePayload =
  | {
      source_object_id: number;
      source_end_frame: number;
      target_object_id: number;
      target_start_frame: number;
    }
  | {
      object_id: number;
      start_frame: number;
      end_frame: number;
    };

export const interpolateTrajectory = async (
  projectId: number,
  data: InterpolatePayload
) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/interpolate-trajectory/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) {
    throw new Error("Failed to interpolate trajectory");
  }

  return res.json();
};