import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import type { Role } from "../api/types";
import { ROLE_HOME } from "../components/navigation";
import { useUser } from "./AuthProvider";

/**
 * Shows its children to one role and redirects the other — to its home page unless
 * told where. A convenience for the screens, not security: the server refuses the
 * same requests whatever the UI shows.
 */
export function RequireRole({
  role,
  redirectTo,
  children,
}: {
  role: Role;
  redirectTo?: string;
  children: ReactNode;
}) {
  const user = useUser();
  if (user.role !== role) return <Navigate to={redirectTo ?? ROLE_HOME[user.role]} replace />;
  return children;
}

/** One route, a different screen per role: /applications is a review queue for a
 * recruiter and "my applications" for a candidate. */
export function RoleSwitch({ recruiter, candidate }: { recruiter: ReactNode; candidate: ReactNode }) {
  return useUser().role === "recruiter" ? recruiter : candidate;
}

/** "/" — send each role to its own home. */
export function RoleHome() {
  return <Navigate to={ROLE_HOME[useUser().role]} replace />;
}
