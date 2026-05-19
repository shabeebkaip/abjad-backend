// HTML email templates for all platform events.
// All templates use inline styles for maximum email-client compatibility.

const BASE_URL = process.env.FRONTEND_URL ?? 'https://abjad.sa';

function layout(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0D2542 0%,#444882 60%,#00ACD3 100%);padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Abjad</p>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Teacher-School Recruitment Platform</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e8edf2;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">This is an automated message from Abjad. Do not reply to this email.</p>
          <p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} Abjad Platform · Saudi Arabia</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0D2542;">${text}</h2>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">${text}</p>`;
}

function infoBox(rows: [string, string][]): string {
  const items = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#64748b;white-space:nowrap;">${label}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0f172a;font-weight:500;">${value}</td>
      </tr>`)
    .join('');
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:16px 0;">
      ${items}
    </table>`;
}

function ctaButton(text: string, url: string): string {
  return `
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#24BFBF,#00ACD3);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">${text}</a>
    </div>`;
}

// ── Teacher templates ────────────────────────────────────────────

export function tplApplicationSubmitted(opts: {
  teacherName: string;
  jobTitle: string;
  schoolName: string;
  referenceNumber: string;
}): { subject: string; html: string } {
  return {
    subject: `Application Submitted – ${opts.jobTitle}`,
    html: layout('Application Submitted', `
      ${heading('Your application was submitted!')}
      ${para(`Hi ${opts.teacherName}, your application for the position below has been received. We'll notify you of any status updates.`)}
      ${infoBox([
        ['Position', opts.jobTitle],
        ['School', opts.schoolName],
        ['Reference', opts.referenceNumber],
        ['Status', 'Submitted'],
      ])}
      ${ctaButton('Track Application', `${BASE_URL}/applications`)}
    `),
  };
}

export function tplApplicationStatusChanged(opts: {
  teacherName: string;
  jobTitle: string;
  schoolName: string;
  status: string;
  rejectionReason?: string;
}): { subject: string; html: string } {
  const statusLabels: Record<string, { label: string; color: string; message: string }> = {
    reviewing:          { label: 'Under Review',       color: '#3b82f6', message: 'Your application is now being reviewed by the school.' },
    shortlisted:        { label: 'Shortlisted',         color: '#10b981', message: 'Great news! You have been shortlisted for this position.' },
    interview_scheduled:{ label: 'Interview Scheduled', color: '#8b5cf6', message: 'An interview has been scheduled for you. Check your interview details.' },
    offer_extended:     { label: 'Offer Received',      color: '#f59e0b', message: 'You have received a job offer from this school!' },
    hired:              { label: 'Hired',                color: '#10b981', message: 'Congratulations! You have been hired for this position.' },
    rejected:           { label: 'Not Selected',         color: '#ef4444', message: 'Unfortunately you were not selected for this position.' },
  };

  const cfg = statusLabels[opts.status] ?? { label: opts.status, color: '#64748b', message: 'Your application status has been updated.' };

  return {
    subject: `Application Update: ${cfg.label} – ${opts.jobTitle}`,
    html: layout('Application Status Update', `
      ${heading('Application Status Update')}
      ${para(`Hi ${opts.teacherName}, your application status has changed.`)}
      ${infoBox([
        ['Position', opts.jobTitle],
        ['School', opts.schoolName],
        ['New Status', cfg.label],
      ])}
      <div style="background:${cfg.color}10;border:1px solid ${cfg.color}30;border-radius:10px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:${cfg.color};font-weight:500;">${cfg.message}</p>
        ${opts.rejectionReason ? `<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Reason: ${opts.rejectionReason}</p>` : ''}
      </div>
      ${ctaButton('View Application', `${BASE_URL}/applications`)}
    `),
  };
}

export function tplInterviewInvitation(opts: {
  teacherName: string;
  jobTitle: string;
  schoolName: string;
  scheduledAt: Date;
  type: string;
  duration: number;
  location?: string;
  meetingLink?: string;
  instructions?: string;
  responseDeadline?: Date;
}): { subject: string; html: string } {
  const typeLabel: Record<string, string> = {
    in_person: 'In Person',
    video: 'Video Call',
    phone: 'Phone',
    abjad_coordinated: 'Abjad Coordinated',
  };
  const locationDetail = opts.meetingLink
    ? `<a href="${opts.meetingLink}" style="color:#00ACD3;">${opts.meetingLink}</a>`
    : opts.location ?? '—';

  return {
    subject: `Interview Invitation – ${opts.jobTitle} at ${opts.schoolName}`,
    html: layout('Interview Invitation', `
      ${heading('You have been invited to an interview!')}
      ${para(`Hi ${opts.teacherName}, ${opts.schoolName} has invited you to interview for the position below.`)}
      ${infoBox([
        ['Position', opts.jobTitle],
        ['School', opts.schoolName],
        ['Date & Time', opts.scheduledAt.toLocaleString('en-SA', { dateStyle: 'full', timeStyle: 'short' })],
        ['Duration', `${opts.duration} minutes`],
        ['Format', typeLabel[opts.type] ?? opts.type],
        ['Location / Link', locationDetail],
        ...(opts.responseDeadline ? [['Respond By', opts.responseDeadline.toLocaleDateString('en-SA')] as [string, string]] : []),
      ])}
      ${opts.instructions ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:16px 0;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Instructions</p><p style="margin:0;font-size:13px;color:#475569;">${opts.instructions}</p></div>` : ''}
      ${ctaButton('Respond to Interview', `${BASE_URL}/interviews`)}
    `),
  };
}

