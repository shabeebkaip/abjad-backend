// Tier 2 #12 — Source-of-truth registry for every transactional email.
// Admins can override the `subject` and `body` of any entry via the admin UI;
// the override row in the `email_templates` collection wins at render time.
// When no override exists, the values here are authoritative.
//
// Body convention: every entry holds the *inner* HTML that will be inserted
// between the email header and footer. The `layout()` wrapper, brand chrome,
// and footer live in `email-templates.util.ts` — admins can't break them.
//
// Variable convention: `{{name}}` placeholders. Values come from the caller's
// `vars` object. Shim functions in `email-templates.util.ts` are responsible
// for pre-rendering any dynamic markup (info tables, status banners) so the
// registry stays straightforward strings.

export type TemplateAudience = 'teacher' | 'school' | 'mixed' | 'admin';

export interface TemplateVariable {
  name: string;
  description: string;
  // Sample value used in the admin "Reference" panel and (later) live preview.
  sample: string;
}

export interface TemplateRegistryEntry {
  name: string;
  description: string;
  audience: TemplateAudience;
  // Inserted into `<title>` of the email document.
  layoutTitle: string;
  defaultSubject: string;
  defaultBody: string;
  variables: TemplateVariable[];
}

// ── Reusable HTML snippets used in defaults below ─────────────────────────
// These match the helpers in email-templates.util.ts. We inline them here
// so admins can edit the literal HTML if they want to.

