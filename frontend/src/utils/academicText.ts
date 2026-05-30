const COMMON_SPOKEN_TERMS: Record<string, string> = {
  H2O: 'water',
  'H_{2}O': 'water',
  CO2: 'carbon dioxide',
  'CO_{2}': 'carbon dioxide',
  O2: 'oxygen',
  'O_{2}': 'oxygen',
  N2: 'nitrogen',
  'N_{2}': 'nitrogen',
  H2: 'hydrogen',
  'H_{2}': 'hydrogen',
  NH3: 'ammonia',
  'NH_{3}': 'ammonia',
  CH4: 'methane',
  'CH_{4}': 'methane',
  HCl: 'hydrochloric acid',
  NaCl: 'sodium chloride',
  CaCO3: 'calcium carbonate',
  'CaCO_{3}': 'calcium carbonate',
  H2SO4: 'sulfuric acid',
  'H_{2}SO_{4}': 'sulfuric acid',
  HNO3: 'nitric acid',
  'HNO_{3}': 'nitric acid',
  NaOH: 'sodium hydroxide',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formulaToLatex = (formula: string) =>
  formula.replace(/([A-Z][a-z]?)(\d+)/g, '$1_{$2}');

const isAcademicLabel = (value: string) =>
  /^(SS[123]|JSS[123]|P[1-6]|WAEC\d+|NECO\d+|JAMB\d+)$/i.test(value);

const looksLikeMath = (value: string) =>
  /\\[a-zA-Z]+|[\^_=]|[<>]=?|\d\s*[+\-*/]\s*\d/.test(value);

const normalizeMathOperators = (expression: string) =>
  expression
    .replace(/\u00d7/g, '\\times')
    .replace(/=\s*\\frac/g, '= \\frac')
    .replace(/\}\s*=/g, '} =')
    .replace(/\\log_\{([^}]+)\}\s*\(([^()]+)\)/g, (_match, base, argument) => `\\log_{${base}}(${argument.trim()})`)
    .replace(/\\log\s*\(([^()]+)\)/g, (_match, argument) => `\\log(${argument.trim()})`)
    .replace(/\\log\\\(\s*([^()\\\n]+(?:\([^()\n]*\)[^()\\\n]*)?)\s*\\\)/g, (_match, argument) => `\\log(${argument.trim()})`)
    .replace(/\blog\s*([0-9]+|[A-Za-z])\s*\(([^()]+)\)/g, (_match, base, argument) => `\\log_{${base}}(${argument.trim()})`)
    .replace(/\b(-?\d+)\s*\/\s*(-?\d+)\b/g, (_match, numerator, denominator) => `\\frac{${numerator}}{${denominator}}`)
    .replace(/\b10\^(-?\d+)\b/g, (_match, exponent) => `10^{${exponent}}`)
    .replace(/\b(\d+(?:\.\d+)?)\^(-?\d+)\b/g, (_match, base, exponent) => `${base}^{${exponent}}`)
    .replace(/\b([A-Za-z])\^(-?\d+)\b/g, (_match, base, exponent) => `${base}^{${exponent}}`);

const wrapInlineMath = (expression: string) => `\\(${normalizeMathOperators(expression.trim())}\\)`;

const isInsideDelimitedMath = (text: string, offset: number) => {
  const before = text.slice(0, offset);
  const lastOpen = Math.max(before.lastIndexOf('\\('), before.lastIndexOf('\\['), before.lastIndexOf('$$'));
  const lastClose = Math.max(before.lastIndexOf('\\)'), before.lastIndexOf('\\]'));
  const unescapedDollarCount = (before.match(/(?<!\\)\$/g) || []).length;
  return lastOpen > lastClose || unescapedDollarCount % 2 === 1;
};

const wrapInlineMathIfNeeded = (expression: string, fullText: string, offset: number) =>
  isInsideDelimitedMath(fullText, offset) ? normalizeMathOperators(expression.trim()) : wrapInlineMath(expression);

