'use client';

import { useEffect, useRef, useState } from "react";
import DynamicVideo from "@/components/dashboard/DynamicVideo";
import Sidebar from "@/components/dashboard/Sidebar";
import { SelectedObject } from "@/types/selection";

const MIN_SIDEBAR_WIDTH = 11;
const MAX_SIDEBAR_WIDTH = 40;
const DEFAULT_SIDEBAR_WIDTH = 20;

export function MainFrames() {
  const [selectedObjects, setSelectedObjects] = useState<SelectedObject[]>([]);
  const [clipStartFrame, setClipStartFrame] = useState<number | null>(null);
  const [clipEndFrame, setClipEndFrame] = useState<number | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const isResizingRef = useRef(false);
  const pendingSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const mainRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    isResizingRef.current = true;
    pendingSidebarWidthRef.current = sidebarWidth;

    event.currentTarget.setPointerCapture(event.pointerId);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleResizeMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!isResizingRef.current || !mainRef.current || !sidebarRef.current || isSidebarCollapsed) return;

    const rect = mainRef.current.getBoundingClientRect();

    const newWidth =
      ((event.clientX - rect.left) / rect.width) * 100;

    const clampedWidth = Math.min(
      Math.max(newWidth, MIN_SIDEBAR_WIDTH),
      MAX_SIDEBAR_WIDTH
    );

    pendingSidebarWidthRef.current = clampedWidth;
    sidebarRef.current.style.width = `${clampedWidth}%`;
  };

  const handleResizeEnd = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!isResizingRef.current) return;

    isResizingRef.current = false;
    setSidebarWidth(pendingSidebarWidthRef.current);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }

    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const handleResizeReset = () => {
    pendingSidebarWidthRef.current = DEFAULT_SIDEBAR_WIDTH;
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  };

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <main
      ref={mainRef}
      className="flex flex-1 overflow-hidden pt-3 pl-3 gap-0 h-full min-w-0 min-h-0"
    >
      {/* Sidebar */}
        <div
          ref={sidebarRef}
          className="h-full shrink-0 min-w-0 overflow-hidden"
          style={{
            width: isSidebarCollapsed ? "0%" : `${sidebarWidth}%`,
          }}
        >
          <Sidebar
            selectedObjects={selectedObjects}
            setSelectedObjects={setSelectedObjects}
            clipStartFrame={clipStartFrame}
            clipEndFrame={clipEndFrame}
            setClipStartFrame={setClipStartFrame}
            setClipEndFrame={setClipEndFrame}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleSidebarToggle}
          />
        </div>

      {/* Resize Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar. Double-click to reset."
        title="Double-click to reset"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onDoubleClick={handleResizeReset}
        className="
          group
          relative
          w-2
          shrink-0
          cursor-col-resize
          bg-transparent
          hover:bg-slate-200
        "
      >
        {/* Visible drag indicator */}
        <div
          className="
            absolute
            left-1/2
            top-1/2
            -translate-x-1/2
            -translate-y-1/2
            h-16
            w-1
            rounded-full
            bg-slate-300
            group-hover:bg-slate-500
          "
        />
      </div>

      {/* Dashboard */}
      <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-2 overflow-hidden h-full">
        <DynamicVideo
          selectedObjects={selectedObjects}
          setSelectedObjects={setSelectedObjects}
          clipStartFrame={clipStartFrame}
          clipEndFrame={clipEndFrame}
        />
      </div>
    </main>
  );
}
