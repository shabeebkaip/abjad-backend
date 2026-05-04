import app from '../src/app';
import { connectDB } from '../src/server';

// Each cold start awaits the DB; warm invocations return instantly (isConnected flag)
export default async function handler(req: any, res: any): Promise<void> {
  await connectDB();
  app(req, res, () => {});
}
