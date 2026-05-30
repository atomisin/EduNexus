import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { normalizeAcademicTextForDisplay } from '@/utils/academicText';

interface MathTextProps {
  children: React.ReactNode;
  className?: string;
}

const reactNodeToText = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return reactNodeToText(node.props.children);
  }
  return '';
};

/**
 * Renders text with inline LaTeX math expressions.
 * Supports both $...$ and \(...\) delimiters for inline math,
 * and $$...$$ and \[...\] for display math.
 */
const MathText: React.FC<MathTextProps> = ({ children, className }) => {
  const text = useMemo(() => {
    return reactNodeToText(children);
  }, [children]);

  const rendered = useMemo(() => {
    if (!text) return '';
    const normalizedChildren = normalizeAcademicTextForDisplay(text);

    // Split on display math first ($$...$$), then inline math ($...$)
    // Also handle \[...\] and \(...\)
    const parts: { type: 'text' | 'math-inline' | 'math-display'; content: string }[] = [];

    // Regex for display math: $$...$$ or \[...\]
    // Regex for inline math: $...$ or \(...\)
    const combined = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\))/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = combined.exec(normalizedChildren)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: normalizedChildren.slice(lastIndex, match.index) });
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
    if (lastIndex < normalizedChildren.length) {
      parts.push({ type: 'text', content: normalizedChildren.slice(lastIndex) });
    }

    return parts;
  }, [text]);

  if (typeof rendered === 'string') {
    return <span className={className}>{normalizeAcademicTextForDisplay(text)}</span>;
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
