"use client";

import React, {
  useState,
  useEffect,
} from "react";

import { Card }
from "@/components/ui/card";

import { Button }
from "@/components/ui/Button";

import {
  getConfusionTable,
} from "@/lib/api/getConfusionTable";

interface Props {

  open: boolean;

  onClose: () => void;

  projectId: number | null;

  currentFrame: number;

  handleFrameJump: (
    frame: number
  ) => Promise<void>;
}

export default function
ConfusionTableModal({

  open,
  onClose,
  projectId,
  currentFrame,
  handleFrameJump,

}: Props) {

  // =====================================
  // STATES
  // =====================================

  const [rows, setRows] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [loadedWindow, setLoadedWindow] =
      useState<number | null>(null);
  // =====================================
  // DRAG STATES
  // =====================================

  const [position, setPosition] =
    useState({
      x: 250,
      y: 100,
    });

  const [dragging, setDragging] =
    useState(false);

  const [offset, setOffset] =
    useState({
      x: 0,
      y: 0,
    });

  // =====================================
  // RESIZE STATES
  // =====================================

  const [size, setSize] =
    useState({
      width: 1000,
      height: 650,
    });

  const [resizing, setResizing] =
    useState(false);

  // =====================================
  // FETCH API
  // =====================================

  const fetchConfusion =
    async () => {

    if (!projectId) return;

    try {

      setLoading(true);

      setError("");

      const currentWindow =
        Math.floor(
          currentFrame / 300
        );

      const startFrame =
        currentWindow * 300;

      const endFrame =
        startFrame + 299;

      const response =
        await getConfusionTable(
          projectId,
          startFrame,
          endFrame
        );

      setRows(
        response.data.rows || []
      );

    } catch (err) {

      console.error(
        "Confusion API Error",
        err
      );

      setError(
        "Failed to fetch confusion table"
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================
  // AUTO FETCH
  // =====================================

  useEffect(() => {

    if (!open || !projectId) {
      return;
    }

    // =====================================
    // CURRENT 300 FRAME WINDOW
    // =====================================

    const currentWindow =
      Math.floor(
        currentFrame / 300
      );

    // =====================================
    // PREVENT CONTINUOUS API CALLS
    // =====================================

    if (
      loadedWindow === currentWindow
    ) {
      return;
    }

    // =====================================
    // SAVE CURRENT WINDOW
    // =====================================

    setLoadedWindow(
      currentWindow
    );

    // =====================================
    // FETCH API
    // =====================================

    fetchConfusion();

  }, [
    open,
    currentFrame,
    projectId,
    loadedWindow,
  ]);

  // =====================================
  // DRAG + RESIZE
  // =====================================

  useEffect(() => {

    const handleMove =
      (e: MouseEvent) => {

      if (dragging) {

        setPosition({
          x:
            e.clientX - offset.x,

          y:
            e.clientY - offset.y,
        });
      }

      if (resizing) {

        setSize({
          width: Math.max(
            700,
            e.clientX - position.x
          ),

          height: Math.max(
            400,
            e.clientY - position.y
          ),
        });
      }
    };

    const handleUp = () => {

      setDragging(false);

      setResizing(false);
    };

    window.addEventListener(
      "mousemove",
      handleMove
    );

    window.addEventListener(
      "mouseup",
      handleUp
    );

    return () => {

      window.removeEventListener(
        "mousemove",
        handleMove
      );

      window.removeEventListener(
        "mouseup",
        handleUp
      );
    };

  }, [
    dragging,
    resizing,
    offset,
    position,
  ]);

  if (!open) return null;

  // =====================================
  // WINDOW RANGE
  // =====================================

  const currentWindow =
    Math.floor(
      currentFrame / 300
    );

  const startFrame =
    currentWindow * 300;

  const endFrame =
    startFrame + 299;

  // =====================================
  // UI
  // =====================================

  return (

    <div
      className="fixed z-50"

      style={{
        top: position.y,
        left: position.x,
      }}
    >

      <Card
        className="
          bg-white
          p-3
          rounded-xl
          shadow-xl
          flex
          flex-col
          relative
        "

        style={{
          width: size.width,
          height: size.height,
        }}
      >

        {/* HEADER */}

        <div
          className="
            flex
            justify-between
            items-center
            mb-2
            bg-gray-100
            p-2
            rounded
            border
            cursor-move
          "

          onMouseDown={(e) => {

            setDragging(true);

            setOffset({
              x:
                e.clientX - position.x,

              y:
                e.clientY - position.y,
            });
          }}
        >

          <div className="w-full">

            {/* ===================================== */}
            {/* TITLE */}
            {/* ===================================== */}

            <div className="
              text-center
              mb-2
            ">

              <h2 className="
                text-lg
                font-bold
                tracking-wide
                text-gray-800
              ">

                Object Matching Uncertainty

              </h2>

              <p className="
                text-xs
                text-gray-500
              ">

                Confusion / Tracking Analysis

              </p>

            </div>

            {/* ===================================== */}
            {/* FRAME INFO TABLE */}
            {/* ===================================== */}

            <div className="
              border
              rounded-md
              overflow-hidden
            ">

              <table className="
                w-full
                text-xs
                border-collapse
              ">

                <tbody>

                  <tr>

                    <td className="
                      border
                      px-3
                      py-2
                      font-semibold
                      bg-gray-100
                      w-40
                    ">

                      Start Frame

                    </td>

                    <td className="
                      border
                      px-3
                      py-2
                      font-medium
                    ">

                      {startFrame}

                    </td>

                  </tr>

                  <tr>

                    <td className="
                      border
                      px-3
                      py-2
                      font-semibold
                      bg-gray-100
                    ">

                      End Frame

                    </td>

                    <td className="
                      border
                      px-3
                      py-2
                      
                      font-medium
                    ">

                      {endFrame}

                    </td>

                  </tr>
                  <tr>
                     <td className="
                        border
                        px-3
                        py-2
                        font-semibold
                        bg-gray-100
                        ">
                        Total Rows
                      </td>
                      <td className="
                          border
                          px-3
                          py-2
                          font-medium
                          ">
                        {rows.length}
                        
                      </td>
                  </tr>

                </tbody>

              </table>

            </div>

          </div>

          {/* ===================================== */}
          {/* CLOSE BUTTON */}
          {/* ===================================== */}

          <Button
              onClick={onClose}

              size="sm"

              className="
                absolute
                top-4
                right-4
                z-50

                bg-black
                hover:bg-gray-900

                text-white

                shadow-md

                border
                border-gray-700

                rounded-md
              "
            >
              Close
          </Button>

        </div>

        {/* ERROR */}

        {error && (

          <div className="
            mb-2
            bg-red-100
            border
            border-red-300
            text-red-700
            text-xs
            p-2
            rounded
          ">

            {error}

          </div>

        )}

        {/* TABLE */}

        <div className="
          border
          rounded
          overflow-hidden
          flex
          flex-col
          flex-1
        ">

          <div className="
            bg-gray-200
            sticky
            top-0
            z-10
          ">

            <table className="
              w-full
              text-xs
              border-collapse
            ">

              <thead>

                <tr>

                  <th className="border px-2 py-1">
                    Frame
                  </th>

                  <th className="border px-2 py-1">
                    Object
                  </th>

                  <th className="border px-2 py-1">
                    Best
                  </th>

                  <th className="border px-2 py-1">
                    Second
                  </th>

                  <th className="border px-2 py-1">
                    Uncertainty
                  </th>

                </tr>

              </thead>

            </table>

          </div>

          <div className="
            overflow-y-auto
            flex-1
          ">

            {loading ? (

              <p className="
                text-center
                py-4
              ">
                Loading...
              </p>

            ) : (

              <table className="
                w-full
                text-xs
                border-collapse
              ">

                <tbody>

                  {rows.map(
                    (
                      row,
                      idx
                    ) => (

                    <tr
                      key={idx}

                      onClick={() =>
                        handleFrameJump(
                          row.frame
                        )
                      }

                      className={`
                        cursor-pointer

                        ${
                          row.uncertainty > 0.8
                            ? "bg-red-200"

                          : row.uncertainty > 0.5
                            ? "bg-yellow-100"

                          : "hover:bg-blue-100"
                        }
                      `}
                    >

                      <th className="border px-2 py-1">
                        {row.frame}
                      </th>

                      <th className="border px-2 py-1">
                        {row.object_id}
                      </th>

                      <th className="border px-2 py-1">
                        {row.best_match}
                      </th>

                      <th className="border px-2 py-1">
                        {row.second_match}
                      </th>

                      <th className="
                        border
                        px-2
                        py-1
                        font-bold
                      ">
                        {row.uncertainty}
                      </th>

                    </tr>

                  ))}

                </tbody>

              </table>

            )}

          </div>

        </div>

        {/* RESIZE */}

        <div
          className="
            absolute
            bottom-1
            right-1
            w-4
            h-4
            cursor-se-resize
            bg-gray-400
            rounded
          "

          onMouseDown={() =>
            setResizing(true)
          }
        />

      </Card>

    </div>
  );
}