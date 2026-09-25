export type TemplateSectionType =
  "hero" | "text" | "bullets" | "image" | "button" | "divider" | "footer";

export interface TemplateSection {
  id: string;
  type: TemplateSectionType;
  eyebrow?: string;
  title?: string;
  body?: string;
  bodyHtml?: string;
  backgroundColor?: string;
  imageUrl?: string;
  imageAlt?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

export const SECTION_TYPES: Array<{ type: TemplateSectionType; label: string }> = [
  { type: "hero", label: "Hero" },
  { type: "text", label: "Text" },
  { type: "bullets", label: "Bullet list" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "footer", label: "Footer" },
];

export function parseTemplateSections(value: unknown): TemplateSection[] {
  if (!Array.isArray(value)) return [];
  return value.filter((section): section is TemplateSection => {
    if (!section || typeof section !== "object") return false;
    const item = section as Record<string, unknown>;
    return typeof item.id === "string" && SECTION_TYPES.some((entry) => entry.type === item.type);
  });
}

/** Allow only formatting tags and safe link/color attributes from the editor. */
export function sanitizeRichHtml(value: string): string {
  value = decodeHtmlEntities(value);
  value = normalizeSimpleMarkdown(value);
  const allowed = new Set([
    "strong",
    "b",
    "u",
    "em",
    "p",
    "div",
    "br",
    "ul",
    "ol",
    "li",
    "a",
    "span",
    "font",
  ]);
  let output = "";
  let cursor = 0;
  const tagPattern = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi;
  for (const match of value.matchAll(tagPattern)) {
    output += escapeHtml(value.slice(cursor, match.index)).replace(/\r?\n/g, "<br>");
    const token = match[0];
    const closing = /^<\//.test(token);
    const name = token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
    if (!name || !allowed.has(name)) {
      output += escapeHtml(token);
    } else if (closing) {
      output += name === "font" ? "</span>" : `</${name}>`;
    } else if (name === "br") {
      output += "<br>";
    } else if (name === "a") {
      const href = token.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? "#";
      const safeHref = /^(https?:|mailto:)/i.test(href) ? href : "#";
      output += `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">`;
    } else if (name === "span" || name === "font") {
      const color =
        name === "font"
          ? token.match(/color\s*=\s*["'](#[0-9a-f]{3,8})["']/i)?.[1]
          : token.match(/color\s*:\s*(#[0-9a-f]{3,8})/i)?.[1];
      output += color ? `<span style="color:${color}">` : "<span>";
    } else {
      output += `<${name}>`;
    }
    cursor = (match.index ?? 0) + token.length;
  }
  output += escapeHtml(value.slice(cursor)).replace(/\r?\n/g, "<br>");
  return output;
}

function normalizeSimpleMarkdown(value: string): string {
  return value
    .replace(/^((?:\s*[-*]\s+.+(?:\r?\n|$))+)/gm, (block) => {
      const items = block
        .trim()
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
        .filter(Boolean)
        .map((item) => `<li>${item}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function decodeHtmlEntities(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = decoded
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
