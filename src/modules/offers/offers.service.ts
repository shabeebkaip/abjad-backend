import { offersRepository } from './offers.repository';
import { IOffer, OfferStatus } from '../../models/offer.model';
import { AppError } from '../../utils/app-error.util';

export class OffersService {
  async listOffers(teacherId: string, status?: OfferStatus, page = 1, limit = 20) {
    const result = await offersRepository.findByTeacher(teacherId, status, page, limit);
    return { ...result, page, totalPages: Math.ceil(result.total / limit) };
  }

  async getOffer(teacherId: string, offerId: string): Promise<IOffer> {
    const offer = await offersRepository.findById(offerId);
    if (!offer) throw AppError.notFound('Offer not found');
    if (offer.teacherId.toString() !== teacherId) throw AppError.forbidden('Access denied');

    // Mark as viewed
    await offersRepository.markViewed(offerId, teacherId);

    return offer;
  }

  async respond(
    teacherId: string,
    offerId: string,
    action: 'accepted' | 'declined' | 'negotiate',
    reason?: string,
    counterSalary?: number,
    message?: string
  ): Promise<IOffer> {
    const offer = await offersRepository.findById(offerId);
    if (!offer) throw AppError.notFound('Offer not found');
    if (offer.teacherId.toString() !== teacherId) throw AppError.forbidden('Access denied');

    if (new Date() > offer.deadline) {
      throw AppError.badRequest('Offer has expired');
    }

    if (action === 'negotiate' && !message) {
      throw AppError.badRequest('A message is required for negotiation');
    }

    const updated = await offersRepository.respond(offerId, teacherId, action, reason, counterSalary, message);
    if (!updated) throw AppError.badRequest('Cannot respond to this offer');
    return updated;
  }
}

export const offersService = new OffersService();
