export type RunKind = "神经元分析" | "API 安全评测" | "提示词脱敏";
export type RunStatus = "运行中" | "已完成" | "失败" | "已取消";
export type RunRecord = {
  id: string;
  kind: RunKind;
  name: string;
  status: RunStatus;
  date: string;
  createdAt?: string;
  model: string;
  count: number;
  config: Record<string, unknown>;
  runId?: string;
};
const KEY = "nl-run-records-v1";
export const workspaceFor = (record: RunRecord) => record.kind === "神经元分析" ? "/analysis" : record.kind === "API 安全评测" ? "/api-safety" : "/desensitization";
export const recordUrl = (record: RunRecord) => `${workspaceFor(record)}?record=${encodeURIComponent(record.id)}`;
export function readRecords(): RunRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && typeof item.kind === "string" && item.config && typeof item.config === "object") : [];
  } catch { return []; }
}
export function persistRecords(records: RunRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(records));
}
const DB = "neurolens-local-records";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("payloads");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savePayload(id: string, payload: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("payloads", "readwrite");
      tx.objectStore("payloads").put(payload, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function loadPayload<T>(id: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction("payloads", "readonly").objectStore("payloads").get(id);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
