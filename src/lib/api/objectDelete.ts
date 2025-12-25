const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const objectDelete = async (
  videoId: number,
  formData: FormData
) => {
  console.log("inside delete");
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${videoId}/objects/delete/`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error("Failed to delete object");
  }

  return res.json();
};
