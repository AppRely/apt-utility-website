const createProject = async (formData: FormData) => {
  const API_BASE = `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}`;
  const response = await fetch(`${API_BASE}/api/v1/videos/project-upload/`, {
    method: "POST",
    body: formData,
  })
  console.log("Response:", response)
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || JSON.stringify(errorData) || "Failed to create project");
  }
  return response.json()
}
export { createProject }