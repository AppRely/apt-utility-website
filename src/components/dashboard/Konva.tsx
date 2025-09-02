"use client"; 

import React, { useRef, useEffect } from "react";
import { Stage, Layer, Circle, Line } from "react-konva";

const Konva= () => {
  const stageRef = useRef(null);

  return (
    <div>
        <Stage width={800} height={600} ref={stageRef}>
      <Layer>
        <Circle x={100} y={100} radius={50} fill="red" />
        <Line
          points={[150, 150, 300, 300]}
          stroke="blue"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />
      </Layer>
    </Stage>
    </div>
  );
};

export default Konva;
