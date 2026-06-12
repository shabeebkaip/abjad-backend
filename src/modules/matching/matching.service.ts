import { IJob, LanguageRequirement } from '../../models/job.model';
import {
  ITeacherProfileDocument,
  IProfessionalInfo,
  ILocationPreferences,
  ILanguageEntry,
  ExperienceRange,
  DegreeType,
  LanguageProficiency,
} from '../../models/teacher-profile.model';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchBreakdown {
  subjects: number;      // 0–100
  gradeLevels: number;   // 0–100
  experience: number;    // 0–100
  location: number;      // 0–100
  language: number;      // 0–100
  qualifications: number;// 0–100
}

export interface MatchResult {
  score: number;           // 0–100 weighted total
  breakdown: MatchBreakdown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Ordered from least to most experience
const EXP_ORDER: ExperienceRange[] = ['0-1', '1-3', '3-5', '5-10', '10+'];

// Ordered from lowest to highest qualification
const DEGREE_RANK: Record<string, number> = {
  diploma:  1,
  bachelor: 2,
  master:   3,
  phd:      4,
  other:    1, // treat as diploma-level for scoring
};

const LANG_SCORE: Record<LanguageProficiency, number> = {
  native:       100,
  fluent:        90,
  intermediate:  70,
  basic:         40,
};

// Spec weights: subjects 30%, grades 20%, experience 20%, location 15%, language 10%, qualifications 5%
const WEIGHTS = {
  subjects:       0.30,
  gradeLevels:    0.20,
  experience:     0.20,
  location:       0.15,
  language:       0.10,
  qualifications: 0.05,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class MatchingService {
  /**
   * Returns true when the teacher's profile lacks the signals needed for a
   * meaningful match score. With no subjects, grades, cities, or languages,
   * every job collapses to the same baseline (~36) which is misleading to
   * surface. Callers should omit matchScore when this is true.
   */
  isProfileSparse(profile: ITeacherProfileDocument): boolean {
    const prof = profile.professional as IProfessionalInfo | undefined;
    const loc  = profile.locationPreferences as ILocationPreferences | undefined;
    const subjects = prof?.subjects?.length ?? 0;
    const grades   = prof?.gradeLevels?.length ?? 0;
    const cities   = (loc?.preferredCities as string[] | undefined)?.length ?? 0;
    const langs    = profile.languages?.length ?? 0;
    return subjects === 0 && grades === 0 && cities === 0 && langs === 0;
  }

  /**
   * Compute a 0–100 match score between a teacher profile and a job posting.
   * Uses the weighted formula from the product spec.
   */
  compute(profile: ITeacherProfileDocument, job: IJob): MatchResult {
    const prof = profile.professional as IProfessionalInfo;
    const loc  = profile.locationPreferences as ILocationPreferences;

    const teacherSubjects:  string[]        = prof?.subjects     ?? [];
    const teacherGrades:    string[]        = prof?.gradeLevels  ?? [];
    const teacherExp:       ExperienceRange | undefined = prof?.experienceRange as ExperienceRange | undefined;
    const teacherCities:    string[]        = (loc?.preferredCities as string[]) ?? [];
    const teacherLanguages: ILanguageEntry[] = profile.languages ?? [];
    const teacherDegree:    DegreeType | undefined = profile.education?.degreeType as DegreeType | undefined;

    const breakdown: MatchBreakdown = {
      subjects:       this.scoreSubjects(teacherSubjects, job.subjects ?? []),
      gradeLevels:    this.scoreGradeLevels(teacherGrades, job.gradeLevels ?? []),
      experience:     this.scoreExperience(teacherExp, job.experienceRequired),
      location:       this.scoreLocation(teacherCities, job.city),
      language:       this.scoreLanguage(teacherLanguages, job.languageRequirement),
      qualifications: this.scoreQualifications(teacherDegree, job.degreeRequired),
    };

    const weighted =
      breakdown.subjects       * WEIGHTS.subjects       +
      breakdown.gradeLevels    * WEIGHTS.gradeLevels    +
      breakdown.experience     * WEIGHTS.experience     +
      breakdown.location       * WEIGHTS.location       +
      breakdown.language       * WEIGHTS.language       +
      breakdown.qualifications * WEIGHTS.qualifications;

    const score = Math.min(100, Math.max(0, Math.round(weighted)));
    return { score, breakdown };
  }

  // ── Subject Match (30%) ────────────────────────────────────────────────────
  private scoreSubjects(teacherSubjects: string[], jobSubjects: string[]): number {
    if (!jobSubjects.length) return 100;  // no requirement
    if (!teacherSubjects.length) return 0;

    const overlap = jobSubjects.filter((s) => teacherSubjects.includes(s)).length;
    return Math.round((overlap / jobSubjects.length) * 100);
  }

  // ── Grade Level Match (20%) ────────────────────────────────────────────────
  private scoreGradeLevels(teacherGrades: string[], jobGrades: string[]): number {
    if (!jobGrades.length) return 100;    // no requirement
    if (!teacherGrades.length) return 50; // no preference → assume somewhat flexible

    const overlap = jobGrades.filter((g) => teacherGrades.includes(g)).length;
    if (!overlap) return 0;
    return Math.round((overlap / jobGrades.length) * 100);
  }

  // ── Experience Level (20%) ─────────────────────────────────────────────────
  private scoreExperience(
    teacherExp: ExperienceRange | undefined,
    jobExp:     ExperienceRange | undefined,
  ): number {
    if (!jobExp)     return 100; // no requirement
    if (!teacherExp) return 60;  // unknown — give benefit of doubt

    const ti = EXP_ORDER.indexOf(teacherExp);
    const ji = EXP_ORDER.indexOf(jobExp);
    if (ti === -1 || ji === -1) return 60;

    const diff = ji - ti; // positive → teacher under-qualified

    if (diff === 0)   return 100; // exact match
    if (diff === -1)  return 95;  // slightly over-qualified (still great fit)
    if (diff <= -2)   return 85;  // notably over-qualified (may want a senior role)
    if (diff === 1)   return 65;  // one level below requirement
    if (diff === 2)   return 35;  // two levels below
    return 10;                    // three+ levels below
  }

  // ── Location (15%) ────────────────────────────────────────────────────────
  private scoreLocation(teacherCities: string[], jobCity: string): number {
    if (!teacherCities.length) return 75; // no preference → assume flexible

    const normalised = jobCity.toLowerCase().trim();
    const match = teacherCities.some((c) => c.toLowerCase().trim() === normalised);
    return match ? 100 : 0;
  }

  // ── Language (10%) ────────────────────────────────────────────────────────
  private scoreLanguage(
    teacherLanguages: ILanguageEntry[],
    jobLanguage: LanguageRequirement,
  ): number {
    if (!jobLanguage || jobLanguage === 'other') return 80; // can't assess

    const findScore = (lang: string): number => {
      const entry = teacherLanguages.find(
        (l) => l.language.toLowerCase() === lang,
      );
      if (!entry) return 0;
      return LANG_SCORE[entry.proficiency] ?? 0;
    };

    if (jobLanguage === 'arabic')    return findScore('arabic');
    if (jobLanguage === 'english')   return findScore('english');
    if (jobLanguage === 'bilingual') {
      const ar = findScore('arabic');
      const en = findScore('english');
      return Math.round((ar + en) / 2);
    }
    return 80;
  }

  // ── Qualifications (5%) ───────────────────────────────────────────────────
  private scoreQualifications(
    teacherDegree: DegreeType | undefined,
    jobDegree:     DegreeType | undefined,
  ): number {
    if (!jobDegree)     return 100; // no requirement
    if (!teacherDegree) return 50;  // unknown

    const teacherRank = DEGREE_RANK[teacherDegree] ?? 1;
    const jobRank     = DEGREE_RANK[jobDegree]     ?? 2;

    if (teacherRank >= jobRank) return 100; // meets or exceeds

    const diff = jobRank - teacherRank;
    if (diff === 1) return 65;
    if (diff === 2) return 30;
    return 10;
  }
}

export const matchingService = new MatchingService();
