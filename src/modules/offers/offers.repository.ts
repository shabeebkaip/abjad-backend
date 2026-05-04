import mongoose from 'mongoose';
import { Offer, IOffer, OfferStatus } from '../../models/offer.model';

export class OffersRepository {
  async findByTeacher(
    teacherId: string,
    status?: OfferStatus,
    page = 1,
    limit = 20
  ): Promise<{ offers: IOffer[]; total: number }> {
    const query: Record<string, unknown> = { teacherId: new mongoose.Types.ObjectId(teacherId) };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [offers, total] = await Promise.all([
      Offer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('jobId', 'title subjects city')
        .populate('schoolId', 'name')
        .lean(),
      Offer.countDocuments(query),
    ]);

    return { offers: offers as IOffer[], total };
  }

  async findById(id: string): Promise<IOffer | null> {
    return Offer.findById(id)
      .populate('jobId')
      .populate('schoolId', 'name email');
  }

  async markViewed(offerId: string, teacherId: string): Promise<void> {
    await Offer.updateOne(
      {
        _id: new mongoose.Types.ObjectId(offerId),
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: 'sent',
      },
      { $set: { status: 'viewed', viewedAt: new Date() } }
    );
  }

  async respond(
    offerId: string,
    teacherId: string,
    action: 'accepted' | 'declined' | 'negotiate',
    reason?: string,
    counterSalary?: number,
    message?: string
  ): Promise<IOffer | null> {
    const statusMap: Record<string, OfferStatus> = {
      accepted: 'accepted',
      declined: 'declined',
      negotiate: 'negotiating',
    };

    const update: Record<string, unknown> = {
      $set: {
        status: statusMap[action],
        teacherResponse: { action, reason, counterSalary, respondedAt: new Date() },
      },
    };

    if (action === 'negotiate' && message) {
      update.$push = {
        negotiationHistory: {
          from: 'teacher',
          message,
          counterSalary,
          timestamp: new Date(),
        },
      };
    }

    return Offer.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(offerId),
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: { $in: ['sent', 'viewed', 'negotiating'] },
      },
      update,
      { new: true }
    );
  }
}

export const offersRepository = new OffersRepository();
