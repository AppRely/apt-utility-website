import { getFrameRangeData } from './getFrameRangeData';

type TrajectoryRange = { object_id: number; start_frame: number; end_frame: number };

export type ValidTrajectoryOverlap = {
  overlapCount: number;
  firstTrajectoryLength: number;
  secondTrajectoryLength: number;
};

export async function getValidTrajectoryOverlap(
  projectId: number,
  first: TrajectoryRange,
  second: TrajectoryRange,
): Promise<ValidTrajectoryOverlap> {
  const start = Math.max(first.start_frame, second.start_frame);
  const end = Math.min(first.end_frame, second.end_frame);
  if (start > end) return { overlapCount: 0, firstTrajectoryLength: first.end_frame - first.start_frame + 1, secondTrajectoryLength: second.end_frame - second.start_frame + 1 };

  const chunks = [];
  for (let chunkStart = start; chunkStart <= end; chunkStart += 500) {
    chunks.push([chunkStart, Math.min(chunkStart + 499, end)] as const);
  }
  const firstFrames = new Set<number>();
  const secondFrames = new Set<number>();
  // Keep the exact calculation, but avoid serially waiting for every chunk.
  // A small concurrency limit prevents a long trajectory from flooding the API.
  for (let offset = 0; offset < chunks.length; offset += 4) {
    const responses = await Promise.all(chunks.slice(offset, offset + 4).map(([chunkStart, chunkEnd]) =>
      getFrameRangeData(projectId, chunkStart, chunkEnd),
    ));
    for (const data of responses) {
    for (const object of data?.objects ?? []) {
      if (object.object_id !== first.object_id && object.object_id !== second.object_id) continue;
      for (const frame of object.frames ?? []) {
        if (!Number.isInteger(frame.frame_id) || !Array.isArray(frame.coordinates) || frame.coordinates.length === 0) continue;
        if (!frame.coordinates.every((point: unknown) => Array.isArray(point) && point.length >= 2 && point.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))) continue;
        (object.object_id === first.object_id ? firstFrames : secondFrames).add(frame.frame_id);
      }
    }
    }
  }

  let count = 0;
  for (const frame of firstFrames) if (secondFrames.has(frame)) count += 1;
  return {
    overlapCount: count,
    firstTrajectoryLength: first.end_frame - first.start_frame + 1,
    secondTrajectoryLength: second.end_frame - second.start_frame + 1,
  };
}
