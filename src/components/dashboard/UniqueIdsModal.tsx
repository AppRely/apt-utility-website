"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUniqueIds } from "@/lib/api/getTrajectoryTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";

const FRAME_RANGE_OFFSET = 3;

type TrajectoryRow = {
  id: number;
  N_frame: number;
  trk_len: number;
  start_frame: number;
  end_frame: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: number | null;
  projectName?: string;
  videoName?: string;
  trkFileName?: string;
  onSelectObject?: (id: number, frame: number) => void;
}

export default function UniqueIdsModal({
  open,
  onClose,
  projectId,
  projectName,
  videoName,
  trkFileName,
  onSelectObject,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["unique-ids", projectId],
    queryFn: () => getUniqueIds(projectId!),
    enabled: open && !!projectId,
  });

  const tableData: TrajectoryRow[] = data?.data?.objects || [];

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);

  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // 🔹 DRAG
  const [position, setPosition] = useState({ x: 200, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // 🔹 RESIZE
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragging) {
        setPosition({
          x: e.clientX - offset.x,
          y: e.clientY - offset.y,
        });
      }

      if (resizing) {
        setSize({
          width: Math.max(600, e.clientX - position.x),
          height: Math.max(400, e.clientY - position.y),
        });
      }
    };

    const handleUp = () => {
      setDragging(false);
      setResizing(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, resizing, offset, position]);

  // 🔥 Reset only modal state
  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setLinkedIds([]);
    }
  }, [open]);

  if (!open) return null;

  const scrollToRow = (id: number) => {
    rowRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleSelection = (id: number) => {
    let newSelected = [...selectedIds];

    if (newSelected.includes(id)) {
      newSelected = newSelected.filter((x) => x !== id);
    } else if (newSelected.length < 2) {
      newSelected.push(id);
    } else {
      newSelected = [newSelected[0], id];
    }

    setSelectedIds(newSelected);

    const base = tableData.find((r) => r.id === newSelected[0]);

    if (base) {
      const startRange = base.end_frame + 1;
      const endRange = base.end_frame + FRAME_RANGE_OFFSET;

      const matched = tableData
        .filter(
          (r) =>
            r.start_frame >= startRange &&
            r.start_frame <= endRange
        )
        .map((r) => r.id);

      setLinkedIds(matched);
    } else {
      setLinkedIds([]);
    }

    const row = tableData.find((r) => r.id === id);
    if (row) onSelectObject?.(id, row.start_frame);
  };

  const removeId = (id: number) => {
    const newSelected = selectedIds.filter((x) => x !== id);
    setSelectedIds(newSelected);

    if (newSelected.length === 0) {
      setLinkedIds([]);
    }
  };

  const clearAll = () => {
    setSelectedIds([]);
    setLinkedIds([]);
  };

  const topIds = [
    ...selectedIds,
    ...linkedIds.filter((id) => !selectedIds.includes(id)),
  ];

  return (
    <div
      className="fixed z-50"
      style={{ top: position.y, left: position.x }}
    >
      <Card
        className="bg-white p-3 rounded-xl shadow-xl flex flex-col relative"
        style={{ width: size.width, height: size.height }}
      >

        {/* HEADER */}
        <div
          className="flex justify-between items-center mb-2 bg-gray-100 p-2 rounded border cursor-move"
          onMouseDown={(e) => {
            setDragging(true);
            setOffset({
              x: e.clientX - position.x,
              y: e.clientY - position.y,
            });
          }}
        >
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold">Trajectory Information</p>
          </div>

          <Button onClick={onClose} size="sm">
            Close
          </Button>
        </div>

        {/* INFO */}
        <div className="mb-2 border rounded overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <tbody>
              <tr>
                <td className="border px-2 py-1 font-medium">Project</td>
                <td className="border px-2 py-1">{projectName || "-"}</td>
              </tr>
              <tr>
                <td className="border px-2 py-1 font-medium">Video</td>
                <td className="border px-2 py-1">{videoName || "-"}</td>
              </tr>
              <tr>
                <td className="border px-2 py-1 font-medium">Track</td>
                <td className="border px-2 py-1">{trkFileName || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* TOP TABLE */}
        <div className="mb-2 border rounded overflow-hidden">
          <div className="bg-gray-100 px-2 py-1 border-b flex justify-between items-center">
            <span className="text-xs font-semibold">
              Selected & Suggested IDs
            </span>
            <Button onClick={clearAll} size="sm" variant="outline">
              Clear
            </Button>
          </div>

          <div className="max-h-[120px] overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <tbody>
                {topIds.length === 0 ? (
                  <tr>
                    <td className="p-2 text-center text-gray-400 border">
                      No selection
                    </td>
                  </tr>
                ) : (
                  topIds.map((id) => (
                    <tr
                      key={id}
                      className={`cursor-pointer ${
                        selectedIds[0] === id
                          ? "bg-green-200"
                          : selectedIds[1] === id
                          ? "bg-blue-200"
                          : "bg-yellow-200"
                      }`}
                    >
                      <td className="border px-2 py-1 flex justify-between items-center">
                        <span
                          onClick={() => {
                            handleSelection(id);
                            scrollToRow(id);
                          }}
                        >
                          ID: {id}
                        </span>

                        {/* <span
                          className="text-red-500 cursor-pointer"
                          onClick={() => removeId(id)}
                        >
                          ✕
                        </span> */}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MAIN TABLE */}
        <div className="border rounded overflow-hidden flex flex-col flex-1">
          <div className="bg-gray-200 sticky top-0 z-10">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="border px-2 py-1">ID</th>
                  <th className="border px-2 py-1">Frames</th>
                  <th className="border px-2 py-1">Len</th>
                  <th className="border px-2 py-1">Start</th>
                  <th className="border px-2 py-1">End</th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <p className="text-center py-3">Loading...</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {tableData.map((row) => (
                    <tr
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[row.id] = el;
                      }}
                      className={`cursor-pointer ${
                        selectedIds[0] === row.id
                          ? "bg-green-200"
                          : selectedIds[1] === row.id
                          ? "bg-blue-200"
                          : linkedIds.includes(row.id)
                          ? "bg-yellow-200"
                          : "hover:bg-blue-100"
                      }`}
                      onClick={() => handleSelection(row.id)}
                    >
                      <td className="border px-2 py-1">{row.id}</td>
                      <td className="border px-2 py-1">{row.N_frame}</td>
                      <td className="border px-2 py-1">{row.trk_len}</td>
                      <td className="border px-2 py-1">{row.start_frame}</td>
                      <td className="border px-2 py-1">{row.end_frame}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RESIZE */}
        <div
          className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize bg-gray-400 rounded"
          onMouseDown={() => setResizing(true)}
        />
      </Card>
    </div>
  );
}