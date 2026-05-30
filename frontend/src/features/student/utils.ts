export const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getAgeAppropriateGreeting = (age?: number) => {
  if (!age) return 'Ready to continue with steady, focused learning today?';
  if (age < 10) return "Welcome back. Let's keep today's learning clear and enjoyable.";
  if (age < 14) return "Welcome back. Let's build confidently on what you already know.";
  if (age < 18) return "Good to see you. Let's keep your learning sharp and well-paced.";
  return "Welcome back. Let's continue toward deeper understanding and mastery.";
};

export const getLearningStyleLabel = (style?: string) => {
  switch (style) {
    case 'visual':
      return { label: 'Visual learner', desc: 'You learn best through images and diagrams.' };
    case 'auditory':
      return { label: 'Auditory learner', desc: 'You learn best by listening and talking.' };
    case 'kinesthetic':
      return { label: 'Kinesthetic learner', desc: 'You learn best by doing and moving.' };
    case 'reading':
      return { label: 'Reading and writing learner', desc: 'You learn best through text.' };
    default:
      return { label: 'Discovering style...', desc: 'Take the assessment to find out.' };
  }
};
