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
