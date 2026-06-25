"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import UniqueIdsTable from "@/components/dashboard/UniqueIdsTable";
import { getUniqueIds } from "@/lib/api/getTrajectoryTable";

export default function UniqueIdsPopup() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");

  const [data, setData] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    getUniqueIds(Number(projectId))
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [projectId]);

  const handleSelectRow = (id: number) => {
    // Highlight clicked row for 3 seconds
    setHighlightedId(id);

    setTimeout(() => {
      setHighlightedId((prev) => (prev === id ? null : prev));
    }, 3000);

    let newSelected = [...selectedIds];
    if (newSelected.includes(id)) {
      newSelected = newSelected.filter((x) => x !== id);
    } else if (newSelected.length < 2) {
      newSelected.push(id);
    } else {
      newSelected = [newSelected[0], id];
    }
    setSelectedIds(newSelected);

    const base = data?.objects?.find(
      (r: any) => r.object_id === newSelected[0]
    );
    if (base) {
      const startRange = base.end_frame + 1;
      const endRange = base.end_frame + 3;
      const matched = (data?.objects || [])
        .filter(
          (r: any) =>
            r.start_frame >= startRange &&
            r.start_frame <= endRange
        )
        .map((r: any) => r.object_id);
      setLinkedIds(matched);
    } else {
      setLinkedIds([]);
    }

    // Jump main window
    const row = data?.objects?.find(
      (r: any) => r.object_id === id
    );
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "UNIQUE_SELECT",
          id,
          frame: row?.end_frame,
        },
        "*"
      );
    }
  };

  return (
    <div className="h-screen p-4 bg-gray-50">
      <Card className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b bg-white px-4 py-3 flex-shrink-0">
          <h2 className="text-lg font-bold">
            Linking Table
          </h2>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 p-4">
          <UniqueIdsTable
            data={data}
            isLoading={loading}
            selectedIds={selectedIds}
            linkedIds={linkedIds}
            highlightedId={highlightedId}
            onSelectRow={handleSelectRow}
          />
        </div>
      </Card>
    </div>
  );
}