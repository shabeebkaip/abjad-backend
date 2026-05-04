import { ISchoolProfileDocument } from '../../models/school-profile.model';
import { schoolProfileRepository } from './school-profile.repository';
import { uploadToCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.util';
import { AppError } from '../../utils/app-error.util';

function calculateCompletion(profile: ISchoolProfileDocument): number {
  let score = 0;

  if (profile.nameAr || profile.nameEn) score += 15;
  if (profile.type) score += 5;
  if (profile.educationLevel) score += 5;
  if (profile.gender) score += 5;
  if (profile.city) score += 5;
  if (profile.logoUrl) score += 5;

  if (profile.adminContact?.name && profile.adminContact?.phone) score += 15;
  if (profile.phone || profile.email) score += 5;

  if (profile.documents?.commercialRegistration?.url) score += 20;
  if (profile.documents?.ministryLicense?.url) score += 15;

  return Math.min(score, 100);
}

export class SchoolProfileService {
  async getOrCreateProfile(userId: string): Promise<ISchoolProfileDocument> {
    let profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) profile = await schoolProfileRepository.create(userId);
    return profile;
  }

  async getProfile(userId: string): Promise<ISchoolProfileDocument> {
    const profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');
    return profile;
  }

  async updateBasic(userId: string, data: Record<string, unknown>): Promise<ISchoolProfileDocument> {
    let profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) profile = await schoolProfileRepository.create(userId);

    const allowed = ['nameAr', 'nameEn', 'type', 'educationLevel', 'gender', 'foundedYear', 'studentsCount'];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) filtered[key] = data[key];
    }

    const updated = await schoolProfileRepository.updateRoot(userId, filtered);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await schoolProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async updateLocation(userId: string, data: Record<string, unknown>): Promise<ISchoolProfileDocument> {
    let profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) profile = await schoolProfileRepository.create(userId);

    const allowed = ['city', 'district', 'address'];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) filtered[key] = data[key];
    }

    const updated = await schoolProfileRepository.updateRoot(userId, filtered);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await schoolProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async updateContact(userId: string, data: Record<string, unknown>): Promise<ISchoolProfileDocument> {
    let profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) profile = await schoolProfileRepository.create(userId);

    const allowed = ['website', 'phone', 'email'];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) filtered[key] = data[key];
    }

    const updated = await schoolProfileRepository.updateRoot(userId, filtered);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await schoolProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async updateAdminContact(userId: string, data: Record<string, unknown>): Promise<ISchoolProfileDocument> {
    let profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) profile = await schoolProfileRepository.create(userId);

    const updated = await schoolProfileRepository.updateRoot(userId, { adminContact: data });
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await schoolProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async uploadLogo(userId: string, buffer: Buffer): Promise<ISchoolProfileDocument> {
    let profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) profile = await schoolProfileRepository.create(userId);

    if (profile.logoKey) {
      await deleteFromCloudinary(profile.logoKey).catch(() => {});
    }

    const result = await uploadToCloudinary(buffer, 'school-logos');
    const updated = await schoolProfileRepository.updateRoot(userId, {
      logoUrl: result.secureUrl,
      logoKey: result.publicId,
    });
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await schoolProfileRepository.updateCompletionPercentage(userId, pct);
    return updated;
  }

  async uploadDocument(
    userId: string,
    docType: 'commercialRegistration' | 'ministryLicense',
    buffer: Buffer
  ): Promise<ISchoolProfileDocument> {
    const profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');

    const existing = profile.documents?.[docType];
    if (existing?.key) {
      await deleteFromCloudinary(existing.key, 'raw').catch(() => {});
    }

    const result = await uploadToCloudinary(buffer, 'school-documents');
    const updated = await schoolProfileRepository.updateSection(userId, 'documents', {
      [docType]: { url: result.secureUrl, key: result.publicId, uploadedAt: new Date() },
    });
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await schoolProfileRepository.updateCompletionPercentage(userId, pct);
    return updated;
  }

  async submitForVerification(userId: string): Promise<ISchoolProfileDocument> {
    const profile = await schoolProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');

    if (profile.completionPercentage < 60) {
      throw AppError.badRequest('Profile must be at least 60% complete before submitting');
    }
    if (profile.profileStatus === 'pending') {
      throw AppError.badRequest('Profile is already under review');
    }
    if (profile.profileStatus === 'verified') {
      throw AppError.badRequest('Profile is already verified');
    }

    const updated = await schoolProfileRepository.submitForVerification(userId);
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }
}

export const schoolProfileService = new SchoolProfileService();
