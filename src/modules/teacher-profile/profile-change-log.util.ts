import ProfileChangeLog, {
  IProfileFieldChange,
  ProfileSection,
} from '../../models/profile-change-log.model';

// SRD 2.2.10 — fields whose change requires admin re-approval.
// Schools rely on these to make hiring decisions, so any modification flips
// the profile back to 'pending' status.
const MAJOR_FIELDS_BY_SECTION: Record<ProfileSection, string[]> = {
  personal: ['fullNameAr', 'fullNameEn', 'nationalId', 'dateOfBirth', 'nationality'],
  professional: ['subjects', 'gradeLevels'],
  education: ['degreeType', 'major'],
  certifications: ['__any__'], // any add/remove is major
  languages: [],
  locationPreferences: [],
  salaryExpectations: [],
  resume: [],
  photo: [],
};

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  // Mongoose ObjectId / subdoc → plain JSON for stable comparison
  if (typeof value === 'object' && value !== null && 'toString' in value && Object.keys(value).length === 0) {
    return (value as { toString: () => string }).toString();
  }
  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/**
 * Diff two snapshots of the same section. Only returns fields that changed.
 */
export function diffSection(
  oldSnapshot: Record<string, unknown> | undefined | null,
  newSnapshot: Record<string, unknown> | undefined | null,
): IProfileFieldChange[] {
  const changes: IProfileFieldChange[] = [];
  const oldObj = oldSnapshot ?? {};
  const newObj = newSnapshot ?? {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of keys) {
    // Skip internal fields
    if (key.startsWith('_') || key === 'photoKey' || key === 'photoUrl' ||
        key === 'fileKey' || key === 'certificateKey' || key === 'photoKey') {
      continue;
    }
    if (!deepEqual(oldObj[key], newObj[key])) {
      changes.push({
        field: key,
        oldValue: normalize(oldObj[key]),
        newValue: normalize(newObj[key]),
      });
    }
  }
  return changes;
}

export function isMajorChange(section: ProfileSection, changes: IProfileFieldChange[]): boolean {
  if (changes.length === 0) return false;
  const majorList = MAJOR_FIELDS_BY_SECTION[section];
  if (!majorList || majorList.length === 0) return false;
  if (majorList.includes('__any__')) return true;
  return changes.some((c) => majorList.includes(c.field));
}

/**
 * Persist a change log entry. Returns whether re-approval was triggered.
 */
export async function writeChangeLog(params: {
  teacherProfileId: string;
  userId: string;
  section: ProfileSection;
  changes: IProfileFieldChange[];
  currentStatus: string;
}): Promise<{ isMajor: boolean; triggeredReApproval: boolean }> {
  if (params.changes.length === 0) {
    return { isMajor: false, triggeredReApproval: false };
  }

  const isMajor = isMajorChange(params.section, params.changes);
  // Re-approval only triggers when the profile was previously approved and the
  // change is classified as major. Pending/draft/rejected profiles don't flip.
  const triggeredReApproval = isMajor && params.currentStatus === 'approved';

  await ProfileChangeLog.create({
    teacherProfileId: params.teacherProfileId,
    userId: params.userId,
    section: params.section,
    changes: params.changes,
    isMajor,
    triggeredReApproval,
  });

  return { isMajor, triggeredReApproval };
}
