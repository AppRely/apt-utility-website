const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

export const exportTrk = async (projectId: number) => {
    const res = await fetch(`${API_BASE}/api/v1/videos/${projectId}/delete-project/`, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify({
        project_id: projectId,
        }),
    });

    if (!res.ok) {
        throw new Error("Failed to Delete Project");
    }

    return res.json();
};