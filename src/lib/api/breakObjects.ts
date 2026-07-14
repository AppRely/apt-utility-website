const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const breakObjects = async (
  projectId: number,
  formData: FormData,
  breakType: 'before' | 'after'   // <-- new parameter
) => {
  const res = await fetch(
    `${API_BASE}/api/v1/videos/${projectId}/objects/break/?break_type=${breakType}`,
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