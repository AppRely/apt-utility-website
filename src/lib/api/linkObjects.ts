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
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/link-objects/`,
    {
      method: "PUT",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Failed to link objects");
  }

  return res.json();
};