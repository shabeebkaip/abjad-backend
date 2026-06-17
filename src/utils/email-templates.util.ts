// Email templates — thin shims that delegate to the registry/service.
//
// Tier 2 #12 — Each tplXxx() prepares dynamic content (info tables, status
// banners, optional callouts) and passes the result as variables to
// templateService.render(). Admins can override subject + body for any
// template via /admin/email-templates without code changes.

import { templateService } from '../modules/email-templates/template.service';

const BASE_URL = process.env['FRONTEND_URL'] ?? 'https://abjad.sa';

// ── Inline HTML builders ─────────────────────────────────────────────────
// These produce the dynamic snippets that get pre-rendered and passed in
// as {{infoTable}} / {{statusBanner}} / etc. Kept here so shims stay
// declarative; the registry still owns the surrounding markup.

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

function statusBanner(color: string, message: string, reason?: string): string {
  return `
      <div style="background:${color}10;border:1px solid ${color}30;border-radius:10px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:${color};font-weight:500;">${message}</p>
        ${reason ? `<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Reason: ${reason}</p>` : ''}
      </div>`;
}

function calloutBlock(title: string, body: string, tone: 'neutral' | 'danger' = 'neutral'): string {
  const cfg = tone === 'danger'
    ? { bg: '#fef2f2', border: '#fecaca', titleColor: '#dc2626', bodyColor: '#7f1d1d' }
    : { bg: '#f8fafc', border: '#e2e8f0', titleColor: '#64748b', bodyColor: '#475569' };
  return `
      <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:10px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${cfg.titleColor};text-transform:uppercase;letter-spacing:0.5px;">${title}</p>
        <p style="margin:0;font-size:13px;color:${cfg.bodyColor};">${body}</p>
      </div>`;
}

function excerptBlock(text: string): string {
  return `
      <div style="background:#f8fafc;border-left:3px solid #00ACD3;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.55;">${text.replace(/\n/g, '<br>')}</p>
      </div>`;
}

// ── Teacher templates ────────────────────────────────────────────────────

export function tplApplicationSubmitted(opts: {
  teacherName: string;
  jobTitle: string;
  schoolName: string;
  referenceNumber: string;
}): { subject: string; html: string } {
  return templateService.render('application_submitted', {
    teacherName:     opts.teacherName,
    jobTitle:        opts.jobTitle,
    trackUrl:        `${BASE_URL}/applications`,
    infoTable:       infoBox([
      ['Position', opts.jobTitle],
      ['School', opts.schoolName],
      ['Reference', opts.referenceNumber],
      ['Status', 'Submitted'],
    ]),
  });
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

  return templateService.render('application_status_changed', {
    teacherName:  opts.teacherName,
    jobTitle:     opts.jobTitle,
    statusLabel:  cfg.label,
    trackUrl:     `${BASE_URL}/applications`,
    infoTable:    infoBox([
      ['Position', opts.jobTitle],
      ['School', opts.schoolName],
      ['New Status', cfg.label],
    ]),
    statusBanner: statusBanner(cfg.color, cfg.message, opts.rejectionReason),
  });
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

  return templateService.render('interview_invitation', {
    teacherName:       opts.teacherName,
    jobTitle:          opts.jobTitle,
    schoolName:        opts.schoolName,
    respondUrl:        `${BASE_URL}/interviews`,
    infoTable:         infoBox([
      ['Position', opts.jobTitle],
      ['School', opts.schoolName],
      ['Date & Time', opts.scheduledAt.toLocaleString('en-SA', { dateStyle: 'full', timeStyle: 'short' })],
      ['Duration', `${opts.duration} minutes`],
      ['Format', typeLabel[opts.type] ?? opts.type],
      ['Location / Link', locationDetail],
      ...(opts.responseDeadline ? [['Respond By', opts.responseDeadline.toLocaleDateString('en-SA')] as [string, string]] : []),
    ]),
    instructionsBlock: opts.instructions ? calloutBlock('Instructions', opts.instructions) : '',
  });
}

