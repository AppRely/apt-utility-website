// getTimelineData.ts

import pako from "pako";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

/**
 * Fetch frame timeline data for a project within a frame range,
 * optionally filtered by object IDs.
 *
 * @param projectId - ID of the project/video
 * @param start - Start frame number
 * @param end - End frame number (inclusive)
 * @param objectIds - Optional: single object ID, comma-separated string, or array of IDs
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Parsed timeline JSON or null if aborted
 */
export const getTimelineData = async (
  projectId: number,
  start: number,
  end: number,
  objectIds?: string | number | (string | number)[],
  signal?: AbortSignal
) => {
  // Build base URL
  let url = `${API_BASE}/api/v1/videos/${projectId}/frame-timeline/?start=${start}&end=${end}`;

  // Append object_ids if provided
  if (objectIds) {
    let idsParam: string;
    if (Array.isArray(objectIds)) {
      idsParam = objectIds.join(",");
    } else {
      idsParam = String(objectIds);
    }
    url += `&object_ids=${encodeURIComponent(idsParam)}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      signal,
    });

    if (!response.ok) {
      // throw new Error("Failed to fetch timeline");
    }

    // raw compressed bytes
    const compressed = await response.arrayBuffer();

    // decompress
    const decompressed = pako.inflate(new Uint8Array(compressed), {
      to: "string",
    });

    // parse JSON
    return JSON.parse(decompressed);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.log("Timeline request cancelled");
      return null;
    }

    console.error("[Timeline API Error]", err);
    throw err;
  }
};
