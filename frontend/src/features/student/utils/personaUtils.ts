export const getPersonaName = (educationLevel?: string): string => {
  if (!educationLevel) return 'Dr. Ade';
  const level = educationLevel.toLowerCase();
  if (['creche', 'nursery_1', 'nursery_2', 'kindergarten'].includes(level)) return 'Sparky';
  if (['primary_1', 'primary_2', 'primary_3'].includes(level)) return 'Bello';
  if (['primary_4', 'primary_5', 'primary_6'].includes(level)) return 'Zara';
  if (['jss_1', 'jss_2', 'jss_3'].includes(level)) return 'Coach Rex';
  return 'Dr. Ade';
};

export const getPersonaEmoji = (educationLevel?: string): string => {
  if (!educationLevel) return '👨‍🏫';
  const level = educationLevel.toLowerCase();
  if (['creche', 'nursery_1', 'nursery_2', 'kindergarten'].includes(level)) return '🐣';
  if (['primary_1', 'primary_2', 'primary_3'].includes(level)) return '🦁';
  if (['primary_4', 'primary_5', 'primary_6'].includes(level)) return '🦊';
  if (['jss_1', 'jss_2', 'jss_3'].includes(level)) return '🏆';
  return '👨‍🏫';
};
