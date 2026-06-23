import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './app';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/abjad';

// Module-level flag reused across warm serverless invocations
let isConnected = false;

export const connectDB = async (): Promise<void> => {
  if (isConnected) return;

  const db = await mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  isConnected = db.connections[0].readyState === 1;
  console.log('✅ MongoDB connected successfully');

  // One-shot migration: any user still on the legacy "pending" default needs
  // to be flipped to "active". OTP is the email-verification step, so a
  // pending status was a footgun — /me would 403 and the user would be
  // logged straight back out. Idempotent: a no-op after the first run.
  try {
    const User = (await import('./models/user.model')).default;
    const r = await User.updateMany({ status: 'pending' }, { $set: { status: 'active' } });
    if (r.modifiedCount > 0) {
      console.log(`[migration] flipped ${r.modifiedCount} pending user(s) → active`);
    }
  } catch (err) {
    console.error('[migration] pending→active failed:', err);
  }

  // Tier 2 #12 — warm the email-template override cache on first connect so
  // every transactional send is a sync registry lookup. Failures are
  // non-fatal (service falls back to registry defaults at render time).
  try {
    const { templateService } = await import('./modules/email-templates/template.service');
    await templateService.warm();
  } catch (err) {
    console.error('[email-templates] warm failed:', err);
  }
};

// Local development only — Vercel uses api/index.ts as the entry point
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;

  const startServer = async () => {
    try {
      await connectDB();
      app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      });
      // SRD 2.6.3 — start the interview reminder scanner. Local dev only;
      // production should hit POST /api/internal/process-reminders from a
      // scheduler (Vercel Cron, external) since setInterval can't run in
      // serverless functions.
      const { startInterviewReminderWorker } = await import('./workers/interview-reminder.worker');
      startInterviewReminderWorker();
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  process.on('unhandledRejection', (err: Error) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
  });

  startServer();
}

export default app;