export function tplInterviewReminder(opts: {
  recipientName: string;
  audience: 'teacher' | 'school';
  hoursBefore: 24 | 1;
  jobTitle: string;
  counterpartName: string;
  scheduledAt: Date;
  type: string;
  duration: number;
  location?: string;
  meetingLink?: string;
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
  const whenLabel = opts.hoursBefore === 24 ? 'tomorrow' : 'in 1 hour';
  const headline  = opts.hoursBefore === 24 ? 'Interview reminder — tomorrow' : 'Interview reminder — starting in 1 hour';
  const ctaPath   = opts.audience === 'teacher' ? '/interviews' : '/school/interviews';
  const counterpartLabel = opts.audience === 'teacher' ? 'School' : 'Candidate';

  return templateService.render('interview_reminder', {
    recipientName: opts.recipientName,
    headline,
    whenLabel,
    jobTitle: opts.jobTitle,
    viewUrl: `${BASE_URL}${ctaPath}`,
    infoTable: infoBox([
      ['Position', opts.jobTitle],
      [counterpartLabel, opts.counterpartName],
      ['Date & Time', opts.scheduledAt.toLocaleString('en-SA', { dateStyle: 'full', timeStyle: 'short' })],
      ['Duration', `${opts.duration} minutes`],
      ['Format', typeLabel[opts.type] ?? opts.type],
      ['Location / Link', locationDetail],
    ]),
  });
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
  return templateService.render('offer_received', {
    teacherName: opts.teacherName,
    schoolName:  opts.schoolName,
    reviewUrl:   `${BASE_URL}/offers`,
    infoTable:   infoBox([
      ['Position', opts.position],
      ['School', opts.schoolName],
      ['Salary', `SAR ${opts.salary.toLocaleString()} / month`],
      ...(opts.startDate ? [['Start Date', opts.startDate.toLocaleDateString('en-SA')] as [string, string]] : []),
      ...(opts.contractDuration ? [['Contract', opts.contractDuration] as [string, string]] : []),
      ['Respond By', opts.deadline.toLocaleDateString('en-SA')],
    ]),
  });
}

export function tplHiredConfirmation(opts: {
  teacherName: string;
  position: string;
  schoolName: string;
  startDate?: Date;
}): { subject: string; html: string } {
  return templateService.render('hired_confirmation', {
    teacherName:  opts.teacherName,
    position:     opts.position,
    schoolName:   opts.schoolName,
    dashboardUrl: `${BASE_URL}/dashboard`,
    infoTable:    infoBox([
      ['Position', opts.position],
      ['School', opts.schoolName],
      ...(opts.startDate ? [['Start Date', opts.startDate.toLocaleDateString('en-SA')] as [string, string]] : []),
    ]),
  });
}

export function tplProfileApproved(opts: { teacherName: string }): { subject: string; html: string } {
  return templateService.render('profile_approved', {
    teacherName: opts.teacherName,
    profileUrl:  `${BASE_URL}/profile`,
  });
}

export function tplProfileRejected(opts: {
  teacherName: string;
  reason: string;
}): { subject: string; html: string } {
  return templateService.render('profile_rejected', {
    teacherName: opts.teacherName,
    profileUrl:  `${BASE_URL}/profile`,
    reasonBlock: calloutBlock('Reason', opts.reason, 'danger'),
  });
}

// ── School templates ─────────────────────────────────────────────────────

export function tplNewApplicationToSchool(opts: {
  schoolName: string;
  teacherName: string;
  jobTitle: string;
  matchScore?: number;
  referenceNumber: string;
}): { subject: string; html: string } {
  return templateService.render('new_application_to_school', {
    teacherName: opts.teacherName,
    jobTitle:    opts.jobTitle,
    reviewUrl:   `${BASE_URL}/school/applications`,
    infoTable:   infoBox([
      ['Applicant', opts.teacherName],
      ['Position', opts.jobTitle],
      ['Reference', opts.referenceNumber],
      ...(opts.matchScore !== undefined ? [['Match Score', `${opts.matchScore}%`] as [string, string]] : []),
    ]),
  });
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
    accepted:            { label: 'Accepted',              msg: `has accepted the interview invitation for <strong>${opts.jobTitle}</strong>.` },
    declined:            { label: 'Declined',              msg: `has declined the interview invitation for <strong>${opts.jobTitle}</strong>.` },
    reschedule_requested:{ label: 'Reschedule Requested',  msg: `has requested to reschedule the interview for <strong>${opts.jobTitle}</strong>.` },
  }[opts.action];

  return templateService.render('interview_response_to_school', {
    teacherName:   opts.teacherName,
    jobTitle:      opts.jobTitle,
    actionLabel:   actionCfg.label,
    actionMessage: actionCfg.msg,
    manageUrl:     `${BASE_URL}/school/interviews`,
    infoTable:     infoBox([
      ['Candidate', opts.teacherName],
      ['Position', opts.jobTitle],
      ['Response', actionCfg.label],
      ...(opts.proposedTime ? [['Proposed Time', opts.proposedTime.toLocaleString('en-SA', { dateStyle: 'full', timeStyle: 'short' })] as [string, string]] : []),
    ]),
    noteBlock:     opts.reason ? calloutBlock('Note from Candidate', opts.reason) : '',
  });
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
    accepted: { label: 'Accepted', msg: `has accepted your offer for the <strong>${opts.position}</strong> position.` },
    declined: { label: 'Declined', msg: `has declined your offer for the <strong>${opts.position}</strong> position.` },
    negotiate:{ label: 'Negotiation Requested', msg: `would like to negotiate the terms of your offer for <strong>${opts.position}</strong>.` },
  }[opts.action];

  return templateService.render('offer_response_to_school', {
    teacherName:   opts.teacherName,
    position:      opts.position,
    actionLabel:   actionCfg.label,
    actionMessage: actionCfg.msg,
    manageUrl:     `${BASE_URL}/school/offers`,
    infoTable:     infoBox([
      ['Candidate', opts.teacherName],
      ['Position', opts.position],
      ['Response', actionCfg.label],
      ...(opts.counterSalary ? [['Counter Salary', `SAR ${opts.counterSalary.toLocaleString()} / month`] as [string, string]] : []),
    ]),
    messageBlock:  opts.reason ? calloutBlock('Message', opts.reason) : '',
  });
}

