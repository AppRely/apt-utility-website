import { z } from 'zod';

export const frameSchema = z.object({
  id: z.number(),
  frame: z.string(),
  time: z.string(),
  fps: z.number(),
  img: z.string(),
});

export const apiFrameSchema = z.object({
  frame_number: z.number(),
  thumbnail: z.string(),
});

export type Frame = z.infer<typeof frameSchema>;
export type APIFrame = z.infer<typeof apiFrameSchema>;
