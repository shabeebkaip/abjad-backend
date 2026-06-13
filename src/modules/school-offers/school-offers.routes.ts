import { Router } from 'express';
import { schoolOffersController } from './school-offers.controller';
import { authenticate, authorize } from '../../middlewares/auth';
import { uploadDocument } from '../../middlewares/upload';

const router = Router();

router.use(authenticate, authorize('school'));

router.post('/', schoolOffersController.extendOffer.bind(schoolOffersController));
router.get('/', schoolOffersController.listOffers.bind(schoolOffersController));
router.get('/:offerId', schoolOffersController.getOffer.bind(schoolOffersController));
router.patch('/:offerId', schoolOffersController.updateOffer.bind(schoolOffersController));
router.post('/:offerId/revoke', schoolOffersController.revokeOffer.bind(schoolOffersController));
router.post('/:offerId/negotiate', schoolOffersController.respondToNegotiation.bind(schoolOffersController));
router.post('/:offerId/confirm-hire', schoolOffersController.confirmHire.bind(schoolOffersController));
// SRD 2.7.3 — multipart upload of the signed contract PDF/DOC
router.post('/:offerId/contract', uploadDocument, schoolOffersController.uploadContract.bind(schoolOffersController));

export default router;
