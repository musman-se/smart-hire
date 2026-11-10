import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { ROLE_HOME } from "../components/navigation";
import { useUser } from "./AuthProvider";
import { canSee, isStaff, type Audience } from "./roles";

/**
 * Shows its children to one audience and redirects everyone else — to their home page
 * unless told where. A convenience for the screens, not security: the server refuses
 * the same requests whatever the UI shows.
 */
export function RequireRole({
  role,
  redirectTo,
  children,
}: {
  role: Audience;
  redirectTo?: string;
  children: ReactNode;
}) {
  const user = useUser();
  if (!canSee(user.role, role)) return <Navigate to={redirectTo ?? ROLE_HOME[user.role]} replace />;
  return children;
}

/** One route, a different screen per side: /applications is a review queue for the
 * hiring team (admins included) and "my applications" for a candidate. */
export function RoleSwitch({ staff, candidate }: { staff: ReactNode; candidate: ReactNode }) {
  return isStaff(useUser().role) ? staff : candidate;
}

/** "/" — send each role to its own home. */
export function RoleHome() {
  return <Navigate to={ROLE_HOME[useUser().role]} replace />;
}
