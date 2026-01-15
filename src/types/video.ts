import React from "react";
import { SelectedObject } from "./selection";

/* Frames */
export type Frame = {
  index: number;
  src: string;
};

/* Annotations */
export type Annotation = {
  object_id: number;
  frame_id: number;
  coordinates: [number, number][];
};

/* Trajectory */
export type TrajectoryFrame = {
  frame_id: number;
  object_id: number;
  coordinate: [number, number];
};

export type TrajectoryMap = Map<number, Map<number, [number, number]>>;

/* Props */
export type SelectedObjectProps = {
  selectedObjects: SelectedObject[];
  setSelectedObjects: React.Dispatch<
    React.SetStateAction<SelectedObject[]>
  >;
};
