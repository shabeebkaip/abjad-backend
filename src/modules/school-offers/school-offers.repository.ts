import mongoose from 'mongoose';
import { Offer, IOffer } from '../../models/offer.model';

export interface CreateOfferData {
  applicationId: string;
  jobId: string;
  teacherId: string;
  position: string;
  salary: number;
  contractDuration?: string;
  startDate?: string;
  benefits?: string;
  terms?: string;
  deadline?: string;
  offerLetterUrl?: string;
}

export class SchoolOffersRepository {
  async create(schoolId: string, data: CreateOfferData): Promise<IOffer> {
    return Offer.create({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      applicationId: new mongoose.Types.ObjectId(data.applicationId),
      jobId: new mongoose.Types.ObjectId(data.jobId),
      teacherId: new mongoose.Types.ObjectId(data.teacherId),
      position: data.position,
      salary: data.salary,
      contractDuration: data.contractDuration,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      benefits: data.benefits,
      terms: data.terms,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      offerLetterUrl: data.offerLetterUrl,
      status: 'sent',
    });
  }

  async findBySchool(
    schoolId: string,
    filters: { status?: string; jobId?: string; page?: number; limit?: number }
  ): Promise<{ offers: IOffer[]; total: number }> {
    const query: Record<string, unknown> = { schoolId: new mongoose.Types.ObjectId(schoolId) };
    if (filters.status) query.status = filters.status;
    if (filters.jobId) query.jobId = new mongoose.Types.ObjectId(filters.jobId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [offers, total] = await Promise.all([
      Offer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('teacherId', 'name email')
        .populate('jobId', 'title')
        .lean(),
      Offer.countDocuments(query),
    ]);

    return { offers: offers as IOffer[], total };
  }

  async findByIdAndSchool(offerId: string, schoolId: string): Promise<IOffer | null> {
    return Offer.findOne({
      _id: new mongoose.Types.ObjectId(offerId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    })
      .populate('teacherId', 'name email')
      .populate('jobId', 'title city');
  }

  async update(offerId: string, schoolId: string, data: Record<string, unknown>): Promise<IOffer | null> {
    return Offer.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(offerId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: 'sent',
      },
      { $set: data },
      { new: true }
    );
  }

  async revoke(offerId: string, schoolId: string): Promise<IOffer | null> {
    return Offer.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(offerId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: { $in: ['sent', 'viewed', 'negotiating'] },
      },
      { $set: { status: 'expired' } },
      { new: true }
    );
  }

  async respondToNegotiation(
    offerId: string,
    schoolId: string,
    response: { message: string; counterSalary?: number; action: 'accept' | 'counter' }
  ): Promise<IOffer | null> {
    const historyEntry = {
      from: 'school',
      message: response.message,
      counterSalary: response.counterSalary,
      createdAt: new Date(),
    };

    const newStatus = response.action === 'accept' ? 'sent' : 'negotiating';

    return Offer.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(offerId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: 'negotiating',
      },
      {
        $push: { negotiationHistory: historyEntry },
        $set: { status: newStatus },
      },
      { new: true }
    );
  }

  async confirmHire(offerId: string, schoolId: string): Promise<IOffer | null> {
    return Offer.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(offerId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: 'accepted',
      },
      { $set: { status: 'accepted' } }, // status stays accepted; application gets updated to hired
      { new: true }
    );
  }
}

export const schoolOffersRepository = new SchoolOffersRepository();
