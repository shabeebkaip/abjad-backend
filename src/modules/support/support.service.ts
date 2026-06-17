import { supportRepository } from './support.repository';
import { ISupportTicket } from '../../models/support-ticket.model';
import { IFeedback } from '../../models/feedback.model';
import { AppError } from '../../utils/app-error.util';
import User from '../../models/user.model';
import { sendEmail } from '../../utils/email.util';
import { tplTicketReceived, tplTicketReplied } from '../../utils/email-templates.util';
import { notificationsService } from '../notifications/notifications.service';

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
    const ticket = await supportRepository.createTicket({ userId, userRole, ...data } as Parameters<typeof supportRepository.createTicket>[0]);

    // SRD 2.9.3 — confirmation email noting the 24h SLA. Fire-and-forget so a
    // slow SMTP doesn't block the response.
    void (async () => {
      const user = await User.findById(userId).select('email firstName lastName schoolName emailNotificationsEnabled').lean<{
        email?: string; firstName?: string; lastName?: string; schoolName?: string; emailNotificationsEnabled?: boolean;
      } | null>();
      if (!user?.email || user.emailNotificationsEnabled === false) return;
      const name = user.schoolName ?? (`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email);
      const { subject, html } = tplTicketReceived({
        recipientName: name,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        responseDueAt: ticket.responseDueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await sendEmail(user.email, subject, html);
    })().catch((err) => console.error('[support] ticket received email failed:', err));

    // Tier 2 #11 — admin fan-out for the bell.
    void notificationsService.notifyAllAdmins(
      'system',
      `New support ticket · ${ticket.priority}`,
      `${ticket.subject}`,
      { ticketId: String(ticket._id), targetType: 'Ticket' },
    );

    return ticket;
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

  // SRD 2.9.3 — used by the admin module when an agent posts a reply. Emails
  // the ticket owner so they get pinged outside the platform too.
  async addAdminReply(
    adminUserId: string,
    ticketId: string,
    content: string,
    attachments?: { url: string; name: string }[],
  ): Promise<ISupportTicket> {
    const ticket = await supportRepository.findById(ticketId);
    if (!ticket) throw AppError.notFound('Ticket not found');
    if (ticket.status === 'closed') throw AppError.badRequest('Cannot reply to a closed ticket');

    const updated = await supportRepository.addMessage(ticketId, adminUserId, 'admin', content, attachments);
    if (!updated) throw AppError.notFound('Ticket not found');

    void (async () => {
      const user = await User.findById(ticket.userId).select('email firstName lastName schoolName emailNotificationsEnabled').lean<{
        email?: string; firstName?: string; lastName?: string; schoolName?: string; emailNotificationsEnabled?: boolean;
      } | null>();
      if (!user?.email || user.emailNotificationsEnabled === false) return;
      const name = user.schoolName ?? (`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email);
      const { subject, html } = tplTicketReplied({
        recipientName: name,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        excerpt: content,
      });
      await sendEmail(user.email, subject, html);
    })().catch((err) => console.error('[support] ticket replied email failed:', err));

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
