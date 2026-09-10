const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

import pako from 'pako'; 

export const getFrameRangeData = async (
  projectId: number,
  startFrame: number,
  endFrame: number,
 signal?: AbortSignal
) => {
  const url = `${API_BASE}/api/v1/videos/${projectId}/frame-object-range-no-fallback/?start=${startFrame}&end=${endFrame}`;
  
  try {
    const response = await fetch(url, {method: "GET", signal,});

    if (!response.ok) {
      throw new Error("Failed to fetch frames data");
    }

    const data = await response.json();

    if (data.compressed && data.data) {
      try {
        const hex: string = data.data;
        const compressed = new Uint8Array(hex.length / 2);
        for (let index = 0; index < compressed.length; index++) {
          compressed[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
        }
        const decompressed = pako.inflate(compressed);
        return JSON.parse(new TextDecoder().decode(decompressed));
      } catch (error) {
        console.error("Decompression failed:", error);
        throw error;
      }
    }

    return data;

  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.log("Request cancelled");
      return null;
    }
    throw err;
  }
}
