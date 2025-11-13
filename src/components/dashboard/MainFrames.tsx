import { Card } from "@/components/ui/card"
import Image from "next/image"
import { Button } from "@/components/ui/Button"
import JsonTrajectory from "@/components/dashboard/JsonTrajectory";
export function MainFrames() {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      {/* <Card className="flex items-center justify-between px-3 py-3 border rounded-[7px]">
        <p className="text-[13px] font-medium">Animal_annotation_recording_mp4</p>
        <div className="flex items-center gap-4">
          <span className="text-xs">1200×720</span>
          <Button variant="outline" size="sm" className="flex items-center text-xs rounded px-2 py-0 hover:bg-[white]">
            75%
            <Image src="/images/downArrow.svg" alt="Down Arrow" width={10} height={7} className="opacity-80" />
          </Button>
        </div>
      </Card> */}
      <JsonTrajectory/>
    </div>
  );
}
