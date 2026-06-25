"use client";

import React from "react";

interface Props {
  rows: any[];
  loading: boolean;
  message?: string;
  onRowClick: (frame: number) => void;
}

export default function ConfusionTable({ rows, loading, message, onRowClick,}: Props) {

  const formatNearbyIds = (ids: number[] | undefined) => {
    if (!ids?.length) return "—";
    return ids.join(", ");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center border rounded">
        Loading...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center border rounded text-gray-500 text-lg">
        {message || "No data available"}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto border rounded">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">#</th>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">Frame</th>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">Obj ID</th>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">Nearby Count</th>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">Nearby IDs</th>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">Confusion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick(row.frame_no)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="border px-3 py-2 text-center">{idx + 1}</td>
              <td className="border px-3 py-2 text-center font-mono">{row.frame_no}</td>
              <td className="border px-3 py-2 text-center">{row.current_object_id ?? "—"}</td>
              <td className="border px-3 py-2 text-center">
                {row.nearby_object_count ?? "—"}</td>
              <td
                className="border px-3 py-2 text-center"
                title={row.nearby_object_ids?.join(", ")}
              >
                {formatNearbyIds(row.nearby_object_ids)}
              </td>
              <td className="border px-3 py-2 text-center">
                {row.confusion_score?.toFixed(4) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}