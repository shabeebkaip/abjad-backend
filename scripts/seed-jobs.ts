/**
 * Seed script: bulk-create active job postings for pagination testing.
 *
 *   pnpm exec ts-node scripts/seed-jobs.ts            # creates 50 jobs
 *   pnpm exec ts-node scripts/seed-jobs.ts 100        # creates N jobs
 *   pnpm exec ts-node scripts/seed-jobs.ts --reset    # wipes seed-marked jobs first
 *
 * Re-runnable: jobs created by this script have description prefixed with
 * "[seed]" so --reset can find them without touching real jobs.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/abjad-platform';
const SEED_TAG = '[seed]';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const countArg = args.find((a) => /^\d+$/.test(a));
const COUNT = countArg ? parseInt(countArg, 10) : 50;

const SUBJECTS = ['islamic_studies','arabic','english','math','science','physics','chemistry','biology','computer_science','social_studies','pe','art'];
const GRADES = ['kg','elementary_1','elementary_3','elementary_5','middle_7','middle_8','middle_9','high_10','high_11','high_12'];
const CITIES = ['riyadh','jeddah','khobar','dammam','mecca','medina','abha','tabuk'];
const EMPLOYMENT_TYPES: Array<'full_time'|'part_time'|'contract'|'temporary'> = ['full_time','part_time','contract','temporary'];
const LANGUAGES: Array<'arabic'|'english'|'bilingual'> = ['arabic','english','bilingual'];
const EXPERIENCE: Array<'0-1'|'1-3'|'3-5'|'5-10'|'10+'> = ['0-1','1-3','3-5','5-10','10+'];
const DEGREES: Array<'bachelor'|'master'|'phd'|'diploma'> = ['bachelor','master','phd','diploma'];
const SALARY_DISPLAY: Array<'show'|'negotiable'|'hidden'> = ['show','negotiable','hidden'];

const TITLE_PREFIXES = ['Senior', 'Lead', 'Head of', 'Junior', 'Assistant', ''];
const TITLE_SUFFIXES_BY_SUBJECT: Record<string, string[]> = {
  islamic_studies: ['Islamic Studies Teacher', 'Quran Instructor', 'Fiqh Educator'],
  arabic: ['Arabic Language Teacher', 'Arabic Literature Tutor'],
  english: ['English Language Teacher', 'ESL Instructor', 'EFL Coordinator'],
  math: ['Mathematics Teacher', 'Math Tutor', 'Algebra Specialist'],
  science: ['Science Teacher', 'General Science Educator'],
  physics: ['Physics Teacher', 'Physics Lab Coordinator'],
  chemistry: ['Chemistry Teacher', 'Chemistry Lab Instructor'],
  biology: ['Biology Teacher', 'Life Sciences Educator'],
  computer_science: ['Computer Science Teacher', 'ICT Instructor', 'Programming Coach'],
  social_studies: ['Social Studies Teacher', 'History Educator', 'Geography Teacher'],
  pe: ['PE Teacher', 'Physical Education Coach', 'Sports Coordinator'],
  art: ['Art Teacher', 'Visual Arts Instructor', 'Design Educator'],
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function pickSome<T>(arr: T[], min: number, max: number): T[] {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function ensureSchoolUser(User: mongoose.Model<any>): Promise<mongoose.Types.ObjectId> {
  const existing = await User.findOne({ role: 'school' });
  if (existing) {
    console.log(`Using existing school user: ${existing.email} (${existing._id})`);
    return existing._id;
  }
  const created = await User.create({
    email: 'seed-school@abjad.local',
    role: 'school',
    status: 'active',
    schoolName: 'Abjad Seed Academy',
    firstName: 'Seed',
    lastName: 'Admin',
  });
  console.log(`Created placeholder school user: ${created.email} (${created._id})`);
  return created._id;
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);

  const { default: User } = await import('../src/models/user.model');
  const { Job } = await import('../src/models/job.model');

  if (reset) {
    const result = await Job.deleteMany({ description: { $regex: `^${SEED_TAG.replace('[','\\[').replace(']','\\]')}` } });
    console.log(`--reset: deleted ${result.deletedCount} previously-seeded jobs`);
  }

  const schoolId = await ensureSchoolUser(User);

  const now = Date.now();
  const docs = Array.from({ length: COUNT }).map((_, i) => {
    const subjects = pickSome(SUBJECTS, 1, 3);
    const primarySubject = subjects[0]!;
    const titleVariants = TITLE_SUFFIXES_BY_SUBJECT[primarySubject] ?? ['Teacher'];
    const prefix = pick(TITLE_PREFIXES);
    const title = `${prefix ? prefix + ' ' : ''}${pick(titleVariants)}`.trim();

    const minSalary = 6000 + Math.floor(Math.random() * 8) * 500;
    const maxSalary = minSalary + 2000 + Math.floor(Math.random() * 8) * 500;

    // Spread postedAt across the last 60 days, deadlines into next 1-90 days
    const postedAt = new Date(now - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000);
    const deadline = new Date(now + (1 + Math.floor(Math.random() * 90)) * 24 * 60 * 60 * 1000);

    return {
      schoolId,
      title,
      subjects,
      gradeLevels: pickSome(GRADES, 1, 4),
      description: `${SEED_TAG} ${title} position at one of our partner schools. We are looking for a passionate educator to join our growing team. The role involves curriculum planning, classroom delivery, and student assessment. Strong subject knowledge and excellent communication skills required.`,
      employmentType: pick(EMPLOYMENT_TYPES),
      salary: {
        min: minSalary,
        max: maxSalary,
        display: pick(SALARY_DISPLAY),
      },
      contractDuration: { type: 'month', value: 12 },
      positions: 1 + Math.floor(Math.random() * 3),
      startDate: new Date(now + (30 + Math.floor(Math.random() * 60)) * 24 * 60 * 60 * 1000),
      deadline,
      city: pick(CITIES),
      languageRequirement: pick(LANGUAGES),
      experienceRequired: pick(EXPERIENCE),
      degreeRequired: pick(DEGREES),
      teachingLicenseRequired: Math.random() < 0.4,
      genderPreference: 'any' as const,
      status: 'active' as const,
      applicationsCount: 0,
      viewsCount: Math.floor(Math.random() * 100),
      isAnonymous: false,
      createdAt: postedAt,
      updatedAt: postedAt,
      // i is unused but kept for readability
      _seedIndex: i,
    };
  });

  // Mongoose ignores unknown fields like _seedIndex
  const inserted = await Job.insertMany(docs.map(({ _seedIndex, ...d }) => d));
  console.log(`Created ${inserted.length} jobs across ${CITIES.length} cities and ${SUBJECTS.length} subjects.`);

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