const H = (text: string) => `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0D2542;">${text}</h2>`;
const P = (text: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">${text}</p>`;
const CTA = (text: string, url: string) =>
  `<div style="text-align:center;margin:24px 0 8px;">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#24BFBF,#00ACD3);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">${text}</a>
    </div>`;

// ── Registry ──────────────────────────────────────────────────────────────

export const EMAIL_TEMPLATES = {
  application_submitted: {
    name: 'Application Submitted',
    description: 'Sent to a teacher when their job application is received.',
    audience: 'teacher',
    layoutTitle: 'Application Submitted',
    defaultSubject: 'Application Submitted – {{jobTitle}}',
    defaultBody: `
      ${H('Your application was submitted!')}
      ${P(`Hi {{teacherName}}, your application for the position below has been received. We'll notify you of any status updates.`)}
      {{infoTable}}
      ${CTA('Track Application', '{{trackUrl}}')}
    `,
    variables: [
      { name: 'teacherName',     description: 'The teacher\'s full name.',                                sample: 'Sara Al-Qahtani' },
      { name: 'jobTitle',        description: 'The job title that was applied to.',                       sample: 'Math Teacher' },
      { name: 'infoTable',       description: 'Pre-rendered info box (position, school, reference, status).', sample: '[info table HTML]' },
      { name: 'trackUrl',        description: 'Link to the teacher\'s application tracker.',              sample: 'https://abjad.sa/applications' },
    ],
  },

  application_status_changed: {
    name: 'Application Status Changed',
    description: 'Sent to a teacher when a school updates their application status.',
    audience: 'teacher',
    layoutTitle: 'Application Status Update',
    defaultSubject: 'Application Update: {{statusLabel}} – {{jobTitle}}',
    defaultBody: `
      ${H('Application Status Update')}
      ${P('Hi {{teacherName}}, your application status has changed.')}
      {{infoTable}}
      {{statusBanner}}
      ${CTA('View Application', '{{trackUrl}}')}
    `,
    variables: [
      { name: 'teacherName',  description: 'The teacher\'s full name.',                                    sample: 'Sara Al-Qahtani' },
      { name: 'jobTitle',     description: 'The job title in question.',                                   sample: 'Math Teacher' },
      { name: 'statusLabel',  description: 'Human-readable status (e.g. Shortlisted, Hired, Not Selected).', sample: 'Shortlisted' },
      { name: 'infoTable',    description: 'Info box (position, school, new status).',                     sample: '[info table HTML]' },
      { name: 'statusBanner', description: 'Coloured banner block carrying the status message + optional reason.', sample: '[banner HTML]' },
      { name: 'trackUrl',     description: 'Link to the teacher\'s application tracker.',                  sample: 'https://abjad.sa/applications' },
    ],
  },

  interview_invitation: {
    name: 'Interview Invitation',
    description: 'Sent to a teacher when a school schedules an interview.',
    audience: 'teacher',
    layoutTitle: 'Interview Invitation',
    defaultSubject: 'Interview Invitation – {{jobTitle}} at {{schoolName}}',
    defaultBody: `
      ${H('You have been invited to an interview!')}
      ${P('Hi {{teacherName}}, {{schoolName}} has invited you to interview for the position below.')}
      {{infoTable}}
      {{instructionsBlock}}
      ${CTA('Respond to Interview', '{{respondUrl}}')}
    `,
    variables: [
      { name: 'teacherName',       description: 'The teacher\'s full name.',                                            sample: 'Sara Al-Qahtani' },
      { name: 'jobTitle',          description: 'The job title.',                                                       sample: 'Math Teacher' },
      { name: 'schoolName',        description: 'Name of the inviting school.',                                         sample: 'Al-Faisaliah School' },
      { name: 'infoTable',         description: 'Pre-rendered info box (date, duration, format, location/link, deadline).', sample: '[info table HTML]' },
      { name: 'instructionsBlock', description: 'Optional instructions block (empty string if none).',                  sample: '[instructions HTML]' },
      { name: 'respondUrl',        description: 'Link to the interview response page.',                                 sample: 'https://abjad.sa/interviews' },
    ],
  },

  interview_reminder: {
    name: 'Interview Reminder',
    description: 'Sent 24h and 1h before a scheduled interview to both sides.',
    audience: 'mixed',
    layoutTitle: 'Interview Reminder',
    defaultSubject: 'Reminder: Interview {{whenLabel}} – {{jobTitle}}',
    defaultBody: `
      ${H('{{headline}}')}
      ${P('Hi {{recipientName}}, this is a friendly reminder that your interview is scheduled {{whenLabel}}.')}
      {{infoTable}}
      ${CTA('View Interview', '{{viewUrl}}')}
    `,
    variables: [
      { name: 'recipientName', description: 'Name of the email recipient (teacher or school user).', sample: 'Sara Al-Qahtani' },
      { name: 'headline',      description: 'Heading copy (varies for 24h vs 1h reminder).',         sample: 'Interview reminder — tomorrow' },
      { name: 'whenLabel',     description: 'Time descriptor: "tomorrow" or "in 1 hour".',            sample: 'tomorrow' },
      { name: 'jobTitle',      description: 'Job title.',                                            sample: 'Math Teacher' },
      { name: 'infoTable',     description: 'Pre-rendered info box.',                                sample: '[info table HTML]' },
      { name: 'viewUrl',       description: 'Link to interview detail.',                             sample: 'https://abjad.sa/interviews' },
    ],
  },

  offer_received: {
    name: 'Offer Received',
    description: 'Sent to a teacher when a school extends a job offer.',
    audience: 'teacher',
    layoutTitle: 'Job Offer',
    defaultSubject: 'Job Offer from {{schoolName}}',
    defaultBody: `
      ${H('You have received a job offer!')}
      ${P('Hi {{teacherName}}, {{schoolName}} has extended you a formal offer. Please review and respond before the deadline.')}
      {{infoTable}}
      ${CTA('Review Offer', '{{reviewUrl}}')}
    `,
    variables: [
      { name: 'teacherName', description: 'Teacher\'s name.',                              sample: 'Sara Al-Qahtani' },
      { name: 'schoolName',  description: 'School that extended the offer.',               sample: 'Al-Faisaliah School' },
      { name: 'infoTable',   description: 'Info box (position, salary, start date, deadline).', sample: '[info table HTML]' },
      { name: 'reviewUrl',   description: 'Link to the offer review page.',                sample: 'https://abjad.sa/offers' },
    ],
  },

  hired_confirmation: {
    name: 'Hired Confirmation',
    description: 'Sent to a teacher when a school confirms hire.',
    audience: 'teacher',
    layoutTitle: 'Hired Confirmation',
    defaultSubject: `Congratulations! You've been hired – {{position}}`,
    defaultBody: `
      ${H(`Congratulations! You're hired!`)}
      ${P('Hi {{teacherName}}, your hiring has been confirmed. Welcome to {{schoolName}}!')}
      {{infoTable}}
      ${CTA('View Your Profile', '{{dashboardUrl}}')}
    `,
    variables: [
      { name: 'teacherName',  description: 'Teacher\'s name.',                            sample: 'Sara Al-Qahtani' },
      { name: 'position',     description: 'Position title.',                             sample: 'Math Teacher' },
      { name: 'schoolName',   description: 'Hiring school.',                              sample: 'Al-Faisaliah School' },
      { name: 'infoTable',    description: 'Info box (position, school, start date).',    sample: '[info table HTML]' },
      { name: 'dashboardUrl', description: 'Link to the teacher dashboard.',              sample: 'https://abjad.sa/dashboard' },
    ],
  },

  profile_approved: {
    name: 'Teacher Profile Approved',
    description: 'Sent when admin approves a teacher\'s profile for verification.',
    audience: 'teacher',
    layoutTitle: 'Profile Verified',
    defaultSubject: 'Your Abjad profile has been verified!',
    defaultBody: `
      ${H('Your profile is verified!')}
      ${P(`Hi {{teacherName}}, your profile has been reviewed and approved by the Abjad team. You now have a "Verified by Abjad" badge, which increases your visibility to schools.`)}
      ${CTA('View Your Profile', '{{profileUrl}}')}
    `,
    variables: [
      { name: 'teacherName', description: 'Teacher\'s name.',         sample: 'Sara Al-Qahtani' },
      { name: 'profileUrl',  description: 'Link to the profile page.', sample: 'https://abjad.sa/profile' },
    ],
  },

  profile_rejected: {
    name: 'Teacher Profile Rejected',
    description: 'Sent when admin rejects a teacher\'s profile with a reason.',
    audience: 'teacher',
    layoutTitle: 'Profile Review',
    defaultSubject: 'Action Required: Your Abjad Profile',
    defaultBody: `
      ${H('Your profile needs attention')}
      ${P('Hi {{teacherName}}, your profile has been reviewed but could not be verified at this time.')}
      {{reasonBlock}}
      ${P('Please update your profile to address the feedback above and resubmit for review.')}
      ${CTA('Update Profile', '{{profileUrl}}')}
    `,
    variables: [
      { name: 'teacherName', description: 'Teacher\'s name.',                  sample: 'Sara Al-Qahtani' },
      { name: 'reasonBlock', description: 'Pre-rendered reason callout block.', sample: '[reason HTML]' },
      { name: 'profileUrl',  description: 'Link to the profile page.',          sample: 'https://abjad.sa/profile' },
    ],
  },

  new_application_to_school: {
    name: 'New Application (to School)',
    description: 'Sent to a school when a teacher applies to one of its jobs.',
    audience: 'school',
    layoutTitle: 'New Application',
    defaultSubject: 'New Application: {{teacherName}} – {{jobTitle}}',
    defaultBody: `
      ${H('New application received')}
      ${P('{{teacherName}} has applied for the <strong>{{jobTitle}}</strong> position at your school.')}
      {{infoTable}}
      ${CTA('Review Application', '{{reviewUrl}}')}
    `,
    variables: [
      { name: 'teacherName', description: 'Applicant teacher.',                  sample: 'Sara Al-Qahtani' },
      { name: 'jobTitle',    description: 'Job that was applied to.',            sample: 'Math Teacher' },
      { name: 'infoTable',   description: 'Info box (applicant, position, ref, match score).', sample: '[info table HTML]' },
      { name: 'reviewUrl',   description: 'Link to the school\'s applications page.', sample: 'https://abjad.sa/school/applications' },
    ],
  },

  interview_response_to_school: {
    name: 'Interview Response (to School)',
    description: 'Sent to a school when a teacher accepts/declines/reschedules an interview.',
    audience: 'school',
    layoutTitle: 'Interview Response',
    defaultSubject: 'Interview {{actionLabel}}: {{teacherName}} – {{jobTitle}}',
    defaultBody: `
      ${H('Interview {{actionLabel}}')}
      ${P('{{teacherName}} {{actionMessage}}')}
      {{infoTable}}
      {{noteBlock}}
      ${CTA('Manage Interviews', '{{manageUrl}}')}
    `,
    variables: [
      { name: 'teacherName',   description: 'Candidate name.',                                                    sample: 'Sara Al-Qahtani' },
      { name: 'jobTitle',      description: 'Job title.',                                                         sample: 'Math Teacher' },
      { name: 'actionLabel',   description: 'Accepted / Declined / Reschedule Requested.',                        sample: 'Accepted' },
      { name: 'actionMessage', description: 'Sentence describing what the candidate did (HTML safe).',            sample: 'has accepted the interview invitation for <strong>Math Teacher</strong>.' },
      { name: 'infoTable',     description: 'Info box (candidate, position, response, proposed time).',           sample: '[info table HTML]' },
      { name: 'noteBlock',     description: 'Optional candidate note block (empty string if none).',              sample: '[note HTML]' },
      { name: 'manageUrl',     description: 'Link to the school interviews page.',                                sample: 'https://abjad.sa/school/interviews' },
    ],
  },

  offer_response_to_school: {
    name: 'Offer Response (to School)',
    description: 'Sent to a school when a teacher accepts/declines/negotiates an offer.',
    audience: 'school',
    layoutTitle: 'Offer Response',
    defaultSubject: 'Offer {{actionLabel}}: {{teacherName}} – {{position}}',
    defaultBody: `
      ${H('Offer {{actionLabel}}')}
      ${P('{{teacherName}} {{actionMessage}}')}
      {{infoTable}}
      {{messageBlock}}
      ${CTA('Manage Offers', '{{manageUrl}}')}
    `,
    variables: [
      { name: 'teacherName',   description: 'Candidate name.',                                                    sample: 'Sara Al-Qahtani' },
      { name: 'position',      description: 'Position offered.',                                                  sample: 'Math Teacher' },
      { name: 'actionLabel',   description: 'Accepted / Declined / Negotiation Requested.',                       sample: 'Negotiation Requested' },
      { name: 'actionMessage', description: 'Sentence describing the response (HTML safe).',                      sample: 'would like to negotiate the terms of your offer for <strong>Math Teacher</strong>.' },
      { name: 'infoTable',     description: 'Info box.',                                                          sample: '[info table HTML]' },
      { name: 'messageBlock',  description: 'Optional candidate message block (empty string if none).',           sample: '[message HTML]' },
      { name: 'manageUrl',     description: 'Link to the school offers page.',                                    sample: 'https://abjad.sa/school/offers' },
    ],
  },

  school_verified: {
    name: 'School Verified',
    description: 'Sent when admin verifies a school.',
    audience: 'school',
    layoutTitle: 'School Verified',
    defaultSubject: 'Your school has been verified on Abjad',
    defaultBody: `
      ${H('Your school is verified!')}
      ${P('{{schoolName}} has been reviewed and verified by the Abjad team. Your school now appears as "Verified by Abjad" to teachers, increasing trust and application rates.')}
      ${CTA('Post a Job', '{{postJobUrl}}')}
    `,
    variables: [
      { name: 'schoolName', description: 'School name.',                       sample: 'Al-Faisaliah School' },
      { name: 'postJobUrl', description: 'Link to the new-job form.',          sample: 'https://abjad.sa/school/jobs/new' },
    ],
  },

  school_rejected: {
    name: 'School Verification Rejected',
    description: 'Sent when admin rejects a school\'s verification with a reason.',
    audience: 'school',
    layoutTitle: 'School Verification',
    defaultSubject: 'Action Required: School Verification – Abjad',
    defaultBody: `
      ${H('Your school verification needs attention')}
      ${P('The profile for <strong>{{schoolName}}</strong> could not be verified at this time.')}
      {{reasonBlock}}
      ${P('Please update your school profile to address the feedback and resubmit for review.')}
      ${CTA('Update School Profile', '{{profileUrl}}')}
    `,
    variables: [
      { name: 'schoolName',  description: 'School name.',                          sample: 'Al-Faisaliah School' },
      { name: 'reasonBlock', description: 'Pre-rendered reason callout block.',    sample: '[reason HTML]' },
      { name: 'profileUrl',  description: 'Link to school profile.',               sample: 'https://abjad.sa/school/profile' },
    ],
  },

  ticket_received: {
    name: 'Support Ticket Received',
    description: 'Sent when a user creates a support ticket (24h SLA).',
    audience: 'mixed',
    layoutTitle: 'Support Ticket Received',
    defaultSubject: 'Support ticket received – {{ticketNumber}}',
    defaultBody: `
      ${H(`We've received your support request`)}
      ${P('Hi {{recipientName}}, thanks for reaching out. Our team will respond within <strong>24 hours</strong>. You can follow the conversation in the support centre any time.')}
      {{infoTable}}
      ${CTA('View Ticket', '{{ticketUrl}}')}
    `,
    variables: [
      { name: 'recipientName', description: 'Ticket creator name.',                          sample: 'Sara Al-Qahtani' },
      { name: 'ticketNumber',  description: 'TKT-… reference.',                               sample: 'TKT-1234-AB12' },
      { name: 'infoTable',     description: 'Info box (subject, category, priority, due by).', sample: '[info table HTML]' },
      { name: 'ticketUrl',     description: 'Link to support centre.',                        sample: 'https://abjad.sa/support' },
    ],
  },

  ticket_replied: {
    name: 'Support Ticket Replied',
    description: 'Sent when an admin replies on a support ticket.',
    audience: 'mixed',
    layoutTitle: 'New Support Reply',
    defaultSubject: 'New reply on your support ticket – {{ticketNumber}}',
    defaultBody: `
      ${H('You have a new reply')}
      ${P('Hi {{recipientName}}, the Abjad support team has replied to your ticket <strong>{{subject}}</strong>.')}
      {{excerptBlock}}
      ${CTA('View Conversation', '{{ticketUrl}}')}
    `,
    variables: [
      { name: 'recipientName', description: 'Ticket creator name.',                          sample: 'Sara Al-Qahtani' },
      { name: 'ticketNumber',  description: 'TKT-… reference.',                               sample: 'TKT-1234-AB12' },
      { name: 'subject',       description: 'Ticket subject line.',                           sample: 'Cannot upload CV' },
      { name: 'excerptBlock',  description: 'Pre-rendered quote block with the reply excerpt.', sample: '[excerpt HTML]' },
      { name: 'ticketUrl',     description: 'Link to support centre.',                        sample: 'https://abjad.sa/support' },
    ],
  },

  team_invitation: {
    name: 'Team Invitation',
    description: 'Sent to a new school team member when invited to join.',
    audience: 'school',
    layoutTitle: 'Team Invitation',
    defaultSubject: `You've been invited to join {{schoolName}} on Abjad`,
    defaultBody: `
      ${H(`You've been invited to Abjad!`)}
      ${P('Hi {{inviteeName}}, {{inviterClause}}<strong>{{schoolName}}</strong> has invited you to join their recruitment team on Abjad.')}
      {{infoTable}}
      ${CTA('Accept Invitation', '{{acceptUrl}}')}
    `,
    variables: [
      { name: 'inviteeName',   description: 'Recipient name.',                                        sample: 'Khalid Al-Otaibi' },
      { name: 'inviterClause', description: 'Either "" or "Sara from " — pre-rendered.',              sample: '<strong>Sara</strong> from ' },
      { name: 'schoolName',    description: 'School name.',                                           sample: 'Al-Faisaliah School' },
      { name: 'infoTable',     description: 'Info box (school, role).',                               sample: '[info table HTML]' },
      { name: 'acceptUrl',     description: 'Link to sign-up flow.',                                  sample: 'https://abjad.sa/auth/signup' },
    ],
  },
} satisfies Record<string, TemplateRegistryEntry>;

export type TemplateKey = keyof typeof EMAIL_TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATES) as TemplateKey[];
