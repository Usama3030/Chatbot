import { persistZustandStore } from "../utils/persistZustandStore";

export const useChatStore = persistZustandStore(
  (set) => ({
    selectedId: "",
    setSelectedId: (selectedId) => {
      set({ selectedId });
    },
    messages: [],
    addMessage: (msg) =>
      set((state) => ({ messages: [...state.messages, msg] })),
    resetMessages: () => set({ messages: [] }),
  }),
  "chat",
  ["messages"]
);
