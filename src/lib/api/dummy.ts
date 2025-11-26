
const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT

export const dummyApiCall = async () => {
  // const response = await fetch(`${API_BASE}/api/v1/dummy`)
  // const response = await fetch("/api/dummy"); // GET request
  // if (!response.ok) throw new Error("Dummy API failed");
  // return response.json();

  return new Promise((resolve) => {
    console.log("Dummy API called!");
    setTimeout(() => resolve({ message: "ok" }), 500);
  });
};