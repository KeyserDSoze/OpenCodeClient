/**
 * Minimal markdown → HTML renderer (zero dependencies).
 * Supports:
 *   - Fenced code blocks with optional language tag (``` lang\n...\n```)
 *   - Inline code (`code`)
 *   - Headings (# h1 – ##### h5)
 *   - Bold (**text** or __text__)
 *   - Italic (*text* or _text_)
 *   - Strikethrough (~~text~~)
 *   - Unordered lists (- or * or +)
 *   - Ordered lists (1. 2. …)
 *   - Blockquotes (> text)
 *   - Links ([label](url))
 *   - Horizontal rule (--- / ***)
 *   - Hard line breaks (two trailing spaces or \n inside paragraph)
 *
 * Syntax highlighting covers the most common tokens for:
 *   js/ts/jsx/tsx, python, bash/sh, json, css, html/xml, go, rust, java, c/cpp
 */

// ─── Escape ────────────────────────────────────────────────────────────────

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Syntax highlighting ───────────────────────────────────────────────────

type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "operator"
  | "type"
  | "decorator"
  | "builtin"
  | "punctuation"
  | "plain";

interface Token {
  type: TokenType;
  value: string;
}

// Shared keyword sets
const JS_KEYWORDS = new Set([
  "abstract","as","async","await","boolean","break","case","catch","class",
  "const","continue","debugger","declare","default","delete","do","else",
  "enum","export","extends","false","finally","for","from","function","get",
  "if","implements","import","in","infer","instanceof","interface","keyof",
  "let","module","namespace","new","null","of","override","package","private",
  "protected","public","readonly","return","satisfies","set","static","super",
  "switch","symbol","this","throw","true","try","type","typeof","undefined",
  "using","var","void","while","with","yield",
]);

const PYTHON_KEYWORDS = new Set([
  "False","None","True","and","as","assert","async","await","break","class",
  "continue","def","del","elif","else","except","finally","for","from",
  "global","if","import","in","is","lambda","nonlocal","not","or","pass",
  "raise","return","try","while","with","yield",
]);

const RUST_KEYWORDS = new Set([
  "as","async","await","break","const","continue","crate","dyn","else","enum",
  "extern","false","fn","for","if","impl","in","let","loop","match","mod",
  "move","mut","pub","ref","return","self","Self","static","struct","super",
  "trait","true","type","unsafe","use","where","while",
]);

const GO_KEYWORDS = new Set([
  "break","case","chan","const","continue","default","defer","else","fallthrough",
  "for","func","go","goto","if","import","interface","map","package","range",
  "return","select","struct","switch","type","var",
  "true","false","nil","iota",
]);

const JAVA_KEYWORDS = new Set([
  "abstract","assert","boolean","break","byte","case","catch","char","class",
  "const","continue","default","do","double","else","enum","extends","final",
  "finally","float","for","goto","if","implements","import","instanceof","int",
  "interface","long","native","new","null","package","private","protected",
  "public","return","short","static","strictfp","super","switch","synchronized",
  "this","throw","throws","transient","true","try","var","void","volatile","while",
]);

function keywordsFor(lang: string): Set<string> {
  switch (lang) {
    case "python": case "py": return PYTHON_KEYWORDS;
    case "rust": case "rs": return RUST_KEYWORDS;
    case "go": return GO_KEYWORDS;
    case "java": return JAVA_KEYWORDS;
    default: return JS_KEYWORDS; // js/ts/jsx/tsx/css-ish fallback
  }
}

/**
 * Tokenise a single line of code for a given language.
 * Returns an array of {type, value} tokens.
 */
