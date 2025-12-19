'use client';
import { useState } from "react";
import DynamicVideo from "@/components/dashboard/DynamicVideo";
import Sidebar from "@/components/dashboard/Sidebar";
import { SelectedObject } from "@/types/selection";
export function MainFrames() {
  const [selectedObjects, setSelectedObjects] = useState<SelectedObject[]>([]);
  return (
    <main className="flex flex-1 overflow-hidden pt-3 pl-3 gap-3">
      <Sidebar selectedObjects={selectedObjects} setSelectedObjects={setSelectedObjects}/>
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        <DynamicVideo selectedObjects={selectedObjects} setSelectedObjects={setSelectedObjects}/>
      </div>
    </main>
  );
}
