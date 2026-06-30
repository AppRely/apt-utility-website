"use client";

import React, { useRef, useEffect } from "react";

type TrajectoryRow = {
  object_id: number;
  N_frame: number;
  trk_len: number;
  start_frame: number;
  end_frame: number;
  start_coordinate?: [number, number];
  end_coordinate?: [number, number];
  best_match: number | null;
  best_match_score: number | null;
  best_match_uncertainty: number | null;
  second_match: number | null;
  second_match_score: number | null;
  other_matches: {
    object_id: number;
    match_score: number;
    rank: number;
  }[];
};

interface Props {
  data: { objects: TrajectoryRow[] } | null | undefined;
  isLoading?: boolean;
  selectedIds: number[];
  linkedIds: number[];
  highlightedId: number | null;
  onSelectRow: (id: number) => void;
  onClear?: () => void;
}

export default function UniqueIdsTable({
  data,
  isLoading,
  selectedIds,
  linkedIds,
  highlightedId,
  onSelectRow,
}: Props) {
  const tableData = data?.objects || [];
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  useEffect(() => {
    const lastSelected = selectedIds[selectedIds.length - 1];
    if (lastSelected && rowRefs.current[lastSelected]) {
      rowRefs.current[lastSelected]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedIds]);

  const formatNumber = (val: number | null | undefined, digits: number = 4) => {
    if (val === null || val === undefined) return "-";
    return val.toFixed(digits);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto border rounded">
        <table className="w-full min-w-[800px] border-collapse text-xs table-auto">
          <thead>
            <tr>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                ID
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                Frames
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                Start
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                End
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                Best Match ID
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                Best Score
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                Uncertainty
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                2nd Match ID
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                2nd Score
              </th>
              <th className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
                Other Matches
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-3 text-center">
                  Loading...
                </td>
              </tr>
            ) : (
              tableData.map((row) => (
                <tr
                    key={row.object_id}
                    ref={(el) => {
                      rowRefs.current[row.object_id] = el;
                    }}
                    onClick={() => onSelectRow(row.object_id)}
                    className={`
                      cursor-pointer
                      transition-all
                      duration-500
                      hover:bg-blue-50
                      ${
                        highlightedId === row.object_id
                          ? "bg-yellow-200 ring-2 ring-yellow-400"
                          : ""
                      }
                    `}
                  >
                  <td className="border px-3 py-2 text-center font-medium whitespace-nowrap">
                    {row.object_id}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.N_frame}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.start_frame}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.end_frame}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.best_match ?? "-"}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {formatNumber(row.best_match_score)}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {formatNumber(row.best_match_uncertainty)}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.second_match ?? "-"}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {formatNumber(row.second_match_score)}
                  </td>
                  <td className="border px-3 py-2 text-left">
                    {row.other_matches?.length ? (
                      <div className="flex flex-col gap-0.5">
                        {row.other_matches.slice(0, 3).map((m) => (
                          <div
                            key={m.object_id}
                            className="whitespace-nowrap"
                          >
                            ID {m.object_id}: {formatNumber(m.match_score)} (r{m.rank})
                          </div>
                        ))}
                        {row.other_matches.length > 3 && (
                          <div className="text-[10px] text-gray-500">
                            +{row.other_matches.length - 3} more
                          </div>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}