const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

import pako from 'pako'; 

export const getFrameRangeData = async (
  projectId: number,
  startFrame: number,
  endFrame: number,
 signal?: AbortSignal
) => {
  console.log("ProjectID:", projectId, "Sending chunk:", startFrame, endFrame);
  const url = `${API_BASE}/api/v1/videos/${projectId}/frame-object-range-no-fallback/?start=${startFrame}&end=${endFrame}`;
  
  try {
    const response = await fetch(url, {method: "GET", signal,});

    if (!response.ok) {
      throw new Error("Failed to fetch frames data");
    }

    const data = await response.json();

    if (data.compressed && data.data) {
      try {
        const binaryString = Array.from(
          new Uint8Array(data.data.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)))
        ).map(byte => String.fromCharCode(byte)).join('');
        const decompressed = pako.inflate(
          new Uint8Array(binaryString.split('').map(c => c.charCodeAt(0)))
        );
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

