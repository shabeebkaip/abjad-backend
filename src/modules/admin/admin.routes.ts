import { Router } from 'express';
import { adminController } from './admin.controller';
import { adminPricingController } from './admin-pricing.controller';
import { adminRankingController } from './admin-ranking.controller';
import { adminPaymentsController } from './admin-payments.controller';
import { auditController } from '../audit/audit.controller';
import { queueController } from '../queue/queue.controller';
import { suspensionController } from '../suspension/suspension.controller';
import { templateController } from '../email-templates/template.controller';
import { documentReviewController } from '../document-review/document-review.controller';
import { activityController } from '../activity/activity.controller';
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

// Tier 1 #5 — Real dashboard charts (registrations / applications / conversion)
router.get('/dashboard-charts', adminController.getDashboardCharts.bind(adminController));

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

// Tier 1 #6 — Teacher suspension + history
router.post('/teachers/:profileId/suspend',   suspensionController.suspendTeacher.bind(suspensionController));
router.post('/teachers/:profileId/reinstate', suspensionController.reinstateTeacher.bind(suspensionController));
router.get('/teachers/:profileId/suspensions', suspensionController.teacherHistory.bind(suspensionController));

// Tier 2 #9 — Per-document approval (teacher)
router.get('/teachers/:profileId/documents',                              documentReviewController.list.bind(documentReviewController));
router.post('/teachers/:profileId/documents/:docKey/approve',             documentReviewController.approve.bind(documentReviewController));
router.post('/teachers/:profileId/documents/:docKey/reject',              documentReviewController.reject.bind(documentReviewController));
router.post('/teachers/:profileId/documents/:docKey/reset',               documentReviewController.reset.bind(documentReviewController));

// School activity + deletion
router.get('/schools/:profileId/activity', adminController.getSchoolActivity.bind(adminController));
router.delete('/schools/:profileId', adminController.deleteSchool.bind(adminController));

// Tier 1 #6 — School suspension + history
router.post('/schools/:profileId/suspend',    suspensionController.suspendSchool.bind(suspensionController));
router.post('/schools/:profileId/reinstate',  suspensionController.reinstateSchool.bind(suspensionController));
router.get('/schools/:profileId/suspensions', suspensionController.schoolHistory.bind(suspensionController));

// Tier 2 #9 — Per-document approval (school)
router.get('/schools/:profileId/documents',                              documentReviewController.list.bind(documentReviewController));
router.post('/schools/:profileId/documents/:docKey/approve',             documentReviewController.approve.bind(documentReviewController));
router.post('/schools/:profileId/documents/:docKey/reject',              documentReviewController.reject.bind(documentReviewController));
router.post('/schools/:profileId/documents/:docKey/reset',               documentReviewController.reset.bind(documentReviewController));

// Interviews
router.get('/interviews', adminController.listInterviews.bind(adminController));

// Applications
router.get('/applications', adminController.listApplications.bind(adminController));

// Support tickets
router.get('/tickets', adminController.listTickets.bind(adminController));
router.get('/tickets/:ticketId', adminController.getTicket.bind(adminController));
router.post('/tickets/:ticketId/reply', adminController.replyToTicket.bind(adminController));
router.patch('/tickets/:ticketId/status', adminController.updateTicketStatus.bind(adminController));
// Tier 2 #10 — assign ticket + admin directory for the picker
router.post('/tickets/:ticketId/assign', adminController.assignTicket.bind(adminController));
router.get('/admins', adminController.listAdmins.bind(adminController));

// Tier 2 #12 — Email template editor (DB-backed overrides on the registry)
router.get('/email-templates',             templateController.list.bind(templateController));
router.get('/email-templates/:key',        templateController.get.bind(templateController));
router.patch('/email-templates/:key',      templateController.update.bind(templateController));
router.post('/email-templates/:key/reset', templateController.reset.bind(templateController));

// Jobs (content moderation)
router.get('/jobs', adminController.listJobs.bind(adminController));
router.patch('/jobs/:jobId/status', adminController.updateJobStatus.bind(adminController));

// Reports & analytics
router.get('/reports/generate', adminController.generateReport.bind(adminController));
router.get('/reports', adminController.getReports.bind(adminController));

// SRD subscription Phase A — pricing plan admin
router.get('/pricing-plans', adminPricingController.list.bind(adminPricingController));
router.patch('/pricing-plans/:id', adminPricingController.update.bind(adminPricingController));
// Step 1 entitlement registry — UI reads this once to render the per-plan editor.
router.get('/entitlement-registry', adminPricingController.getRegistry.bind(adminPricingController));

// SRD subscription Phase C — WDRS weights + feature flags + premium-gate status
router.get('/wdrs-config', adminRankingController.getConfig.bind(adminRankingController));
router.patch('/wdrs-config', adminRankingController.updateConfig.bind(adminRankingController));
router.get('/feature-flags', adminRankingController.listFlags.bind(adminRankingController));
router.patch('/feature-flags/:key', adminRankingController.updateFlag.bind(adminRankingController));
router.get('/premium-gate', adminRankingController.premiumGateStatus.bind(adminRankingController));

// Tier 1 #1 — Admin audit log (append-only, immutable history of every state-changing action)
router.get('/audit-log', auditController.list.bind(auditController));
router.get('/audit-log/target/:type/:id', auditController.forTarget.bind(auditController));

// Tier 3 #24 — Activity Stream + per-admin metrics (read views on AuditLog)
router.get('/activity-stream', activityController.stream.bind(activityController));
router.get('/admin-metrics',   activityController.metrics.bind(activityController));

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
router.post('/payments/:id/refund', adminPaymentsController.refundPayment.bind(adminPaymentsController));
router.get('/subscriptions', adminPaymentsController.listSubscriptions.bind(adminPaymentsController));
router.get('/ledger/:ownerId', adminPaymentsController.ownerLedger.bind(adminPaymentsController));

export default router;
