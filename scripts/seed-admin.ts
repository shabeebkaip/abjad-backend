/**
 * Seed script: create the Abjad super-admin user.
 * Run once:  npx ts-node scripts/seed-admin.ts
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/abjad-platform';

const ADMIN_EMAIL = 'admin@abjad.com.sa';
const ADMIN_PASSWORD = 'abjad@123#';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Dynamic import after mongoose is connected (model registers itself)
  const { default: User } = await import('../src/models/user.model');

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin user already exists (id: ${existing._id}). Updating password…`);
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.updateOne(
      { email: ADMIN_EMAIL },
      { $set: { password: hash, status: 'active', role: 'admin' } }
    );
    console.log('Password updated.');
  } else {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({
      email: ADMIN_EMAIL,
      password: hash,
      role: 'admin',
      status: 'active',
      name: 'Super Admin',
      firstName: 'Super',
      lastName: 'Admin',
      isEmailVerified: true,
      isPhoneVerified: false,
      isProfileComplete: true,
      profileStep: 'complete',
      failedLoginAttempts: 0,
      loginCount: 0,
      pushNotificationsEnabled: false,
      emailNotificationsEnabled: true,
      deviceTokens: [],
      language: 'en',
    });
    console.log(`Admin user created: ${ADMIN_EMAIL}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
