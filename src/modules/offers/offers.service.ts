import { offersRepository } from './offers.repository';
import { IOffer, OfferStatus } from '../../models/offer.model';
import { AppError } from '../../utils/app-error.util';
import User from '../../models/user.model';
import TeacherProfile from '../../models/teacher-profile.model';
import { sendEmail } from '../../utils/email.util';
import { tplOfferResponseToSchool } from '../../utils/email-templates.util';

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

    // Fire-and-forget email to school
    void (async () => {
      const [schoolUser, teacherProfile] = await Promise.all([
        User.findById(offer.schoolId).select('email emailNotificationsEnabled').lean(),
        TeacherProfile.findOne({ userId: teacherId }).select('personal').lean(),
      ]);
      if (!schoolUser?.emailNotificationsEnabled || !schoolUser.email) return;
      const teacherName = (teacherProfile as any)?.personal?.fullNameEn ?? (teacherProfile as any)?.personal?.fullNameAr ?? 'The teacher';
      const { subject, html } = tplOfferResponseToSchool({
        schoolName: '',
        teacherName,
        position: offer.position,
        action,
        reason: reason ?? message,
        counterSalary,
      });
      await sendEmail(schoolUser.email, subject, html);
    })();

    return updated;
  }
}

export const offersService = new OffersService();
