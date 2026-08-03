import fs from 'fs';
import path from 'path';
import React from 'react';

interface MarkdownBlock {
  type: 'heading' | 'paragraph' | 'list' | 'orderedList' | 'table' | 'hr';
  level?: number;
  items?: string[];
  rows?: string[][];
  content?: string;
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const inner = token.slice(
      token.startsWith('**') || token.startsWith('__') ? 2 : 1,
      token.endsWith('**') || token.endsWith('__') ? -2 : -1
    );

    if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(<strong key={`${match.index}-${match[0]}`}>{inner}</strong>);
    } else {
      parts.push(<em key={`${match.index}-${match[0]}`}>{inner}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      blocks.push({ type: 'heading', level, content: line.replace(/^#{1,6}\s/, '') });
      index += 1;
      continue;
    }

    if (/^---$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (/^\|/.test(line)) {
      const rowLines: string[] = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) {
        rowLines.push(lines[index].trim());
        index += 1;
      }

      const rows = rowLines.map((row) =>
        row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())
      );
      blocks.push({ type: 'table', rows });
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ''));
        index += 1;
      }
      blocks.push({ type: 'orderedList', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== '') {
      const current = lines[index].trim();
      if (
        !/^#{1,6}\s/.test(current) &&
        !/^---$/.test(current.trim()) &&
        !/^\|/.test(current) &&
        !/^[-*]\s/.test(current) &&
        !/^\d+\.\s/.test(current)
      ) {
        paragraphLines.push(current);
      }
      index += 1;
    }

    if (paragraphLines.length) {
      blocks.push({ type: 'paragraph', content: paragraphLines.join(' ') });
    }
  }

  return blocks;
}

function MarkdownRenderer({ content }: { content: string }) {
  const blocks = parseMarkdown(content);

  return (
    <div className="space-y-6 text-ds-text">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const classes = {
            1: 'text-3xl font-semibold tracking-tight text-white',
            2: 'text-2xl font-semibold mt-8 text-white',
            3: 'text-xl font-semibold mt-6 text-ds-text',
          }[block.level ?? 1];

          return React.createElement(
            `h${block.level ?? 1}`,
            { key: `${block.type}-${index}`, className: classes },
            renderInline(block.content ?? '')
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`${block.type}-${index}`} className="leading-8 text-ds-text-secondary">
              {renderInline(block.content ?? '')}
            </p>
          );
        }

        if (block.type === 'list') {
          return (
            <ul
              key={`${block.type}-${index}`}
              className="list-disc space-y-2 pl-6 leading-7 text-ds-text-secondary"
            >
              {block.items?.map((item, itemIndex) => (
                <li key={`${block.type}-${index}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'orderedList') {
          return (
            <ol
              key={`${block.type}-${index}`}
              className="list-decimal space-y-2 pl-6 leading-7 text-ds-text-secondary"
            >
              {block.items?.map((item, itemIndex) => (
                <li key={`${block.type}-${index}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === 'table') {
          const rows = block.rows ?? [];
          return (
            <div
              key={`${block.type}-${index}`}
              className="overflow-x-auto rounded-xl border border-ds-border bg-ds-surface-raised/80"
            >
              <table className="min-w-full text-sm">
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      key={`${block.type}-${index}-${rowIndex}`}
                      className="border-b border-ds-border last:border-b-0"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${block.type}-${index}-${rowIndex}-${cellIndex}`}
                          className={`px-4 py-3 ${rowIndex === 0 ? 'font-semibold text-white' : 'text-ds-text-secondary'}`}
                        >
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'hr') {
          return <hr key={`${block.type}-${index}`} className="border-ds-border" />;
        }

        return null;
      })}
    </div>
  );
}

export default function PrdPage() {
  const filePath = path.join(process.cwd(), 'docs', 'PRD.md');
  const markdown = fs.readFileSync(filePath, 'utf8');

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-ds-surface px-6 py-10 text-ds-text lg:px-10"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="rounded-2xl border border-ds-border bg-ds-surface-raised/70 p-6 shadow-2xl shadow-black/30">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
            Product Requirements
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Aegis PRD</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ds-text-muted">
            This page renders the PRD directly from the markdown source so the product requirements
            are visible in the app as well as in the repository.
          </p>
        </div>

        <article className="rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-6 shadow-xl shadow-black/20">
          <MarkdownRenderer content={markdown} />
        </article>
      </div>
    </main>
  );
}
