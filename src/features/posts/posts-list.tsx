"use client";

import { Post } from '@/entities';

export function PostsList({ posts }: { posts: Post[] }) {
  if (!posts?.length) return <p>No posts found.</p>;

  return (
    <ul className="space-y-2">
      {posts.map((post) => (
        <li key={post.id} className="border rounded p-4">
          <h2 className="font-semibold">{post.title}</h2>
          <p>{post.body}</p>
        </li>
      ))}
    </ul>
  );
}
