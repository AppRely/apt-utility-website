"use client";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { getFrameData } from "@/lib/api/getFrameData";
import { useMutation } from "@tanstack/react-query";
import { linkObjects } from "@/lib/api/linkObjects";
import { swapObjects } from "@/lib/api/swapObjects";
import { breakObjects } from "@/lib/api/breakObjects";
import { useToast } from "@/components/hooks/use-toast";
import { objectDelete } from "@/lib/api/objectDelete";
import { ConfirmDialog } from "@/components/annotation/ConfirmDialog";
import { SelectedObjectProps } from "@/types";
import { ArrowLeft, Crop, PawPrint, X } from "lucide-react";
import { formatFileName } from "@/lib/utils/formatFileName";
import { getObjectColor } from "@/lib/objectColors";
import { interpolateTrajectory } from "@/lib/api/interpolateTrajectory";
import { recalculateConfusion } from "@/lib/api/recalculateConfusion";
import { getConfusionStatus } from "@/lib/api/getConfusionStatus";
import { clipObject } from "@/lib/api/clipObject";
import { getUniqueIdsData, type UniqueIdObject } from "@/lib/api/getUniqueIdsData";
import {
  getCoordinateDistance,
  NEXT_LINK_MAX_DISTANCE_PX,
  NEXT_LINK_START_THRESHOLD_FRAMES,
} from "@/lib/trajectoryLinking";

