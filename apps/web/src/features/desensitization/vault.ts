export type Collection = {
  id: string;
  name: string;
  created: string;
  mapping: Record<string, string>;
};

export const VAULT_KEY = "nl-desens-vault-v2";
const LEGACY_KEY = "nl-desens-kv-v4";

function cleanMapping(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key, text]) => /^<[^<>\r\n]+>$/.test(key) && typeof text === "string"),
  );
}

export function parseVault(raw: string | null): Collection[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.name !== "string") return [];
      const mapping = cleanMapping(item.mapping);
      return Object.keys(mapping).length ? [{ id: item.id, name: item.name, created: typeof item.created === "string" ? item.created : "", mapping }] : [];
    });
  } catch { return []; }
}

export function parseLegacyVault(raw: string | null): Collection[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value?.collections)) return [];
    return value.collections.flatMap((item: { id?: string; name?: string; created?: string; pairs?: { token?: string; key?: string; value?: string }[] }) => {
      if (!item.id || !item.name || !Array.isArray(item.pairs)) return [];
      const mapping = cleanMapping(Object.fromEntries(item.pairs.filter((pair) => typeof pair.value === "string").map((pair) => [pair.token || `<${pair.key}>`, pair.value])));
      return Object.keys(mapping).length ? [{ id: item.id, name: item.name, created: item.created || "", mapping }] : [];
    });
  } catch { return []; }
}

export function loadVault(): Collection[] {
  try {
    const current = localStorage.getItem(VAULT_KEY);
    return current === null ? parseLegacyVault(localStorage.getItem(LEGACY_KEY)) : parseVault(current);
  } catch { return []; }
}

export function saveVault(collections: Collection[]): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(collections));
}
