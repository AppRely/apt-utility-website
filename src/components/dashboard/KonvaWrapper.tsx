"use client";

import dynamic from "next/dynamic";

// ✅ Import your Konva component dynamically, client-only
const Konva = dynamic(() => import("@/components/dashboard/Konva"), {
  ssr: false, // disable SSR
  loading: () => <p>Loading canvas...</p>,
});

export function KonvaWrapper() {
  return <Konva />;
}
