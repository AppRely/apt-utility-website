declare module "@ffmpeg/ffmpeg/dist/ffmpeg.min.js" {
  export function createFFmpeg(options?: any): any;
  export function fetchFile(file: any): Promise<Uint8Array>;
}
