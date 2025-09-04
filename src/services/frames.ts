import { apiClient, ApiError } from './api';
import { APIFrame, apiFrameSchema } from '@/entities/frame';
import { z } from 'zod';

const framesResponseSchema = z.object({
  frames: z.array(apiFrameSchema),
});

export async function fetchFrames(videoId: number): Promise<APIFrame[]> {
  try {
    const response = await apiClient.get(`/api/v1/videos/${videoId}/frames/`);
    const parsed = framesResponseSchema.parse(response.data);
    return parsed.frames;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError('Invalid response format from server');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Failed to fetch frames');
  }
}
