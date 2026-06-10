"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { getFrameData } from "@/lib/api/getFrameData";
import { useMutation } from "@tanstack/react-query";
import { linkObjects } from "@/lib/api/linkObjects";
import { swapObjects } from "@/lib/api/swapObjects";
import { breakObjects } from "@/lib/api/breakObjects";
import { useToast } from "@/components/hooks/use-toast";
import { objectDelete } from "@/lib/api/objectDelete";
import { ConfirmDialog } from "@/components/annotation/ConfirmDialog";
import { SelectedObjectProps } from "@/types";
import { ArrowLeft } from "lucide-react";
import { formatFileName } from "@/lib/utils/formatFileName";
import { interpolateTrajectory } from "@/lib/api/interpolateTrajectory";
import { recalculateConfusion } from "@/lib/api/recalculateConfusion";
import { getConfusionStatus } from "@/lib/api/getConfusionStatus";

export default function Sidebar({
  selectedObjects,
  setSelectedObjects,
}: SelectedObjectProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [previousFrameId, setPreviousFrameId] = useState<number | null>(null);
  const { toast } = useToast();

  // State for dialog boxes
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isConfusionRunning, setIsConfusionRunning] = useState(false);

  // State for collapsing the object list - default to true (collapsed)
  const [objectsCollapsed, setObjectsCollapsed] = useState(true);

  // CUSTOM HOOK FOR SESSION STORAGE WITH BETTER POLLING
  const useSessionStorage = (key: string) => {
    const [value, setValue] = useState<string | null>(
      typeof window !== "undefined" ? sessionStorage.getItem(key) : null,
    );

    useEffect(() => {
      const handleStorageChange = () => {
        const newValue =
          typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
        setValue(newValue);
      };

      window.addEventListener("storage", handleStorageChange);

      // IMPROVED POLLING - CHECK EVERY 200MS
      const interval = setInterval(() => {
        const newValue =
          typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
        if (newValue !== value) {
          setValue(newValue);
          console.log(`${key} changed to:`, newValue);
        }
      }, 200);
      
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        clearInterval(interval);
      };
    }, [key, value]);

    return value;
  };

  const videoId = useSessionStorage("videoId");
  const projectId = useSessionStorage("projectId");
  const frameId = useSessionStorage("frameId");
  const projectName = useSessionStorage("project_name");
  const videoName = useSessionStorage("video_name");
  const trkFileName = useSessionStorage("trk_file_name");
  const totalFrames = useSessionStorage("totalFrames");

  // QUERY WITH PROPER CACHE INVALIDATION
    const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["frameData", projectId, frameId],
    queryFn: () => getFrameData(Number(projectId!), Number(frameId!)),
    enabled: !!(projectId && frameId && !objectsCollapsed),
    staleTime: 0,
    gcTime: 0,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const swapMutation = useMutation({
    mutationFn: (formData: FormData) =>
      swapObjects(Number(projectId), formData),
    onSuccess: () => {
      toast({
        title: "Swap",
        description: "Objects swapped successfully",
        duration: 3000,
        className: "text-green-600",
      });
      setSwapDialogOpen(false);

      setSelectedObjects([]);
      window.dispatchEvent(
        new CustomEvent("operationComplete", {
          detail: { frameId: Number(frameId) },
        }),
      );
    },
  });

  const linkMutation = useMutation({
    mutationFn: (formData: FormData) =>
      linkObjects(Number(projectId), formData),
    onSuccess: () => {
      toast({
        title: "✅ Success",
        description: "Objects linked successfully.",
        duration: 3000,
        className: "text-green-600",
      });
      setLinkDialogOpen(false);

      setSelectedObjects([]);

      // DISPATCH LINKING COMPLETE EVENT
      const currentFrameId = Number(frameId);
      if (currentFrameId) {
        window.dispatchEvent(
          new CustomEvent("operationComplete", {
            detail: { frameId: currentFrameId },
          }),
        );
      }

      // REFETCH SIDEBAR DATA AFTER 500MS (AFTER MAIN COMPONENT PROCESSES)
      setTimeout(() => {
        console.log(" Refetching sidebar data after linking...");
        refetch();
      }, 500);
    },
    onError: (err: any) => {
      toast({
        title: "❌ Error",
        description: `Failed to link objects: ${err.message}`,
        variant: "destructive",
        duration: 3000,
      });
    },
  });

  const breakMutation = useMutation({
    mutationFn: (formData: FormData) =>
      breakObjects(Number(projectId), formData),
    onSuccess: () => {
      toast({
        title: "Break",
        description: "Object broken successfully",
        duration: 3000,
        className: "text-green-600",
      });
      setBreakDialogOpen(false);

      setSelectedObjects([]);
      window.dispatchEvent(
        new CustomEvent("operationComplete", {
          detail: { frameId: Number(frameId) },
        }),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (formData: FormData) =>
      objectDelete(Number(projectId), formData),
    onSuccess: () => {
      toast({
        title: "Delete",
        description: "Object delete successfully",
        duration: 3000,
        className: "text-green-600",
      });
      setDeleteDialogOpen(false);

      setSelectedObjects([]);
      window.dispatchEvent(
        new CustomEvent("operationComplete", {
          detail: { frameId: Number(frameId) },
        }),
      );
    },
  });

  const interpolateMutation = useMutation({
    mutationFn: (payload: any) =>
      interpolateTrajectory(Number(projectId), payload),

    onSuccess: () => {
      toast({
        title: "Success",
        description: "Interpolation completed successfully",
        duration: 3000,
        className: "text-green-600",
      });

      setSelectedObjects([]);

      window.dispatchEvent(
        new CustomEvent("operationComplete", {
          detail: { frameId: Number(frameId) },
        }),
      );
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: () =>
      recalculateConfusion(Number(projectId)),

    onSuccess: () => {

      toast({
        title: "Success",
        description: "Confusion recalculation started",
        duration: 3000,
        className: "text-green-600",
      });
      setIsConfusionRunning(true);
      const interval = setInterval(async () => {
        try {

          const response =
            await getConfusionStatus(
              Number(projectId)
            );

          const status =
            response.confusion_status;

          console.log(
            "Confusion Status:",
            status
          );

          if (status === "COMPLETED") {

            clearInterval(interval);
            setIsConfusionRunning(false);

            toast({
              title: "Completed",
              description:
                "Confusion recalculation completed successfully",
              duration: 5000,
              className: "text-green-600",
            });

          }

          if (status === "FAILED") {

            clearInterval(interval);
            setIsConfusionRunning(false);

            toast({
              title: "Failed",
              description:
                "Confusion recalculation failed",
              variant: "destructive",
            });

          }

        } catch (error) {

          clearInterval(interval);
          setIsConfusionRunning(false);

          toast({
            title: "Error",
            description:
              "Failed to check confusion status",
            variant: "destructive",
          });
        }

      }, 8000);
    },
  });

  const fpsValue = mounted ? sessionStorage.getItem("fps") : "N/A";
  
  // LISTEN FOR LINKING COMPLETION FROM MAIN COMPONENT
  useEffect(() => {
    const handleLinkingComplete = (event: any) => {
      console.log("📡 Sidebar received linking complete event");
      setTimeout(() => {
        refetch();
      }, 1000);
    };

    window.addEventListener("operationComplete", handleLinkingComplete);

    return () => {
      window.removeEventListener("operationComplete", handleLinkingComplete);
    };
  }, [refetch]);

  // Reset expansions & log on frame change
  useEffect(() => {
    if (data) {
      setExpandedIds(new Set());
      console.log(
        `Frame ${frameId}: ${data.data.objects?.length || 0} objects loaded`,
      );
      console.log(
        "Sample coordinates (Object 0):",
        data.objects?.[0]?.coordinates?.slice(0, 2),
      );
      setInitialLoadComplete(true);
      setPreviousFrameId(Number(frameId));
    }
  }, [data, frameId]);

  const toggleExpand = useCallback((objectId: number) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(objectId)) newSet.delete(objectId);
      else newSet.add(objectId);
      return newSet;
    });
  }, []);

  // Handler functions for each operation
  const handleLinkObjects = () => {
    if (selectedObjects.length !== 2) {
      toast({
        title: "⚠️ Invalid Selection",
        description: "Please select exactly 2 objects to link.",
        variant: "destructive",
        duration: 3000,
      });

      return;
    }

    const [obj1, obj2] = selectedObjects;

    const formData = new FormData();
    formData.append("object_1_id", String(obj1.object_id));
    formData.append("object_1_start", String(obj1.start_frame));
    formData.append("object_1_end", String(obj1.end_frame));

    formData.append("object_2_id", String(obj2.object_id));
    formData.append("object_2_start", String(obj2.start_frame));
    formData.append("object_2_end", String(obj2.end_frame));

    linkMutation.mutate(formData);
  };

  const handleSwapObjects = () => {
    if (selectedObjects.length !== 2) {
      toast({
        title: "⚠️ Invalid Selection",
        description: "Please select exactly 2 objects to swap.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const [obj1, obj2] = selectedObjects;

    const formData = new FormData();
    formData.append("object_1_id", String(obj1.object_id));
    formData.append("current_frame", String(obj1.frame_id));
    formData.append("object_2_id", String(obj2.object_id));

    swapMutation.mutate(formData);
  };

  const handleBreakObject = () => {
    if (selectedObjects.length !== 1) {
      toast({
        title: "⚠️ Invalid Selection",
        description: "Please select exactly 1 objects to break.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const [obj] = selectedObjects;

    const formData = new FormData();
    formData.append("object_id", String(obj.object_id));
    formData.append("video_id", String(videoId));
    formData.append("break_frame", String(obj.frame_id));
    formData.append("start_frame", String(obj.start_frame));
    formData.append("end_frame", String(obj.end_frame));

    breakMutation.mutate(formData);
  };

  const handleDeleteObject = () => {
    if (selectedObjects.length !== 1) {
      toast({
        title: "⚠️ Invalid Selection",
        description: "Please select exactly 1 object to delete.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    console.log("deleting log start");

    const [obj] = selectedObjects;
    console.log(obj);
    const formData = new FormData();
    formData.append("object_id", String(obj.object_id));
    formData.append("start_frame", String(obj.start_frame));
    formData.append("end_frame", String(obj.end_frame));
    console.log(formData);
    deleteMutation.mutate(formData);
  };

  const handleInterpolate = () => {
    if (selectedObjects.length !== 2) {
      toast({
        title: "Invalid Selection",
        description: "Please select exactly 2 objects.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const [sourceObj, targetObj] = selectedObjects;

    interpolateMutation.mutate({
      source_object_id: sourceObj.object_id,
      source_end_frame: sourceObj.end_frame,
      target_object_id: targetObj.object_id,
      target_start_frame: targetObj.start_frame,
    });
  };

  // FIXED HEIGHT CONTAINER TO PREVENT LAYOUT SHIFT
  const renderObjectsSection = () => {
    if (isLoading || !initialLoadComplete) {
      return (
        <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-[#5A5A5A] text-[13px]">Loading objects...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-[300px] flex items-center justify-center bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-[13px] text-center px-4">
            Error: {(error as Error).message}
          </p>
        </div>
      );
    }

    if (!data?.data.objects || data?.data.objects.length === 0) {
      return (
        <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg">
          <p className="text-[#5A5A5A] text-[13px]">
            No objects found for frame {frameId}
          </p>
        </div>
      );
    }

    return (
      <div className="h-[450px] overflow-y-auto space-y-3 pr-2">
        {data.data.objects.map((obj: any, index: number) => {
          const isExpanded = expandedIds.has(obj.object_id);
          return (
            <Card
              key={obj.object_id || index}
              className="border border-[#D9D9D9] border-[1px] rounded-[7px] p-3 cursor-pointer hover:shadow-md transition-all min-h-[50px]"
              onClick={() => toggleExpand(obj.object_id)}>
              <div className="flex items-center pb-1 justify-between">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
                  <span className="font-semibold text-[13px] leading-[13px]">
                    Object {index + 1}: Animal
                  </span>
                </div>
                <span className="font-medium text-[13px] leading-[13px]">
                  ID {obj.object_id}
                  {isExpanded ? " ▼" : " ►"}
                </span>
              </div>

              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-[#5A5A5A] text-[13px] font-medium mb-2">
                    <strong>start frame :</strong> {obj.start_frame}
                  </p>
                  <p className="text-[#5A5A5A] text-[13px] font-medium mb-2">
                    <strong>end frame :</strong> {obj.end_frame}
                  </p>

                  <div className="space-y-3">
                    {/* Coordinates card */}
                    <div>
                      <p className="text-xs font-medium text-neutral-800 mb-1">
                        Coordinates
                      </p>
                      <div className="rounded-md border border-neutral-200 bg-neutral-50">
                        <div className="max-h-32 overflow-y-auto px-3 py-2">
                          {obj.coordinates && obj.coordinates.length > 0 ? (
                            <ul className="space-y-1">
                              {obj.coordinates.map(
                                (
                                  point: [number, number],
                                  pointIndex: number,
                                ) => {
                                  const [x, y] = point;
                                  return (
                                    <li
                                      key={pointIndex}
                                      className="text-[11px] text-neutral-700 flex items-start gap-2">
                                      <span className="mt-[2px] text-[10px] text-neutral-500">
                                        {pointIndex + 1}.
                                      </span>
                                      <div className="space-y-[1px]">
                                        <div>
                                          <span className="font-medium">x</span>{" "}
                                          = {x}
                                        </div>
                                        <div>
                                          <span className="font-medium">y</span>{" "}
                                          = {y}
                                        </div>
                                      </div>
                                    </li>
                                  );
                                },
                              )}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-neutral-400 italic">
                              No coordinate data
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Confidence card */}
                    <div>
                      <p className="text-xs font-medium text-neutral-800 mb-1">
                        Confidence
                      </p>
                      <div className="rounded-md border border-neutral-200 bg-neutral-50">
                        <div className="max-h-32 overflow-y-auto px-3 py-2">
                          {obj.confidence && obj.confidence.length > 0 ? (
                            <div className="grid grid-cols-1 gap-1.5">
                              {obj.confidence.map(
                                (conf: number, confIndex: number) => (
                                  <span
                                    key={confIndex}
                                    className="inline-flex items-center justify-between rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-700">
                                    <span className="text-[10px] text-neutral-500 mr-1">
                                      #{confIndex + 1}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {conf}
                                    </span>
                                  </span>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-neutral-400 italic">
                              No confidence data
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="bg-slate-50 border border-slate-200 rounded-xl shadow-sm text-sm ">
      <CardHeader className="flex flex-row items-center gap-3 p-3 pb-0">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md" />
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[#595959] text-[16px] font-medium">
              Animal Annotation
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              className="h-8 w-8 text-[#595959] hover:text-[#333] hover:bg-gray-100">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[#9F9F9F] text-[12px]">PROJECT</p>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-2"></span>
          <span
            className="text-[#404040] text-[13px] truncate"
            title={mounted ? videoName ?? "" : ""}>
            {mounted ? formatFileName(videoName ?? "") : "-"}
          </span>
        </div>

        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></span>
          <span
            className="text-[#404040] text-[13px] truncate"
            title={mounted ? trkFileName ?? "" : ""}>
            {mounted ? formatFileName(trkFileName ?? "") : "-"}
          </span>
        </div>
      </CardContent>

      <Separator />

      <CardContent className="p-3 pt-2 flex-shrink-0">
        <div className="p-4 w-64 bg-white border border-slate-200 rounded-xl shadow-sm h-full">
          {/* title + clear button side-by-side */}
          <div className="flex items-center justify-between mb-3">
           <h2 className="font-semibold text-slate-800 text-lg">Selected Objects</h2>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setSelectedObjects([]);
                toast({
                  title: "ℹ️ Cleared",
                  description: "Selected objects cleared.",
                  variant: "default",
                  duration: 3000,
                });
              }}
              disabled={selectedObjects.length === 0}>
              Clear
            </Button>
          </div>

          {/* when empty */}
          {selectedObjects.length === 0 && (
            <p className="text-gray-500">No object selected</p>
          )}

          {/* selected list */}
          {selectedObjects.map((obj, i) => (
            <div
              key={i}
              className="p-2 mt-2 border bg-white shadow-sm border rounded-[7px] flex justify-between items-start">
              <div>
                <p>
                  <b>Object {i + 1} Selected:</b>
                </p>
                <p className="flex gap-3">
                  <span>ID: {obj.object_id}</span>
                  <span>Frame: {obj.frame_id}</span>
                </p>
                <p className="flex gap-3">
                  <span>Start: {obj.start_frame}</span>
                  <span>End: {obj.end_frame}</span>
                </p>
              </div>

              {/* Cross button */}
              <button
                onClick={() => {
                  setSelectedObjects((prev) =>
                    prev.filter((o) => o.object_id !== obj.object_id),
                  );
                  toast({
                    title: "🗑️ Removed",
                    description: `Object ${obj.object_id} removed from selection.`,
                    variant: "default",
                    duration: 3000,
                  });
                }}
                className="text-red-500 font-bold text-lg hover:text-red-700 ml-2">
                ×
              </button>
            </div>
          ))}
        </div>
      </CardContent>

      <CardContent className="flex flex-col gap-3 p-3 pt-0">
        {/* First row: Swap + Break */}
        <div className="flex justify-center gap-2 w-full">
          {/* Swap Button */}
          <Button
            className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex-1 flex items-center justify-center gap-2"
            disabled={selectedObjects.length !== 2 || swapMutation.isPending}
            onClick={() => setSwapDialogOpen(true)}>
            <Image src="/images/swap.svg" alt="Swap" width={25} height={25} />
            {swapMutation.isPending ? "Swapping..." : "Swap"}
          </Button>

          {/* Break Button - ORANGE */}
          <Button
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex-1 flex items-center justify-center gap-2"
            disabled={selectedObjects.length !== 1 || breakMutation.isPending}
            onClick={() => setBreakDialogOpen(true)}>
            <Image src="/images/break.svg" alt="Break" width={25} height={25} />
            {breakMutation.isPending ? "Breaking..." : "Break"}
          </Button>
        </div>

        {/* Second row: Link + Delete */}
        <div className="flex justify-center gap-2 w-full">
          {/* Link Button */}
          <Button
            className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex-1 flex items-center justify-center gap-2"
            disabled={selectedObjects.length !== 2 || linkMutation.isPending}
            onClick={() => setLinkDialogOpen(true)}>
            <Image src="/images/link.svg" alt="Link" width={25} height={25} />
            {linkMutation.isPending ? "Linking..." : "Link"}
          </Button>

          {/* Delete Button - RED DANGER */}
          <Button
            className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex-1 flex items-center justify-center gap-2"
            disabled={selectedObjects.length !== 1 || deleteMutation.isPending}
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}>
            <Image
              src="/images/delete.png"
              alt="Delete"
              width={35}
              height={35}
            />
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>

        {/* Third Row: Interpolate + Recalculate */}
        <div className="flex justify-center gap-2 w-full">

          <Button
            className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex-1 flex items-center justify-center gap-2"
            disabled={
              selectedObjects.length !== 2 ||
              interpolateMutation.isPending
            }
            onClick={handleInterpolate}
          >
            <Image src="/images/interpolate.svg" alt="Interpolate" width={25} height={25}/>
            {interpolateMutation.isPending
              ? "Interpolating..."
              : "Interpolate"}
          </Button>

          <Button
            className="bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex-1 flex items-center justify-center gap-2"
            disabled={recalculateMutation.isPending || isConfusionRunning }
            onClick={() => recalculateMutation.mutate()}
          >
              <Image src="/images/refresh.svg" alt="Confusion" width={25} height={25}/>
            {
              isConfusionRunning
                ? "Calculating..."
                : recalculateMutation.isPending
                  ? "Starting..."
                  : "Confusion"
            }
          </Button>

        </div>
      </CardContent>

      <Separator />

      <CardContent className="p-3 pt-2 flex-shrink-0">
        <p className="text-[#494949] text-[13px] leading-[13px] font-medium pt-2 pb-2">
          Frame #{frameId}
        </p>
        <p className="text-[#494949] text-[13px] leading-[13px] font-medium pt-2 pb-2">
          fps : {fpsValue}
        </p>
      </CardContent>

      <Separator />

      {/* Collapsible Objects Section - collapsed by default */}
      <CardContent className="p-3 flex-1 flex flex-col">
        <div className="flex justify-end flex-shrink-0 pt-2 pb-3">
          <button
            onClick={() => setObjectsCollapsed(!objectsCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl rounded-md focus:outline-none transition"
            aria-label={objectsCollapsed ? "Expand object list" : "Collapse object list"}
          >
            Object List
            {objectsCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>

        {!objectsCollapsed && renderObjectsSection()}
      </CardContent>

      {/* LINK CONFIRM DIALOG */}
      <ConfirmDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title="Confirm Link Objects"
        confirmText="Confirm Link"
        loadingText="Linking..."
        confirmClassName="bg-[#5EC16A] hover:bg-[#4CAF50]"
        loading={linkMutation.isPending}
        onConfirm={handleLinkObjects}
        description={
          <>
            <p>Are you sure you want to link these 2 objects?</p>

            {selectedObjects.length === 2 && (
              <div className="mt-4 space-y-1">
                <p>
                  <strong>Object 1:</strong> ID {selectedObjects[0].object_id}
                  (Current Range: {selectedObjects[0].start_frame} to{" "}
                  {selectedObjects[0].end_frame})
                </p>
                <p>
                  <strong>Object 2:</strong> ID {selectedObjects[1].object_id}
                  (Current Range: {selectedObjects[1].start_frame} to{" "}
                  {selectedObjects[1].end_frame})
                </p>
                <p className="text-yellow-600 mt-2">
                  This will connect the two object IDs together.
                </p>
              </div>
            )}
          </>
        }
      />

      {/* SWAP CONFIRM DIALOG */}
      <ConfirmDialog
        open={swapDialogOpen}
        onOpenChange={setSwapDialogOpen}
        title="Confirm Swap Objects"
        confirmText="Confirm Swap"
        loadingText="Swapping..."
        confirmClassName="bg-[#4B84EE] hover:bg-[#3B74DE]"
        loading={swapMutation.isPending}
        onConfirm={handleSwapObjects}
        description={
          <>
            <p>Are you sure you want to swap these 2 objects?</p>

            {selectedObjects.length === 2 && (
              <div className="mt-4 space-y-1">
                <p>
                  <strong>Object 1:</strong> ID {selectedObjects[0].object_id}
                  (Current Range: {selectedObjects[0].start_frame} to{" "}
                  {selectedObjects[0].end_frame})
                </p>
                <p>
                  <strong>Object 2:</strong> ID {selectedObjects[1].object_id}
                  (Current Range: {selectedObjects[1].start_frame} to{" "}
                  {selectedObjects[1].end_frame})
                </p>
                <p className="text-yellow-600 mt-2">
                  This will swap the IDs and tracking data of the two objects.
                </p>
              </div>
            )}
          </>
        }
      />
      {/* BREAK CONFIRM DIALOG */}
      <ConfirmDialog
        open={breakDialogOpen}
        onOpenChange={setBreakDialogOpen}
        title="Confirm Break Object"
        confirmText="Confirm Break"
        loadingText="Breaking..."
        confirmClassName="bg-[#DD524C] hover:bg-[#CC423C]"
        loading={breakMutation.isPending}
        onConfirm={handleBreakObject}
        description={
          <>
            <p>Are you sure you want to break this object?</p>

            {selectedObjects.length === 1 && (
              <div className="mt-4 space-y-1">
                <p>
                  <strong>Object:</strong> ID {selectedObjects[0].object_id}
                </p>
                <p>
                  <strong>At Frame:</strong> {selectedObjects[0].frame_id}
                </p>
                <p>
                  <strong>Current Range:</strong> Frame{" "}
                  {selectedObjects[0].start_frame} to{" "}
                  {selectedObjects[0].end_frame}
                </p>
                <p className="text-yellow-600 mt-2">
                  Current ID will be deleted and a new ID will be assigned.
                </p>
              </div>
            )}
          </>
        }
      />
      {/* DELETE CONFIRM DIALOG */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Confirm Delete Object"
        confirmText="Confirm Delete"
        loadingText="Deleting..."
        confirmClassName="bg-[#DD524C] hover:bg-[#CC423C]"
        loading={deleteMutation.isPending}
        onConfirm={handleDeleteObject}
        description={
          <>
            <p>Are you sure you want to delete this object?</p>

            {selectedObjects.length === 1 && (
              <div className="mt-4 space-y-1">
                <p>
                  <strong>Object:</strong> ID {selectedObjects[0].object_id}
                </p>
                <p>
                  <strong>At Frame:</strong> {selectedObjects[0].frame_id}
                </p>
                <p>
                  <strong>Current Range:</strong> Frame{" "}
                  {selectedObjects[0].start_frame} to{" "}
                  {selectedObjects[0].end_frame}
                </p>
                <p className="text-yellow-600 mt-2">
                  Current ID will be deleted.
                </p>
              </div>
            )}
          </>
        }
      />
    </Card>
  );
}
