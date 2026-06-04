"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { getConfusionTable } from "@/lib/api/getConfusionTable";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: number | null;
  currentFrame: number;
  handleFrameJump: (frame: number) => Promise<void>;
}

export default function ConfusionTableModal({
  open,
  onClose,
  projectId,
  currentFrame,
  handleFrameJump,
}: Props) {
  // =====================================
  // STATES
  // =====================================
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedWindow, setLoadedWindow] = useState<number | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [startFrame, setStartFrame] = useState<number | null>(null);
  const [endFrame, setEndFrame] = useState<number | null>(null);

  // =====================================
  // DRAG STATES
  // =====================================
  const [position, setPosition] = useState({ x: 250, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // =====================================
  // RESIZE STATES
  // =====================================
  const [size, setSize] = useState({ width: 1200, height: 650 });
  const [resizing, setResizing] = useState(false);

  // =====================================
  // FETCH API
  // =====================================
  const fetchConfusion = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError("");

      const currentWindow = Math.floor(currentFrame / 300);
      const reqStartFrame = currentWindow * 300;
      const reqEndFrame = reqStartFrame + 299;

      const response = await getConfusionTable(projectId);
      const data = response.data;

      setRows(data.rows || []);
      setTotalRows(data.total_rows || 0);
      setStartFrame(data.start_frame ?? reqStartFrame);
      setEndFrame(data.end_frame ?? reqEndFrame);
    } catch (err) {
      console.error("Confusion API Error", err);
      setError("Failed to fetch confusion table");
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // AUTO FETCH
  // =====================================
  useEffect(() => {
    if (!open || !projectId) return;

    const currentWindow = Math.floor(currentFrame / 300);
    if (loadedWindow === currentWindow) return;

    setLoadedWindow(currentWindow);
    fetchConfusion();
  }, [open, currentFrame, projectId, loadedWindow]);

  // =====================================
  // DRAG + RESIZE
  // =====================================
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
          width: Math.max(700, e.clientX - position.x),
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

  if (!open) return null;

  return (
    <div
      className="fixed z-50"
      style={{ top: position.y, left: position.x }}
    >
      <Card
        className="bg-white p-3 rounded-xl shadow-xl flex flex-col relative"
        style={{ width: size.width, height: size.height }}
      >
        {/* HEADER (draggable area) */}
        <div
          className="flex justify-between items-start mb-2 bg-gray-100 p-2 rounded border cursor-move"
          onMouseDown={(e) => {
            setDragging(true);
            setOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
          }}
        >
          <div className="w-full">
            <div className="text-center mb-2">
              <h2 className="text-lg font-bold tracking-wide text-gray-800">
                Object Matching Uncertainty
              </h2>
              <p className="text-xs text-gray-500">Confusion / Tracking Analysis</p>
            </div>

            {/* Frame info table */}
            {/* <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr>
                    <td className="border px-3 py-2 font-semibold bg-gray-100 w-40">Start Frame</td>
                    <td className="border px-3 py-2 font-medium">{startFrame ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="border px-3 py-2 font-semibold bg-gray-100">End Frame</td>
                    <td className="border px-3 py-2 font-medium">{endFrame ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="border px-3 py-2 font-semibold bg-gray-100">Total Rows</td>
                    <td className="border px-3 py-2 font-medium">{totalRows}</td>
                  </tr>
                </tbody>
              </table>
            </div> */}
          </div>

          {/* CLOSE BUTTON */}
          <Button
            onClick={onClose}
            size="sm"
            className="absolute top-4 right-4 z-50 bg-black hover:bg-gray-900 text-white shadow-md border border-gray-700 rounded-md"
          >
            Close
          </Button>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-2 bg-red-100 border border-red-300 text-red-700 text-xs p-2 rounded">
            {error}
          </div>
        )}

        {/* SINGLE TABLE WITH STICKY HEADER & SCROLL */}
        <div className="flex-1 overflow-auto border rounded">
          {loading ? (
            <p className="text-center py-4">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-4 text-gray-500">No data available</p>
          ) : (
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead className="sticky top-0 bg-gray-200 z-10">
                <tr>
                  <th className="border px-2 py-1">No</th>
                  <th className="border px-2 py-1">Frame</th>
                  {/* <th className="border px-2 py-1">Next Frame</th>
                  <th className="border px-2 py-1">Object</th>
                  <th className="border px-2 py-1">Best Match</th>
                  <th className="border px-2 py-1">Second Match</th> */}
                  <th className="border px-2 py-1">Uncertainty</th>
                  {/* <th className="border px-2 py-1">Forward</th> */}
                  <th className="border px-2 py-1">Best Cost</th>
                  <th className="border px-2 py-1">Second Cost</th>
                  {/* <th className="border px-2 py-1">Nearby</th> */}
                  <th className="border px-2 py-1">Confusion</th>
                  {/* <th className="border px-2 py-1">Crowded</th> */}
                  {/* <th className="border px-2 py-1">Event</th> */}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={() => handleFrameJump(row.frame_no)}
                    className="text-centercursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="border px-2 py-1">{idx + 1}</td>
                    <td className="border px-2 py-1">{row.frame_no}</td>
                    {/* <td className="border px-2 py-1">{row.next_frame_no ?? "—"}</td> */}
                    {/* <td className="border px-2 py-1">{row.current_object_id}</td> */}
                    {/* <td className="border px-2 py-1">{row.best_match_object_id}</td>
                    <td className="border px-2 py-1">{row.second_match_object_id}</td> */}
                    <td className="border px-2 py-1 font-bold">
                      {row.uncertainty?.toFixed(4) ?? "—"}
                    </td>
                    {/* <td className="border px-2 py-1">{row.is_forward ? "Yes" : "No"}</td> */}
                    <td className="border px-2 py-1">{row.best_match_cost?.toFixed(2) ?? "—"}</td>
                    <td className="border px-2 py-1">{row.second_match_cost?.toFixed(2) ?? "—"}</td>
                    {/* <td className="border px-2 py-1">{row.nearby_object_count ?? "—"}</td> */}
                    <td className="border px-2 py-1">{row.confusion_score?.toFixed(4) ?? "—"}</td>
                    {/* <td className="border px-2 py-1">{row.is_crowded ? "Yes" : "No"}</td>
                    <td className="border px-2 py-1">{row.event_type ?? "—"}</td> */}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* RESIZE HANDLE */}
        <div
          className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize bg-gray-400 rounded"
          onMouseDown={() => setResizing(true)}
        />
      </Card>
    </div>
  );
}