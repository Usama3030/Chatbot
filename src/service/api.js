const API = import.meta.env.VITE_API_URL;

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");
  return res.json();
};

export const fetchFiles = async () => {
  const res = await fetch(`${API}/api/files`);
  if (!res.ok) throw new Error("Failed to fetch files");
  return res.json();
};

export const selectFile = async (filename) => {
  const res = await fetch(`${API}/api/select-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });

  if (!res.ok) throw new Error("Failed to select file");
  return res.json();
};



export const sendChatMessage = async (question) => {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat/csv/groq`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
};
