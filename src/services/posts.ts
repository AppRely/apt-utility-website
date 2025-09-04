import { posts } from '@/data/posts';
import { Post } from '@/entities/post';

export async function fetchPosts(filter?: string): Promise<Post[]> {
  // simulate latency to showcase React Query loading state
  await new Promise((res) => setTimeout(res, 300));

  if (!filter) return posts;
  return posts.filter((p) =>
    p.title.toLowerCase().includes(filter.toLowerCase()),
  );
}
