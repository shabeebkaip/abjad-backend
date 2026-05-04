import { supportRepository } from './support.repository';
import { ISupportTicket } from '../../models/support-ticket.model';
import { IFeedback } from '../../models/feedback.model';
import { AppError } from '../../utils/app-error.util';

export class SupportService {
  async createTicket(
    userId: string,
    userRole: 'teacher' | 'school',
    data: {
      category: string;
      subject: string;
      description: string;
      attachments?: { url: string; name: string }[];
    }
  ): Promise<ISupportTicket> {
    return supportRepository.createTicket({ userId, userRole, ...data } as Parameters<typeof supportRepository.createTicket>[0]);
  }

  async listTickets(userId: string, status?: string, page = 1, limit = 20) {
    const result = await supportRepository.findByUser(userId, status as Parameters<typeof supportRepository.findByUser>[1], page, limit);
    return { ...result, page, totalPages: Math.ceil(result.total / limit) };
  }

  async getTicket(userId: string, ticketId: string): Promise<ISupportTicket> {
    const ticket = await supportRepository.findById(ticketId);
    if (!ticket) throw AppError.notFound('Ticket not found');
    if (ticket.userId.toString() !== userId) throw AppError.forbidden('Access denied');
    return ticket;
  }

  async addReply(
    userId: string,
    userRole: 'teacher' | 'school',
    ticketId: string,
    content: string,
    attachments?: { url: string; name: string }[]
  ): Promise<ISupportTicket> {
    const ticket = await supportRepository.findById(ticketId);
    if (!ticket) throw AppError.notFound('Ticket not found');
    if (ticket.userId.toString() !== userId) throw AppError.forbidden('Access denied');
    if (ticket.status === 'closed') throw AppError.badRequest('Cannot reply to a closed ticket');

    const updated = await supportRepository.addMessage(ticketId, userId, userRole, content, attachments);
    if (!updated) throw AppError.notFound('Ticket not found');
    return updated;
  }

  async closeTicket(userId: string, ticketId: string): Promise<ISupportTicket> {
    const ticket = await supportRepository.findById(ticketId);
    if (!ticket) throw AppError.notFound('Ticket not found');
    if (ticket.userId.toString() !== userId) throw AppError.forbidden('Access denied');

    const updated = await supportRepository.updateStatus(ticketId, userId, 'closed');
    if (!updated) throw AppError.notFound('Ticket not found');
    return updated;
  }

  async submitFeedback(
    userId: string,
    data: {
      type: string;
      rating?: number;
      content: string;
      isAnonymous?: boolean;
      relatedId?: string;
      relatedModel?: 'Job' | 'Application' | 'Interview';
    }
  ): Promise<IFeedback> {
    return supportRepository.createFeedback({ userId, ...data } as Parameters<typeof supportRepository.createFeedback>[0]);
  }
}

export const supportService = new SupportService();