export function tplOfferReceived(opts: {
  teacherName: string;
  position: string;
  schoolName: string;
  salary: number;
  deadline: Date;
  startDate?: Date;
  contractDuration?: string;
}): { subject: string; html: string } {
  return {
    subject: `Job Offer from ${opts.schoolName}`,
    html: layout('Job Offer', `
      ${heading('You have received a job offer!')}
      ${para(`Hi ${opts.teacherName}, ${opts.schoolName} has extended you a formal offer. Please review and respond before the deadline.`)}
      ${infoBox([
        ['Position', opts.position],
        ['School', opts.schoolName],
        ['Salary', `SAR ${opts.salary.toLocaleString()} / month`],
        ...(opts.startDate ? [['Start Date', opts.startDate.toLocaleDateString('en-SA')] as [string, string]] : []),
        ...(opts.contractDuration ? [['Contract', opts.contractDuration] as [string, string]] : []),
        ['Respond By', opts.deadline.toLocaleDateString('en-SA')],
      ])}
      ${ctaButton('Review Offer', `${BASE_URL}/offers`)}
    `),
  };
}

export function tplHiredConfirmation(opts: {
  teacherName: string;
  position: string;
  schoolName: string;
  startDate?: Date;
}): { subject: string; html: string } {
  return {
    subject: `Congratulations! You've been hired – ${opts.position}`,
    html: layout('Hired Confirmation', `
      ${heading('Congratulations! You\'re hired!')}
      ${para(`Hi ${opts.teacherName}, your hiring has been confirmed. Welcome to ${opts.schoolName}!`)}
      ${infoBox([
        ['Position', opts.position],
        ['School', opts.schoolName],
        ...(opts.startDate ? [['Start Date', opts.startDate.toLocaleDateString('en-SA')] as [string, string]] : []),
      ])}
      ${ctaButton('View Your Profile', `${BASE_URL}/dashboard`)}
    `),
  };
}

export function tplProfileApproved(opts: { teacherName: string }): { subject: string; html: string } {
  return {
    subject: 'Your Abjad profile has been verified!',
    html: layout('Profile Verified', `
      ${heading('Your profile is verified!')}
      ${para(`Hi ${opts.teacherName}, your profile has been reviewed and approved by the Abjad team. You now have a "Verified by Abjad" badge, which increases your visibility to schools.`)}
      ${ctaButton('View Your Profile', `${BASE_URL}/profile`)}
    `),
  };
}

export function tplProfileRejected(opts: {
  teacherName: string;
  reason: string;
}): { subject: string; html: string } {
  return {
    subject: 'Action Required: Your Abjad Profile',
    html: layout('Profile Review', `
      ${heading('Your profile needs attention')}
      ${para(`Hi ${opts.teacherName}, your profile has been reviewed but could not be verified at this time.`)}
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
        <p style="margin:0;font-size:13px;color:#7f1d1d;">${opts.reason}</p>
      </div>
      ${para('Please update your profile to address the feedback above and resubmit for review.')}
      ${ctaButton('Update Profile', `${BASE_URL}/profile`)}
    `),
  };
}

// ── School templates ─────────────────────────────────────────────

export function tplNewApplicationToSchool(opts: {
  schoolName: string;
  teacherName: string;
  jobTitle: string;
  matchScore?: number;
  referenceNumber: string;
}): { subject: string; html: string } {
  return {
    subject: `New Application: ${opts.teacherName} – ${opts.jobTitle}`,
    html: layout('New Application', `
      ${heading('New application received')}
      ${para(`${opts.teacherName} has applied for the <strong>${opts.jobTitle}</strong> position at your school.`)}
      ${infoBox([
        ['Applicant', opts.teacherName],
        ['Position', opts.jobTitle],
        ['Reference', opts.referenceNumber],
        ...(opts.matchScore !== undefined ? [['Match Score', `${opts.matchScore}%`] as [string, string]] : []),
      ])}
      ${ctaButton('Review Application', `${BASE_URL}/school/applications`)}
    `),
  };
}

