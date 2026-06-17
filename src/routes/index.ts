import { Router, Response } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import uploadRoutes from '../modules/upload/upload.routes';
import teacherProfileRoutes from '../modules/teacher-profile/teacher-profile.routes';
import jobsRoutes from '../modules/jobs/jobs.routes';
import applicationsRoutes from '../modules/applications/applications.routes';
import interviewsRoutes from '../modules/interviews/interviews.routes';
import offersRoutes from '../modules/offers/offers.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';
import supportRoutes from '../modules/support/support.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import schoolProfileRoutes from '../modules/school-profile/school-profile.routes';
import schoolJobsRoutes from '../modules/school-jobs/school-jobs.routes';
import schoolCandidatesRoutes from '../modules/school-candidates/school-candidates.routes';
import schoolApplicationsRoutes from '../modules/school-applications/school-applications.routes';
import schoolShortlistRoutes from '../modules/school-shortlist/school-shortlist.routes';
import schoolInterviewsRoutes from '../modules/school-interviews/school-interviews.routes';
import schoolOffersRoutes from '../modules/school-offers/school-offers.routes';
import schoolDashboardRoutes from '../modules/school-dashboard/school-dashboard.routes';
import schoolTeamRoutes from '../modules/school-team/school-team.routes';
import adminRoutes from '../modules/admin/admin.routes';
import internalRoutes from '../modules/internal/internal.routes';
import subscriptionsRoutes from '../modules/subscriptions/subscriptions.routes';
import { subscriptionsController } from '../modules/subscriptions/subscriptions.controller';
import paymentsRoutes from '../modules/payments/payments.routes';
import { paymentsController } from '../modules/payments/payments.controller';
import { pricingPageController } from '../modules/pricing-page/pricing-page.controller';
import { authenticate } from '../middlewares/auth';

const router: Router = Router();

// Health check
router.get('/', (_req, res: Response) => {
  res.json({
    message: 'Abjad Hiring Application API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Auth & file upload
router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);

// Teacher features
router.use('/teacher/profile', teacherProfileRoutes);
router.use('/teacher/dashboard', dashboardRoutes);

// Jobs (public listing + teacher saved jobs)
router.use('/jobs', jobsRoutes);

// Applications (teacher)
router.use('/applications', applicationsRoutes);

// Interviews (teacher responses)
router.use('/interviews', interviewsRoutes);

// Offers (teacher responses)
router.use('/offers', offersRoutes);

// Notifications
router.use('/notifications', notificationsRoutes);

// Support & feedback (shared: teacher + school)
router.use('/support', supportRoutes);

// School features
router.use('/school/profile', schoolProfileRoutes);
router.use('/school/jobs', schoolJobsRoutes);
router.use('/school/candidates', schoolCandidatesRoutes);
router.use('/school/applications', schoolApplicationsRoutes);
router.use('/school/shortlists', schoolShortlistRoutes);
router.use('/school/interviews', schoolInterviewsRoutes);
router.use('/school/offers', schoolOffersRoutes);
router.use('/school/dashboard', schoolDashboardRoutes);
router.use('/school/team', schoolTeamRoutes);

// Admin
router.use('/admin', adminRoutes);

// Subscriptions (Phase B) — teacher + school facing
router.use('/subscriptions', subscriptionsRoutes);
// Public catalogue of pricing plans — needs auth, not gated by role.
router.get('/pricing-plans', authenticate, subscriptionsController.listPublicPlans.bind(subscriptionsController));

// PUBLIC: full pricing-page payload (hero + trust + plans + comparison + FAQ).
// No auth — drives the marketing /pricing page on abjad-frontend.
router.get('/pricing/page', pricingPageController.getPublicPayload.bind(pricingPageController));

// Payments (Phase D) — initiate, webhook, receipt
router.use('/payments', paymentsRoutes);
router.get('/invoices', authenticate, paymentsController.listMine.bind(paymentsController));
router.get('/invoices/:id/receipt', authenticate, paymentsController.receipt.bind(paymentsController));

// Internal — cron-triggered jobs (gated by CRON_SECRET in prod)
router.use('/internal', internalRoutes);

export default router;
