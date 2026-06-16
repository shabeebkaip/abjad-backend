import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestId } from './middlewares/request-id';
import { config } from './config';

const app: Application = express();

// Assign a request id to every inbound request so audit log entries + error
// logs share a correlation key. Must come BEFORE any logging or routing.
app.use(requestId);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));

app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));

// Rate limiting (disabled in test to avoid 429s during test runs)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  skip: (_req) => process.env.NODE_ENV === 'test',
});
app.use('/api', limiter);

// Body parsing middleware. We capture the raw JSON body on every request so
// HMAC signature verification (e.g. Moyasar webhooks) can compute the digest
// against the bytes Moyasar actually signed, not a re-stringification.
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as typeof req & { rawBody?: string }).rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

export default app;
