// SRD 2.6.3 — Interview reminders (24h + 1h before).
//
// Periodic scan: every 5 minutes, find interviews whose scheduledAt falls in
// the 23-25h or 0.5-1.5h window and that don't yet have the corresponding
// reminder recorded in `interview.reminders`. For each match, push the
// reminder entry and create an `interview_reminder` Notification for the
// teacher.
//
// Local dev: started by server.ts after the Mongo connection is ready.
// Production (Vercel serverless): setInterval doesn't work — use the
// processReminders() function via a Vercel Cron trigger or an external
// scheduler hitting POST /api/internal/process-reminders.

import mongoose from 'mongoose';
import { Interview } from '../models/interview.model';
import { Notification } from '../models/notification.model';
import User from '../models/user.model';
import { sendEmail } from '../utils/email.util';
import { tplInterviewReminder } from '../utils/email-templates.util';

const FIVE_MIN_MS  = 5 * 60 * 1000;
const ONE_HOUR_MS  = 60 * 60 * 1000;

const TYPES: Array<{ type: '24h' | '1h'; hours: 24 | 1; minMs: number; maxMs: number; teacherLabel: string; schoolLabel: string }> = [
  { type: '24h', hours: 24, minMs: 23 * ONE_HOUR_MS,  maxMs: 25 * ONE_HOUR_MS,  teacherLabel: 'Interview in 24 hours',          schoolLabel: 'Interview tomorrow' },
  { type: '1h',  hours: 1,  minMs: 0.5 * ONE_HOUR_MS, maxMs: 1.5 * ONE_HOUR_MS, teacherLabel: 'Interview starting in 1 hour',   schoolLabel: 'Candidate interview in 1 hour' },
];

// SRD 2.6.3 — reminders fire only for active/upcoming interviews.
// Cancelled / declined / completed / past interviews don't get reminders.
const REMINDABLE_STATUSES = ['accepted', 'pending', 'rescheduled'];

interface PopulatedInterview {
  _id: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  schoolId: mongoose.Types.ObjectId;
  scheduledAt: Date;
  type: string;
  duration: number;
  location?: string;
  meetingLink?: string;
  jobId?: { title?: string } | null;
}

async function fireRemindersForWindow(
  cfg: typeof TYPES[number],
): Promise<number> {
  const now = Date.now();
  const candidates = await Interview.find({
    status: { $in: REMINDABLE_STATUSES },
    scheduledAt: { $gt: new Date(now + cfg.minMs), $lt: new Date(now + cfg.maxMs) },
    'reminders.type': { $ne: cfg.type },
  })
    .populate('jobId', 'title')
    .lean();

  let sent = 0;
  for (const raw of candidates) {
    const interview = raw as unknown as PopulatedInterview;
    // Atomic re-check — if another worker instance got here first, modifiedCount
    // will be 0 and we skip notification/email creation entirely.
    const update = await Interview.updateOne(
      { _id: interview._id, 'reminders.type': { $ne: cfg.type } },
      { $push: { reminders: { type: cfg.type, sentAt: new Date() } } },
    );
    if (update.modifiedCount === 0) continue;

    await notifyAndEmail(interview, cfg);
    sent++;
  }
  return sent;
}

interface UserLite { _id: { toString(): string }; email?: string; firstName?: string; lastName?: string; schoolName?: string; emailNotificationsEnabled?: boolean }

async function notifyAndEmail(interview: PopulatedInterview, cfg: typeof TYPES[number]): Promise<void> {
  const jobTitle = interview.jobId?.title ?? 'your interview';
  const when     = new Date(interview.scheduledAt).toLocaleString('en-SA', { dateStyle: 'medium', timeStyle: 'short' });

  // Fetch both users so we know names + emails + email preferences.
  const [teacher, school] = await Promise.all([
    User.findById(interview.teacherId.toString()).select('email firstName lastName emailNotificationsEnabled').lean<UserLite | null>(),
    User.findById(interview.schoolId.toString()).select('email firstName lastName schoolName emailNotificationsEnabled').lean<UserLite | null>(),
  ]);

  const teacherName    = teacher ? `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim() || (teacher.email ?? 'Teacher') : 'Teacher';
  const schoolDisplay  = school?.schoolName ?? (`${school?.firstName ?? ''} ${school?.lastName ?? ''}`.trim() || school?.email || 'School');

  // In-app notifications — both parties.
  await Promise.all([
    Notification.create({
      userId: interview.teacherId,
      type: 'interview_reminder',
      title: cfg.teacherLabel,
      body: `Your interview for "${jobTitle}" with ${schoolDisplay} is scheduled for ${when}.`,
      data: { interviewId: interview._id.toString() },
    }),
    Notification.create({
      userId: interview.schoolId,
      type: 'interview_reminder',
      title: cfg.schoolLabel,
      body: `Interview with ${teacherName} for "${jobTitle}" is scheduled for ${when}.`,
      data: { interviewId: interview._id.toString() },
    }),
  ]);

  // Email both parties — respect emailNotificationsEnabled (default true if
  // the field isn't set, matching the rest of the codebase).
  const sendIfAllowed = async (user: UserLite | null, audience: 'teacher' | 'school', counterpartName: string) => {
    if (!user?.email) return;
    if (user.emailNotificationsEnabled === false) return;
    const recipientName = audience === 'teacher' ? teacherName : schoolDisplay;
    const { subject, html } = tplInterviewReminder({
      recipientName,
      audience,
      hoursBefore: cfg.hours,
      jobTitle,
      counterpartName,
      scheduledAt: interview.scheduledAt,
      type: interview.type,
      duration: interview.duration,
      location: interview.location,
      meetingLink: interview.meetingLink,
    });
    // Fire-and-forget — don't let a slow SMTP block the worker.
    sendEmail(user.email, subject, html).catch((err) => {
      console.error(`[reminder-worker] email to ${user.email} failed:`, err);
    });
  };

  await Promise.all([
    sendIfAllowed(teacher, 'teacher', schoolDisplay),
    sendIfAllowed(school,  'school',  teacherName),
  ]);
}

/**
 * Single pass — scans both windows and fires reminders. Safe to call from a
 * setInterval (dev) or an HTTP cron trigger (prod). Returns a summary.
 */
export async function processReminders(): Promise<{ sent24h: number; sent1h: number }> {
  const [sent24h, sent1h] = await Promise.all([
    fireRemindersForWindow(TYPES[0]!),
    fireRemindersForWindow(TYPES[1]!),
  ]);
  if (sent24h + sent1h > 0) {
    console.log(`[reminder-worker] sent ${sent24h} 24h + ${sent1h} 1h reminder pair(s)`);
  }
  return { sent24h, sent1h };
}

let intervalId: NodeJS.Timeout | null = null;

export function startInterviewReminderWorker(): void {
  if (intervalId) return;
  // Don't block startup — run async
  processReminders().catch((err) => console.error('[reminder-worker] initial pass failed:', err));
  intervalId = setInterval(() => {
    processReminders().catch((err) => console.error('[reminder-worker] interval pass failed:', err));
  }, FIVE_MIN_MS);
  console.log('🔔 Interview reminder worker started (5-min interval)');
}

export function stopInterviewReminderWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