export function tplInterviewResponseToSchool(opts: {
  schoolName: string;
  teacherName: string;
  jobTitle: string;
  action: 'accepted' | 'declined' | 'reschedule_requested';
  reason?: string;
  proposedTime?: Date;
}): { subject: string; html: string } {
  const actionCfg = {
    accepted:            { label: 'Accepted',              color: '#10b981', msg: `has accepted the interview invitation for <strong>${opts.jobTitle}</strong>.` },
    declined:            { label: 'Declined',              color: '#ef4444', msg: `has declined the interview invitation for <strong>${opts.jobTitle}</strong>.` },
    reschedule_requested:{ label: 'Reschedule Requested',  color: '#f59e0b', msg: `has requested to reschedule the interview for <strong>${opts.jobTitle}</strong>.` },
  }[opts.action];

  return {
    subject: `Interview ${actionCfg.label}: ${opts.teacherName} – ${opts.jobTitle}`,
    html: layout('Interview Response', `
      ${heading(`Interview ${actionCfg.label}`)}
      ${para(`${opts.teacherName} ${actionCfg.msg}`)}
      ${infoBox([
        ['Candidate', opts.teacherName],
        ['Position', opts.jobTitle],
        ['Response', actionCfg.label],
        ...(opts.proposedTime ? [['Proposed Time', opts.proposedTime.toLocaleString('en-SA', { dateStyle: 'full', timeStyle: 'short' })] as [string, string]] : []),
      ])}
      ${opts.reason ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:16px 0;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Note from Candidate</p><p style="margin:0;font-size:13px;color:#475569;">${opts.reason}</p></div>` : ''}
      ${ctaButton('Manage Interviews', `${BASE_URL}/school/interviews`)}
    `),
  };
}

export function tplOfferResponseToSchool(opts: {
  schoolName: string;
  teacherName: string;
  position: string;
  action: 'accepted' | 'declined' | 'negotiate';
  reason?: string;
  counterSalary?: number;
}): { subject: string; html: string } {
  const actionCfg = {
    accepted: { label: 'Accepted', color: '#10b981', msg: `has accepted your offer for the <strong>${opts.position}</strong> position.` },
    declined: { label: 'Declined', color: '#ef4444', msg: `has declined your offer for the <strong>${opts.position}</strong> position.` },
    negotiate:{ label: 'Negotiation Requested', color: '#f59e0b', msg: `would like to negotiate the terms of your offer for <strong>${opts.position}</strong>.` },
  }[opts.action];

  return {
    subject: `Offer ${actionCfg.label}: ${opts.teacherName} – ${opts.position}`,
    html: layout('Offer Response', `
      ${heading(`Offer ${actionCfg.label}`)}
      ${para(`${opts.teacherName} ${actionCfg.msg}`)}
      ${infoBox([
        ['Candidate', opts.teacherName],
        ['Position', opts.position],
        ['Response', actionCfg.label],
        ...(opts.counterSalary ? [['Counter Salary', `SAR ${opts.counterSalary.toLocaleString()} / month`] as [string, string]] : []),
      ])}
      ${opts.reason ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:16px 0;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Message</p><p style="margin:0;font-size:13px;color:#475569;">${opts.reason}</p></div>` : ''}
      ${ctaButton('Manage Offers', `${BASE_URL}/school/offers`)}
    `),
  };
}

export function tplSchoolVerified(opts: { schoolName: string }): { subject: string; html: string } {
  return {
    subject: 'Your school has been verified on Abjad',
    html: layout('School Verified', `
      ${heading('Your school is verified!')}
      ${para(`${opts.schoolName} has been reviewed and verified by the Abjad team. Your school now appears as "Verified by Abjad" to teachers, increasing trust and application rates.`)}
      ${ctaButton('Post a Job', `${BASE_URL}/school/jobs/new`)}
    `),
  };
}

export function tplSchoolRejected(opts: {
  schoolName: string;
  reason: string;
}): { subject: string; html: string } {
  return {
    subject: 'Action Required: School Verification – Abjad',
    html: layout('School Verification', `
      ${heading('Your school verification needs attention')}
      ${para(`The profile for <strong>${opts.schoolName}</strong> could not be verified at this time.`)}
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
        <p style="margin:0;font-size:13px;color:#7f1d1d;">${opts.reason}</p>
      </div>
      ${para('Please update your school profile to address the feedback and resubmit for review.')}
      ${ctaButton('Update School Profile', `${BASE_URL}/school/profile`)}
    `),
  };
}

export function tplTeamInvitation(opts: {
  inviteeName: string;
  schoolName: string;
  role: string;
  invitedByName?: string;
}): { subject: string; html: string } {
  const roleLabel: Record<string, string> = {
    admin: 'Admin',
    recruiter: 'Recruiter',
    interviewer: 'Interviewer',
    viewer: 'Viewer',
  };
  return {
    subject: `You've been invited to join ${opts.schoolName} on Abjad`,
    html: layout('Team Invitation', `
      ${heading('You\'ve been invited to Abjad!')}
      ${para(`Hi ${opts.inviteeName}, ${opts.invitedByName ? `<strong>${opts.invitedByName}</strong> from ` : ''}<strong>${opts.schoolName}</strong> has invited you to join their recruitment team on Abjad.`)}
      ${infoBox([
        ['School', opts.schoolName],
        ['Your Role', roleLabel[opts.role] ?? opts.role],
      ])}
      ${ctaButton('Accept Invitation', `${BASE_URL}/auth/signup`)}
    `),
  };
}
