import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './app';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/abjad';

// Database connection with connection pooling for serverless
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('Using existing database connection');
    return;
  }

  try {
    const db = await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    isConnected = db.connections[0].readyState === 1;
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

// For Vercel serverless deployment
if (process.env.VERCEL) {
  // Connect to database for serverless
  connectDB().catch(err => {
    console.error('Database connection failed:', err);
  });
  
  // Export the Express app for Vercel
  module.exports = app;
} else {
  // Local development server
  const startServer = async () => {
    try {
      // Connect to database
      await connectDB();

      // Start Express server
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

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err: Error) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
  });

  // Start the application
  startServer();
}

// Export for serverless
export default app;
