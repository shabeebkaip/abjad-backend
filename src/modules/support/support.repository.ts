import mongoose from 'mongoose';
import { SupportTicket, ISupportTicket, TicketStatus, TicketCategory } from '../../models/support-ticket.model';
import { Feedback, IFeedback, FeedbackType } from '../../models/feedback.model';

export class SupportRepository {
  async createTicket(data: {
    userId: string;
    userRole: 'teacher' | 'school';
    category: TicketCategory;
    subject: string;
    description: string;
    attachments?: { url: string; name: string }[];
  }): Promise<ISupportTicket> {
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return SupportTicket.create({
      ticketNumber,
      userId: new mongoose.Types.ObjectId(data.userId),
      userRole: data.userRole,
      category: data.category,
      subject: data.subject,
      description: data.description,
      attachments: data.attachments ?? [],
      priority: data.category === 'technical' ? 'high' : 'medium',
    });
  }

  async findByUser(
    userId: string,
    status?: TicketStatus,
    page = 1,
    limit = 20
  ): Promise<{ tickets: ISupportTicket[]; total: number }> {
    const query: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SupportTicket.countDocuments(query),
    ]);

    return { tickets: tickets as ISupportTicket[], total };
  }

  async findById(id: string): Promise<ISupportTicket | null> {
    return SupportTicket.findById(id);
  }

  async addMessage(
    ticketId: string,
    userId: string,
    userRole: 'teacher' | 'school' | 'admin',
    content: string,
    attachments: { url: string; name: string }[] = []
  ): Promise<ISupportTicket | null> {
    return SupportTicket.findByIdAndUpdate(
      ticketId,
      {
        $push: {
          messages: {
            senderId: new mongoose.Types.ObjectId(userId),
            senderRole: userRole,
            content,
            attachments,
            timestamp: new Date(),
          },
        },
        $set: { status: 'in_progress' },
      },
      { new: true }
    );
  }

  async updateStatus(ticketId: string, userId: string, status: TicketStatus): Promise<ISupportTicket | null> {
    const update: Record<string, unknown> = { status };
    if (status === 'resolved') update.resolvedAt = new Date();
    if (status === 'closed') update.closedAt = new Date();

    return SupportTicket.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(ticketId), userId: new mongoose.Types.ObjectId(userId) },
      { $set: update },
      { new: true }
    );
  }

  async createFeedback(data: {
    userId: string;
    type: FeedbackType;
    rating?: number;
    content: string;
    isAnonymous?: boolean;
    relatedId?: string;
    relatedModel?: 'Job' | 'Application' | 'Interview';
  }): Promise<IFeedback> {
    return Feedback.create({
      userId: new mongoose.Types.ObjectId(data.userId),
      type: data.type,
      rating: data.rating,
      content: data.content,
      isAnonymous: data.isAnonymous ?? false,
      relatedId: data.relatedId ? new mongoose.Types.ObjectId(data.relatedId) : undefined,
      relatedModel: data.relatedModel,
    });
  }
}

export const supportRepository = new SupportRepository();
