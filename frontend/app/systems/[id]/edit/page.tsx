"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { SystemDetail } from "@/lib/workspace";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { SystemBuilder } from "@/components/workspace/SystemBuilder";
import { ErrorState, LoadingState } from "@/components/ui/AsyncState";

/**
 * Edit a saved system.
 *
 * A system belonging to somebody else answers 404 from the API, so this screen
 * reports "not found" without ever having to know whose it was.
 */
export default function EditSystemPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [system, setSystem] = useState<SystemDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    api.system(id).then(setSystem).catch(setError);
  }, [id]);

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title={system ? `Edit ${system.name}` : "Edit system"} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="p-8">
              <ErrorState error={error} what="that system" />
            </div>
          ) : !system ? (
            <LoadingState label="Loading the system…" />
          ) : system.read_only ? (
            <div className="mx-auto max-w-[640px] px-6 py-10">
              <h2 className="text-title text-primary">The demo is read-only</h2>
              <p className="pt-2 text-body text-secondary">
                Nova Commerce is a sample architecture shared by everyone, so it
                cannot be edited. Create your own system to model something you
                actually run.
              </p>
            </div>
          ) : (
            <SystemBuilder existing={system} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
