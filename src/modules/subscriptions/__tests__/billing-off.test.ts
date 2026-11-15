/**
 * Client feedback R1 §8.2–8.3: with billing switched off, a school with no
 * subscription must not be blocked from posting jobs or seeing candidates.
 */
import User from '../../../models/user.model';
import { getSchoolEntitlement } from '../../../utils/entitlement.util';
import { entitlementsService } from '../entitlements.service';

async function make(role: 'school' | 'teacher'): Promise<string> {
  const u = await User.create({
    email: `${role}-${Date.now()}-${Math.random()}@test.com`,
    role,
    status: 'active',
    ...(role === 'school' ? { schoolName: 'Test School' } : { firstName: 'T', lastName: 'T' }),
  });
  return (u._id as { toString(): string }).toString();
}

describe('BILLING_ENFORCED off', () => {
  const prev = process.env.BILLING_ENFORCED;
  beforeEach(() => { delete process.env.BILLING_ENFORCED; });
  afterAll(() => { process.env.BILLING_ENFORCED = prev; });

  it('school without a subscription can post jobs with no CV cap', async () => {
    const id = await make('school');
    const e = await getSchoolEntitlement(id);
    expect(e).toMatchObject({ hasAccess: true, canPostJobs: true, cvCap: null });
    const { bag } = await entitlementsService.getForUser(id);
    expect(bag.maxActiveJobs).toBeNull(); // null = unlimited
  });

  it('teachers keep the free bag (no premium handed out)', async () => {
    const { source } = await entitlementsService.getForUser(await make('teacher'));
    expect(source).toBe('free');
  });

  it('turning it on restores the gate', async () => {
    process.env.BILLING_ENFORCED = 'true';
    const id = await make('school');
    expect((await getSchoolEntitlement(id)).canPostJobs).toBe(false);
    expect((await entitlementsService.getForUser(id)).bag.maxActiveJobs).toBe(0);
  });
});
