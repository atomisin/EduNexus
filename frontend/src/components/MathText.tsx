import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  children: string;
  className?: string;
}

/**
 * Renders text with inline LaTeX math expressions.
 * Supports both $...$ and \(...\) delimiters for inline math,
 * and $$...$$ and \[...\] for display math.
 */
const MathText: React.FC<MathTextProps> = ({ children, className }) => {
  const rendered = useMemo(() => {
    if (!children) return '';

    // Split on display math first ($$...$$), then inline math ($...$)
    // Also handle \[...\] and \(...\)
    const parts: { type: 'text' | 'math-inline' | 'math-display'; content: string }[] = [];

    // Regex for display math: $$...$$ or \[...\]
    // Regex for inline math: $...$ or \(...\)
    const combined = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\))/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = combined.exec(children)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: children.slice(lastIndex, match.index) });
      }

      const raw = match[0];
      if (raw.startsWith('$$') || raw.startsWith('\\[')) {
        const inner = raw.startsWith('$$')
          ? raw.slice(2, -2)
          : raw.slice(2, -2);
        parts.push({ type: 'math-display', content: inner });
      } else {
        const inner = raw.startsWith('$')
          ? raw.slice(1, -1)
          : raw.slice(2, -2);
        parts.push({ type: 'math-inline', content: inner });
      }

      lastIndex = match.index + raw.length;
    }

    // Remaining text
    if (lastIndex < children.length) {
      parts.push({ type: 'text', content: children.slice(lastIndex) });
    }

    return parts;
  }, [children]);

  if (typeof rendered === 'string') {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={className}>
      {rendered.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i}>{part.content}</span>;
        }

        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: part.type === 'math-display',
          });

          if (part.type === 'math-display') {
            return (
              <span
                key={i}
                className="block my-2 text-center"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          }

          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={i} className="text-red-500">{part.content}</span>;
        }
      })}
    </span>
  );
};

export default MathText;
