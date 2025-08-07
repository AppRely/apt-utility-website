"use client";

import { useCounterStore } from '@/store/counter';
import { useQuery } from '@tanstack/react-query';
import { fetchPosts } from '@/features/posts/api';
import { PostsList } from '@/features/posts';
import { Button } from '@/components/ui/Button';
import { useQueryState } from 'nuqs';

export default function Home() {
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);

  const [filter, setFilter] = useQueryState<string>('filter', {
    history: 'replace',
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['posts', { filter }],
    queryFn: () => fetchPosts(filter),
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">Next.js 15 Playground</h1>

      <div className="flex items-center gap-2">
        <span>Count: {count}</span>
        <Button onClick={increment}>Increment</Button>
      </div>

      <div>
        <label className="mr-2">Filter:</label>
        <input
          className="border rounded px-2 py-1 text-black"
          value={filter ?? ''}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <PostsList posts={posts} />
    </div>
  );
}
