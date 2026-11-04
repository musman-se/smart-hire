import type { Candidate } from "../../api/types";
import { Avatar, Card, CardHeader, Icon, Tags, formatYears } from "../ui";

/**
 * The candidate's profile as a recruiter meets it on an application — name, headline,
 * experience, skills and how to reach them. Fed the form's unsaved values, so every
 * keystroke shows what it changes.
 */
export function RecruiterPreview({ candidate }: { candidate: Candidate }) {
  const skills = candidate.skills ?? [];
  return (
    <Card className="profile-preview">
      <CardHeader
        title="How recruiters see you"
        icon="eye"
        description="Updates as you type. Recruiters see it once you save."
      />
      <div className="profile-preview-card" aria-label="Preview of your profile" role="group">
        <div className="profile-preview-identity">
          <Avatar name={candidate.full_name} size="lg" />
          <div className="profile-preview-name">
            <strong>{candidate.full_name}</strong>
            {candidate.headline ? (
              <span className="profile-preview-headline">{candidate.headline}</span>
            ) : (
              <span className="profile-preview-missing">No headline yet</span>
            )}
          </div>
        </div>

        <ul className="profile-preview-facts">
          <li>
            <Icon name="briefcase" size={14} />
            {candidate.years_experience > 0
              ? `${formatYears(candidate.years_experience)} of experience`
              : "Experience not set"}
          </li>
          <li>
            <Icon name="mail" size={14} />
            <span className="truncate">{candidate.email}</span>
          </li>
          <li>
            <Icon name="phone" size={14} />
            {candidate.phone ?? <span className="profile-preview-missing">No phone number</span>}
          </li>
          <li>
            <Icon name="file-text" size={14} />
            {candidate.resume_url ? (
              <span>Resume linked</span>
            ) : (
              <span className="profile-preview-missing">No resume linked</span>
            )}
          </li>
        </ul>

        <div className="stack-sm">
          <span className="profile-preview-label">Skills</span>
          {skills.length > 0 ? (
            <Tags items={skills} max={10} />
          ) : (
            <span className="profile-preview-missing">No skills listed</span>
          )}
        </div>
      </div>
    </Card>
  );
}