const normalizeBrokenFormulaLayouts = (value: string) =>
  value
    .replace(/\n\s*([A-Za-z])\s*\n\s*\1\b/g, (_match, variable) => wrapInlineMath(variable))
    .replace(
      /(^|[:\n])\s*a\s*\n+\s*n\s*\n+\s*a\s*\n+\s*=\s*\n+\s*r\s*\n+\s*n\s*[−\-?]\s*1(?:[\s\S]{0,100}?=\s*r\s*n\s*[−\-?]\s*1)?/g,
      (_match, prefix) => `${prefix}${prefix === ':' ? ' ' : ''}\\[\\frac{a_n}{a} = r^{n-1}\\]`
    )
    .replace(/(\\\[[^\]]+\\\])\s*\n?\s*\.\s+/g, '$1\n\n')
    .replace(/\(\(\s*n\s*[-−]\s*1\s*\)\)th\b/gi, `${wrapInlineMath('n - 1')}th`)
    .replace(
      /\\\s*(a\s*,\s*ar\s*,\s*ar\^2\s*,\s*ar\^3\s*,\s*\\ldots\s*,\s*ar\^\{?n\s*[-−]\s*1\}?)\s*\\,/gi,
      (_match, expression) => wrapInlineMath(expression.replace(/ar\^2/g, 'ar^{2}').replace(/ar\^3/g, 'ar^{3}').replace(/−/g, '-'))
    )
    .replace(
      /\\+\s*([A-Za-z]{1,3}\s*=\s*)\\frac\{([^}]+)\}\{([^}]+)\}([^\\\n]*)\\+[,.]?/g,
      (_match, prefix, numerator, denominator, suffix) => wrapInlineMath(`${prefix.trim()}\\frac{${numerator}}{${denominator}}${suffix.trim()}`)
    )
    .replace(
      /\\+\s*([A-Za-z]{1,3}\s*(?:=|\\times)\s*[^\\\n]*(?:\\times|\\frac\{[^}]+\}\{[^}]+\})?[^\\\n]*)\s*\\+[,.]?/g,
      (_match, expression) => wrapInlineMath(expression.trim())
    )
    .replace(
      /\\+\s*([A-Za-z]{1,3}(?:\s*[+\-*/=]\s*[^\\\n]+)?|\\frac\{[^}]+\}\{[^}]+\}(?:\s*=\s*[^\\\n]+)?)\s*\\+/g,
      (_match, expression) => wrapInlineMath(expression.replace(/ar\^2/g, 'ar^{2}').replace(/ar\^3/g, 'ar^{3}'))
    )
    .replace(/(?<![A-Za-z])\(\s*([A-Za-z]{2,3})\s*\)(?![A-Za-z])/g, (_match, expression) => wrapInlineMath(expression))
    .replace(/\(\(\s*([A-Za-z])\s*\)\)/g, (_match, variable) => wrapInlineMath(variable))
    .replace(/(?<![A-Za-z])\(\s*([A-Za-z])\s*\)(?![A-Za-z])/g, (_match, variable) => wrapInlineMath(variable))
    .replace(
      /\(\s*([^()\n]*(?:\\frac|\\left|\\right|\\sqrt|[=^_])[^()\n]*(?:\([^()\n]*\)[^()\n]*)?)\s*\)/g,
      (match, expression, offset, fullText) => {
        if (isInsideDelimitedMath(fullText, offset)) return match;
        if (!/[=^_]|\\(?:frac|left|right|sqrt)/.test(expression)) return match;
        return wrapInlineMath(normalizeMathOperators(expression.trim()));
      }
    );

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

  normalized = normalizeBrokenFormulaLayouts(normalized);

  normalized = normalized
    .replace(/\\log\\\(\s*([^\\\n]+?)\s*\\\)/g, (_match, argument) => `log(${argument.trim()})`)
    .replace(/\\log\s*\(\s*([^)\\\n]+?)\s*\)/g, (_match, argument) => `log(${argument.trim()})`);

  normalized = normalized.replace(/(^|\n)\s*:\s+(?=\S)/g, '$1');

  normalized = normalized.replace(
    /(^|\n)(\s*)((?:(?:[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?)\s*)+)(#{1,6})\s+/gu,
    (_match, lineStart, spacing, emojiPrefix, headingMarks) =>
      `${lineStart}${spacing}${headingMarks} ${emojiPrefix}`
  );

  normalized = normalized.replace(
    /\(\s*([A-Za-z])\s*[xX\u00d7]\s*10\s*([A-Za-z])\s*\1\s*[xX\u00d7]\s*10\s*\2\s*\)/gs,
    (_match, coefficient, exponent) => wrapInlineMath(`${coefficient} \\times 10^{${exponent}}`)
  );

  normalized = normalized.replace(
    /\(\s*([A-Za-z])\s*[xX\u00d7]\s*10\s*([A-Za-z])\s*\)/gs,
    (_match, coefficient, exponent) => wrapInlineMath(`${coefficient} \\times 10^{${exponent}}`)
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
    (_match, prefix, total, coefficient, exponent) => `${prefix}${wrapInlineMath(`${total} = ${coefficient} \\times 10^{${exponent}}`)}`
  );

  normalized = normalized.replace(
    /\\log_\{([^}]+)\}\s*\(\s*([^()\n]+)\s*\)\s*=\s*([^.\n]+)/g,
    (_match, base, argument, value, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log_{${base}}(${argument.trim()}) = ${value.trim()}`, fullText, offset)
  );

  normalized = normalized.replace(
    /\\log_\{([^}]+)\}\s*\(\s*([^()\n]+)\s*\)/g,
    (_match, base, argument, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log_{${base}}(${argument.trim()})`, fullText, offset)
  );

  normalized = normalized.replace(
    /\\log\s*\(\s*([^()\n]+)\s*\)\s*=\s*([^.\n]+)/g,
    (_match, argument, value, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log(${argument.trim()}) = ${value.trim()}`, fullText, offset)
  );

  normalized = normalized.replace(
    /\\log\s*\(\s*([^()\n]+)\s*\)/g,
    (_match, argument, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log(${argument.trim()})`, fullText, offset)
  );

  normalized = normalized.replace(
    /\\log\\\(\s*([^()\\\n]+(?:\([^()\n]*\)[^()\\\n]*)?)\s*\\\)\s*=\s*([^.\n]+)/g,
    (_match, argument, value, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log(${argument.trim()}) = ${value.trim()}`, fullText, offset)
  );

  normalized = normalized.replace(
    /\\log\\\(\s*([^()\\\n]+(?:\([^()\n]*\)[^()\\\n]*)?)\s*\\\)/g,
    (_match, argument, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log(${argument.trim()})`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<![$\\])((?:log\([^)\n]+\)|-?\d+(?:\.\d+)?(?:\^\{?-?\d+\}?)?|\\times|\s|=)+)(?=[.!?,;:](?:\s|$))/g,
    (match, expression, offset, fullText) => {
      if (!expression.includes('log(') || !expression.includes('=')) return match;
      return wrapInlineMathIfNeeded(normalizeMathOperators(expression.trim()), fullText, offset);
    }
  );

  normalized = normalized.replace(
    /(?<![$\\])\blog\s*\(\s*([^()\n]+)\s*\)\s*=\s*(-?\d+(?:\.\d+)?)/g,
    (_match, argument, value, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log(${argument.trim()}) = ${value}`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<![$\\])\blog\s*\(\s*([^()\n]+)\s*\)/g,
    (_match, argument, offset, fullText) =>
      wrapInlineMathIfNeeded(`\\log(${argument.trim()})`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<!\\)\blog(?:[\s\n]+|\u2044|\u2061)+([A-Za-z0-9]+)[\s\n]+([A-Za-z0-9]+)\s*=\s*(-?\d+(?:\.\d+)?)(?:[\s\n]+log[\s\n]*\1[\s\n]*\2\s*=\s*\3)?/g,
    (match, base, argument, value) => {
      if (!isLikelyLogBase(base) || !isLikelyLogArgument(argument)) return match;
      return wrapInlineMath(`\\log_{${base}} ${argument} = ${value}`);
    }
  );

  normalized = normalized.replace(
    /(?<!\\)\blog(?:[\s\n]+|\u2044|\u2061)+([A-Za-z0-9]+)[\s\n]+([A-Za-z0-9]+)(?=[\s?.,;:!]|$)/g,
    (match, base, argument) => {
      if (!isLikelyLogBase(base) || !isLikelyLogArgument(argument)) return match;
      return wrapInlineMath(`\\log_{${base}} ${argument}`);
    }
  );

  normalized = normalized.replace(
    /(^|\n)(\s*)((?:-?\d+(?:\.\d+)?|\d+\/\d+)\^-?\d+\s*=\s*[^.\n]*?\blog\s*[0-9A-Za-z]\s*\([^)\n]+\)\s*=\s*-?\d+(?:\.\d+)?\s*\))/g,
    (_match, prefix, spacing, expression, offset, fullText) => `${prefix}${spacing}${wrapInlineMathIfNeeded(expression, fullText, offset)}`
  );

  normalized = normalized.replace(
    /(?<![$\\])\blog\s*([0-9]+|[A-Za-z])\s*\(([^()\n]+)\)\s*=\s*(-?\d+(?:\.\d+)?)/g,
    (match, base, argument, value, offset, fullText) => {
      if (!isLikelyLogBase(base)) return match;
      return wrapInlineMathIfNeeded(`\\log_{${base}}(${argument.trim()}) = ${value}`, fullText, offset);
    }
  );

  normalized = normalized.replace(
    /(?<![$\\])\blog\s*([0-9]+|[A-Za-z])\s*\(([^()\n]+)\)/g,
    (match, base, argument, offset, fullText) => {
      if (!isLikelyLogBase(base)) return match;
      return wrapInlineMathIfNeeded(`\\log_{${base}}(${argument.trim()})`, fullText, offset);
    }
  );

  normalized = normalized.replace(
    /(?<![$\\])\b(\d+(?:\.\d+)?)\^(-?\d+)\s*=\s*((?:\d+(?:\.\d+)?)|(?:\d+\s*\/\s*\d+))/g,
    (_match, base, exponent, value, offset, fullText) => wrapInlineMathIfNeeded(`${base}^{${exponent}} = ${value}`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<![$\\])(-?\d+(?:\.\d+)?)\s*\\times\s*(-?\d+(?:\.\d+)?)/g,
    (_match, left, right, offset, fullText) => wrapInlineMathIfNeeded(`${left} \\times ${right}`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<![$\\])(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*\n+\s*(-?\d+)(?=[\s,.;:!?)]|$)/g,
    (_match, left, base, exponent, offset, fullText) =>
      wrapInlineMathIfNeeded(`${left} = ${base}^{${exponent}}`, fullText, offset)
  );

  normalized = normalized.replace(
    /(\\\(\\log_\{[^}]+\}\s+[^\\]+\\\))\s+\1/g,
    '$1'
  );

  normalized = normalized.replace(
    /\(\(([^()]+)\)\s*=\s*([^()]+)\)/g,
    (match, left, right) => {
      const expression = `${left} = ${right}`;
      return looksLikeMath(expression) ? wrapInlineMath(expression) : match;
    }
  );

  normalized = normalized.replace(
    /(?<!\\)(?<![A-Za-z])\(([^()]*\\[a-zA-Z]+[^()]*)\)/g,
    (_match, expression) => wrapInlineMath(expression)
  );

  normalized = normalized.replace(
    /(?<!\\)(?<![A-Za-z])\(([^()]*(?:[\^_=]|[xX\u00d7]\s*10)[^()]*)\)/g,
    (match, expression) => looksLikeMath(expression) ? wrapInlineMath(expression) : match
  );

  normalized = normalized.replace(
    /(?<![$\\])((?:\\[a-zA-Z]+(?:_\{[^}]+\}|\^[{\w-]+)?|\\times|[A-Za-z0-9.]+\s*[xX\u00d7]\s*10\^?\{?-?\d+\}?)[^.!?\n]*(?:=|\\times|[xX\u00d7]|[+\-*/^_])[^.!?\n]*(?:\\[a-zA-Z]+|\\times|[A-Za-z0-9.]+\s*[xX\u00d7]\s*10\^?\{?-?\d+\}?|10\^?\{?-?\d+\}?))/g,
    (match, expression, offset, fullText) => {
      const before = fullText.slice(Math.max(0, offset - 3), offset);
      const after = fullText.slice(offset + match.length, offset + match.length + 3);
      if (before.endsWith('\\(') || before.endsWith('\\[') || after.startsWith('\\)') || after.startsWith('\\]')) return match;
      return wrapInlineMathIfNeeded(expression, fullText, offset);
    }
  );

  normalized = normalized.replace(
    /(?<![$\\])\b10\^\{(-?\d+)\}\b/g,
    (match, exponent, offset, fullText) => isInsideDelimitedMath(fullText, offset) ? match : wrapInlineMath(`10^{${exponent}}`)
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z])\s*[xX\u00d7]\s*10\s*\^?\s*\{?([A-Za-z0-9+-]+)\}?\b/g,
    (_match, coefficient, exponent, offset, fullText) => wrapInlineMathIfNeeded(`${coefficient} \\times 10^{${exponent}}`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z])\^\{(-?\d+)\}\b/g,
    (match, base, exponent, offset, fullText) => isInsideDelimitedMath(fullText, offset) ? match : wrapInlineMath(`${base}^{${exponent}}`)
  );

  normalized = normalized.replace(
    /(?<![$\\])\b(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*10\^(-?\d+)\b/g,
    (_match, coefficient, exponent, offset, fullText) => wrapInlineMathIfNeeded(`${coefficient} \\times 10^{${exponent}}`, fullText, offset)
  );

  normalized = normalized.replace(
    /(?<![$\\])\b10\^(-?\d+)\b/g,
    (match, exponent, offset, fullText) => isInsideDelimitedMath(fullText, offset) ? match : wrapInlineMath(`10^{${exponent}}`)
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z])\^(-?\d+)\b/g,
    (match, base, exponent, offset, fullText) => isInsideDelimitedMath(fullText, offset) ? match : wrapInlineMath(`${base}^{${exponent}}`)
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Z][a-z]?(?:\d+|[A-Z][a-z]?)+(?:[A-Z][a-z]?\d*)*)\b/g,
    (match, _formula, offset, fullText) => {
      if (isAcademicLabel(match)) return match;
      if (!/\d/.test(match)) return match;
      if (isInsideDelimitedMath(fullText, offset)) return match;
      return wrapInlineMath(formulaToLatex(match));
    }
  );

  normalized = normalized.replace(
    /(?<![$\\])\b([A-Za-z]+\/[A-Za-z]+)\^(-?\d+)\b/g,
    (match, unit, exponent, offset, fullText) => isInsideDelimitedMath(fullText, offset) ? match : wrapInlineMath(`${unit}^{${exponent}}`)
  );

  return normalized;
};

export const normalizeAcademicTextForSpeech = (text: string) => {
  if (!text) return text;

  let spoken = normalizeAcademicTextForDisplay(text)
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s/g, '');

  for (const [symbol, phrase] of Object.entries(COMMON_SPOKEN_TERMS)) {
    spoken = spoken.replace(new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'g'), phrase);
  }

  spoken = spoken
    .replace(/\bm\/s\^2\b/g, 'metres per second squared')
    .replace(/\bm\/s2\b/g, 'metres per second squared')
    .replace(/\bm\/s\b/g, 'metres per second')
    .replace(/\bkg\/m\^3\b/g, 'kilograms per cubic metre')
    .replace(/\bcm\^3\b/g, 'cubic centimetres')
    .replace(/\bcm2\b/g, 'square centimetres')
    .replace(/\bcm\^2\b/g, 'square centimetres')
    .replace(/\bm2\b/g, 'square metres')
    .replace(/\bm\^2\b/g, 'square metres')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/\\log_\{([^}]+)\}\s*\(([^()]+)\)/g, ' log base $1 of $2 ')
    .replace(/\\log_\{([^}]+)\}\s*([A-Za-z0-9.]+(?:\s*\\times\s*10\^\{?-?\d+\}?)?)/g, ' log base $1 of $2 ')
    .replace(/\\ln\s*\(([^()]+)\)/g, ' natural log of $1 ')
    .replace(/\\sqrt\{([^}]+)\}/g, ' square root of $1 ')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, ' $1 over $2 ')
    .replace(/\\left|\\right/g, ' ')
    .replace(/\\times|\u00d7/g, ' times ')
    .replace(/\\div|\u00f7/g, ' divided by ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/=/g, ' equals ')
    .replace(/\+/g, ' plus ')
    .replace(/\\leq|\u2264/g, ' less than or equal to ')
    .replace(/\\geq|\u2265/g, ' greater than or equal to ')
    .replace(/\\neq|\u2260/g, ' not equal to ')
    .replace(/\\cdot/g, ' times ')
    .replace(/\^\{2\}|\^2/g, ' squared ')
    .replace(/\^\{3\}|\^3/g, ' cubed ')
    .replace(/\^\{(-?\d+)\}|\^(-?\d+)/g, (_match, braced, plain) => ` to the power of ${braced || plain} `)
    .replace(/_\{([^}]+)\}/g, ' subscript $1 ')
    .replace(/\\([a-zA-Z]+)/g, (_match, command) => {
      const commandWords: Record<string, string> = {
        alpha: 'alpha',
        beta: 'beta',
        gamma: 'gamma',
        delta: 'delta',
        theta: 'theta',
        lambda: 'lambda',
        mu: 'mu',
        pi: 'pi',
        sigma: 'sigma',
        omega: 'omega',
        percent: 'percent',
      };
      return ` ${commandWords[command] || command} `;
    })
    .replace(/\*\*|__|\*|_/g, '')
    .replace(/([A-Z][a-z]?)(\d+)/g, '$1 $2')
    .replace(/\bC\s*O\s*subscript\s*2\b/gi, 'carbon dioxide')
    .replace(/\bH\s*subscript\s*2\s*O\b/gi, 'water')
    .replace(/\bm\s*\/\s*s\s*squared\b/gi, 'metres per second squared')
    .replace(/\bm\s*\/\s*s\b/gi, 'metres per second')
    .replace(/\u20a6\s?([\d,]+(?:\.\d+)?)/g, 'naira $1')
    .replace(/\$\s?([\d,]+(?:\.\d+)?)/g, 'dollars $1')
    .replace(/%/g, ' percent ')
    .replace(/\u00b0C/g, ' degrees Celsius')
    .replace(/\u00b0F/g, ' degrees Fahrenheit')
    .replace(/\s+/g, ' ')
    .trim();

  return spoken;
};
