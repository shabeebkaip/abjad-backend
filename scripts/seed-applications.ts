/**
 * Seed script: bulk-create applications with realistic statusHistory so the
 * teacher's My Applications analytics (SRD 2.5.4) can be tested without having
 * to log in as the school and walk every application through the pipeline.
 *
 *   pnpm exec ts-node scripts/seed-applications.ts <teacher-email>
 *   pnpm exec ts-node scripts/seed-applications.ts <teacher-email> --reset
 *
 * Creates ~8 applications across submitted / reviewing / shortlisted /
 * interview_scheduled / offer_extended / hired / rejected with backdated
 * timestamps. Re-runnable: cover letters are tagged "[seed]" so --reset only
 * touches seeded data.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/abjad-platform';
const SEED_TAG = '[seed]';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const email = args.find((a) => !a.startsWith('--'));

if (!email) {
  console.error('Usage: pnpm exec ts-node scripts/seed-applications.ts <teacher-email> [--reset]');
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Each scenario: applied N days ago, then responded after `respondAfter` days
// reaching `finalStatus`. The history entries are derived from the chain.
interface Scenario {
  daysAgoApplied: number;
  respondAfterDays?: number; // undefined → still at submitted
  finalStatus: 'submitted' | 'reviewing' | 'shortlisted' | 'interview_scheduled' | 'offer_extended' | 'hired' | 'rejected';
}

const SCENARIOS: Scenario[] = [
  { daysAgoApplied: 1,  finalStatus: 'submitted' },                                  // fresh, no response yet
  { daysAgoApplied: 5,  finalStatus: 'submitted' },                                  // older, school never responded
  { daysAgoApplied: 4,  respondAfterDays: 2,  finalStatus: 'reviewing' },
  { daysAgoApplied: 6,  respondAfterDays: 3,  finalStatus: 'shortlisted' },
  { daysAgoApplied: 8,  respondAfterDays: 4,  finalStatus: 'interview_scheduled' },
  { daysAgoApplied: 10, respondAfterDays: 6,  finalStatus: 'offer_extended' },
  { daysAgoApplied: 15, respondAfterDays: 12, finalStatus: 'hired' },                // success
  { daysAgoApplied: 10, respondAfterDays: 5,  finalStatus: 'rejected' },
];

function buildHistory(scenario: Scenario, now: number): { status: Scenario['finalStatus']; statusHistory: Array<{ status: string; timestamp: Date; note?: string }>; createdAt: Date } {
  const appliedAt = new Date(now - scenario.daysAgoApplied * DAY_MS);
  const history: Array<{ status: string; timestamp: Date; note?: string }> = [
    { status: 'submitted', timestamp: appliedAt, note: SEED_TAG },
  ];

  if (scenario.respondAfterDays !== undefined && scenario.finalStatus !== 'submitted') {
    const respondedAt = new Date(appliedAt.getTime() + scenario.respondAfterDays * DAY_MS);
    history.push({ status: scenario.finalStatus, timestamp: respondedAt });
  }

  return { status: scenario.finalStatus, statusHistory: history, createdAt: appliedAt };
}

function genRefNumber(): string {
  return `APP-SEED-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);

  const { default: User } = await import('../src/models/user.model');
  const { default: TeacherProfile } = await import('../src/models/teacher-profile.model');
  const { Job } = await import('../src/models/job.model');
  const { Application } = await import('../src/models/application.model');

  // 1. Find the teacher
  const teacher = await User.findOne({ email: email!.toLowerCase() });
  if (!teacher) {
    console.error(`Teacher not found: ${email}`);
    process.exit(1);
  }
  if (teacher.role !== 'teacher') {
    console.error(`User ${email} is role=${teacher.role}, expected 'teacher'`);
    process.exit(1);
  }
  console.log(`Teacher: ${teacher.email} (${teacher._id})`);

  // 2. Get the teacher profile (required by Application schema)
  let profile = await TeacherProfile.findOne({ userId: teacher._id });
  if (!profile) {
    console.log('Creating placeholder TeacherProfile…');
    profile = await TeacherProfile.create({
      uuid: new mongoose.Types.ObjectId().toString(),
      userId: teacher._id,
      profileStatus: 'draft',
      completionPercentage: 0,
    });
  }

  // 3. --reset: wipe previously seeded apps for this teacher
  if (reset) {
    const result = await Application.deleteMany({
      teacherId: teacher._id,
      coverLetter: { $regex: `^\\${SEED_TAG.replace(']','\\]')}` },
    });
    console.log(`--reset: deleted ${result.deletedCount} previously seeded applications`);
  }

  // 4. Find active jobs the teacher hasn't applied to
  const existing = await Application.find({ teacherId: teacher._id }).select('jobId').lean();
  const appliedJobIds = new Set(existing.map((a) => (a as { jobId: { toString(): string } }).jobId.toString()));

  const jobs = await Job.find({ status: 'active' }).limit(50).lean();
  const candidates = jobs.filter((j) => !appliedJobIds.has((j as { _id: { toString(): string } })._id.toString()));

  if (candidates.length < SCENARIOS.length) {
    console.error(`Not enough unapplied active jobs (${candidates.length}) for ${SCENARIOS.length} scenarios. Run seed-jobs.ts first.`);
    process.exit(1);
  }

  // 5. Create one application per scenario
  const now = Date.now();
  const docs = SCENARIOS.map((scenario, i) => {
    const job = candidates[i] as { _id: mongoose.Types.ObjectId; schoolId: mongoose.Types.ObjectId };
    const { status, statusHistory, createdAt } = buildHistory(scenario, now);
    return {
      referenceNumber: genRefNumber(),
      jobId: job._id,
      teacherId: teacher._id,
      teacherProfileId: profile!._id,
      schoolId: job.schoolId,
      coverLetter: `${SEED_TAG} Application created by seed script for analytics testing.`,
      status,
      statusHistory,
      matchScore: 60 + Math.floor(Math.random() * 35),
      isRead: false,
      createdAt,
      updatedAt: new Date(statusHistory[statusHistory.length - 1]!.timestamp),
    };
  });

  await Application.insertMany(docs);
  console.log(`Created ${docs.length} applications:`);
  for (const d of docs) {
    const final = d.statusHistory[d.statusHistory.length - 1]!;
    console.log(`  - ${d.status.padEnd(20)} applied ${d.createdAt.toISOString().slice(0,10)}  final ${final.timestamp.toISOString().slice(0,10)}`);
  }

  // 6. Summary preview (mirrors getStats math so user knows what to expect)
  const respondedCount = docs.filter((d) => d.status !== 'submitted').length;
  const hiredCount     = docs.filter((d) => d.status === 'hired').length;
  const responseTimes  = docs
    .filter((d) => d.statusHistory.length > 1)
    .map((d) => (d.statusHistory[1]!.timestamp.getTime() - d.statusHistory[0]!.timestamp.getTime()) / 3_600_000);
  const avgHours = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  console.log('\nExpected analytics:');
  console.log(`  Total Applied      : ${docs.length}`);
  console.log(`  Response Rate      : ${Math.round((respondedCount / docs.length) * 100)}%`);
  console.log(`  Avg Response Time  : ${avgHours == null ? '—' : avgHours < 24 ? `${avgHours}h` : `${Math.round(avgHours / 24)}d`}`);
  console.log(`  Success Rate       : ${Math.round((hiredCount / docs.length) * 100)}%`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
