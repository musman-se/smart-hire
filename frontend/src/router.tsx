import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole, RoleHome, RoleSwitch } from "./auth/RequireRole";
import { Layout } from "./components/Layout";
import type { RouteHandle } from "./components/navigation";
import { RouteErrorPage } from "./components/RouteErrorPage";
import { PageLoader } from "./components/ui";

/**
 * Lazy-loads a page that is a named export. Each page becomes its own chunk, so a
 * candidate never downloads the recruiter's pipeline board.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy<ComponentType>(() => load().then((module) => ({ default: module[name] })));
}

const LoginPage = lazyPage(() => import("./pages/LoginPage"), "LoginPage");
const RegisterPage = lazyPage(() => import("./pages/RegisterPage"), "RegisterPage");
const InvitePage = lazyPage(() => import("./pages/InvitePage"), "InvitePage");
const DashboardPage = lazyPage(() => import("./pages/recruiter/DashboardPage"), "DashboardPage");
const CandidateHomePage = lazyPage(() => import("./pages/candidate/HomePage"), "CandidateHomePage");
const JobsPage = lazyPage(() => import("./pages/JobsPage"), "JobsPage");
const JobDetailPage = lazyPage(() => import("./pages/JobDetailPage"), "JobDetailPage");
const JobEditorPage = lazyPage(() => import("./pages/recruiter/JobEditorPage"), "JobEditorPage");
const PipelinePage = lazyPage(() => import("./pages/recruiter/PipelinePage"), "PipelinePage");
const CandidatesPage = lazyPage(() => import("./pages/CandidatesPage"), "CandidatesPage");
const CandidateDetailPage = lazyPage(
  () => import("./pages/CandidateDetailPage"),
  "CandidateDetailPage",
);
const ApplicationsPage = lazyPage(
  () => import("./pages/recruiter/ApplicationsPage"),
  "ApplicationsPage",
);
const MyApplicationsPage = lazyPage(
  () => import("./pages/candidate/MyApplicationsPage"),
  "MyApplicationsPage",
);
const ProfilePage = lazyPage(() => import("./pages/ProfilePage"), "ProfilePage");
const TeamPage = lazyPage(() => import("./pages/admin/TeamPage"), "TeamPage");
const NotFoundPage = lazyPage(() => import("./pages/NotFoundPage"), "NotFoundPage");

/** The signed-out pages have no shell around them to hold a Suspense boundary. */
function Standalone({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/** The hiring side: recruiters and admins. */
const staffOnly = (page: ReactNode) => <RequireRole role="staff">{page}</RequireRole>;
const adminOnly = (page: ReactNode) => <RequireRole role="admin">{page}</RequireRole>;
const candidateOnly = (page: ReactNode) => <RequireRole role="candidate">{page}</RequireRole>;

/** The route map. Pages render inside Layout's Suspense and per-route ErrorBoundary. */
export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Standalone>
        <LoginPage />
      </Standalone>
    ),
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/register",
    element: (
      <Standalone>
        <RegisterPage />
      </Standalone>
    ),
    errorElement: <RouteErrorPage />,
  },
  {
    // Public: whoever opens an invitation link has no password yet. The token rides
    // in the fragment (/invite#…), which browsers never send to a server.
    path: "/invite",
    element: (
      <Standalone>
        <InvitePage />
      </Standalone>
    ),
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: "dashboard", element: staffOnly(<DashboardPage />) },
      { path: "home", element: candidateOnly(<CandidateHomePage />) },

      { path: "jobs", element: <JobsPage /> },
      { path: "jobs/new", element: staffOnly(<JobEditorPage />) },
      { path: "jobs/:jobId", element: <JobDetailPage /> },
      { path: "jobs/:jobId/edit", element: staffOnly(<JobEditorPage />) },
      {
        path: "jobs/:jobId/pipeline",
        element: staffOnly(<PipelinePage />),
        handle: { wide: true } satisfies RouteHandle,
      },

      { path: "candidates", element: staffOnly(<CandidatesPage />) },
      {
        path: "candidates/:candidateId",
        // A candidate's own record is their applications page.
        element: (
          <RequireRole role="staff" redirectTo="/applications">
            <CandidateDetailPage />
          </RequireRole>
        ),
      },

      {
        path: "applications",
        element: <RoleSwitch staff={<ApplicationsPage />} candidate={<MyApplicationsPage />} />,
      },
      { path: "profile", element: <ProfilePage /> },
      { path: "team", element: adminOnly(<TeamPage />) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
