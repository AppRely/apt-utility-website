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
): Promise<{ f: Record<string, Record<string, unknown>> } | null> => {
  let url = `${API_BASE}/api/v1/videos/${projectId}/frame-timeline/?start=${start}&end=${end}`;
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
    const response = await fetch(url, { method: "GET", signal });
    if (!response.ok) {
      if (response.status === 400) {
        // This endpoint rejects a multi-ID request when any ID has no frames
        // in the requested window. Keep the other selected trajectories visible.
        const ids = [...new Set((Array.isArray(objectIds) ? objectIds.join(",") : String(objectIds ?? ""))
          .split(",").map(id => id.trim()).filter(Boolean))];
        if (ids.length > 1) {
          const merged: Record<string, Record<string, unknown>> = {};
          // Limit concurrent fallback requests for large bulk selections.
          for (let index = 0; index < ids.length; index += 4) {
            if (signal?.aborted) return null;
            const results = await Promise.all(ids.slice(index, index + 4).map(id =>
              getTimelineData(projectId, start, end, id, signal)));
            if (signal?.aborted) return null;
            for (const result of results) {
              for (const [frame, objects] of Object.entries(result?.f ?? {})) {
                merged[frame] = { ...merged[frame], ...objects };
              }
            }
          }
          return { f: merged };
        }
        return { f: {} };
      }
      throw new Error(`Failed to fetch timeline: ${response.status} ${response.statusText}`);
    }
    const compressed = await response.arrayBuffer();
    if (compressed.byteLength === 0) return { f: {} };
    const decompressed = pako.inflate(new Uint8Array(compressed), { to: "string" });
    if (!decompressed || decompressed.trim() === "") return { f: {} };
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