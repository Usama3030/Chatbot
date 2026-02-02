import { useEffect, useRef, useState } from "react";
import { useChatStore } from "./stores/ChatStore";
import { sendChatMessage } from "./service/api";
import DatasetModal from "./DatasetModal";

export default function Chatbot() {
  const { messages, addMessage, resetMessages } = useChatStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDatasetModal, setShowDatasetModal] = useState(true);
  const [activeFile, setActiveFile] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages, loading]);

  // Function to download data as CSV
  const downloadCSV = (data, filename = "data.csv") => {
    if (!data || data.length === 0) return;

    // Get headers from first object
    const headers = Object.keys(data[0]);

    // Create CSV content
    const csvContent = [
      headers.join(","), // Header row
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            // Handle values with commas or quotes
            if (value === null || value === undefined) return "";
            const stringValue = String(value);
            if (
              stringValue.includes(",") ||
              stringValue.includes('"') ||
              stringValue.includes("\n")
            ) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(",")
      ),
    ].join("\n");

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Component to render formatted results - NOT stored in state
  const FormattedResult = ({ result }) => {
    if (!result || result.length === 0) {
      return <span>No data found.</span>;
    }

    const validResults = result.filter((row) => {
      return Object.values(row).some(
        (val) => val !== null && val !== undefined && val !== ""
      );
    });

    if (validResults.length === 0) {
      return <span>No data found.</span>;
    }

    // Single row - key-value pairs
    if (validResults.length === 1) {
      const row = validResults[0];
      return (
        <div style={styles.resultContainer}>
          {Object.entries(row).map(([key, value]) => (
            <div key={key} style={styles.resultRow}>
              <span style={styles.resultKey}>{key}:</span>
              <span style={styles.resultValue}>
                {typeof value === "number" ? value.toLocaleString() : value}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // Multiple rows - table
    const headers = Object.keys(validResults[0]);
    return (
      <div>
        <div style={styles.tableHeader}>
          <span style={styles.tableTitle}>
            Results ({validResults.length} rows)
          </span>
          <button
            onClick={() => downloadCSV(validResults, "incident_data.csv")}
            style={styles.downloadButton}
            title="Download as CSV"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: "0.3rem" }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download CSV
          </button>
        </div>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} style={styles.th}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validResults.map((row, idx) => (
                <tr
                  key={idx}
                  style={idx % 2 === 0 ? styles.trEven : styles.trOdd}
                >
                  {headers.map((header) => (
                    <td key={header} style={styles.td}>
                      {typeof row[header] === "number"
                        ? row[header].toLocaleString()
                        : row[header] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (!activeFile) {
      setError("Please select a dataset first.");
      return;
    }

    const userMessage = { role: "user", text: trimmed };
    addMessage(userMessage);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await sendChatMessage(trimmed);

      // Store RAW data, not JSX
      const assistantMessage = {
        role: "assistant",
        data: response?.result || null,
        text: response?.result ? null : "No results returned from the query.",
      };
      addMessage(assistantMessage);
    } catch (err) {
      console.error(err);
      setError(
        "Failed to reach the chatbot backend. Make sure the server is running."
      );
      addMessage({
        role: "assistant",
        text: "Cannot answer reliably. Please check if the backend server is running.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    resetMessages();
    setError(null);
    setInput("");
  };

  {!activeFile && (
    <div style={styles.chatWindow}>
      <div style={styles.placeholderWrapper}>
        <p>Please select or upload a dataset to start.</p>
      </div>
    </div>
  )}
  

  return (
    <div style={styles.page}>
   <DatasetModal
        open={showDatasetModal}
        onClose={() => setShowDatasetModal(false)}
        onSelected={(file) => {
          setActiveFile(file);
          setShowDatasetModal(false);
        }}
      />
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Excel Incident Analytics Chatbot</h1>
            <p style={styles.subtitle}>
              Ask natural-language questions on your incident data.
            </p>
            {activeFile && (
              <p style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Active file: <strong>{activeFile}</strong>
              </p>
            )}
          </div>
          

          <div style={styles.headerRight}>
            {/* <div style={styles.statusPill}>
              <span style={styles.statusDot} />
              <span>Online</span>
            </div> */}
             <button
              onClick={() => setShowDatasetModal(true)}
              style={styles.resetButton}
            >
              Dataset
            </button>
            <button
              onClick={handleReset}
              style={styles.resetButton}
              title="Clear chat history"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Reset
            </button>
          </div>
        </header>

        <div style={styles.chatWindow}>
          {messages.length === 0 && (
            <div style={styles.placeholderWrapper}>
              <p style={styles.placeholderTitle}>Try asking things like:</p>
              <ul style={styles.placeholderList}>
                <li>"Which region has the highest total cost?"</li>
                <li>"Show me all incidents from Karachi Plant"</li>
                <li>"How many incidents are recordable?"</li>
                <li>"What are the top 5 most expensive incidents?"</li>
              </ul>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                ...styles.messageRow,
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  ...styles.messageBubble,
                  ...(msg.role === "user"
                    ? styles.userBubble
                    : styles.assistantBubble),
                }}
              >
                <div style={styles.messageMeta}>
                  <span style={styles.messageAuthor}>
                    {msg.role === "user" ? "You" : "Bot"}
                  </span>
                </div>
                <div>
                  {msg.role === "user" ? (
                    msg.text
                  ) : msg.data ? (
                    <FormattedResult result={msg.data} />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ ...styles.messageRow, justifyContent: "flex-start" }}>
              <div
                style={{ ...styles.messageBubble, ...styles.assistantBubble }}
              >
                <div style={styles.typingDots}>
                  <span style={styles.dot} />
                  <span style={styles.dot} />
                  <span style={styles.dot} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div style={styles.inputForm}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your Excel incident data..."
            style={styles.input}
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            style={styles.button}
            disabled={loading || !input.trim()}
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    padding: "2rem 1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(circle at top left, #e0f2fe 0, #f9fafb 40%, #e5e7eb 100%)",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: "100%",
    maxWidth: "960px",
    height: "min(80vh, 720px)",
    backgroundColor: "#ffffff",
    borderRadius: "1.25rem",
    padding: "1.5rem",
    boxShadow:
      "0 18px 45px rgba(15, 23, 42, 0.20), 0 0 0 1px rgba(148, 163, 184, 0.25)",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(148, 163, 184, 0.35)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    paddingBottom: "0.75rem",
    marginBottom: "0.75rem",
    borderBottom: "1px solid #e5e7eb",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  title: {
    fontSize: "1.4rem",
    fontWeight: 600,
    margin: 0,
    color: "#0f172a",
  },
  subtitle: {
    margin: "0.15rem 0 0",
    fontSize: "0.9rem",
    color: "#64748b",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.2rem 0.7rem",
    borderRadius: "999px",
    backgroundColor: "#ecfdf3",
    color: "#166534",
    fontSize: "0.8rem",
    border: "1px solid #bbf7d0",
    whiteSpace: "nowrap",
  },
  statusDot: {
    width: "0.5rem",
    height: "0.5rem",
    borderRadius: "999px",
    backgroundColor: "#22c55e",
    boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.35)",
  },
  resetButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.4rem 0.85rem",
    borderRadius: "999px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: "0.8rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
    whiteSpace: "nowrap",
  },
  chatWindow: {
    flex: 1,
    borderRadius: "0.9rem",
    padding: "1rem",
    marginTop: "0.25rem",
    marginBottom: "0.75rem",
    overflowY: "auto",
    background:
      "linear-gradient(145deg, #f9fafb 0, #f1f5f9 25%, #f9fafb 60%, #eef2ff 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
    border: "1px solid rgba(148, 163, 184, 0.35)",
  },
  messageRow: {
    display: "flex",
    marginBottom: "0.65rem",
  },
  messageBubble: {
    maxWidth: "85%",
    padding: "0.55rem 0.75rem",
    borderRadius: "0.9rem",
    fontSize: "0.9rem",
    lineHeight: 1.4,
    boxShadow: "0 10px 25px rgba(15,23,42,0.05)",
  },
  userBubble: {
    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
    color: "#ffffff",
    borderBottomRightRadius: "0.25rem",
  },
  assistantBubble: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    color: "#0f172a",
    borderBottomLeftRadius: "0.25rem",
    border: "1px solid rgba(148, 163, 184, 0.45)",
  },
  messageMeta: {
    fontSize: "0.75rem",
    fontWeight: 500,
    marginBottom: "0.2rem",
    opacity: 0.75,
  },
  messageAuthor: {
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  placeholderWrapper: {
    maxWidth: "480px",
    margin: "0.5rem auto 0",
    padding: "0.85rem 1rem",
    borderRadius: "0.85rem",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    border: "1px dashed rgba(148, 163, 184, 0.8)",
    color: "#475569",
    fontSize: "0.9rem",
  },
  placeholderTitle: {
    margin: "0 0 0.35rem",
    fontWeight: 600,
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#94a3b8",
  },
  placeholderList: {
    margin: 0,
    paddingLeft: "1.1rem",
  },
  typingDots: {
    display: "inline-flex",
    gap: "0.25rem",
    alignItems: "center",
  },
  dot: {
    width: "0.28rem",
    height: "0.28rem",
    borderRadius: "999px",
    backgroundColor: "#6b7280",
    animation: "typing 1s infinite ease-in-out",
  },
  inputForm: {
    display: "flex",
    gap: "0.6rem",
    marginTop: "0.25rem",
  },
  input: {
    flex: 1,
    padding: "0.6rem 0.85rem",
    borderRadius: "999px",
    border: "1px solid #cbd5f5",
    outline: "none",
    fontSize: "0.9rem",
    backgroundColor: "#f9fafb",
    boxShadow:
      "0 0 0 1px rgba(148, 163, 184, 0.15), inset 0 1px 0 rgba(255,255,255,0.9)",
  },
  button: {
    padding: "0.6rem 1.4rem",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, #4f46e5, #2563eb)",
    color: "#ffffff",
    fontWeight: 500,
    fontSize: "0.9rem",
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(37, 99, 235, 0.35)",
    whiteSpace: "nowrap",
  },
  error: {
    marginTop: "0.6rem",
    color: "#b91c1c",
    fontSize: "0.85rem",
    backgroundColor: "#fef2f2",
    borderRadius: "0.75rem",
    padding: "0.45rem 0.75rem",
    border: "1px solid #fecaca",
  },
  resultContainer: {
    marginTop: "0.5rem",
  },
  resultRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.3rem",
    fontSize: "0.9rem",
  },
  resultKey: {
    fontWeight: 600,
    color: "#475569",
    minWidth: "120px",
  },
  resultValue: {
    color: "#0f172a",
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
    paddingBottom: "0.4rem",
    borderBottom: "1px solid #e5e7eb",
  },
  tableTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  downloadButton: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.35rem 0.65rem",
    borderRadius: "0.5rem",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
  },
  tableWrapper: {
    marginTop: "0.5rem",
    overflowX: "auto",
    maxWidth: "100%",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.85rem",
    minWidth: "400px",
  },
  th: {
    backgroundColor: "#f1f5f9",
    padding: "0.5rem",
    textAlign: "left",
    fontWeight: 600,
    color: "#475569",
    borderBottom: "2px solid #cbd5e1",
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  td: {
    padding: "0.5rem",
    borderBottom: "1px solid #e2e8f0",
    color: "#0f172a",
  },
  trEven: {
    backgroundColor: "#ffffff",
  },
  trOdd: {
    backgroundColor: "#f8fafc",
  },
};
