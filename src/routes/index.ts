import { Router, Request, Response } from 'express';
import usersRoutes from '../modules/users/users.routes';

const router: Router = Router();

// Health check
router.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Abjad Hiring Application API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Module routes
router.use('/users', usersRoutes);

// Add more module routes here as you create them
// router.use('/auth', authRoutes);
// router.use('/jobs', jobsRoutes);
// router.use('/applications', applicationsRoutes);

export default router;
