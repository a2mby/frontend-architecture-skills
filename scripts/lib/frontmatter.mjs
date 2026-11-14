// Small YAML-subset reader for SKILL.md frontmatter. Handles what the Agent Skills spec uses:
// plain, 'single' and "double" quoted scalars; folded (>) and literal (|) block scalars; plain multi-line
// scalars; one-level nested maps (metadata:); flow lists [a, b] and "- item" lists; # comments.
// It is deliberately not a full YAML parser. Anything it cannot read is an error, never a silent guess.
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { data: null, body: text, error: "no frontmatter block (file must start with ---)" };
  const lines = m[1].split(/\r?\n/);
  const body = text.slice(m[0].length);
  const data = {};
  let i = 0;
  const indentOf = (l) => l.match(/^ */)[0].length;
  const unquote = (raw) => {
    const v = raw.trim();
    if (v.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\.)*"$/.test(v)) throw new Error(`unterminated double-quoted value: ${v.slice(0, 40)}`);
      return JSON.parse(v);
    }
    if (v.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(v)) throw new Error(`unterminated single-quoted value: ${v.slice(0, 40)}`);
      return v.slice(1, -1).replace(/''/g, "'");
    }
    return v.replace(/\s+#.*$/, "");
  };
  const scalar = (raw) => {
    const v = raw.trim();
    if (v.startsWith("[") && v.endsWith("]")) return v.slice(1, -1).split(",").map((s) => unquote(s)).filter((s) => s !== "");
    return unquote(v);
  };
  try {
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }
      if (/^\t/.test(line)) throw new Error(`line ${i + 1}: tab indentation is not allowed in YAML`);
      if (indentOf(line) !== 0) throw new Error(`line ${i + 1}: unexpected indentation`);
      const km = line.match(/^([A-Za-z0-9_.\/-]+):(?:\s+(.*))?$/);
      if (!km) throw new Error(`line ${i + 1}: expected "key: value"`);
      const [, key, rest = ""] = km;
      if (key in data) throw new Error(`line ${i + 1}: duplicate key "${key}"`);
      i++;
      const block = [];
      while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > 0)) block.push(lines[i++]);
      while (block.length && block[block.length - 1].trim() === "") block.pop();
      const r = rest.trim();
      if (/^[>|][+-]?$/.test(r)) {
        const base = Math.min(...block.filter((l) => l.trim()).map(indentOf), Infinity);
        const texts = block.map((l) => l.slice(Number.isFinite(base) ? base : 0));
        data[key] = r[0] === "|" ? texts.join("\n") : texts.join("\n").replace(/(?<!\n)\n(?!\n)/g, " ").replace(/\n\n/g, "\n");
        if (!r.endsWith("+")) data[key] = data[key].replace(/\n+$/, "");
      } else if (r === "" && block.length && block.some((l) => /^\s+-\s/.test(l))) {
        data[key] = block.filter((l) => l.trim()).map((l) => { const lm = l.match(/^\s+-\s+(.*)$/); if (!lm) throw new Error(`key ${key}: mixed list and map`); return unquote(lm[1]); });
      } else if (r === "" && block.length) {
        const map = {};
        for (const l of block.filter((x) => x.trim() && !x.trim().startsWith("#"))) {
          const mm = l.match(/^\s+([A-Za-z0-9_.\/-]+):\s*(.*)$/);
          if (!mm) throw new Error(`key ${key}: nested lines must be "name: value"`);
          map[mm[1]] = scalar(mm[2]);
        }
        data[key] = map;
      } else if (block.length) {
        if (/^["']/.test(r)) throw new Error(`key ${key}: multi-line quoted scalars are not supported; use > or |`);
        data[key] = [r, ...block.map((l) => l.trim())].join(" ");
      } else data[key] = scalar(r);
    }
  } catch (e) { return { data: null, body, error: e.message }; }
  return { data, body, error: null };
}
