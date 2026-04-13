/**
 * Jest Setup File
 * Runs before all tests
 * Configures mongodb-memory-server and connects Mongoose
 */

const dotenv = require("dotenv");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let mongoServer;

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Set NODE_ENV to test
process.env.NODE_ENV = "test";

// Start mongodb-memory-server and connect Mongoose before all tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;

  // Connect Mongoose to in-memory DB (app.ts doesn't connect — server.ts does)
  await mongoose.connect(mongoUri);
}, 60000);

// Disconnect Mongoose and stop mongodb-memory-server after all tests
afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);
