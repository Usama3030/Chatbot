import { useEffect, useState } from "react";
import { fetchFiles, uploadFile, selectFile } from "./service/api";

export default function DatasetModal({ open, onClose, onSelected }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchFiles().then((res) => setFiles(res.files));
  }, [open]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    await uploadFile(file);
    const res = await fetchFiles();
    setFiles(res.files);
    setUploading(false);
  };

  const handleSelect = async (filename) => {
    setLoading(true);
    await selectFile(filename);
    setLoading(false);
    onSelected(filename);
    onClose();
  };

  if (!open) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Modal Header */}
        <div style={header}>
          <h2 style={title}>Select Dataset</h2>
          <button style={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* File Upload */}
        <div style={uploadContainer}>
          <input
            type="file"
            onChange={handleUpload}
            style={fileInput}
            id="datasetFileInput"
          />
          <label htmlFor="datasetFileInput" style={uploadLabel}>
            {uploading ? "Uploading…" : "Click or Drag to Upload File"}
          </label>
        </div>

        {/* File List */}
        <div style={fileList}>
          {files.map((f) => (
            <button
              key={f.filename}
              onClick={() => handleSelect(f.filename)}
              style={fileBtn}
            >
              {f.filename}
            </button>
          ))}
          {files.length === 0 && !uploading && (
            <p style={{ textAlign: "center", color: "#555" }}>No files available</p>
          )}
        </div>

        {/* Loading */}
        {loading && <p style={loadingText}>Loading…</p>}
      </div>
    </div>
  );
}

/* Inline Styles */
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modal = {
  background: "#fff",
  borderRadius: 12,
  width: 400,
  maxWidth: "90%",
  padding: 24,
  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const title = {
  margin: 0,
  fontSize: 18,
  fontWeight: "600",
  color: "#222",
};

const closeBtn = {
  background: "none",
  border: "none",
  fontSize: 20,
  cursor: "pointer",
  color: "#555",
};

const uploadContainer = {
  marginBottom: 16,
};

const fileInput = {
  display: "none",
};

const uploadLabel = {
  display: "block",
  width: "96%",
  padding: "12px 8px",
  textAlign: "center",
  border: "2px dashed #ccc",
  borderRadius: 8,
  cursor: "pointer",
  color: "#555",
  transition: "all 0.2s",
};

const fileList = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginBottom: 16,
  maxHeight: 200,
  overflowY: "auto",
};

const fileBtn = {
  display: "block",
  width: "100%",
  padding: "8px 12px",
  background: "#f4f4f4",
  border: "1px solid #ccc",
  borderRadius: 6,
  cursor: "pointer",
  textAlign: "left",
  fontSize: 14,
  transition: "background 0.2s",
};

const loadingText = {
  textAlign: "center",
  color: "#555",
};