function tokeniseLine(line: string, lang: string): Token[] {
  const keywords = keywordsFor(lang);
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Single-line comment //
    if ((lang === "js" || lang === "ts" || lang === "jsx" || lang === "tsx"
      || lang === "java" || lang === "go" || lang === "rust" || lang === "cpp"
      || lang === "c" || lang === "cs") && line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }
    // Hash comment (#)
    if ((lang === "python" || lang === "py" || lang === "bash" || lang === "sh"
      || lang === "yaml" || lang === "yml" || lang === "toml") && line[i] === "#") {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }
    // CSS/HTML comment start <!--
    if ((lang === "html" || lang === "xml") && line.slice(i, i + 4) === "&lt;") {
      // just treat rest as plain; full comment spans are handled at block level
      tokens.push({ type: "plain", value: line[i] });
      i++;
      continue;
    }
    // String: double quote
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j - 1] !== "\\")) j++;
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // String: single quote
    if (line[i] === "'") {
      let j = i + 1;
      while (j < line.length && !(line[j] === "'" && line[j - 1] !== "\\")) j++;
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // Template literal
    if (line[i] === "`") {
      let j = i + 1;
      while (j < line.length && !(line[j] === "`" && line[j - 1] !== "\\")) j++;
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // Number
    if (/[0-9]/.test(line[i]) && (i === 0 || /\W/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9._xXbBoO]/.test(line[j])) j++;
      tokens.push({ type: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }
    // Decorator / annotation (@)
    if (line[i] === "@") {
      let j = i + 1;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      tokens.push({ type: "decorator", value: line.slice(i, j) });
      i = j;
      continue;
    }
    // Word (keyword / type / function / identifier)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ type: "keyword", value: word });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ type: "type", value: word });
      } else if (line[j] === "(") {
        tokens.push({ type: "function", value: word });
      } else {
        tokens.push({ type: "plain", value: word });
      }
      i = j;
      continue;
    }
    // Operators
    if (/[+\-*/%=<>!&|^~?:]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[+\-*/%=<>!&|^~?:]/.test(line[j])) j++;
      tokens.push({ type: "operator", value: line.slice(i, j) });
      i = j;
      continue;
    }
    // Punctuation
    if (/[{}()[\],;.]/.test(line[i])) {
      tokens.push({ type: "punctuation", value: line[i] });
      i++;
      continue;
    }
    // Whitespace and anything else
    tokens.push({ type: "plain", value: line[i] });
    i++;
  }

  return tokens;
}

function tokensToHtml(tokens: Token[]): string {
  return tokens.map((t) => {
    const escaped = escHtml(t.value);
    if (t.type === "plain") return escaped;
    return `<span class="hl-${t.type}">${escaped}</span>`;
  }).join("");
}

/**
 * Returns syntax-highlighted HTML for a code block.
 * lang should be a lowercase language identifier.
 */
