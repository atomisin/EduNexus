import React from 'react';

type LegalSection = {
  title: string;
  body: string;
};

const termsSections: LegalSection[] = [
  {
    title: '1. Using EduNexus',
    body: 'EduNexus provides digital learning tools, AI tutoring, live sessions, assignments, assessments, progress tracking, and parent or guardian reporting for learners, teachers, schools, and approved organizations. By creating an account, you agree to use the platform for lawful educational purposes only.',
  },
  {
    title: '2. Learner Accounts and Guardian Support',
    body: 'Students should provide accurate class, subject, school, and guardian details so lessons, reports, and recommendations are appropriate. Where a learner is a minor, a parent, guardian, school, or authorized teacher may support account setup and receive learning updates.',
  },
  {
    title: '3. Teacher and Admin Approval',
    body: 'Teacher accounts and sensitive platform access may require administrator review before activation. EduNexus may ask for additional information where needed to protect learners and maintain trust in the learning environment.',
  },
  {
    title: '4. AI Tutor and Learning Guidance',
    body: 'The AI Tutor is a learning assistant. It explains concepts, asks questions, suggests practice, and supports revision, but it does not replace a qualified teacher, school policy, examination board, or professional judgment. Students should verify important academic, medical, legal, financial, or professional decisions with a qualified person.',
  },
  {
    title: '5. Assessments, Reports, and Progress',
    body: 'Quizzes, placement checks, brain power, mastery indicators, class participation, attendance, and reports are intended to guide learning. They should be treated as educational signals, not absolute judgments of ability. Teachers and guardians should use them together with classroom evidence and learner context.',
  },
  {
    title: '6. Live Sessions and Conduct',
    body: 'Users must behave respectfully in live classes, chats, messages, and shared materials. Harassment, impersonation, cheating, unauthorized recording, spam, abusive language, or attempts to bypass lesson progression and access controls are not allowed.',
  },
  {
    title: '7. Content and Materials',
    body: 'Teachers, schools, and users remain responsible for the materials they upload or share. By uploading content, you confirm you have the right to use it and allow EduNexus to store, process, and display it for learning, reporting, and classroom delivery.',
  },
  {
    title: '8. Account Security',
    body: 'Keep your login details private. You are responsible for activity on your account unless you report unauthorized access promptly. EduNexus may suspend or limit accounts that appear compromised, unsafe, fraudulent, or harmful to learners.',
  },
  {
    title: '9. Availability and Changes',
    body: 'EduNexus works to keep the service reliable, but access may be affected by internet issues, maintenance, hosting limits, third-party providers, or security events. Features, policies, and learning tools may be updated to improve quality, safety, or compliance.',
  },
  {
    title: '10. Contact',
    body: 'For questions about these terms, account access, learner safety, or school administration, contact the EduNexus team through the official support channels provided on the platform.',
  },
];

const privacySections: LegalSection[] = [
  {
    title: '1. Information We Collect',
    body: 'EduNexus may collect account details such as name, email address, phone number, role, school or organization, class level, subjects, department, guardian contact details, teacher profile information, and profile photo where provided.',
  },
  {
    title: '2. Learning and Classroom Data',
    body: 'We process learning activity such as selected lessons, quiz answers, placement results, mastery progress, assignments, attendance, participation, live session activity, AI Tutor conversations, recommended videos, reports, and teacher feedback.',
  },
  {
    title: '3. Voice, Media, and Uploaded Files',
    body: 'If you use speech, live sessions, profile photos, or uploaded learning materials, EduNexus may process the audio, image, transcript, or file only to provide the requested learning, communication, storage, or classroom feature.',
  },
  {
    title: '4. How We Use Information',
    body: 'We use data to create accounts, verify users, personalize lessons, support AI tutoring, recommend revision, unlock appropriate learning paths, generate notes and reports, help teachers manage classes, protect the platform, and improve educational quality.',
  },
  {
    title: '5. Sharing Information',
    body: 'Student progress may be shared with approved teachers, school administrators, and parents or guardians connected to the learner. We may also use trusted service providers for hosting, email delivery, storage, analytics, AI processing, and live classroom tools.',
  },
  {
    title: '6. Cookies and Session Security',
    body: 'EduNexus uses secure cookies and related browser storage to keep users signed in, protect accounts, remember preferences, and maintain learning sessions. Some features may not work correctly if these are blocked.',
  },
  {
    title: '7. Children and Student Privacy',
    body: 'EduNexus is designed for education. We limit student data use to learning, safety, communication, reporting, and platform operations. Parents, guardians, schools, and authorized teachers may request corrections or support for student records where appropriate.',
  },
  {
    title: '8. Data Retention and Security',
    body: 'We keep information for as long as needed to provide education services, meet school or legal requirements, resolve disputes, prevent abuse, and maintain records. We use reasonable technical and organizational safeguards, but no online service can guarantee absolute security.',
  },
  {
    title: '9. Your Choices',
    body: 'You may update your profile information, request help correcting inaccurate data, ask about report delivery, and contact EduNexus about account access or data concerns. Some records may need to be retained for legitimate educational, security, or legal reasons.',
  },
  {
    title: '10. Policy Updates',
    body: 'We may update this Privacy Policy as EduNexus grows or legal requirements change. Important updates will be reflected in the platform, and continued use means the updated policy applies.',
  },
];

export const legalDocuments = {
  terms: {
    title: 'EduNexus Terms of Service',
    intro:
      'These terms explain how learners, teachers, guardians, schools, and organizations should use EduNexus safely and responsibly.',
    sections: termsSections,
  },
  privacy: {
    title: 'EduNexus Privacy Policy',
    intro:
      'This policy explains what EduNexus collects, why it is used, and how learning, classroom, and account information is protected.',
    sections: privacySections,
  },
};

interface LegalDocumentProps {
  type: 'terms' | 'privacy';
}

export const LegalDocument: React.FC<LegalDocumentProps> = ({ type }) => {
  const document = legalDocuments[type];

  return (
    <article className="min-w-0 space-y-5 text-sm leading-6 text-foreground">
      <div className="space-y-2">
        <p className="text-muted-foreground">{document.intro}</p>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Effective May 2026
        </p>
      </div>
      <div className="space-y-4">
        {document.sections.map((section) => (
          <section key={section.title} className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            <p className="text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
};
