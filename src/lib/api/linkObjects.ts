export const linkObjects = async (
  videoId: number,
  formData: FormData   // <-- accept FormData
) => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/api/v1/videos/${videoId}/link-objects/`,
    {
      method: "PUT",
      body: formData, // <-- send FormData directly
    }
  );

  if (!res.ok) {
    throw new Error("Failed to link objects");
  }

  return res.json();
};
