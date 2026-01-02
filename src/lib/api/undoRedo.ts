const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const undoAction = async (projectId: number) => {
  const res = await fetch(`${API_BASE}/api/v1/videos/undo/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project_id: projectId,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to undo");
  }

  return res.json();
};

export const redoAction = async (projectId: number) => {
  const res = await fetch(`${API_BASE}/api/v1/videos/redo/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project_id: projectId,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to redo");
  }

  return res.json();
};
