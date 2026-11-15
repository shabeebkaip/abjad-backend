/**
 * A teacher who withdraws can apply to the same open job again (promised in the
 * teacher Support FAQ). The unique teacher+job index means the application is reopened.
 */
import mongoose from 'mongoose';
import User from '../../../models/user.model';
import TeacherProfile from '../../../models/teacher-profile.model';
import { Job } from '../../../models/job.model';
import { Application } from '../../../models/application.model';
import { applicationsService } from '../applications.service';

jest.mock('../../../utils/email.util', () => ({ sendEmail: jest.fn() }));

it('apply -> withdraw -> apply again reopens the same application', async () => {
  const school = await User.create({ email: `s-${Date.now()}@school.test`, role: 'school', status: 'active', schoolName: 'S' });
  const teacher = await User.create({ email: `t-${Date.now()}@teacher.test`, role: 'teacher', status: 'active' });
  await TeacherProfile.create({ userId: teacher._id, profileStatus: 'approved' });
  const job = await Job.create({ schoolId: school._id, title: 'Math', description: 'x', employmentType: 'full_time', city: 'Riyadh', status: 'active' });
  const [tid, jid] = [String(teacher._id), String(job._id)];

  const first = await applicationsService.apply(tid, jid, 'first');
  await applicationsService.withdraw(tid, String(first._id));
  const again = await applicationsService.apply(tid, jid, 'second');

  expect(String(again._id)).toBe(String(first._id));
  expect(again.status).toBe('submitted');
  expect(again.coverLetter).toBe('second');
  expect(again.statusHistory.map((h) => h.status)).toEqual(['submitted', 'withdrawn', 'submitted']);
  expect(await Application.countDocuments({ teacherId: teacher._id, jobId: job._id })).toBe(1);
  expect((await Job.findById(job._id))!.applicationsCount).toBe(1);

  // A live application still blocks a duplicate.
  await expect(applicationsService.apply(tid, jid)).rejects.toMatchObject({ statusCode: 409 });
  // apply() fires its email lookups without awaiting; let them settle before teardown.
  await new Promise((r) => setTimeout(r, 300));
  void mongoose;
});