type SidebarProps = SelectedObjectProps & {
  clipStartFrame: number | null;
  clipEndFrame: number | null;
  setClipStartFrame: Dispatch<SetStateAction<number | null>>;
  setClipEndFrame: Dispatch<SetStateAction<number | null>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

const formatMetadataNumber = (value: string | null) => {
  const number = Number(value);
  return value && Number.isFinite(number) ? number.toLocaleString() : "—";
};

const formatVideoDuration = (value: string | null) => {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) return "—";

  const totalSeconds = Math.round(duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
    : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

export default function Sidebar({
  selectedObjects,
  setSelectedObjects,
  clipStartFrame,
  clipEndFrame,
  setClipStartFrame,
  setClipEndFrame,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [previousFrameId, setPreviousFrameId] = useState<number | null>(null);
  const { toast } = useToast();

  // Dialog states
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clipDialogOpen, setClipDialogOpen] = useState(false);
  const [isConfusionRunning, setIsConfusionRunning] = useState(false);
  const [breakType, setBreakType] = useState<'before' | 'after'>('after');

  // Link dialog internal states
  const [linkOperation, setLinkOperation] = useState<'link' | 'overlap'>('link');
  const [linkPreferredId, setLinkPreferredId] = useState<number | null>(null);

  const isAnyDialogOpen = linkDialogOpen || swapDialogOpen || breakDialogOpen || deleteDialogOpen || clipDialogOpen;
  useEffect(() => {
    sessionStorage.setItem("dialogOpen", String(isAnyDialogOpen));
  }, [isAnyDialogOpen]);

  const [objectsCollapsed, setObjectsCollapsed] = useState(true);
  const [videoInfoCollapsed, setVideoInfoCollapsed] = useState(true);
  const linkOrderRef = useRef<{ obj1: any; obj2: any } | null>(null);

  // Session storage hook
  const useSessionStorage = (key: string) => {
    const [value, setValue] = useState<string | null>(null);
    useEffect(() => {
      const readValue = () => sessionStorage.getItem(key);
      setValue(readValue());

      const handleStorageChange = () => {
        setValue(readValue());
      };
      window.addEventListener("storage", handleStorageChange);
      const interval = setInterval(() => {
        setValue(currentValue => {
          const newValue = readValue();
          return newValue === currentValue ? currentValue : newValue;
        });
      }, 200);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        clearInterval(interval);
      };
    }, [key]);
    return value;
  };

  const videoId = useSessionStorage("videoId");
  const projectId = useSessionStorage("projectId");
  const frameId = useSessionStorage("frameId");
  const projectName = useSessionStorage("project_name");
  const videoName = useSessionStorage("video_name");
  const trkFileName = useSessionStorage("trk_file_name");
  const fps = useSessionStorage("fps");
  const videoWidth = useSessionStorage("width");
  const videoHeight = useSessionStorage("height");
  const videoDuration = useSessionStorage("duration");
  const totalFrames = useSessionStorage("total_frames");
  const activeObjectCount = useSessionStorage("active_object_count");
  const [displayActiveObjectCount, setDisplayActiveObjectCount] = useState<string | null>(null);
  const videoStoragePath = useSessionStorage("video_storage_path");
  const trkStoragePath = useSessionStorage("trk_storage_path");
  const autoInterpolation = useSessionStorage("autoInterpolation");
  const videoColorTheme = useSessionStorage("videoColorTheme") === "dark" ? "dark" : "light";

  useEffect(() => {
    setDisplayActiveObjectCount(activeObjectCount);
  }, [activeObjectCount]);

  const adjustActiveObjectCount = useCallback((delta: number) => {
    setDisplayActiveObjectCount((current) => {
      const count = Number(current);
      if (!Number.isFinite(count)) return current;
      const nextCount = Math.max(0, count + delta).toString();
      sessionStorage.setItem("active_object_count", nextCount);
      return nextCount;
    });
  }, []);

  // The first object in the current selection is always the clip target.
  // Removing it naturally promotes the next selected object.
  const selectedClipObject = selectedObjects[0] ?? null;
  const selectedObjectEnd = selectedClipObject?.end_frame ?? selectedClipObject?.start_frame;
  const nextLinkWindowStart = selectedObjectEnd !== undefined ? selectedObjectEnd + 1 : null;
  const nextLinkWindowEnd = nextLinkWindowStart !== null
    ? nextLinkWindowStart + NEXT_LINK_START_THRESHOLD_FRAMES - 1
    : null;
  const { data: nextLinkData, isLoading: isLoadingNextLinkCandidates } = useQuery({
    queryKey: ["nextLinkCandidates", projectId, selectedClipObject?.object_id, nextLinkWindowStart, nextLinkWindowEnd],
    queryFn: () => getUniqueIdsData(Number(projectId), selectedObjectEnd!, nextLinkWindowEnd!),
    enabled: Boolean(
      projectId &&
      selectedObjects.length === 1 &&
      nextLinkWindowStart !== null &&
      nextLinkWindowEnd !== null
    ),
    staleTime: 30_000,
  });
  const nextLinkCandidates = useMemo(() => {
    if (selectedObjects.length !== 1 || nextLinkWindowStart === null || nextLinkWindowEnd === null) return [];
    const normalizedObjects = (nextLinkData?.data?.objects ?? [])
      .map(object => ({
        ...object,
        id: object.id ?? (object as UniqueIdObject & { object_id?: number }).object_id,
      }));
    const source = normalizedObjects.find(object => object.id === selectedClipObject?.object_id);
    if (!source?.end_coordinate) return [];
    return normalizedObjects
      .map(object => ({
        ...object,
        linkDistance: getCoordinateDistance(source.end_coordinate, object.start_coordinate),
      }))
      .filter(object =>
        object.id !== undefined &&
        object.id !== selectedClipObject?.object_id &&
        object.start_frame >= nextLinkWindowStart &&
        object.start_frame <= nextLinkWindowEnd &&
        object.linkDistance !== null &&
        object.linkDistance <= NEXT_LINK_MAX_DISTANCE_PX
      )
      .sort((a, b) =>
        a.start_frame - b.start_frame ||
        (a.linkDistance ?? Infinity) - (b.linkDistance ?? Infinity) ||
        a.id - b.id
      );
  }, [nextLinkData, nextLinkWindowEnd, nextLinkWindowStart, selectedClipObject?.object_id, selectedObjects.length]);
  const capturedClipStart = clipStartFrame !== null && clipEndFrame !== null
    ? Math.min(clipStartFrame, clipEndFrame)
    : null;
  const capturedClipEnd = clipStartFrame !== null && clipEndFrame !== null
    ? Math.max(clipStartFrame, clipEndFrame)
    : null;
  const effectiveClipStart = capturedClipStart;
  const effectiveClipEnd = capturedClipEnd;
  const selectedClipObjectEnd = selectedClipObject?.end_frame ?? selectedClipObject?.start_frame;
  const hasValidClipRange = Boolean(
    selectedClipObject &&
    effectiveClipStart !== null &&
    effectiveClipEnd !== null &&
    selectedClipObjectEnd !== undefined &&
    effectiveClipStart >= selectedClipObject.start_frame &&
    effectiveClipEnd <= selectedClipObjectEnd
  );

  // Query for frame data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["frameData", projectId, frameId],
    queryFn: () => getFrameData(Number(projectId!), Number(frameId!)),
    enabled: !!(projectId && frameId && !objectsCollapsed),
    staleTime: 0,
    gcTime: 0,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Mutations
  const swapMutation = useMutation({
    mutationFn: (formData: FormData) => swapObjects(Number(projectId), formData),
    onSuccess: () => {
      toast({ title: "Swap", description: "Objects swapped successfully", duration: 3000, className: "text-green-600" });
      setSwapDialogOpen(false);
      setSelectedObjects([]);
      window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Number(frameId) } }));
    },
  });

  // --- handleInterpolate with fallbacks ---
  const handleInterpolate = useCallback((params?: any) => {
    if (params) {
      interpolateMutation.mutate(params);
      return;
    }
    if (selectedObjects.length === 1) {
      const obj = selectedObjects[0];
      if (!obj) return;
      interpolateMutation.mutate({
        object_id: obj.object_id,
        start_frame: obj.start_frame,
        end_frame: obj.end_frame ?? obj.start_frame,
      });
      return;
    }
    if (selectedObjects.length === 2) {
      const [sourceObj, targetObj] = selectedObjects;
      if (!sourceObj || !targetObj) return;
      interpolateMutation.mutate({
        source_object_id: sourceObj.object_id,
        source_end_frame: sourceObj.end_frame ?? sourceObj.start_frame,
        target_object_id: targetObj.object_id,
        target_start_frame: targetObj.start_frame,
      });
      return;
    }
    toast({ title: "Invalid Selection", description: "Select either 1 object or 2 objects.", variant: "destructive", duration: 3000 });
  }, [selectedObjects, toast]);

  // --- Link mutation with JSON payload ---
  const linkMutation = useMutation({
    mutationFn: (payload: Parameters<typeof linkObjects>[1]) =>
      linkObjects(Number(projectId), payload),
    onSuccess: () => {
      toast({ title: "✅ Success", description: "Objects linked successfully.", duration: 3000, className: "text-green-600" });
      adjustActiveObjectCount(-1);
      setLinkDialogOpen(false);
      if (linkOrderRef.current) {
        const { obj1, obj2 } = linkOrderRef.current;
        const mergedStart = Math.min(obj1.start_frame, obj2.start_frame);
        const mergedEnd = Math.max(obj1.end_frame ?? obj1.start_frame, obj2.end_frame ?? obj2.start_frame);
        const mergedObj = {
          object_id: obj1.object_id,
          frame_id: obj1.frame_id,
          start_frame: mergedStart,
          end_frame: mergedEnd,
          is_inside: obj1.is_inside,
        };
        setSelectedObjects([mergedObj]);
        linkOrderRef.current = null;
        if (autoInterpolation === "true") {
          handleInterpolate({
            object_id: mergedObj.object_id,
            start_frame: mergedStart,
            end_frame: mergedEnd,
          });
        }
      } else {
        if (selectedObjects.length > 0) setSelectedObjects([selectedObjects[0]]);
        else setSelectedObjects([]);
      }
      const currentFrameId = Number(frameId);
      if (currentFrameId) {
        window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: currentFrameId } }));
      }
      setTimeout(() => { refetch(); }, 500);
    },
    onError: (err: any) => {
      toast({ title: "❌ Error", description: `Failed to link objects: ${err.message}`, variant: "destructive", duration: 3000 });
      linkOrderRef.current = null;
      setLinkDialogOpen(false);
    },
  });

  const breakMutation = useMutation({
    mutationFn: ({ formData, breakType }: { formData: FormData; breakType: 'before' | 'after' }) =>
      breakObjects(Number(projectId), formData, breakType),
    onSuccess: () => {
      toast({ title: "Break", description: "Object broken successfully", duration: 3000, className: "text-green-600" });
      adjustActiveObjectCount(1);
      setBreakDialogOpen(false);
      setSelectedObjects([]);
      window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Number(frameId) } }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (formData: FormData) => objectDelete(Number(projectId), formData),
    onSuccess: () => {
      toast({ title: "Delete", description: "Object deleted successfully", duration: 3000, className: "text-green-600" });
      adjustActiveObjectCount(-1);
      setDeleteDialogOpen(false);
      setSelectedObjects([]);
      window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Number(frameId) } }));
    },
  });

  const clipMutation = useMutation({
    mutationFn: ({ objectId, startFrame, endFrame }: { objectId: number; startFrame: number; endFrame: number }) =>
      clipObject(Number(projectId), {
        object_id: objectId,
        start_frame: startFrame,
        end_frame: endFrame,
      }),
    onSuccess: (response) => {
      toast({ title: "Clip", description: response?.message || "Object clipped successfully", duration: 3000, className: "text-green-600" });
      setClipDialogOpen(false);
      setClipStartFrame(null);
      setClipEndFrame(null);
      window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Number(frameId) } }));
    },
    onError: (error: Error) => {
      toast({ title: "Clip Failed", description: error.message, variant: "destructive", duration: 3000 });
      setClipDialogOpen(false);
    },
  });

  const interpolateMutation = useMutation({
    mutationFn: (payload: any) => interpolateTrajectory(Number(projectId), payload),
    onSuccess: (response) => {
      const result = response?.data;
      if (result?.interpolation_required === false) {
        toast({ title: "Interpolation", description: "No missing frames found in the selected range.", duration: 3000 });
        return;
      }
      toast({ title: "Success", description: "Interpolation completed successfully", duration: 3000, className: "text-green-600" });
      window.dispatchEvent(new CustomEvent("operationComplete", { detail: { frameId: Number(frameId) } }));
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: () => recalculateConfusion(Number(projectId)),
    onSuccess: () => {
      toast({ title: "Success", description: "Confusion recalculation started", duration: 3000, className: "text-green-600" });
      setIsConfusionRunning(true);
      const interval = setInterval(async () => {
        try {
          const response = await getConfusionStatus(Number(projectId));
          const status = response.confusion_status;
          console.log("Confusion Status:", status);
          if (status === "COMPLETED") {
            clearInterval(interval);
            setIsConfusionRunning(false);
            toast({ title: "Completed", description: "Confusion recalculation completed successfully", duration: 5000, className: "text-green-600" });
          }
          if (status === "FAILED") {
            clearInterval(interval);
            setIsConfusionRunning(false);
            toast({ title: "Failed", description: "Confusion recalculation failed", variant: "destructive" });
          }
        } catch (error) {
          clearInterval(interval);
          setIsConfusionRunning(false);
          toast({ title: "Error", description: "Failed to check confusion status", variant: "destructive" });
        }
      }, 8000);
    },
  });

  // Listen for operation complete
  useEffect(() => {
    const handleOperationComplete = (event: any) => {
      console.log("📡 Sidebar received operation complete event");
      setTimeout(() => refetch(), 1000);
    };
    window.addEventListener("operationComplete", handleOperationComplete);
    return () => window.removeEventListener("operationComplete", handleOperationComplete);
  }, [refetch]);

  useEffect(() => {
    if (data) {
      setExpandedIds(new Set());
      console.log(`Frame ${frameId}: ${data.data.objects?.length || 0} objects loaded`);
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

  // --------------------------------------------------------------
  // LINK LOGIC – Unified dialog with operation choice
  // --------------------------------------------------------------
  const performLink = (operation: 'link' | 'overlap', preferredId?: number) => {
    if (!linkOrderRef.current) return;
    const { obj1, obj2 } = linkOrderRef.current;

    const payload = {
      object_1_id: obj1.object_id,
      object_1_start: obj1.start_frame,
      object_1_end: obj1.end_frame ?? obj1.start_frame,
      object_2_id: obj2.object_id,
      object_2_start: obj2.start_frame,
      object_2_end: obj2.end_frame ?? obj2.start_frame,
      operation,
      ...(operation === 'overlap' && { preferred_object: preferredId }),
    };

    linkMutation.mutate(payload);
  };

  const linkNextCandidate = (candidate: UniqueIdObject) => {
    const selected = selectedObjects[0];
    if (!selected || selected.start_frame === undefined) return;
    linkOrderRef.current = {
      obj1: selected,
      obj2: {
        object_id: candidate.id,
        frame_id: candidate.start_frame,
        start_frame: candidate.start_frame,
        end_frame: candidate.end_frame,
      },
    };
    performLink('link');
  };

  const handleLinkObjects = () => {
    if (selectedObjects.length === 1) {
      const candidate = nextLinkCandidates[0];
      if (candidate) {
        linkNextCandidate(candidate);
      } else {
        toast({
          title: isLoadingNextLinkCandidates ? "Finding next object" : "No nearby object found",
          description: isLoadingNextLinkCandidates
            ? "Please try again when the search completes."
            : `No object starts within ${NEXT_LINK_START_THRESHOLD_FRAMES} frames after this object ends.`,
          duration: 2500,
        });
      }
      return;
    }
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
    if (!obj1 || !obj2) {
      toast({
        title: "⚠️ Error",
        description: "Selected objects are invalid.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (obj1.start_frame === undefined || obj2.start_frame === undefined) {
      toast({
        title: "⚠️ Missing Data",
        description: "One of the selected objects has no start frame.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // Order by start_frame (earlier first)
    const firstStart = obj1.start_frame!;
    const secondStart = obj2.start_frame!;
    let first = obj1;
    let second = obj2;
    if (firstStart > secondStart) {
      [first, second] = [second, first];
    }

    linkOrderRef.current = { obj1: first, obj2: second };

    // Non-overlapping trajectories can be linked unambiguously, so link them
    // immediately. Only overlapping ranges require a user decision.
    const overlap = (first.end_frame ?? first.start_frame!) >= second.start_frame!;

    if (!overlap) {
      performLink('link');
      return;
    }

    setLinkOperation('overlap');
    setLinkPreferredId(first.object_id);
    setLinkDialogOpen(true);
  };
  // --------------------------------------------------------------

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
    if (!obj1 || !obj2) {
      toast({ title: "⚠️ Error", description: "Selected objects are invalid.", variant: "destructive", duration: 3000 });
      return;
    }
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
        description: "Please select exactly 1 object to break.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    const [obj] = selectedObjects;
    if (!obj) {
      toast({ title: "⚠️ Error", description: "Selected object is invalid.", variant: "destructive", duration: 3000 });
      return;
    }
    const formData = new FormData();
    formData.append("object_id", String(obj.object_id));
    formData.append("video_id", String(projectId));
    formData.append("break_frame", String(frameId));
    formData.append("start_frame", String(obj.start_frame));
    formData.append("end_frame", String(obj.end_frame ?? obj.start_frame));
    breakMutation.mutate({ formData, breakType });
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
    const [obj] = selectedObjects;
    if (!obj) {
      toast({ title: "⚠️ Error", description: "Selected object is invalid.", variant: "destructive", duration: 3000 });
      return;
    }
    const formData = new FormData();
    formData.append("object_id", String(obj.object_id));
    formData.append("start_frame", String(obj.start_frame));
    formData.append("end_frame", String(obj.end_frame ?? obj.start_frame));
    deleteMutation.mutate(formData);
  };

  const handleClipObject = () => {
    const selected = selectedClipObject;
    if (!selected || clipStartFrame === null || clipEndFrame === null || effectiveClipStart === null || effectiveClipEnd === null) {
      toast({
        title: "Clip range incomplete",
        description: "Select an object and capture both clip frames with Ctrl+C.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (!hasValidClipRange) {
      const objectEnd = selected.end_frame ?? selected.start_frame;
      toast({
        title: "Invalid clip range",
        description: `The complete range must be within frames ${selected.start_frame} to ${objectEnd}.`,
        variant: "destructive",
        duration: 3000,
      });
      setClipDialogOpen(false);
      return;
    }
    clipMutation.mutate({ objectId: selected.object_id, startFrame: effectiveClipStart, endFrame: effectiveClipEnd });
  };

  const handleOpenClipDialog = () => {
    if (!selectedClipObject || clipStartFrame === null) return;

    const currentClipEnd = clipEndFrame ?? Number(frameId);
    const rangeStart = Math.min(clipStartFrame, currentClipEnd);
    const rangeEnd = Math.max(clipStartFrame, currentClipEnd);
    const objectStart = selectedClipObject.start_frame;
    const objectEnd = selectedClipObject.end_frame ?? objectStart;

    if (rangeStart < objectStart || rangeEnd > objectEnd) {
      toast({
        title: "Invalid clip range",
        description: `Object ${selectedClipObject.object_id} exists only from frame ${objectStart} to ${objectEnd}.`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (clipEndFrame === null) {
      toast({
        title: "Clip range incomplete",
        description: "Press Ctrl+C again to capture the end frame.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setClipDialogOpen(true);
  };

  const clearClipRange = useCallback(() => {
    setClipStartFrame(null);
    setClipEndFrame(null);
    setClipDialogOpen(false);
  }, [setClipEndFrame, setClipStartFrame]);

  // Ctrl+C captures the start frame first and the end frame second.
  useEffect(() => {
    const handleClipShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== "c") return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable
      )) return;
      if (isAnyDialogOpen) return;
      event.preventDefault();
      if (selectedObjects.length < 1) {
        toast({ title: "Select an object", description: "At least one object is required for clipping.", variant: "destructive", duration: 3000 });
        return;
      }
      const currentFrame = Number(frameId);
      if (!Number.isFinite(currentFrame)) return;
      if (clipStartFrame === null || clipEndFrame !== null) {
        setClipStartFrame(currentFrame);
        setClipEndFrame(null);
        toast({ title: "Clip start captured", description: `Start frame: ${currentFrame}`, duration: 2000 });
      } else {
        setClipEndFrame(currentFrame);
        toast({ title: "Clip end captured", description: `End frame: ${currentFrame}`, duration: 2000 });
      }
    };
    window.addEventListener("keydown", handleClipShortcut);
    return () => window.removeEventListener("keydown", handleClipShortcut);
  }, [clipEndFrame, clipStartFrame, frameId, isAnyDialogOpen, selectedObjects.length, setClipEndFrame, setClipStartFrame, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnyDialogOpen) return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable
      )) return;
      const key = e.key.toLowerCase();
      const preventDefaultKeys = ["l", "w", "b", "d", "i", "r"];
      const isPlainClipShortcut = key === "x" && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (preventDefaultKeys.includes(key) || isPlainClipShortcut) e.preventDefault();

      if (key === "l") {
        if (![1, 2].includes(selectedObjects.length)) {
          toast({ title: "⚠️ Invalid Selection", description: "Select an object to link.", variant: "destructive", duration: 3000 });
          return;
        }
        if (!linkMutation.isPending) handleLinkObjects();
      } else if (key === "w") {
        if (selectedObjects.length !== 2) {
          toast({ title: "⚠️ Invalid Selection", description: "Please select exactly 2 objects to swap.", variant: "destructive", duration: 3000 });
          return;
        }
        if (!swapMutation.isPending) setSwapDialogOpen(true);
      } else if (key === "b") {
        if (selectedObjects.length !== 1) {
          toast({ title: "⚠️ Invalid Selection", description: "Please select exactly 1 object to break.", variant: "destructive", duration: 3000 });
          return;
        }
        if (!breakMutation.isPending) setBreakDialogOpen(true);
      } else if (key === "d") {
        if (selectedObjects.length !== 1) {
          toast({ title: "⚠️ Invalid Selection", description: "Please select exactly 1 object to delete.", variant: "destructive", duration: 3000 });
          return;
        }
        if (!deleteMutation.isPending) setDeleteDialogOpen(true);
      } else if (key === "i") {
        if (![1, 2].includes(selectedObjects.length)) {
          toast({ title: "⚠️ Invalid Selection", description: "Select either 1 or 2 objects to interpolate.", variant: "destructive", duration: 3000 });
          return;
        }
        if (!interpolateMutation.isPending) handleInterpolate();
      } else if (isPlainClipShortcut) {
        if (selectedObjects.length !== 1) {
          toast({ title: "Select one object", description: "Exactly one object is required for clipping.", variant: "destructive", duration: 3000 });
          return;
        }
        if (clipStartFrame === null || clipEndFrame === null) {
          toast({ title: "Clip range incomplete", description: "Capture the start and end frames with Ctrl+C first.", variant: "destructive", duration: 3000 });
          return;
        }
        if (!clipMutation.isPending) handleOpenClipDialog();
      } else if (key === "r" && !e.ctrlKey && !e.metaKey) {
        if (!recalculateMutation.isPending && !isConfusionRunning) recalculateMutation.mutate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedObjects, isAnyDialogOpen, linkMutation.isPending, swapMutation.isPending, breakMutation.isPending, deleteMutation.isPending, interpolateMutation.isPending, clipMutation.isPending, recalculateMutation.isPending, isConfusionRunning, clipStartFrame, clipEndFrame, toast, handleInterpolate, handleLinkObjects]);

  // Enter key confirmation
  useEffect(() => {
    const handleEnterConfirm = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (linkDialogOpen) {
        e.preventDefault();
        if (!linkMutation.isPending) {
          // Validate overlap operation
          if (linkOperation === 'overlap' && linkPreferredId === null) {
            toast({ title: "⚠️ Please select a preferred object", variant: "destructive", duration: 3000 });
            return;
          }
          const preferred = linkOperation === 'overlap' ? linkPreferredId! : undefined;
          performLink(linkOperation, preferred);
        }
      } else if (swapDialogOpen) {
        e.preventDefault();
        if (!swapMutation.isPending) handleSwapObjects();
      } else if (breakDialogOpen) {
        e.preventDefault();
        if (!breakMutation.isPending) handleBreakObject();
      } else if (deleteDialogOpen) {
        e.preventDefault();
        if (!deleteMutation.isPending) handleDeleteObject();
      }
    };
    window.addEventListener('keydown', handleEnterConfirm);
    return () => window.removeEventListener('keydown', handleEnterConfirm);
  }, [linkDialogOpen, swapDialogOpen, breakDialogOpen, deleteDialogOpen, linkMutation.isPending, swapMutation.isPending, breakMutation.isPending, deleteMutation.isPending, linkOperation, linkPreferredId, performLink, handleSwapObjects, handleBreakObject, handleDeleteObject, toast]);

  // renderObjectsSection (unchanged)
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
          <p className="text-red-600 text-[13px] text-center px-4">Error: {(error as Error).message}</p>
        </div>
      );
    }
    if (!data?.data.objects || data.data.objects.length === 0) {
      return (
        <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg">
          <p className="text-[#5A5A5A] text-[13px]">No objects found for frame {frameId}</p>
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
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
                  <span className="font-semibold text-[13px] leading-[13px]">Object {index + 1}: Animal</span>
                </div>
                <span className="font-medium text-[13px] leading-[13px]">ID {obj.object_id}{isExpanded ? " ▼" : " ►"}</span>
              </div>
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-[#5A5A5A] text-[13px] font-medium mb-2"><strong>start frame :</strong> {obj.start_frame}</p>
                  <p className="text-[#5A5A5A] text-[13px] font-medium mb-2"><strong>end frame :</strong> {obj.end_frame}</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-neutral-800 mb-1">Coordinates</p>
                      <div className="rounded-md border border-neutral-200 bg-neutral-50">
                        <div className="max-h-32 overflow-y-auto px-3 py-2">
                          {obj.coordinates && obj.coordinates.length > 0 ? (
                            <ul className="space-y-1">
                              {obj.coordinates.map((point: [number, number], pointIndex: number) => {
                                const [x, y] = point;
                                return (
                                  <li key={pointIndex} className="text-[11px] text-neutral-700 flex items-start gap-2">
                                    <span className="mt-[2px] text-[10px] text-neutral-500">{pointIndex + 1}.</span>
                                    <div className="space-y-[1px]">
                                      <div><span className="font-medium">x</span> = {x}</div>
                                      <div><span className="font-medium">y</span> = {y}</div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-neutral-400 italic">No coordinate data</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-neutral-800 mb-1">Confidence</p>
                      <div className="rounded-md border border-neutral-200 bg-neutral-50">
                        <div className="max-h-32 overflow-y-auto px-3 py-2">
                          {obj.confidence && obj.confidence.length > 0 ? (
                            <div className="grid grid-cols-1 gap-1.5">
                              {obj.confidence.map((conf: number, confIndex: number) => (
                                <span key={confIndex} className="inline-flex items-center justify-between rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-700">
                                  <span className="text-[10px] text-neutral-500 mr-1">#{confIndex + 1}</span>
                                  <span className="font-medium tabular-nums">{conf}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-neutral-400 italic">No confidence data</p>
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

  // -------------------- MAIN RENDER --------------------
  return (
    <Card
      className="flex w-full h-full min-h-0 flex-col bg-slate-50 border border-slate-200 rounded-xl shadow-sm text-sm overflow-hidden"
      style={{ containerType: "inline-size" }}
    >
      <CardHeader data-system-guide="sidebar-project" className="flex flex-row items-center gap-3 p-3 pb-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm">
          <PawPrint className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[#595959] text-[16px] font-medium">Animal Annotation</h2>
            <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="h-8 w-8 text-[#595959] hover:text-[#333] hover:bg-gray-100">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <p
            className="text-[#9F9F9F] text-[12px]"
            title={mounted ? projectName ?? "" : ""}
          >
            {mounted ? projectName ?? "" : ""}
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-2"></span>
          <span className="text-[#404040] text-[13px] truncate" title={mounted ? videoStoragePath ?? videoName ?? "" : ""}>
            {mounted ? formatFileName(videoName ?? "") : "-"}
          </span>
        </div>
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></span>
          <span className="text-[#404040] text-[13px] truncate" title={mounted ? trkStoragePath ?? trkFileName ?? "" : ""}>
            {mounted ? formatFileName(trkFileName ?? "") : "-"}
          </span>
        </div>
      </CardContent>

      <Separator />

      <CardContent className="p-3 pt-2 flex-shrink-0">
        <div data-system-guide="sidebar-selection" className="p-4 w-full bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800 text-lg">Selected Objects</h2>
            <Button variant="destructive" size="sm" onClick={() => { setSelectedObjects([]); clearClipRange(); toast({ title: "ℹ️ Cleared", description: "Selection and clip range cleared.", variant: "default", duration: 3000 }); }} disabled={selectedObjects.length === 0 && clipStartFrame === null}>
              Clear
            </Button>
          </div>
          {selectedObjects.length === 0 && <p className="text-gray-500">No object selected</p>}
          {selectedObjects.map((obj, i) => {
            const color = getObjectColor(obj.object_id, videoColorTheme);
            return (
              <div key={i} className="p-3 mt-2 border border-[#D9D9D9] border-[1px] bg-white shadow-sm rounded-[7px] flex justify-between items-start" style={{ borderLeft: `5px solid ${color}` }}>
                <div>
                  <p className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <b>Object {i + 1}</b>
                  </p>
                  <p className="flex gap-3 text-sm"><span>ID: {obj.object_id}</span><span>Frame: {obj.frame_id}</span></p>
                  <p className="flex gap-3 text-xs text-gray-600"><span>Start: {obj.start_frame}</span><span>End: {obj.end_frame}</span></p>
                </div>
                <button onClick={() => { setSelectedObjects((prev) => prev.filter((o) => o.object_id !== obj.object_id)); toast({ title: "🗑️ Removed", description: `Object ${obj.object_id} removed from selection.`, variant: "default", duration: 3000 }); }} className="text-red-500 font-bold text-lg hover:text-red-700 ml-2">×</button>
              </div>
            );
          })}
        </div>

        {clipStartFrame !== null && (
          <div className="mt-3 w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-800 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Clip range</div>
                <button
                  type="button"
                  onClick={clearClipRange}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100"
                  aria-label="Clear clip range"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div>Object ID: {selectedClipObject?.object_id ?? "No object selected"}</div>
              <div>
                Start: {clipStartFrame} · End: {clipEndFrame ?? Number(frameId)}
                {clipEndFrame === null && <span className="ml-1 text-violet-500">(capturing)</span>}
              </div>
          </div>
        )}
      </CardContent>

      <CardContent className="sidebar-action-grid p-3 pt-0">
        <Button data-system-guide="sidebar-swap" className="min-w-0 w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2" disabled={selectedObjects.length !== 2 || swapMutation.isPending} onClick={() => setSwapDialogOpen(true)}>
          <Image src="/images/swap.svg" alt="Swap" width={25} height={25} />{swapMutation.isPending ? "Swapping..." : "Swap"}
        </Button>
        <Button data-system-guide="sidebar-break" className="min-w-0 w-full bg-amber-600 hover:bg-amber-700 text-white h-11 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2" disabled={selectedObjects.length !== 1 || breakMutation.isPending} onClick={() => setBreakDialogOpen(true)}>
          <Image src="/images/break.svg" alt="Break" width={25} height={25} />{breakMutation.isPending ? "Breaking..." : "Break"}
        </Button>
        <Button data-system-guide="sidebar-link" className="min-w-0 w-full bg-teal-700 hover:bg-teal-800 text-white h-11 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2" disabled={![1, 2].includes(selectedObjects.length) || linkMutation.isPending} onClick={handleLinkObjects}>
          <Image src="/images/link.svg" alt="Link" width={25} height={25} />{linkMutation.isPending ? "Linking..." : "Link"}
        </Button>
        <Button data-system-guide="sidebar-delete" className="min-w-0 w-full bg-red-600 hover:bg-red-700 text-white h-11 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2" disabled={selectedObjects.length !== 1 || deleteMutation.isPending} variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
          <Image src="/images/delete.png" alt="Delete" width={35} height={35} />{deleteMutation.isPending ? "Deleting..." : "Delete"}
        </Button>
        <Button data-system-guide="sidebar-interpolate" className="min-w-0 w-full bg-blue-700 hover:bg-blue-800 text-white h-11 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2" disabled={![1, 2].includes(selectedObjects.length) || interpolateMutation.isPending} onClick={() => handleInterpolate()}>
          <Image src="/images/interpolate.svg" alt="Interpolate" width={25} height={25} />{interpolateMutation.isPending ? "Interpolating..." : "Interpolate"}
        </Button>
        <Button data-system-guide="sidebar-confusion" className="min-w-0 w-full bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white h-11 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2" disabled={recalculateMutation.isPending || isConfusionRunning} onClick={() => recalculateMutation.mutate()}>
          <Image src="/images/refresh.svg" alt="Confusion" width={25} height={25} />{isConfusionRunning ? "Calculating..." : recalculateMutation.isPending ? "Starting..." : "Confusion"}
        </Button>
        <Button
          data-system-guide="sidebar-clip"
          className="min-w-0 w-full bg-cyan-700 hover:bg-cyan-800 text-white h-11 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          disabled={!selectedClipObject || clipStartFrame === null || clipMutation.isPending}
          onClick={handleOpenClipDialog}
        >
          <Crop className="h-5 w-5" />
          {clipMutation.isPending ? "Clipping..." : "Clip"}
        </Button>
      </CardContent>

      <Separator />

      <CardContent className="p-3 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 pt-2">
          <button
            data-system-guide="sidebar-video-information"
            type="button"
            onClick={() => setVideoInfoCollapsed((collapsed) => !collapsed)}
            className="flex w-full items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-left text-slate-700 transition hover:bg-slate-200 focus:outline-none"
            aria-expanded={!videoInfoCollapsed}
          >
            <span className="font-medium">Video Information</span>
            <svg
              className={`h-4 w-4 transition-transform ${videoInfoCollapsed ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {!videoInfoCollapsed && (
            <dl className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">FPS</dt>
                <dd className="font-medium tabular-nums text-slate-800">
                  {mounted ? formatMetadataNumber(fps) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Resolution</dt>
                <dd className="font-medium tabular-nums text-slate-800">
                  {mounted && videoWidth && videoHeight
                    ? `${formatMetadataNumber(videoWidth)} × ${formatMetadataNumber(videoHeight)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Duration</dt>
                <dd className="font-medium tabular-nums text-slate-800">
                  {mounted ? formatVideoDuration(videoDuration) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Total Frames</dt>
                <dd className="font-medium tabular-nums text-slate-800">
                  {mounted ? formatMetadataNumber(totalFrames) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Active Object Ids</dt>
                <dd className="font-medium tabular-nums text-slate-800">
                  {mounted ? formatMetadataNumber(displayActiveObjectCount) : "—"}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex justify-end flex-shrink-0 pt-2 pb-3">
          <button data-system-guide="sidebar-object-list" onClick={() => setObjectsCollapsed(!objectsCollapsed)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl rounded-md focus:outline-none transition" aria-label={objectsCollapsed ? "Expand object list" : "Collapse object list"}>
            Object List
            {objectsCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            )}
          </button>
        </div>
        {!objectsCollapsed && renderObjectsSection()}
      </CardContent>

      {/* ========== UNIFIED LINK DIALOG ========== */}
      <ConfirmDialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) {
            // Reset states when dialog closes
            linkOrderRef.current = null;
            setLinkOperation('link');
            setLinkPreferredId(null);
          }
        }}
        title="Link Objects"
        confirmText="Confirm"
        loadingText="Linking..."
        confirmClassName="bg-[#5EC16A] hover:bg-[#4CAF50]"
        loading={linkMutation.isPending}
        onConfirm={() => {
          // Validate overlap operation
          if (linkOperation === 'overlap' && linkPreferredId === null) {
            toast({ title: "⚠️ Please select a preferred object", variant: "destructive", duration: 3000 });
            return;
          }
          const preferred = linkOperation === 'overlap' ? linkPreferredId! : undefined;
          performLink(linkOperation, preferred);
        }}
        description={
          <div className="space-y-4">
            <p>Choose how to combine these two objects:</p>

            {/* Operation radio buttons */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="linkOperation"
                  value="link"
                  checked={linkOperation === 'link'}
                  onChange={() => setLinkOperation('link')}
                />
                <span className="font-medium">Link</span> – merge the two objects (no preference)
              </label>
              <label className="flex items-center gap-2 mt-1">
                <input
                  type="radio"
                  name="linkOperation"
                  value="overlap"
                  checked={linkOperation === 'overlap'}
                  onChange={() => setLinkOperation('overlap')}
                />
                <span className="font-medium">Overlap</span> – keep one object ID (you choose below)
              </label>
            </div>

            {/* Preferred object selection (only when operation is 'overlap') */}
            {linkOperation === 'overlap' && linkOrderRef.current && (
              <div className="mt-2 border-t pt-2">
                <p className="font-medium mb-1">Choose which object ID to keep:</p>
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="preferred"
                      checked={linkPreferredId === linkOrderRef.current.obj1.object_id}
                      onChange={() => setLinkPreferredId(linkOrderRef.current!.obj1.object_id)}
                    />
                    Object 1 (ID {linkOrderRef.current.obj1.object_id})
                    <span className="text-xs text-gray-500">
                      (range {linkOrderRef.current.obj1.start_frame}–{linkOrderRef.current.obj1.end_frame})
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="preferred"
                      checked={linkPreferredId === linkOrderRef.current.obj2.object_id}
                      onChange={() => setLinkPreferredId(linkOrderRef.current!.obj2.object_id)}
                    />
                    Object 2 (ID {linkOrderRef.current.obj2.object_id})
                    <span className="text-xs text-gray-500">
                      (range {linkOrderRef.current.obj2.start_frame}–{linkOrderRef.current.obj2.end_frame})
                    </span>
                  </label>
                </div>
                <p className="text-yellow-600 text-sm mt-2">
                  The selected object will survive; the other will be merged into it.
                </p>
              </div>
            )}

            {/* Show current ranges for reference */}
            {linkOrderRef.current && (
              <div className="mt-2 text-sm text-gray-600 border-t pt-2">
                <p><strong>Object 1:</strong> ID {linkOrderRef.current.obj1.object_id} (range {linkOrderRef.current.obj1.start_frame}–{linkOrderRef.current.obj1.end_frame})</p>
                <p><strong>Object 2:</strong> ID {linkOrderRef.current.obj2.object_id} (range {linkOrderRef.current.obj2.start_frame}–{linkOrderRef.current.obj2.end_frame})</p>
              </div>
            )}
          </div>
        }
      />

      {/* SWAP DIALOG */}
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
                <p><strong>Object 1:</strong> ID {selectedObjects[0].object_id} (Range: {selectedObjects[0].start_frame}–{selectedObjects[0].end_frame})</p>
                <p><strong>Object 2:</strong> ID {selectedObjects[1].object_id} (Range: {selectedObjects[1].start_frame}–{selectedObjects[1].end_frame})</p>
                <p className="text-yellow-600 mt-2">This will swap the IDs and tracking data of the two objects.</p>
              </div>
            )}
          </>
        }
      />

      {/* BREAK DIALOG */}
      <ConfirmDialog
        open={breakDialogOpen}
        onOpenChange={(open) => { setBreakDialogOpen(open); if (!open) setBreakType('after'); }}
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
              <div className="mt-4 space-y-3">
                <p><strong>Object:</strong> ID {selectedObjects[0].object_id}</p>
                <p><strong>At Frame:</strong> {frameId}</p>
                <p><strong>Current Range:</strong> {selectedObjects[0].start_frame}–{selectedObjects[0].end_frame}</p>
                <div>
                  <p className="font-medium mb-2">Break Type:</p>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="breakType" value="before" checked={breakType === 'before'} onChange={() => setBreakType('before')} /> Before
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="breakType" value="after" checked={breakType === 'after'} onChange={() => setBreakType('after')} /> After <span className="text-xs text-gray-400">(default)</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{breakType === 'before' ? 'Current object retains frames before the break frame; a new object is created for frames after.' : 'Current object retains frames after the break frame; a new object is created for frames before.'}</p>
                </div>
                <p className="text-yellow-600 mt-2">Current ID will be deleted and a new ID will be assigned.</p>
              </div>
            )}
          </>
        }
      />

      {/* DELETE DIALOG */}
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
                <p><strong>Object:</strong> ID {selectedObjects[0].object_id}</p>
                <p><strong>At Frame:</strong> {selectedObjects[0].frame_id}</p>
                <p><strong>Current Range:</strong> {selectedObjects[0].start_frame}–{selectedObjects[0].end_frame}</p>
                <p className="text-yellow-600 mt-2">Current ID will be deleted.</p>
              </div>
            )}
          </>
        }
      />

      {/* CLIP DIALOG */}
      <ConfirmDialog
        open={clipDialogOpen}
        onOpenChange={setClipDialogOpen}
        title="Confirm Clip Object"
        confirmText="Confirm Clip"
        loadingText="Clipping..."
        confirmClassName="bg-violet-600 hover:bg-violet-700"
        loading={clipMutation.isPending}
        onConfirm={handleClipObject}
        description={
          <>
            <p>Create a new object ID for the selected frame range?</p>
            {selectedClipObject && hasValidClipRange && (
              <div className="mt-4 space-y-1">
                <p><strong>Object ID:</strong> {selectedClipObject.object_id}</p>
                <p><strong>Start frame:</strong> {effectiveClipStart}</p>
                <p><strong>End frame:</strong> {effectiveClipEnd}</p>
              </div>
            )}
          </>
        }
      />
    </Card>
  );
}
