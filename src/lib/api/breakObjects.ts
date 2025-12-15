const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const breakObjects = async (
  videoId: number,
  formData: FormData
) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${videoId}/objects/break/`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error("Failed to break object");
  }

  return res.json();
};
