import { Router } from 'express';
import { adminController } from './admin.controller';
import { adminPricingController } from './admin-pricing.controller';
import { adminRankingController } from './admin-ranking.controller';
import { adminPaymentsController } from './admin-payments.controller';
import { auditController } from '../audit/audit.controller';
import { queueController } from '../queue/queue.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

// Public admin auth routes (no token required)
router.post('/auth/login', adminController.login.bind(adminController));

// All other admin routes require admin role
router.use(authenticate, authorize('admin'));

// Dashboard stats
router.get('/stats', adminController.getStats.bind(adminController));

// Tier 1 #3 — Sidebar live badge counts (one round-trip)
router.get('/sidebar-counts', adminController.getSidebarCounts.bind(adminController));

// School verification
router.get('/schools', adminController.listSchools.bind(adminController));
router.get('/schools/:profileId', adminController.getSchool.bind(adminController));
router.post('/schools/:profileId/approve', adminController.approveSchool.bind(adminController));
router.post('/schools/:profileId/reject', adminController.rejectSchool.bind(adminController));

// Teacher verification
router.get('/teachers', adminController.listTeachers.bind(adminController));
router.get('/teachers/:profileId', adminController.getTeacher.bind(adminController));
router.post('/teachers/:profileId/approve', adminController.approveTeacher.bind(adminController));
router.post('/teachers/:profileId/reject', adminController.rejectTeacher.bind(adminController));
router.get('/teachers/:profileId/activity', adminController.getTeacherActivity.bind(adminController));
router.get('/teachers/:profileId/history', adminController.getTeacherHistory.bind(adminController));
router.delete('/teachers/:profileId', adminController.deleteTeacher.bind(adminController));

// School activity + deletion
router.get('/schools/:profileId/activity', adminController.getSchoolActivity.bind(adminController));
router.delete('/schools/:profileId', adminController.deleteSchool.bind(adminController));

// Interviews
router.get('/interviews', adminController.listInterviews.bind(adminController));

// Applications
router.get('/applications', adminController.listApplications.bind(adminController));

// Support tickets
router.get('/tickets', adminController.listTickets.bind(adminController));
router.get('/tickets/:ticketId', adminController.getTicket.bind(adminController));
router.post('/tickets/:ticketId/reply', adminController.replyToTicket.bind(adminController));
router.patch('/tickets/:ticketId/status', adminController.updateTicketStatus.bind(adminController));

// Jobs (content moderation)
router.get('/jobs', adminController.listJobs.bind(adminController));
router.patch('/jobs/:jobId/status', adminController.updateJobStatus.bind(adminController));

// Reports & analytics
router.get('/reports/generate', adminController.generateReport.bind(adminController));
router.get('/reports', adminController.getReports.bind(adminController));

// SRD subscription Phase A — pricing plan admin
router.get('/pricing-plans', adminPricingController.list.bind(adminPricingController));
router.patch('/pricing-plans/:id', adminPricingController.update.bind(adminPricingController));

// SRD subscription Phase C — WDRS weights + feature flags + premium-gate status
router.get('/wdrs-config', adminRankingController.getConfig.bind(adminRankingController));
router.patch('/wdrs-config', adminRankingController.updateConfig.bind(adminRankingController));
router.get('/feature-flags', adminRankingController.listFlags.bind(adminRankingController));
router.patch('/feature-flags/:key', adminRankingController.updateFlag.bind(adminRankingController));
router.get('/premium-gate', adminRankingController.premiumGateStatus.bind(adminRankingController));

// Tier 1 #1 — Admin audit log (append-only, immutable history of every state-changing action)
router.get('/audit-log', auditController.list.bind(auditController));
router.get('/audit-log/target/:type/:id', auditController.forTarget.bind(auditController));

// Tier 1 #2 — Approval Queue (Mission Control)
router.get('/queue', queueController.list.bind(queueController));
router.post('/queue/claim', queueController.claim.bind(queueController));
router.post('/queue/unclaim', queueController.unclaim.bind(queueController));
router.post('/queue/snooze', queueController.snooze.bind(queueController));
router.post('/queue/unsnooze', queueController.unsnooze.bind(queueController));

// SRD subscription Phase D — invoices, payments, ledger, subscriptions, bank-transfer admin
router.get('/invoices', adminPaymentsController.listInvoices.bind(adminPaymentsController));
router.get('/invoices/:id/receipt', adminPaymentsController.receipt.bind(adminPaymentsController));
router.post('/invoices/:id/mark-paid', adminPaymentsController.markInvoicePaid.bind(adminPaymentsController));
router.get('/payments', adminPaymentsController.listPayments.bind(adminPaymentsController));
router.get('/subscriptions', adminPaymentsController.listSubscriptions.bind(adminPaymentsController));
router.get('/ledger/:ownerId', adminPaymentsController.ownerLedger.bind(adminPaymentsController));

export default router;
