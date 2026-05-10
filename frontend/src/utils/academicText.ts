const COMMON_SPOKEN_TERMS: Record<string, string> = {
  H2O: 'water',
  CO2: 'carbon dioxide',
  O2: 'oxygen',
  N2: 'nitrogen',
  H2: 'hydrogen',
  NH3: 'ammonia',
  CH4: 'methane',
  HCl: 'hydrochloric acid',
  NaCl: 'sodium chloride',
  CaCO3: 'calcium carbonate',
  H2SO4: 'sulfuric acid',
  HNO3: 'nitric acid',
  NaOH: 'sodium hydroxide',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formulaToLatex = (formula: string) =>
  formula.replace(/([A-Z][a-z]?)(\d+)/g, '$1_{$2}');

const isAcademicLabel = (value: string) =>
  /^(SS[123]|JSS[123]|P[1-6]|WAEC\d+|NECO\d+|JAMB\d+)$/i.test(value);

const looksLikeMath = (value: string) =>
  /\\[a-zA-Z]+|[\^_=]|[<>]=?|\d\s*[+\-*/]\s*\d/.test(value);

const isLikelyLogBase = (value: string) =>
  /^(?:\d+(?:\.\d+)?|[a-z])$/i.test(value);

const isLikelyLogArgument = (value: string) =>
  /^(?:\d+(?:\.\d+)?|[a-z]|[a-z]\^\{?-?\d+\}?|10\^\{?-?\d+\}?)$/i.test(value);

export const normalizeAcademicTextForDisplay = (text: string) => {
  if (!text) return text;

  let normalized = text;

  normalized = normalized
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\u2061/g, '')
    .replace(/\r\n/g, '\n');

  normalized = normalized.replace(
    /\(\s*([A-Za-z])\s*[xX\u00d7]\s*10\s*([A-Za-z])\s*\1\s*[xX\u00d7]\s*10\s*\2\s*\)/gs,
    (_match, coefficient, exponent) => `\\(${coefficient} \\times 10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /\(\s*([A-Za-z])\s*[xX\u00d7]\s*10\s*([A-Za-z])\s*\)/gs,
    (_match, coefficient, exponent) => `\\(${coefficient} \\times 10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(^|[\n:])\s*\[\s*([^\]\n]*(?:\\[a-zA-Z]+|[=^_]|[xX\u00d7]\s*10)[^\]\n]*)\s*\]/g,
    (_match, prefix, expression) => `${prefix}${prefix === ':' ? ' ' : ''}\\[${expression.trim()}\\]`
  );

  normalized = normalized.replace(
    /where\s*\n+([A-Za-z])\s*\n*=\s*\n*([A-Za-z])\s*[xX\u00d7]\s*10\s*\n*([A-Za-z])\s*\n+\1\s*=\s*\2\s*[xX\u00d7]\s*10\s*\n*\3/gi,
    (_match, total, coefficient, exponent) => `where \\(${total} = ${coefficient} \\times 10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(^|\n)([A-Za-z])\s*=\s*([A-Za-z])\s*[xX\u00d7]\s*10\s+([A-Za-z])(?=\n|$)/g,
    (_match, prefix, total, coefficient, exponent) => `${prefix}\\(${total} = ${coefficient} \\times 10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<!\\)\blog(?:[\s\n]+|\u2044|\u2061)+([A-Za-z0-9]+)[\s\n]+([A-Za-z0-9]+)\s*=\s*(-?\d+(?:\.\d+)?)(?:[\s\n]+log[\s\n]*\1[\s\n]*\2\s*=\s*\3)?/g,
    (match, base, argument, value) => {
      if (!isLikelyLogBase(base) || !isLikelyLogArgument(argument)) return match;
      return `\\(\\log_{${base}} ${argument} = ${value}\\)`;
    }
  );

  normalized = normalized.replace(
    /(?<!\\)\blog(?:[\s\n]+|\u2044|\u2061)+([A-Za-z0-9]+)[\s\n]+([A-Za-z0-9]+)(?=[\s?.,;:!]|$)/g,
    (match, base, argument) => {
      if (!isLikelyLogBase(base) || !isLikelyLogArgument(argument)) return match;
      return `\\(\\log_{${base}} ${argument}\\)`;
    }
  );

  normalized = normalized.replace(
    /(\\\(\\log_\{[^}]+\}\s+[^\\]+\\\))\s+\1/g,
    '$1'
  );

  normalized = normalized.replace(
    /\(\(([^()]+)\)\s*=\s*([^()]+)\)/g,
    (match, left, right) => {
      const expression = `${left} = ${right}`;
      return looksLikeMath(expression) ? `\\(${expression}\\)` : match;
    }
  );

  normalized = normalized.replace(
    /(?<!\\)\(([^()]*\\[a-zA-Z]+[^()]*)\)/g,
    (_match, expression) => `\\(${expression}\\)`
  );

  normalized = normalized.replace(
    /(?<!\\)\(([^()]*(?:[\^_=]|[xX\u00d7]\s*10)[^()]*)\)/g,
    (match, expression) => looksLikeMath(expression) ? `\\(${expression}\\)` : match
  );

  normalized = normalized.replace(
    /(?<![$\\])\b10\^\{(-?\d+)\}\b/g,
    (_match, exponent) => `\\(10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z])\s*[xX\u00d7]\s*10\s*\^?\s*\{?([A-Za-z0-9+-]+)\}?\b/g,
    (_match, coefficient, exponent) => `\\(${coefficient} \\times 10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z])\^\{(-?\d+)\}\b/g,
    (_match, base, exponent) => `\\(${base}^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<![$\\])\b(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*10\^(-?\d+)\b/g,
    (_match, coefficient, exponent) => `\\(${coefficient} \\times 10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<![$\\])\b10\^(-?\d+)\b/g,
    (_match, exponent) => `\\(10^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z])\^(-?\d+)\b/g,
    (_match, base, exponent) => `\\(${base}^{${exponent}}\\)`
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Z][a-z]?(?:\d+|[A-Z][a-z]?)+(?:[A-Z][a-z]?\d*)*)\b/g,
    (match) => {
      if (isAcademicLabel(match)) return match;
      if (!/\d/.test(match)) return match;
      return `\\(${formulaToLatex(match)}\\)`;
    }
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z]+\/[A-Za-z]+)\^(-?\d+)\b/g,
    (_match, unit, exponent) => `\\(${unit}^{${exponent}}\\)`
  );

  return normalized;
};

export const normalizeAcademicTextForSpeech = (text: string) => {
  if (!text) return text;

  let spoken = text
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*|__|\*|_/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, ' ')
    .replace(/\$/g, ' ');

  for (const [symbol, phrase] of Object.entries(COMMON_SPOKEN_TERMS)) {
    spoken = spoken.replace(new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'g'), phrase);
  }

  spoken = spoken
    .replace(/\\times|\u00d7/g, ' times ')
    .replace(/\\div|\u00f7/g, ' divided by ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\leq|\u2264/g, ' less than or equal to ')
    .replace(/\\geq|\u2265/g, ' greater than or equal to ')
    .replace(/\\neq|\u2260/g, ' not equal to ')
    .replace(/\\sqrt\{([^}]+)\}/g, ' square root of $1 ')
    .replace(/\^\{2\}|\^2/g, ' squared ')
    .replace(/\^\{3\}|\^3/g, ' cubed ')
    .replace(/\^\{(-?\d+)\}|\^(-?\d+)/g, (_match, braced, plain) => ` to the power of ${braced || plain} `)
    .replace(/_\{(\d+)\}/g, ' $1 ')
    .replace(/([A-Z][a-z]?)(\d+)/g, '$1 $2')
    .replace(/\u20a6\s?([\d,]+(?:\.\d+)?)/g, 'naira $1')
    .replace(/\$\s?([\d,]+(?:\.\d+)?)/g, 'dollars $1')
    .replace(/%/g, ' percent ')
    .replace(/\u00b0C/g, ' degrees Celsius')
    .replace(/\u00b0F/g, ' degrees Fahrenheit')
    .replace(/\s+/g, ' ')
    .trim();

  return spoken;
};
