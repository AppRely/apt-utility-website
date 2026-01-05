"use client";

import { loadFFmpeg } from "./ffmpeg";

let videoWrittenFiles = new WeakMap<File, boolean>();

// --- FFmpeg mutex ---
let ffmpegBusy: Promise<void> = Promise.resolve();          //hold current active job

async function runFFmpegSafely(fn: () => Promise<void>) {
  let release: () => void;
  const next = new Promise<void>((res) => (release = res));
  const previous = ffmpegBusy;
  ffmpegBusy = (async () => {
    await previous;           // wait until previous job finishes
    try {
      await fn();          // run the actual job  
    } finally {
      release!();        // release the lock for the next job
    }
  })();
  return ffmpegBusy;
}

/**
 * Extract frames at exact video FPS
 */
export async function extractFramesExact(
  file: File,
  fps: number,
  start: number = 0,
  duration: number = 5
): Promise<string[]> {
  const { ffmpeg, fetchFile } = await loadFFmpeg();

  if (!videoWrittenFiles.get(file)) {
    await runFFmpegSafely(async () => {
      ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file));
    });
    videoWrittenFiles.set(file, true);
  }

  const args = [
    "-ss",
    String(start),
    "-t",
    String(duration),
    "-i",
    "input.mp4",
    "-vf",
    `fps=${fps},scale=320:-1`,
    "-threads",
    "8",
    "-q:v",
    "2",
    "frame_%04d.jpg",
  ];

  console.log(`[FFmpeg] Extracting frames: ${start}s → ${start + duration}s`);
  await runFFmpegSafely(async () => {
    await ffmpeg.run(...args);
  });

  const files: string[] = [];
  let index = 1;
  while (true) {
    const name = `frame_${String(index).padStart(4, "0")}.jpg`;
    try {
      const data = ffmpeg.FS("readFile", name);
      const blob = new Blob([data.buffer], { type: "image/jpeg" });
      files.push(URL.createObjectURL(blob));
      ffmpeg.FS("unlink", name);
      index++;
    } catch {
      break;
    }
  }

  return files;
}
