import { Router } from 'express';
import { offersController } from './offers.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('teacher'));

router.get('/', offersController.listOffers.bind(offersController));
router.get('/:offerId', offersController.getOffer.bind(offersController));
router.patch('/:offerId/respond', offersController.respond.bind(offersController));

export default router;
