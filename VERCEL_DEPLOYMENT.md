# Vercel Deployment Guide

## Environment Variables

Add these environment variables in your Vercel project settings:

1. `MONGODB_URI` - Your MongoDB connection string
2. `JWT_SECRET` - Your JWT secret key
3. `JWT_EXPIRES_IN` - JWT expiration time (e.g., 7d)
4. `NODE_ENV` - Set to "production"
5. `CLIENT_URL` - Your frontend URL (for CORS)
6. `REDIS_URL` - Your Redis connection string (if using Redis)

## Deployment Steps

1. Install Vercel CLI (optional):
   ```bash
   npm i -g vercel
   ```

2. Deploy to Vercel:
   - Push your code to GitHub
   - Import the repository in Vercel dashboard
   - Configure environment variables
   - Deploy

3. Or use Vercel CLI:
   ```bash
   vercel
   ```

## Important Notes

- MongoDB connection uses connection pooling for serverless
- File uploads will need external storage (S3, Cloudinary, etc.)
- Rate limiting is configured
- CORS is set up for production

## API Endpoints

- Health Check: `https://your-app.vercel.app/health`
- API Base: `https://your-app.vercel.app/api`

## Local Development

Continue using:
```bash
pnpm run dev
```

The app automatically detects if it's running on Vercel or locally.
