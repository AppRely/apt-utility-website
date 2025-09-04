import { useQuery } from '@tanstack/react-query';
import { fetchPosts } from '@/services';

export function usePosts(filter?: string) {
  return useQuery({
    queryKey: ['posts', { filter }],
    queryFn: () => fetchPosts(filter),
  });
}
