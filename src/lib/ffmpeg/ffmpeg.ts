"use client";

let ffmpegInstance: any = null;
let fetchFileFn: any = null;

export const loadFFmpeg = async () => {
  if (!ffmpegInstance) {
    // console.log("4.Importing ffmpeg.wasm...");
    const ffmpegModule: any = await import("@ffmpeg/ffmpeg/dist/ffmpeg.min.js");
    // console.log("7.ffmpeg.wasm imported");
    // console.log("8.Creating ffmpeg instance...");
    // console.log("9.fetchFile helper to load a file into ffmpeg’s virtual FS.")
    const { createFFmpeg, fetchFile } = ffmpegModule;

    if (!createFFmpeg || !fetchFile) throw new Error("ffmpeg.wasm not loaded");

    ffmpegInstance = createFFmpeg({
      log: false,
      corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
    });

    fetchFileFn = fetchFile;
    // console.log("10.ffmpeg instance created");
    // console.log("11.Loading ffmpeg core...");
    await ffmpegInstance.load();
  }

  return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };
};