export function tplSchoolVerified(opts: { schoolName: string }): { subject: string; html: string } {
  return templateService.render('school_verified', {
    schoolName: opts.schoolName,
    postJobUrl: `${BASE_URL}/school/jobs/new`,
  });
}

export function tplSchoolRejected(opts: {
  schoolName: string;
  reason: string;
}): { subject: string; html: string } {
  return templateService.render('school_rejected', {
    schoolName:  opts.schoolName,
    profileUrl:  `${BASE_URL}/school/profile`,
    reasonBlock: calloutBlock('Reason', opts.reason, 'danger'),
  });
}

// ── Support / team templates ─────────────────────────────────────────────

export function tplTicketReceived(opts: {
  recipientName: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  responseDueAt: Date;
}): { subject: string; html: string } {
  const categoryLabel: Record<string, string> = {
    technical: 'Technical',
    profile_application: 'Profile / Applications',
    payment: 'Payment',
    report: 'Report',
    general: 'General',
    other: 'Other',
  };
  return templateService.render('ticket_received', {
    recipientName: opts.recipientName,
    ticketNumber:  opts.ticketNumber,
    ticketUrl:     `${BASE_URL}/support`,
    infoTable:     infoBox([
      ['Ticket', opts.ticketNumber],
      ['Subject', opts.subject],
      ['Category', categoryLabel[opts.category] ?? opts.category],
      ['Priority', opts.priority.charAt(0).toUpperCase() + opts.priority.slice(1)],
      ['Response by', opts.responseDueAt.toLocaleString('en-SA', { dateStyle: 'medium', timeStyle: 'short' })],
    ]),
  });
}

export function tplTicketReplied(opts: {
  recipientName: string;
  ticketNumber: string;
  subject: string;
  excerpt: string;
}): { subject: string; html: string } {
  const safeExcerpt = opts.excerpt.length > 220 ? opts.excerpt.slice(0, 220).trimEnd() + '…' : opts.excerpt;
  return templateService.render('ticket_replied', {
    recipientName: opts.recipientName,
    ticketNumber:  opts.ticketNumber,
    subject:       opts.subject,
    ticketUrl:     `${BASE_URL}/support`,
    excerptBlock:  excerptBlock(safeExcerpt),
  });
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
  return templateService.render('team_invitation', {
    inviteeName:   opts.inviteeName,
    inviterClause: opts.invitedByName ? `<strong>${opts.invitedByName}</strong> from ` : '',
    schoolName:    opts.schoolName,
    acceptUrl:     `${BASE_URL}/auth/signup`,
    infoTable:     infoBox([
      ['School', opts.schoolName],
      ['Your Role', roleLabel[opts.role] ?? opts.role],
    ]),
  });
}
