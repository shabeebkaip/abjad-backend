import { schoolOffersRepository, CreateOfferData } from './school-offers.repository';
import { IOffer } from '../../models/offer.model';
import { Application } from '../../models/application.model';
import { AppError } from '../../utils/app-error.util';
import mongoose from 'mongoose';
import User from '../../models/user.model';
import { sendEmail } from '../../utils/email.util';
import { tplOfferReceived, tplHiredConfirmation } from '../../utils/email-templates.util';

export class SchoolOffersService {
  async extendOffer(schoolId: string, data: CreateOfferData): Promise<IOffer> {
    // Verify application belongs to school
    const app = await Application.findOne({
      _id: new mongoose.Types.ObjectId(data.applicationId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
    if (!app) throw AppError.notFound('Application not found');
    if (app.status !== 'interview_scheduled' && app.status !== 'shortlisted') {
      throw AppError.badRequest('Application must be in interview_scheduled or shortlisted status');
    }

    const offer = await schoolOffersRepository.create(schoolId, data);

    // Update application status to offer_extended
    await Application.updateOne(
      { _id: app._id },
      {
        $set: { status: 'offer_extended' },
        $push: { statusHistory: { status: 'offer_extended', timestamp: new Date() } },
      }
    );

    // Fire-and-forget email to teacher
    void (async () => {
      const [teacherUser, schoolUser] = await Promise.all([
        User.findById(app.teacherId).select('email emailNotificationsEnabled firstName').lean(),
        User.findById(schoolId).select('schoolName').lean(),
      ]);
      if (!teacherUser?.emailNotificationsEnabled || !teacherUser.email) return;
      const { subject, html } = tplOfferReceived({
        teacherName: (teacherUser as any).firstName ?? 'there',
        position: offer.position,
        schoolName: (schoolUser as any)?.schoolName ?? 'the school',
        salary: offer.salary,
        deadline: offer.deadline,
        startDate: offer.startDate,
        contractDuration: offer.contractDuration,
      });
      await sendEmail(teacherUser.email, subject, html);
    })();

    return offer;
  }

  async listOffers(
    schoolId: string,
    filters: { status?: string; jobId?: string; page?: number; limit?: number }
  ): Promise<{ offers: IOffer[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { offers, total } = await schoolOffersRepository.findBySchool(schoolId, filters);
    return { offers, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getOffer(schoolId: string, offerId: string): Promise<IOffer> {
    const offer = await schoolOffersRepository.findByIdAndSchool(offerId, schoolId);
    if (!offer) throw AppError.notFound('Offer not found');
    return offer;
  }

  async updateOffer(schoolId: string, offerId: string, data: Record<string, unknown>): Promise<IOffer> {
    const updated = await schoolOffersRepository.update(offerId, schoolId, data);
    if (!updated) throw AppError.badRequest('Offer not found or cannot be updated (only draft/sent offers can be edited)');
    return updated;
  }

  async revokeOffer(schoolId: string, offerId: string): Promise<IOffer> {
    const updated = await schoolOffersRepository.revoke(offerId, schoolId);
    if (!updated) throw AppError.badRequest('Offer not found or cannot be revoked');
    return updated;
  }

  async respondToNegotiation(
    schoolId: string,
    offerId: string,
    response: { message: string; counterSalary?: number; action: 'accept' | 'counter' }
  ): Promise<IOffer> {
    const updated = await schoolOffersRepository.respondToNegotiation(offerId, schoolId, response);
    if (!updated) throw AppError.badRequest('Offer not found or not in negotiation');
    return updated;
  }

  async confirmHire(schoolId: string, offerId: string): Promise<IOffer> {
    const offer = await schoolOffersRepository.findByIdAndSchool(offerId, schoolId);
    if (!offer) throw AppError.notFound('Offer not found');
    if (offer.status !== 'accepted') throw AppError.badRequest('Offer must be accepted by teacher first');

    // Update application to hired
    await Application.updateOne(
      { _id: offer.applicationId },
      {
        $set: { status: 'hired' },
        $push: { statusHistory: { status: 'hired', timestamp: new Date() } },
      }
    );

    // Fire-and-forget hired confirmation email to teacher
    void (async () => {
      const [teacherUser, schoolUser] = await Promise.all([
        User.findById(offer.teacherId).select('email emailNotificationsEnabled firstName').lean(),
        User.findById(schoolId).select('schoolName').lean(),
      ]);
      if (!teacherUser?.emailNotificationsEnabled || !teacherUser.email) return;
      const { subject, html } = tplHiredConfirmation({
        teacherName: (teacherUser as any).firstName ?? 'there',
        position: offer.position,
        schoolName: (schoolUser as any)?.schoolName ?? 'the school',
        startDate: offer.startDate,
      });
      await sendEmail(teacherUser.email, subject, html);
    })();

    return offer;
  }
}

export const schoolOffersService = new SchoolOffersService();
