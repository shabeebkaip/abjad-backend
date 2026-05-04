import { Router } from 'express';
import { supportController } from './support.controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.use(authenticate);

router.post('/tickets', supportController.createTicket.bind(supportController));
router.get('/tickets', supportController.listTickets.bind(supportController));
router.get('/tickets/:ticketId', supportController.getTicket.bind(supportController));
router.post('/tickets/:ticketId/reply', supportController.addReply.bind(supportController));
router.patch('/tickets/:ticketId/close', supportController.closeTicket.bind(supportController));
router.post('/feedback', supportController.submitFeedback.bind(supportController));

export default router;
