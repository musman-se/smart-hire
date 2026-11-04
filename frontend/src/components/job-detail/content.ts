/**
 * How the skills a job asks for line up with the skills its description talks about.
 * A required skill the text never mentions is worth a recruiter's attention: the
 * posting asks for it without saying why, and scoring cannot see it in context.
 */

import type { JobContent } from "../../api/types";

type ExtractedSkill = JobContent["extracted_skills"][number];

export interface SkillCoverage {
  /** Extracted skills that are also required, most-mentioned first. */
  required: ExtractedSkill[];
  /** Extracted skills the job does not require — they feed scoring's 15% only. */
  other: ExtractedSkill[];
  /** Required skills the description never mentions, in the job's spelling. */
  unmentioned: string[];
}

const normalise = (skill: string) => skill.trim().toLowerCase();

export function skillCoverage(
  requiredSkills: readonly string[] | null | undefined,
  extracted: readonly ExtractedSkill[],
): SkillCoverage {
  const required = new Set((requiredSkills ?? []).map(normalise));
  const mentioned = new Set(extracted.map((skill) => normalise(skill.name)));
  const byMentions = [...extracted].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));

  return {
    required: byMentions.filter((skill) => required.has(normalise(skill.name))),
    other: byMentions.filter((skill) => !required.has(normalise(skill.name))),
    unmentioned: (requiredSkills ?? []).filter((skill) => !mentioned.has(normalise(skill))),
  };
}
