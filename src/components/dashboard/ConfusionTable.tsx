"use client";

import React from "react";

interface Props {
  rows: any[];
  loading: boolean;
  onRowClick: (frame: number) => void;
}

export default function ConfusionTable({ rows, loading, onRowClick }: Props) {
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
                <th className="border px-3 py-2 text-center whitespace-nowrap">No</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Frame</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Uncertainty</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Best Cost</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Second Cost</th>
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
                  <td className="border px-3 py-2 text-center">{row.frame_no}</td>
                  <td className="border px-3 py-2 text-center font-bold">
                    {row.uncertainty?.toFixed(4) ?? "—"}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {row.best_match_cost?.toFixed(2) ?? "—"}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {row.second_match_cost?.toFixed(2) ?? "—"}
                  </td>
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