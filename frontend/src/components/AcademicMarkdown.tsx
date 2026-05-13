import React from 'react';
import ReactMarkdown from 'react-markdown';
import MathText from '@/components/MathText';
import { normalizeAcademicTextForDisplay } from '@/utils/academicText';

const normalizeMarkdownStructure = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/^(Introduction to [A-Z][A-Za-z0-9 ,&()/-]{3,80}?)\s+(?=(?:A|An|The|This|In)\s)/, '# $1\n\n')
    .replace(/([^\n])\s+(#{1,6}\s+)/g, '$1\n\n$2')
    .replace(/(^|\n)(#{1,6}\s+[^\n]+?)\s+(?=[A-Z][A-Za-z ]{2,}:)/g, '$1$2\n\n')
    .replace(/([.!?])\s+(\d+\.\s+)/g, '$1\n$2')
    .replace(/([.!?])\s+([-*]\s+)/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const normalizeAcademicMarkdown = (value: string) => {
  if (!value) return '';

  return value
    .split(/(```[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith('```')) return part;
      return normalizeAcademicTextForDisplay(normalizeMarkdownStructure(part));
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const renderRichText = (value: string) => {
  const parts = value.split(/(\+\+[^+]+\+\+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('++') && part.endsWith('++')) {
      return (
        <span key={`${part}-${index}`} className="underline decoration-primary/70 decoration-2 underline-offset-4 font-semibold">
          <MathText>{part.slice(2, -2)}</MathText>
        </span>
      );
    }
    return <MathText key={`${part}-${index}`}>{part}</MathText>;
  });
};

const renderMathChildren = (children: React.ReactNode): React.ReactNode =>
  React.Children.map(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return renderRichText(String(child));
    }
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(element, {
        children: renderMathChildren(element.props.children),
      });
    }
    return child;
  });

interface AcademicMarkdownProps {
  children: string;
  className?: string;
}

export const AcademicMarkdown = ({ children, className = '' }: AcademicMarkdownProps) => (
  <div className={`prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-primary prose-p:leading-7 prose-li:leading-7 prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:break-words ${className}`}>
    <ReactMarkdown
      components={{
        p: ({ children }: any) => <p>{renderMathChildren(children)}</p>,
        li: ({ children }: any) => <li>{renderMathChildren(children)}</li>,
        h1: ({ children }: any) => <h2>{renderMathChildren(children)}</h2>,
        h2: ({ children }: any) => <h2>{renderMathChildren(children)}</h2>,
        h3: ({ children }: any) => <h3>{renderMathChildren(children)}</h3>,
        h4: ({ children }: any) => <h4>{renderMathChildren(children)}</h4>,
        strong: ({ children }: any) => <strong>{renderMathChildren(children)}</strong>,
        em: ({ children }: any) => <em>{renderMathChildren(children)}</em>,
        code: ({ className, children }: any) => (
          <code className={className}>{children}</code>
        ),
      }}
    >
      {normalizeAcademicMarkdown(String(children || ''))}
    </ReactMarkdown>
  </div>
);

export default AcademicMarkdown;
