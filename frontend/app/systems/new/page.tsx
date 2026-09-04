"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { SystemBuilder } from "@/components/workspace/SystemBuilder";
import { Spinner } from "@/components/ui/AsyncState";

function NewSystemInner() {
  const params = useSearchParams();
  const mode = params.get("mode") === "import" ? "import" : "build";

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="New system" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SystemBuilder initialMode={mode} />
        </div>
      </div>
    </AppShell>
  );
}

export default function NewSystemPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-canvas">
          <Spinner />
        </div>
      }
    >
      <NewSystemInner />
    </Suspense>
  );
}
