const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export type ClipObjectPayload = {
  object_id: number;
  start_frame: number;
  end_frame: number;
};

export const clipObject = async (projectId: number, payload: ClipObjectPayload) => {
  const response = await fetch(`${API_BASE}/api/v1/videos/${projectId}/clip-object/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to clip object");
  }
  return data;
};
