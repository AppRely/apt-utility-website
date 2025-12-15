const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const swapObjects = async (
  videoId: number,
  formData: FormData
) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${videoId}/swap-objects/`,
    {
      method: "PUT",
      body: formData, // same pattern as link
    }
  );

  if (!res.ok) {
    throw new Error("Failed to swap objects");
  }

  return res.json();
};
