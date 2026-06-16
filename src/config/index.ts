import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/abjad',
  },
  
  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // OTP
  otp: {
    length: 6,
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10'),
    maxAttempts: 3,
  },

  // Session cookie — standard naming with optional __Host- prefix in
  // production. __Host- forces Secure + Path=/ + no Domain (RFC 6265bis),
  // which is the strictest configuration for an httpOnly session cookie.
  // In dev we can't use it (browsers require Secure, which won't ship over
  // plain http://localhost).
  cookie: {
    refreshTokenName: process.env.NODE_ENV === 'production' ? '__Host-abjad_session' : 'abjad_session',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30d in ms (only applied when remembered)
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  // TODO: [BEFORE PRODUCTION] Restrict CORS to specific origins using CLIENT_URL env var.
  // Replace `origin: true` with:
  //   origin: process.env.CLIENT_URL
  //     ? process.env.CLIENT_URL.split(',').map((o) => o.trim())
  //     : ['http://localhost:3000'],
  // And set CLIENT_URL=https://abjad-frontend.vercel.app in Vercel backend env vars.
  cors: {
    origin: true,
  },
  
  // File Upload
  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB default
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  
  // Email (for future use)
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
  },

  // Payments — Moyasar (Phase D). Test keys live in .env, never committed.
  // Get yours at https://dashboard.moyasar.com/ → Settings → API Keys.
  // The webhook secret comes from Settings → Webhooks → "Add Webhook" (Moyasar
  // returns the secret once on creation — store immediately).
  moyasar: {
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY || '',
    secretKey:      process.env.MOYASAR_SECRET_KEY      || '',
    webhookSecret:  process.env.MOYASAR_WEBHOOK_SECRET  || '',
    apiBase:        process.env.MOYASAR_API_BASE        || 'https://api.moyasar.com/v1',
  },

  // Abjad seller block (snapshotted onto every invoice per ZATCA's invoice
  // fields — even though ZATCA submission is deferred, we collect the data
  // now so the Phase E swap is a code change, not a data backfill).
  seller: {
    nameEn:    process.env.SELLER_NAME_EN    || 'Abjad Platform',
    nameAr:    process.env.SELLER_NAME_AR    || 'منصة أبجد',
    vatNumber: process.env.SELLER_VAT_NUMBER || '',  // 15-digit ZATCA VAT
    crNumber:  process.env.SELLER_CR_NUMBER  || '',
    address:   process.env.SELLER_ADDRESS    || 'Riyadh, Saudi Arabia',
  },
};
