const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
}

function formatInline(text: string, skipLinks = false): string {
  let escaped = escapeHtml(text);

  if (!skipLinks) {
    escaped = escaped.replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
      (_match, label, url, title) => {
        const safeUrl = escapeHtml(url);
        const safeLabel = formatInline(label, true);
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${safeUrl}"${titleAttribute} target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
      },
    );
  }

  // Strong emphasis **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Emphasis *text*
  escaped = escaped.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // Inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

  return escaped;
}

function renderParagraph(lines: string[]): string {
  return `<p>${formatInline(lines.join(" "))}</p>`;
}

function renderTable(rows: string[]): string {
  if (!rows.length) return "";

  const parsedRows = rows.map((row) =>
    row
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim()),
  );

  const headerRow = parsedRows[0] ?? [];
  let alignRow: string[] = [];
  let bodyRows = parsedRows.slice(1);

  if (
    bodyRows.length > 0 &&
    bodyRows[0].every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  ) {
    alignRow = bodyRows[0];
    bodyRows = bodyRows.slice(1);
  }

  const alignments = alignRow.map((cell) => {
    const normalized = cell.replace(/\s+/g, "");
    if (normalized.startsWith(":")) {
      if (normalized.endsWith(":")) return "center";
      return "left";
    }
    if (normalized.endsWith(":")) return "right";
    return "";
  });

  const headerHtml = headerRow
    .map((cell, index) => {
      const alignment = alignments[index]
        ? ` style="text-align:${alignments[index]};"`
        : "";
      return `<th${alignment}>${formatInline(cell)}</th>`;
    })
    .join("");

  const bodyHtml = bodyRows
    .map((row) => {
      return `<tr>${row
        .map((cell, index) => {
          const alignment = alignments[index]
            ? ` style="text-align:${alignments[index]};"`
            : "";
          return `<td${alignment}>${formatInline(cell)}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead>${
    bodyHtml ? `<tbody>${bodyHtml}</tbody>` : ""
  }</table>`;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let paragraphBuffer: string[] = [];
  let inUnorderedList = false;
  let inOrderedList = false;
  let inBlockquote = false;
  let tableBuffer: string[] = [];

  const closeParagraph = () => {
    if (paragraphBuffer.length) {
      html += renderParagraph(paragraphBuffer);
      paragraphBuffer = [];
    }
  };

  const closeLists = () => {
    if (inUnorderedList) {
      html += "</ul>";
      inUnorderedList = false;
    }
    if (inOrderedList) {
      html += "</ol>";
      inOrderedList = false;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html += "</blockquote>";
      inBlockquote = false;
    }
  };

  const closeTable = () => {
    if (tableBuffer.length) {
      html += renderTable(tableBuffer);
      tableBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trimStart();
    if (!trimmedLine) {
      closeParagraph();
      closeBlockquote();
      closeTable();
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeParagraph();
      closeLists();
      closeBlockquote();
      closeTable();
      const level = headingMatch[1].length;
      const content = formatInline(headingMatch[2]);
      html += `<h${level}>${content}</h${level}>`;
      continue;
    }

    const blockquoteMatch = trimmedLine.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      closeParagraph();
      closeLists();
      closeTable();
      if (!inBlockquote) {
        html += "<blockquote>";
        inBlockquote = true;
      }
      html += renderParagraph([blockquoteMatch[1]]);
      continue;
    }

    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      closeParagraph();
      closeBlockquote();
      closeTable();
      if (!inUnorderedList) {
        closeLists();
        html += "<ul>";
        inUnorderedList = true;
      }
      html += `<li>${formatInline(unorderedMatch[1])}</li>`;
      continue;
    }

    const orderedMatch = trimmedLine.match(/^(\d+)[.)]\s+(.*)$/);
    if (orderedMatch) {
      closeParagraph();
      closeBlockquote();
      closeTable();
      if (!inOrderedList) {
        closeLists();
        const startNum = Number(orderedMatch[1]);
        const startAttr = startNum !== 1 ? ` start="${startNum}"` : "";
        html += `<ol${startAttr}>`;
        inOrderedList = true;
      }
      html += `<li value="${orderedMatch[1]}">${formatInline(
        orderedMatch[2],
      )}</li>`;
      continue;
    }

    if (/^\|.*\|$/.test(trimmedLine)) {
      closeParagraph();
      closeLists();
      closeBlockquote();
      tableBuffer.push(trimmedLine);
      continue;
    } else {
      closeTable();
    }

    paragraphBuffer.push(trimmedLine);
  }

  closeParagraph();
  closeLists();
  closeBlockquote();
  closeTable();

  return html;
}
