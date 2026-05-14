// getTimelineData.ts

import pako from "pako";

const API_BASE =
  process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const getTimelineData =
  async (
    projectId: number,
    start: number,
    end: number,
    signal?: AbortSignal
  ) => {

    const url =
      `${API_BASE}/api/v1/videos/${projectId}/frame-timeline/?start=${start}&end=${end}`;

    try {

      const response =
        await fetch(url, {
          method: "GET",
          signal,
        });

      if (!response.ok) {

        throw new Error(
          "Failed to fetch timeline"
        );
      }

      // raw compressed bytes
      const compressed =
        await response.arrayBuffer();

      // decompress
      const decompressed =
        pako.inflate(
          new Uint8Array(
            compressed
          ),
          {
            to: "string",
          }
        );

      // parse
      return JSON.parse(
        decompressed
      );

    } catch (err: any) {

      if (
        err?.name === "AbortError"
      ) {

        console.log(
          "Timeline request cancelled"
        );

        return null;
      }

      console.error(
        "[Timeline API Error]",
        err
      );

      throw err;
    }
};