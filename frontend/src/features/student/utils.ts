export const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getAgeAppropriateGreeting = (age?: number) => {
  if (!age) return "Ready for today's learning adventure? 🌟";
  if (age < 10) return "Hi there! Ready to learn something amazing today? 🌟";
  if (age < 14) return "Welcome back! Let's conquer some new topics today. 🚀";
  if (age < 18) return "Great to see you. Ready to level up your skills? 📚";
  return "Welcome. Let's continue your journey toward mastery. 🎯";
};

export const getLearningStyleLabel = (style?: string) => {
  switch (style) {
    case 'visual': return { label: 'Visual Learner 👁️', desc: 'You learn best through images and diagrams.' };
    case 'auditory': return { label: 'Auditory Learner 🎧', desc: 'You learn best by listening and talking.' };
    case 'kinesthetic': return { label: 'Kinesthetic Learner 🏃', desc: 'You learn best by doing and moving.' };
    case 'reading': return { label: 'Reading/Writing Learner ✍️', desc: 'You learn best through text.' };
    default: return { label: 'Discovering Style...', desc: 'Take the assessment to find out!' };
  }
};
