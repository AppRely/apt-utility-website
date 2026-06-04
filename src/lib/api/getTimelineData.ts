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
 * @returns Parsed timeline JSON, empty array, or null if aborted / no data
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
      throw new Error(`Failed to fetch timeline: ${response.status} ${response.statusText}`);
    }

    // Get the raw compressed bytes
    const compressed = await response.arrayBuffer();

    // If the response body is empty, return an empty array (or null) without error
    if (compressed.byteLength === 0) {
      console.log("Empty timeline data received, returning empty array");
      return []; // or return null if your app expects null
    }

    // Decompress the data
    const decompressed = pako.inflate(new Uint8Array(compressed), {
      to: "string",
    });

    // If decompressed string is empty, return empty array
    if (!decompressed || decompressed.trim() === "") {
      console.log("Decompressed timeline data is empty, returning empty array");
      return [];
    }

    // Parse JSON
    return JSON.parse(decompressed);
  } catch (err: any) {
    // AbortError is expected on cancellation – return null
    if (err?.name === "AbortError") {
      console.log("Timeline request cancelled");
      return null;
    }

    // For any other error, log it and rethrow (unless you want to suppress all)
    console.error("[Timeline API Error]", err);
    throw err;
  }
};