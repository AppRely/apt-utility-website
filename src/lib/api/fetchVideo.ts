const API_BASE = `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}`;

export async function fetchVideoStream(id: number) {
  const res = await fetch(`${API_BASE}/api/v1/videos/${id}/stream/`);
  if (!res.ok) {
    throw new Error("Failed to fetch video stream");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob); // browser-playable video URL
}