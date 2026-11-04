import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { ApiError } from "./api/client";
import { AuthProvider } from "./auth/AuthProvider";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { ThemeProvider } from "./hooks/useTheme";
import { router } from "./router";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Retrying a 404 or a rule violation is pointless — the answer will not change.
      // Only genuine transport failures are worth a second attempt.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

/*
 * Provider order: data first (Auth clears the query cache on sign-out, so it sits
 * inside QueryClient), then presentation (theme, toasts, confirms), which pages reach
 * from anywhere — including from inside dialogs, which portal out to <body>.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
