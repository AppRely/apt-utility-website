"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

import { X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useQuery } from "@tanstack/react-query";
import { getActivityLogs } from "@/lib/api/getActivityLogs";
import { AuditModalProps, NormalizedObject } from "@/types";

function normalizeObjects(
  operation: string,
  objectsData: any
): { obj1: NormalizedObject; obj2: NormalizedObject | null } {
  switch (operation) {
    case "link":
    case "swap":
      return {
        obj1: {
          id: objectsData.object_1_id,
          start_frame: objectsData.object_1_start,
          end_frame: objectsData.object_1_end,
        },
        obj2: {
          id: objectsData.object_2_id,
          start_frame: objectsData.object_2_start,
          end_frame: objectsData.object_2_end,
        },
      };

    case "delete":
    case "break_object":
      return {
        obj1: {
          id: objectsData.object_id,
          start_frame: objectsData.object_start,
          end_frame: objectsData.object_end,
        },
        obj2: null,
      };

    default:
      return { obj1: {}, obj2: null };
  }
}

export default function AuditModal({
  open,
  onClose,
  projectId,
}: AuditModalProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activityLogs", projectId],
    queryFn: () => getActivityLogs(projectId),
    enabled: open && !!projectId,
  });

  const logs = data?.data?.logs ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <DialogClose asChild>
          <button className="absolute top-3 right-3 hover:bg-gray-100 p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </DialogClose>

        <DialogHeader>
          <DialogTitle className="text-center text-xl font-semibold">
            Activity Logs
          </DialogTitle>
        </DialogHeader>

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
              <TableHeader className="bg-[#3B3B3B] text-white hover:bg-[#3B3B3B]">
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
                    Operation
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Updated At
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {[...logs]
                  .sort(
                    (a: any, b: any) =>
                      new Date(a.activity_updated_at).getTime() -
                      new Date(b.activity_updated_at).getTime()
                  )
                  .map((log: any, index: number) => {
                    const { obj1, obj2 } = normalizeObjects(
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

                        <TableCell className="text-center capitalize">
                          {log.operation.replace("_", " ")}
                        </TableCell>

                        <TableCell className="text-center">
                          {log.activity_updated_at.split("T")[0]}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
