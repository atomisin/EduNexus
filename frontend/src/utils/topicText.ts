const ROMAN_MARKER = /\b(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\.\s*/gi;

const tidyTopicText = (value: string) =>
  value
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*([,;:])\s*/g, '$1 ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\b(e)\.\s*g\.?/gi, 'e.g.')
    .replace(/\beg\b/gi, 'e.g.')
    .replace(/\s+([,;:.])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const splitRomanOutline = (value: string) => {
  const spaced = value.replace(/([A-Za-z])(?=(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\.)/g, '$1 ');
  const matches = [...spaced.matchAll(ROMAN_MARKER)];
  if (!matches.length || (matches.length === 1 && (matches[0].index ?? 0) > 80)) {
    return spaced;
  }

  const firstIndex = matches[0].index ?? 0;
  const heading = spaced.slice(0, firstIndex).trim();
  const parts = matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? spaced.length;
      return spaced.slice(start, end).trim();
    })
    .filter(Boolean);

  if (!parts.length) return spaced;
  return heading ? `${heading}: ${parts.join('; ')}` : parts.join('; ');
};

export const formatTopicName = (value?: string | null) => {
  if (!value) return '';
  let text = String(value).trim();
  if (!text) return '';

  text = text
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z]{2,})/g, '$1 $2')
    .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([:;,.])([^\s])/g, '$1 $2');

  return tidyTopicText(splitRomanOutline(text));
};

export const formatTopicLike = <T extends { name?: string | null }>(topic: T | null | undefined) =>
  topic?.name ? formatTopicName(topic.name) : '';
