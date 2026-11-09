export type Match = {
  start: number;
  end: number;
  value: string;
  type: string;
  replacement: string;
};
export type Redacted = {
  text: string;
  matches: Match[];
  mapping: Record<string, string>;
};
export type NerEntity = { start: number; end: number; label: string; type: string; text: string };
export async function detectEntities(text: string): Promise<NerEntity[]> {
  const response = await fetch("/api/v1/ner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "本地姓名与地址模型不可用");
  if (!Array.isArray(data.entities)) throw new Error("姓名与地址模型返回的数据无效");
  const offsets = [0];
  for (const char of text) offsets.push(offsets[offsets.length - 1] + char.length);
  return data.entities.flatMap((entity: NerEntity) => {
    if (!Number.isInteger(entity.start) || !Number.isInteger(entity.end) || entity.start < 0 || entity.end > offsets.length - 1 || entity.start >= entity.end || !["姓名", "地址"].includes(entity.type)) return [];
    const start = offsets[entity.start], end = offsets[entity.end];
    return [{ ...entity, start, end, text: text.slice(start, end) }];
  });
}
export function redact(
  text: string,
  enabled: string[],
  custom: string,
  entities: NerEntity[] = [],
): Redacted {
  const candidates: {
    start: number;
    end: number;
    value: string;
    type: string;
  }[] = [];
  const patterns: Record<string, RegExp> = {
    电话: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    邮箱: /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,
    身份证: /(?<!\d)\d{17}[\dXx](?!\d)/g,
  };
  for (const [type, re] of Object.entries(patterns)) {
    if (!enabled.includes(type)) continue;
    for (const m of text.matchAll(re))
      candidates.push({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        type,
      });
  }
  for (const entity of entities) {
    if (!enabled.includes(entity.type) || entity.start < 0 || entity.end > text.length || entity.start >= entity.end) continue;
    if (candidates.some((c) => entity.start < c.end && c.start < entity.end)) continue;
    candidates.push({ start: entity.start, end: entity.end, value: text.slice(entity.start, entity.end), type: entity.type });
  }
  if (enabled.includes("自定义"))
    for (const word of custom
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      let from = 0;
      while (from < text.length) {
        const start = text.indexOf(word, from);
        if (start < 0) break;
        candidates.push({
          start,
          end: start + word.length,
          value: word,
          type: "自定义",
        });
        from = start + word.length;
      }
    }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (!chosen.length || c.start >= chosen[chosen.length - 1].end)
      chosen.push(c);
  }
  const mapping: Record<string, string> = {},
    counts: Record<string, number> = {},
    existing = new Map<string, string>();
  const matches: Match[] = chosen.map((m) => {
    let replacement = existing.get(m.type + "|" + m.value);
    if (!replacement) {
      do {
        counts[m.type] = (counts[m.type] || 0) + 1;
        replacement = `<${m.type}-${counts[m.type]}>`;
      } while (text.includes(replacement));
      existing.set(m.type + "|" + m.value, replacement);
      mapping[replacement] = m.value;
    }
    return { ...m, replacement };
  });
  let output = text;
  for (const m of [...matches].reverse())
    output = output.slice(0, m.start) + m.replacement + output.slice(m.end);
  return { text: output, matches, mapping };
}
export function restore(text: string, mapping: Record<string, string>) {
  const start = text.indexOf("-----BEGIN NL-DESENS-MAP-----");
  const endMarker = "-----END NL-DESENS-MAP-----";
  const end = start >= 0 ? text.indexOf(endMarker, start) : -1;
  const body = end >= 0 ? text.slice(end + endMarker.length).replace(/^\s+/, "") : text;
  return body.replace(/<[^<>\r\n]+>|«[^«»\r\n]+»/g, (token) => {
    const key = token.startsWith("«") ? `<${token.slice(1, -1)}>` : token;
    return Object.hasOwn(mapping, key) ? mapping[key] : token;
  });
}
