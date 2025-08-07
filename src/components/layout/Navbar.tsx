import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="border-b px-6 py-4 flex gap-4">
      <Link href="/">Home</Link>
    </nav>
  );
}
