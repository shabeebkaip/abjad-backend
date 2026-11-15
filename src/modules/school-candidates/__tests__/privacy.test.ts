/**
 * Schools must never receive a teacher's National ID / Iqama.
 */
import mongoose from 'mongoose';
import TeacherProfile from '../../../models/teacher-profile.model';
import { schoolCandidatesRepository } from '../school-candidates.repository';

describe('school-facing teacher reads hide personal.nationalId', () => {
  let userId: string;
  beforeAll(async () => {
    userId = new mongoose.Types.ObjectId().toString();
    await TeacherProfile.create({
      userId,
      profileStatus: 'approved',
      personal: { fullNameEn: 'Test Teacher', nationalId: '1234567890' },
    });
  });

  it('findById', async () => {
    const p = await schoolCandidatesRepository.findById(userId);
    expect(p?.personal?.fullNameEn).toBe('Test Teacher');
    expect(p?.personal?.nationalId).toBeUndefined();
  });

  it('search + ranking', async () => {
    const { teachers } = await schoolCandidatesRepository.search({ page: 1, limit: 10 } as never);
    const ranked = await schoolCandidatesRepository.findAllForRanking({} as never);
    for (const t of [...teachers, ...ranked]) expect(t.personal?.nationalId).toBeUndefined();
    expect(teachers.length + ranked.length).toBeGreaterThan(0);
  });
});
