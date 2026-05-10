import { EDUCATION_LEVELS } from '@/constants/educationLevels';

const levelLabels = new Map(
  EDUCATION_LEVELS.map((level) => [level.value.toLowerCase(), level.label])
);

export const formatEducationLevel = (value?: string | null) => {
  if (!value) return 'Not set';
  const key = value.trim().toLowerCase().replace(/\s+/g, '_');
  const knownLabel = levelLabels.get(key);
  if (knownLabel) return knownLabel;

  const secondaryMatch = key.match(/^(jss|ss)_?([123])$/);
  if (secondaryMatch) {
    return `${secondaryMatch[1].toUpperCase()} ${secondaryMatch[2]}`;
  }

  const primaryMatch = key.match(/^primary_?([1-6])$/);
  if (primaryMatch) {
    return `Primary ${primaryMatch[1]}`;
  }

  return value
    .replace(/_/g, ' ')
    .replace(/\b(jss|ss|waec|neco|jamb)\b/gi, (match) => match.toUpperCase())
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

export const formatCurriculumLabel = (value?: string | null) => {
  if (!value) return 'Not set';
  return formatEducationLevel(value)
    .replace(/^Waec$/, 'WAEC')
    .replace(/^Neco$/, 'NECO')
    .replace(/^Jamb$/, 'JAMB');
};
