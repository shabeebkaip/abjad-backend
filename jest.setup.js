/**
 * Jest Setup File
 * Runs before all tests
 * Configures mongodb-memory-server
 */

const dotenv = require("dotenv");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Set NODE_ENV to test
process.env.NODE_ENV = "test";

// Start mongodb-memory-server before all tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;
});

// Stop mongodb-memory-server after all tests
afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Suppress verbose logs during tests (optional)
// global.console.log = jest.fn();
// global.console.error = jest.fn();
