/**
 * One-off: set User.name from firstName + lastName where it is missing.
 * Sign-up never set `name`, so school-side views showed applicants as "Candidate".
 * Usage: pnpm exec ts-node --transpile-only -P tsconfig.json scripts/backfill-user-names.ts [--apply]
 * Without --apply it only counts (read-only).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/user.model';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const filter = { $or: [{ name: { $exists: false } }, { name: '' }, { name: null }], $and: [{ $or: [{ firstName: { $nin: [null, ''] } }, { lastName: { $nin: [null, ''] } }, { schoolName: { $nin: [null, ''] } }] }] };
  const users = await User.find(filter).select('firstName lastName schoolName role').lean();
  console.log(`${users.length} users without name (teachers: ${users.filter((u) => u.role === 'teacher').length}, schools: ${users.filter((u) => u.role === 'school').length})`);
  if (process.argv.includes('--apply')) {
    for (const u of users) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || (u as { schoolName?: string }).schoolName?.trim();
      if (name) await User.updateOne({ _id: u._id, $or: [{ name: { $exists: false } }, { name: '' }, { name: null }] }, { $set: { name } });
    }
    console.log('applied');
  }
  await mongoose.disconnect();
})();
