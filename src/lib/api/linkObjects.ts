const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const linkObjects = async (
  videoId: number,
  payload: {
    object_1_id: number;
    object_1_start: number;
    object_1_end: number;
    object_2_id: number;
    object_2_start: number;
    object_2_end: number;
  }
) => {
  const res = await fetch(`${API_BASE}/videos/${videoId}/link-objects/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Failed to link objects");
  }

  return res.json();
};
