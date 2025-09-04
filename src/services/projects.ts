import { apiClient, ApiError } from './api';

export interface CreateProjectResponse {
  id: number;
  name: string;
  created_at: string;
  [key: string]: unknown;
}

export async function createProject(formData: FormData): Promise<CreateProjectResponse> {
  try {
    const response = await apiClient.post('/api/v1/videos/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Failed to create project');
  }
}
