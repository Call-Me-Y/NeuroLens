import { create } from "zustand";
import type { Version } from "../data/demo";
import { persistRecords, readRecords, type RunRecord, type RunStatus } from "../services/runRecords";
type State = {
  model: string;
  version: Version;
  method: string;
  layer: number;
  selectedSample: string | null;
  selectedNeuron: number | null;
  tasks: RunRecord[];
  notice: string;
  compact: boolean;
  set: (v: Partial<State>) => void;
  notify: (s: string) => void;
  addTask: (t: RunRecord) => void;
  updateTask: (id: string, status: RunStatus) => void;
  mergeTasks: (records: RunRecord[]) => void;
};
export const useApp = create<State>((set) => ({
  model: "qwen",
  version: "baseline",
  method: "全部方法",
  layer: 17,
  selectedSample: null,
  selectedNeuron: null,
  tasks: readRecords(),
  notice: "",
  compact: localStorage.getItem("nl-compact") === "true",
  set,
  notify: (notice) => set({ notice }),
  addTask: (t) => set((s) => {
    const tasks = [t, ...s.tasks.filter((item) => item.id !== t.id)];
    persistRecords(tasks);
    return { tasks };
  }),
  updateTask: (id, status) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === id ? { ...t, status } : t));
      persistRecords(tasks);
      return { tasks };
    }),
  mergeTasks: (records) => set((s) => {
    const known = new Set(s.tasks.map((item) => item.id));
    const additions = records.filter((item) => !known.has(item.id));
    if (!additions.length) return s;
    const tasks = [...s.tasks, ...additions].sort((a, b) => Date.parse(b.createdAt || b.date) - Date.parse(a.createdAt || a.date));
    persistRecords(tasks);
    return { tasks };
  }),
}));
