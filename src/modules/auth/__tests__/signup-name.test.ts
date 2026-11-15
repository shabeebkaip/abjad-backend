/** School-side views read User.name; sign-up must set it from first + last name. */
import authRepository from '../auth.repository';

it('createUser sets name from first and last name', async () => {
  const u = await authRepository.createUser({ email: `n-${Date.now()}@teacher.test`, role: 'teacher', firstName: 'Sara', lastName: 'Al-Harbi' });
  expect(u.name).toBe('Sara Al-Harbi');
  const s = await authRepository.createUser({ email: `s-${Date.now()}@school.test`, role: 'school', schoolName: 'X School' });
  expect(s.name).toBe('X School');
});
