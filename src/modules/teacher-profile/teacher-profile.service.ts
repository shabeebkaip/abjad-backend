import { ITeacherProfileDocument } from '../../models/teacher-profile.model';
import { teacherProfileRepository } from './teacher-profile.repository';
import { uploadToCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.util';
import { AppError } from '../../utils/app-error.util';

function calculateCompletion(profile: ITeacherProfileDocument): number {
  let score = 0;

  if (profile.personal?.fullNameAr || profile.personal?.fullNameEn) score += 10;
  if (profile.personal?.dateOfBirth) score += 5;
  if (profile.personal?.gender) score += 5;
  if (profile.personal?.nationality) score += 5;
  if (profile.personal?.photoUrl) score += 5;

  if (profile.professional?.subjects?.length > 0) score += 15;
  if (profile.professional?.gradeLevels?.length > 0) score += 10;
  if (profile.professional?.experienceRange) score += 5;
  if (profile.professional?.employmentStatus) score += 5;

  if (profile.education?.degreeType) score += 10;
  if (profile.education?.major) score += 5;
  if (profile.education?.university) score += 5;
  if (profile.education?.certificateUrl) score += 5;

  if (profile.languages?.length > 0) score += 5;
  if (profile.locationPreferences?.preferredCities?.length > 0) score += 5;
  if (profile.resume?.fileUrl) score += 5;

  return Math.min(score, 100);
}

export class TeacherProfileService {
  async getOrCreateProfile(userId: string): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) {
      profile = await teacherProfileRepository.create(userId);
    }
    return profile;
  }

  async getProfile(userId: string): Promise<ITeacherProfileDocument> {
    const profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');
    return profile;
  }

  async updatePersonal(userId: string, data: Record<string, unknown>): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.updateSection(userId, 'personal', data);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async updateProfessional(userId: string, data: Record<string, unknown>): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.updateSection(userId, 'professional', data);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async updateEducation(userId: string, data: Record<string, unknown>): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.updateSection(userId, 'education', data);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    updated.completionPercentage = pct;
    return updated;
  }

  async addCertification(userId: string, data: Record<string, unknown>): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.addCertification(userId, data);
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }

  async removeCertification(userId: string, certId: string): Promise<ITeacherProfileDocument> {
    const updated = await teacherProfileRepository.removeCertification(userId, certId);
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }

  async updateLanguages(userId: string, languages: unknown[]): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.updateRoot(userId, { languages });
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    return updated;
  }

  async updateLocationPreferences(userId: string, data: Record<string, unknown>): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.updateSection(userId, 'locationPreferences', data);
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    return updated;
  }

  async updateSalaryExpectations(userId: string, data: Record<string, unknown>): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    const updated = await teacherProfileRepository.updateSection(userId, 'salaryExpectations', data);
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }

  async uploadPhoto(userId: string, buffer: Buffer): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    if (profile.personal?.photoKey) {
      await deleteFromCloudinary(profile.personal.photoKey).catch(() => {});
    }

    const result = await uploadToCloudinary(buffer, 'photos');
    const updated = await teacherProfileRepository.updateSection(userId, 'personal', {
      photoUrl: result.secureUrl,
      photoKey: result.publicId,
    });
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    return updated;
  }

  async uploadResume(userId: string, buffer: Buffer, originalName: string): Promise<ITeacherProfileDocument> {
    let profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) profile = await teacherProfileRepository.create(userId);

    if (profile.resume?.fileKey) {
      await deleteFromCloudinary(profile.resume.fileKey, 'raw').catch(() => {});
    }

    const result = await uploadToCloudinary(buffer, 'resumes');
    const updated = await teacherProfileRepository.updateRoot(userId, {
      resume: {
        fileUrl: result.secureUrl,
        fileKey: result.publicId,
        originalName,
        uploadedAt: new Date(),
      },
    });
    if (!updated) throw AppError.notFound('Profile not found');

    const pct = calculateCompletion(updated);
    await teacherProfileRepository.updateCompletionPercentage(userId, pct);
    return updated;
  }

  async uploadCertificateFile(userId: string, certId: string, buffer: Buffer): Promise<ITeacherProfileDocument> {
    const profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cert = profile.certifications.find((c) => (c as any)._id?.toString() === certId);
    if (!cert) throw AppError.notFound('Certification not found');

    if (cert.fileKey) {
      await deleteFromCloudinary(cert.fileKey, 'raw').catch(() => {});
    }

    const result = await uploadToCloudinary(buffer, 'certificates');

    const updatedCerts = profile.certifications.map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cObj = c as any as Record<string, unknown> & { _id?: { toString(): string } };
      if (cObj._id?.toString() === certId) {
        return { ...cObj, fileUrl: result.secureUrl, fileKey: result.publicId };
      }
      return cObj;
    });

    const updated = await teacherProfileRepository.updateRoot(userId, { certifications: updatedCerts });
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }

  async uploadEducationCertificate(userId: string, buffer: Buffer): Promise<ITeacherProfileDocument> {
    const profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');

    if (profile.education?.certificateKey) {
      await deleteFromCloudinary(profile.education.certificateKey, 'raw').catch(() => {});
    }

    const result = await uploadToCloudinary(buffer, 'certificates');
    const updated = await teacherProfileRepository.updateSection(userId, 'education', {
      certificateUrl: result.secureUrl,
      certificateKey: result.publicId,
    });
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }

  async submitForApproval(userId: string): Promise<ITeacherProfileDocument> {
    const profile = await teacherProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Profile not found');

    if (profile.completionPercentage < 60) {
      throw AppError.badRequest('Profile must be at least 60% complete before submitting');
    }
    if (profile.profileStatus === 'pending') {
      throw AppError.badRequest('Profile is already under review');
    }
    if (profile.profileStatus === 'approved') {
      throw AppError.badRequest('Profile is already approved');
    }

    const updated = await teacherProfileRepository.submitForApproval(userId);
    if (!updated) throw AppError.notFound('Profile not found');
    return updated;
  }
}

export const teacherProfileService = new TeacherProfileService();