export function highlightCode(code: string, lang: string): string {
  const normalLang = lang.toLowerCase().trim();

  // JSON: just pretty-print with minimal colouring
  if (normalLang === "json") {
    return escHtml(code)
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="hl-type">$1</span>$2')
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="hl-string">$1</span>')
      .replace(/:\s*(\d[\d.eE+\-]*)/g, ': <span class="hl-number">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="hl-keyword">$1</span>');
  }

  // Bash: simple heuristic
  if (normalLang === "bash" || normalLang === "sh" || normalLang === "shell"
    || normalLang === "zsh" || normalLang === "fish") {
    return code.split("\n").map((line) => {
      if (line.trimStart().startsWith("#")) {
        return `<span class="hl-comment">${escHtml(line)}</span>`;
      }
      // Command (first word)
      return escHtml(line)
        .replace(/^(\s*)(\S+)/, (_m, ws, cmd) => `${ws}<span class="hl-function">${cmd}</span>`)
        .replace(/(["'])([^"']*)\1/g, '<span class="hl-string">$1$2$1</span>')
        .replace(/\$[\w{][^"'\s]*/g, '<span class="hl-keyword">$&</span>');
    }).join("\n");
  }

  // CSS
  if (normalLang === "css" || normalLang === "scss" || normalLang === "less") {
    return escHtml(code)
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>')
      .replace(/([.#]?[\w-]+)\s*\{/g, '<span class="hl-type">$1</span> {')
      .replace(/([\w-]+)\s*:/g, '<span class="hl-function">$1</span>:')
      .replace(/:\s*([^;{}\n]+)/g, (_m, v) => `: <span class="hl-string">${v}</span>`);
  }

  // HTML / XML
  if (normalLang === "html" || normalLang === "xml" || normalLang === "svg") {
    return escHtml(code)
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>')
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-keyword">$2</span>')
      .replace(/([\w-]+)=(&quot;[^&]*&quot;)/g, '<span class="hl-function">$1</span>=<span class="hl-string">$2</span>');
  }

  // Generic: line-by-line tokeniser
  const supported = [
    "js","ts","jsx","tsx","javascript","typescript",
    "python","py","go","rust","rs","java","c","cpp","cs","csharp",
  ];
  if (!supported.includes(normalLang) && normalLang !== "") {
    // Unknown lang: just escape
    return escHtml(code);
  }

  return code.split("\n").map((line) => tokensToHtml(tokeniseLine(line, normalLang))).join("\n");
}

// ─── Inline markdown → HTML ────────────────────────────────────────────────

function renderInline(text: string): string {
  return escHtml(text)
    // Bold+italic ***
    .replace(/\*\*\*(.+?)\*\*\*/gs, "<strong><em>$1</em></strong>")
    // Bold **
    .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
    // Bold __
    .replace(/__(.+?)__/gs, "<strong>$1</strong>")
    // Italic *
    .replace(/\*(.+?)\*/gs, "<em>$1</em>")
    // Italic _
    .replace(/_(.+?)_/gs, "<em>$1</em>")
    // Strikethrough ~~
    .replace(/~~(.+?)~~/gs, "<del>$1</del>")
    // Inline code (already escaped so we use special marker approach)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Links [label](url)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    // Auto-link bare URLs
    .replace(
      /(^|[\s(])(https?:\/\/[^\s<)"]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
    )
    // Hard line break (two spaces + newline)
    .replace(/  \n/g, "<br>");
}

// ─── Block markdown → HTML ─────────────────────────────────────────────────

export interface RenderedBlock {
  type: "code" | "html";
  /** For type=code: raw unescaped code text */
  code?: string;
  lang?: string;
  /** For type=html: ready-to-inject HTML string */
  html?: string;
}

/**
 * Parse markdown text into a sequence of blocks.
 * Each block is either a fenced code block (type=code) or
 * an HTML string (type=html) representing the rendered prose.
 *
 * Splitting into blocks allows the React component to render code blocks
 * as real DOM nodes (for copy buttons, etc.) while prose is dangerouslySetInnerHTML.
 */
export function parseMarkdown(text: string): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  // Split on fenced code blocks
  const parts = text.split(/(```[\w]*\n[\s\S]*?```)/g);

  for (const part of parts) {
    const fenceMatch = part.match(/^```([\w]*)\n([\s\S]*?)```$/);
    if (fenceMatch) {
      blocks.push({
        type: "code",
        lang: fenceMatch[1] || "plaintext",
        code: fenceMatch[2],
      });
      continue;
    }

    if (!part.trim()) continue;

    // Process block-level elements line by line
    const html = renderBlocks(part);
    if (html) {
      blocks.push({ type: "html", html });
    }
  }

  return blocks;
}

function renderBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,5})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        bqLines.push(lines[i].slice(1).trimStart());
        i++;
      }
      out.push(`<blockquote>${renderBlocks(bqLines.join("\n"))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[\-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-*+] /.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph: accumulate until blank line
    const pLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^[>#\-*+\d]/.test(lines[i]) && !/^(-{3,}|\*{3,})$/.test(lines[i])) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length) {
      out.push(`<p>${pLines.map(renderInline).join("<br>")}</p>`);
    }
  }

  return out.join("\n");
}
