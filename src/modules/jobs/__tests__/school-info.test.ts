/**
 * Job listings carry the school's display name and a verified flag.
 * A school may post before filling its profile, so the sign-up name is the fallback.
 */
import User from '../../../models/user.model';
import SchoolProfile from '../../../models/school-profile.model';
import { Job } from '../../../models/job.model';
import { jobsRepository } from '../jobs.repository';

async function school(schoolName: string, profile?: { nameEn?: string; profileStatus: string }) {
  const u = await User.create({ email: `${Date.now()}-${Math.random()}@school.test`, role: 'school', status: 'active', schoolName });
  if (profile) await SchoolProfile.create({ userId: u._id, documents: {}, ...profile });
  await Job.create({ schoolId: u._id, title: `Job at ${schoolName}`, description: 'x', employmentType: 'full_time', city: 'Riyadh', status: 'active' });
  return schoolName;
}

it('falls back to sign-up name and flags only verified schools', async () => {
  await school('Signup Only School');
  await school('Verified School', { nameEn: 'Verified School Profile', profileStatus: 'verified' });
  await school('Pending School', { nameEn: 'Pending School Profile', profileStatus: 'pending' });

  const { jobs } = await jobsRepository.findActive({ page: 1, limit: 50 });
  const by = (t: string) => jobs.find((j) => j.title === t)!.school!;
  expect(by('Job at Signup Only School')).toMatchObject({ name: 'Signup Only School', verified: false });
  expect(by('Job at Verified School')).toMatchObject({ name: 'Verified School Profile', verified: true });
  expect(by('Job at Pending School')).toMatchObject({ name: 'Pending School Profile', verified: false });
});
