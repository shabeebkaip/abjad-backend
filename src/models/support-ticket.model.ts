import mongoose, { Document, Schema } from 'mongoose';

export type TicketCategory =
  | 'technical'
  | 'profile_application'
  | 'payment'
  | 'report'
  | 'general'
  | 'other';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';

export interface ITicketMessage {
  senderId: mongoose.Types.ObjectId;
  senderRole: 'teacher' | 'school' | 'admin';
  content: string;
  attachments: { url: string; name: string }[];
  timestamp: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  userId: mongoose.Types.ObjectId;
  userRole: 'teacher' | 'school';
  category: TicketCategory;
  subject: string;
  description: string;
  attachments: { url: string; name: string }[];
  priority: TicketPriority;
  status: TicketStatus;
  messages: ITicketMessage[];
  assignedTo?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  closedAt?: Date;
  // SRD 2.9.3 — 24h response SLA
  responseDueAt?: Date;       // createdAt + 24h, stamped on creation
  firstResponseAt?: Date;     // set when an admin posts the first reply
  createdAt: Date;
  updatedAt: Date;
}

const ticketMessageSchema = new Schema<ITicketMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['teacher','school','admin'], required: true },
    content: { type: String, required: true },
    attachments: [{ url: String, name: String, _id: false }],
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userRole: { type: String, enum: ['teacher','school'], required: true },
    category: { type: String, enum: ['technical','profile_application','payment','report','general','other'], required: true },
    subject: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    attachments: [{ url: String, name: String, _id: false }],
    priority: { type: String, enum: ['low','medium','high'], default: 'medium', index: true },
    status: { type: String, enum: ['open','in_progress','resolved','closed'], default: 'open', index: true },
    messages: [ticketMessageSchema],
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    responseDueAt: { type: Date, index: true },
    firstResponseAt: { type: Date },
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1 });
supportTicketSchema.index({ createdAt: -1 });

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', supportTicketSchema);
