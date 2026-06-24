"use client";

import React from "react";

interface Props {
  rows: any[];
  loading: boolean;
  onRowClick: (frame: number) => void;
}

export default function ConfusionTable({ rows, loading, onRowClick }: Props) {
  // Helper to display nearby IDs in a compact way
  const formatNearbyIds = (ids: number[] | undefined) => {
    if (!ids || ids.length === 0) return "—";
    return ids.join(", ");
  };
  return (
    <div className="flex-1 overflow-auto border rounded">
      {loading ? (
        <p className="text-center py-4">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-center py-4 text-gray-500">No data available</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse table-auto">
            <thead className="sticky top-0 bg-gray-200 z-10">
              <tr>
                <th className="border px-3 py-2 text-center whitespace-nowrap">#</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Frame</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Obj ID</th>
                {/* <th className="border px-3 py-2 text-center whitespace-nowrap">Event</th> */}
                {/* <th className="border px-3 py-2 text-center whitespace-nowrap">Crowded</th> */}
                <th className="border px-3 py-2 text-center whitespace-nowrap">Nearby Count</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Nearby IDs</th>
                {/* <th className="border px-3 py-2 text-center whitespace-nowrap">Uncertainty</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Best Cost</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Second Cost</th> */}
                <th className="border px-3 py-2 text-center whitespace-nowrap">Confusion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick(row.frame_no)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="border px-3 py-2 text-center">{idx + 1}</td>
                  <td className="border px-3 py-2 text-center font-mono">{row.frame_no}</td>
                  <td className="border px-3 py-2 text-center">{row.current_object_id ?? "—"}</td>
                  {/* <td className="border px-3 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.event_type === "CROWD"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {row.event_type || "—"}
                    </span>
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {row.is_crowded ? (
                      <span className="text-red-600 font-bold">✓</span>
                    ) : (
                      "—"
                    )}
                  </td> */}
                  <td className="border px-3 py-2 text-center">{row.nearby_object_count ?? "—"}</td>
                  <td
                    className="border px-3 py-2 text-center"
                    title={row.nearby_object_ids?.join(", ")} // full list on hover
                  >
                    {formatNearbyIds(row.nearby_object_ids)}
                  </td>
                    {/* <td className="border px-3 py-2 text-center font-bold">
                      {row.uncertainty?.toFixed(4) ?? "—"}
                    </td>
                    <td className="border px-3 py-2 text-center">
                      {row.best_match_cost?.toFixed(2) ?? "—"}
                    </td>
                    <td className="border px-3 py-2 text-center">
                      {row.second_match_cost?.toFixed(2) ?? "—"}
                    </td> */}
                  <td className="border px-3 py-2 text-center">
                    {row.confusion_score?.toFixed(4) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}