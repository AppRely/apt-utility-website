"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { getFrameData } from "@/lib/api/getFrameData";
import { SelectedObject } from "@/types/selection";
import { useMutation } from "@tanstack/react-query";
import { getObjectData } from "@/lib/api/getObjectData";
import { linkObjects } from "@/lib/api/linkObjects";

type SelectedObjectProps = {
  selectedObjects: SelectedObject[];
  setSelectedObjects: React.Dispatch<React.SetStateAction<SelectedObject[]>>;
};

export default function Sidebar({
  selectedObjects,
  setSelectedObjects,
}: SelectedObjectProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Custom hook to detect sessionStorage changes
  const useSessionStorage = (key: string) => {
    const [value, setValue] = useState<string | null>(
      sessionStorage.getItem(key)
    );

    useEffect(() => {
      const handleStorageChange = () => {
        const newValue = sessionStorage.getItem(key);
        setValue(newValue);
      };

      window.addEventListener("storage", handleStorageChange);

      const interval = setInterval(() => {
        const newValue = sessionStorage.getItem(key);
        if (newValue !== value) {
          setValue(newValue);
          console.log(`${key} changed to:`, newValue);
        }
      }, 100);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
        clearInterval(interval);
      };
    }, [key, value]);

    return value;
  };

  const videoId = useSessionStorage("videoId");
  const frameId = useSessionStorage("frameId");
  const projectName = useSessionStorage("project_name");
  const videoName = useSessionStorage("video_name");
  const trkFileName = useSessionStorage("trk_file_name");
  const totalFrames = useSessionStorage("totalFrames");

  const { data, isLoading, error } = useQuery({
    queryKey: ["frameData", videoId, frameId],
    queryFn: () => getFrameData(Number(videoId!), Number(frameId!)),
    enabled: !!(videoId && frameId),
    staleTime: 0,
  });


const linkMutation = useMutation({
  mutationFn: (formData: FormData) =>
    linkObjects(Number(videoId), formData),
  onSuccess: () => {
    alert("Objects linked successfully!");
  },
  onError: (err: any) => {
    alert("Failed to link objects: " + err.message);
  },
});



  // Reset expansions & log on frame change
  useEffect(() => {
    if (data) {
      setExpandedIds(new Set());
      console.log(
        `Frame ${frameId}: ${data.objects?.length || 0} objects loaded`
      );
      console.log(
        "Sample coordinates (Object 0):",
        data.objects?.[0]?.coordinates?.slice(0, 2)
      );
      setInitialLoadComplete(true);
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

  // Fixed height container to prevent layout shift
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

    if (!data?.objects || data.objects.length === 0) {
      return (
        <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg">
          <p className="text-[#5A5A5A] text-[13px]">
            No objects found for frame {frameId}
          </p>
        </div>
      );
    }

    return (
      <div className="h-[350px] overflow-y-auto space-y-3 pr-2">
        {data.objects.map((obj: any, index: number) => {
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
                    Object {index + 1}: Fly
                  </span>
                </div>
                <span className="text-[#A2A2A2] font-medium text-[13px] leading-[13px]">
                  ID {obj.object_id}
                  {isExpanded ? " ▼" : " ►"}
                </span>
              </div>

              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-[#5A5A5A] text-[13px] font-medium mb-2">
                    object: {obj.object_id + 1} Coordinates
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="border rounded-[7px] text-sm">
      <CardHeader className="flex flex-row items-center gap-3 p-3 pb-0">
        <div className="bg-[#D9D9D9] h-10 w-10 rounded" />
        <div>
          <h2 className="text-[#595959] text-[16px] font-medium">
            Animal Annotation
          </h2>
          <p className="text-[#9F9F9F] text-[12px]">PROJECT</p>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-2"></span>
          <span className="text-[#404040] text-[13px]">{videoName}</span>
        </div>
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></span>
          <span className="text-[#404040] text-[13px]">{trkFileName}</span>
        </div>
      </CardContent>

      <Separator />

      <CardContent className="p-3 pt-2 flex-shrink-0">
        <div className="p-4 border-l w-64 bg-gray-50 h-full border rounded-[7px]">
          {/* title + clear button side-by-side */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Selected Objects</h2>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setSelectedObjects([])}
              disabled={selectedObjects.length === 0}>
              Clear
            </Button>
          </div>

          {/* when empty */}
          {selectedObjects.length === 0 && <p>No object selected</p>}

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
                onClick={() =>
                  setSelectedObjects((prev) =>
                    prev.filter((o) => o.object_id !== obj.object_id)
                  )
                }
                className="text-red-500 font-bold text-lg hover:text-red-700 ml-2">
                ×
              </button>
            </div>
          ))}
        </div>
      </CardContent>

      <CardContent className="flex justify-center gap-2 p-3 pt-0 ">
        <Button className="bg-[#4B84EE] border-[2px] text-white text-[13px] px-3 py-2 border rounded-[7px] flex items-center gap-1 hover:bg-[#4B84EE]">
          <Image src="/images/swap.svg" alt="Swap" width={15} height={15} />{" "}
          Swap
        </Button>
        <Button className="bg-[#DD524C] text-white border-[2px] text-[13px] px-3 py-2 border rounded-[7px] flex items-center gap-1 hover:bg-[#DD524C]">
          <Image src="/images/break.svg" alt="Break" width={15} height={15} />{" "}
          Break
        </Button>
        <Button
          className="bg-[#5EC16A] border-[2px] text-white text-[13px] px-3 py-2 border rounded-[7px] flex items-center gap-1 hover:bg-[#5EC16A]"
          disabled={selectedObjects.length !== 2}
          onClick={() => {
            if (selectedObjects.length !== 2) {
              alert("Please select exactly 2 objects to link");
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
          }}>
          <Image src="/images/link.svg" alt="Link" width={15} height={15} />{" "}
          Link
        </Button>
      </CardContent>

      <Separator />

      <CardContent className="p-3 pt-2 flex-shrink-0">
        <p className="text-[#494949] text-[13px] leading-[13px] font-medium pt-2 pb-2">
          Frame #{frameId}
        </p>
        <p className="text-[#5A5A5A] text-[13px] leading-[13px] font-medium pb-2">
          Frame: {frameId} / {totalFrames}
        </p>
        {/* <p className="text-[#5A5A5A] text-[13px] leading-[13px] font-medium">
          Time: 00:04:16 | FPS: 30
        </p> */}
      </CardContent>

      <Separator />

      <CardContent className="p-3 flex-1 flex flex-col">
        {" "}
        {/* Flexible container for objects */}
        <p className="text-[#494949] text-[13px] leading-[13px] pt-2 pb-3 font-medium flex-shrink-0">
          Objects ({data?.objects?.length || 0})
        </p>
        {renderObjectsSection()}
      </CardContent>
    </Card>
  );
}
