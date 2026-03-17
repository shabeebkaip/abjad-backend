import { Router, Response } from 'express';
import authRoutes from '../modules/auth/auth.routes';

const router: Router = Router();

// Health check
router.get('/', (_req, res: Response) => {
  res.json({ 
    message: 'Abjad Hiring Application API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Module routes
router.use('/auth', authRoutes);

// Add more module routes here as you create them
// router.use('/jobs', jobsRoutes);
// router.use('/applications', applicationsRoutes);

export default router;
