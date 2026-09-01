"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { X, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/Button";
import { useQuery } from "@tanstack/react-query";
import { getActivityLogs } from "@/lib/api/getActivityLogs";
import { exportActivityLogs } from "@/lib/api/exportActivityLogs";
import { AuditModalProps, NormalizedObject } from "@/types";

// Helper to normalize objects based on operation type
// Returns obj1, obj2, and optionally newObjectId (for break operations)
function normalizeObjects(
  operation: string,
  objectsData: any
): { obj1: NormalizedObject; obj2: NormalizedObject | null; newObjectId: number | null } {
  let obj1: NormalizedObject = {};
  let obj2: NormalizedObject | null = null;
  let newObjectId: number | null = null;

  switch (operation) {
    case "link":
    case "swap":
      obj1 = {
        id: objectsData.object_1_id,
        start_frame: objectsData.object_1_start,
        end_frame: objectsData.object_1_end,
      };
      obj2 = {
        id: objectsData.object_2_id,
        start_frame: objectsData.object_2_start,
        end_frame: objectsData.object_2_end,
      };
      break;

    case "delete":
      obj1 = {
        id: objectsData.object_id,
        start_frame: objectsData.object_start,
        end_frame: objectsData.object_end,
      };
      obj2 = null;
      break;

    case "clip":
      obj1 = {
        id: objectsData.old_object_id,
        start_frame: objectsData.clip_start_frame,
        end_frame: objectsData.clip_end_frame,
      };
      obj2 = null;
      newObjectId = objectsData.new_object_id;
      break;

    case "overlap":
      obj1 = {
        id: objectsData.winner_object,
        start_frame: objectsData.overlap_start,
        end_frame: objectsData.overlap_end,
      };
      obj2 = {
        id: objectsData.loser_object,
        start_frame: objectsData.overlap_start,
        end_frame: objectsData.overlap_end,
      };
      break;

    case "interpolate":
      obj1 = {
        id: objectsData.source_object_id,
        start_frame: undefined,
        end_frame: objectsData.source_end_frame,
      };
      obj2 = {
        id: objectsData.target_object_id,
        start_frame: objectsData.target_start_frame,
        end_frame: undefined,
      };
      break;

    case "break_object":
      obj1 = {
        id: objectsData.object_id,
        start_frame: objectsData.object_start,
        end_frame: objectsData.object_end,
      };
      obj2 = {
        id: objectsData.new_object_id,
        start_frame: objectsData.new_object_id_start,
        end_frame: objectsData.new_object_id_end,
      };
      newObjectId = objectsData.new_object_id;
      break;

    case "break_before":
    case "break_after":
      // Both have old_object and new_object fields
      obj1 = {
        id: objectsData.old_object_id,
        start_frame: objectsData.old_start_frame,
        end_frame: objectsData.old_end_frame,
      };
      obj2 = {
        id: objectsData.new_object_id,
        start_frame: objectsData.new_start_frame,
        end_frame: objectsData.new_end_frame,
      };
      newObjectId = objectsData.new_object_id;
      break;

    default:
      obj1 = {};
      obj2 = null;
      break;
  }

  return { obj1, obj2, newObjectId };
}

// Helper to format date in IST (YYYY-MM-DD HH:mm:ss)
function formatToIST(dateString: string): string {
  const date = new Date(dateString);
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");
  const hours = String(istTime.getUTCHours()).padStart(2, "0");
  const minutes = String(istTime.getUTCMinutes()).padStart(2, "0");
  const seconds = String(istTime.getUTCSeconds()).padStart(2, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default function AuditModal({
  open,
  onClose,
  projectId,
}: AuditModalProps) {
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["activityLogs", projectId],
    queryFn: () => getActivityLogs(projectId),
    enabled: open && !!projectId,
  });

  const logs = data?.data?.logs ?? [];

  const handleExport = async () => {
    if (!projectId) return;
    setIsExporting(true);
    try {
      await exportActivityLogs(projectId);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        data-system-guide="audit-dialog"
        className="max-w-5xl fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-system-guide-ui]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogClose asChild>
          <button className="absolute top-3 right-3 hover:bg-gray-100 p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </DialogClose>

        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle className="text-center text-xl font-semibold">
            Activity Logs
          </DialogTitle>
          <Button
            data-system-guide="audit-export"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || logs.length === 0}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </DialogHeader>

        <div data-system-guide="audit-table">
          {isLoading && <p className="text-center py-4">Loading...</p>}

          {error && (
            <p className="text-center text-red-500 py-4">Failed to load logs</p>
          )}

          {!isLoading && logs.length === 0 && (
            <p className="text-center py-4 text-gray-500">
              No activity logs found
            </p>
          )}

          {logs.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto border rounded-md mt-3">
              <Table>
                {/* Sticky header fix applied here */}
                <TableHeader className="sticky top-0 z-10 bg-[#3B3B3B] text-white hover:bg-[#3B3B3B]">
                <TableRow className="hover:bg-[#3B3B3B]">
                  <TableHead className="text-center text-white">
                    Sr. No.
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Obj1 ID
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Obj1 Start
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Obj1 End
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Obj2 ID
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Obj2 Start
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Obj2 End
                  </TableHead>
                  <TableHead className="text-center text-white">
                    New Obj ID
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Operation
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Updated At (IST)
                  </TableHead>
                </TableRow>
                </TableHeader>

                <TableBody>
                {[...logs]
                  .sort(
                    (a: any, b: any) =>
                      new Date(b.activity_updated_at).getTime() -
                      new Date(a.activity_updated_at).getTime()
                  )
                  .map((log: any, index: number) => {
                    const { obj1, obj2, newObjectId } = normalizeObjects(
                      log.operation,
                      log.objects_data
                    );

                    return (
                      <TableRow key={log.activity_id}>
                        <TableCell className="text-center font-medium">
                          {index + 1}
                        </TableCell>

                        <TableCell className="text-center">
                          {obj1.id ?? "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {obj1.start_frame ?? "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {obj1.end_frame ?? "-"}
                        </TableCell>

                        <TableCell className="text-center">
                          {obj2?.id ?? "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {obj2?.start_frame ?? "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {obj2?.end_frame ?? "-"}
                        </TableCell>

                        <TableCell className="text-center">
                          {newObjectId ?? "-"}
                        </TableCell>

                        <TableCell className="text-center capitalize">
                          {log.operation.replace("_", " ")}
                        </TableCell>

                        <TableCell className="text-center">
                          {formatToIST(log.activity_updated_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
