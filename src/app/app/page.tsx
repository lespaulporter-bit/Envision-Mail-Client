import { AppShell } from "@/components/AppShell";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

export default function AppPage() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
