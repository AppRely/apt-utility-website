const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export async function exportActivityLogs(projectId: number): Promise<void> {
  const url = `${API_BASE}/api/v1/videos/activity/logs/export/?project_id=${projectId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      // Include any auth headers if needed (e.g., Authorization)
      // 'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  // Get the filename from Content-Disposition header or use a default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = "audit_trail_export.csv";
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];
  }

  // Convert response to Blob
  const blob = await response.blob();

  // Create a download link and trigger it
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the object URL
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}