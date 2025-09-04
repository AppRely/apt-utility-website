import { apiClient, ApiError } from './api';

export async function fetchVideoStream(id: number): Promise<string> {
  try {
    const response = await apiClient.get(`/api/v1/videos/${id}/stream/`, {
      responseType: 'blob',
    });
    
    const blob = new Blob([response.data]);
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Failed to fetch video stream');
  }
}
