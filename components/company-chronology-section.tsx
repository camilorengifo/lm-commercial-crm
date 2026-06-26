"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_TYPE_LABELS,
  activityTypeBadgeClass,
} from "@/lib/crmConstants";
import {
  fetchCommercialTimelineActivities,
  type CommercialTimelineActivity,
} from "@/lib/commercialTimeline";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";

export function CompanyChronologySection({
  companyId,
  userId,
  externalRefreshKey,
  isAdmin = false,
}: {
  companyId: string;
  userId: string;
  onCompanyUpdated?: () => void;
  externalRefreshKey?: number;
  canManage?: boolean;
  isAdmin?: boolean;
}) {
  const [activities, setActivities] = useState<CommercialTimelineActivity[]>(
    [],
  );
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await fetchCommercialTimelineActivities({
      companyId,
      userId,
      isAdmin,
    });

    if (error) {
      throw error;
    }

    setActivities(data);
  }, [companyId, userId, isAdmin]);

  const refreshAll = useCallback(async () => {
    setFetchError(null);
    try {
      await fetchActivities();
    } catch (error) {
      setFetchError(formatSupabaseError(error as { message?: string }));
    }
  }, [fetchActivities]);

  useEffect(() => {
    setLoadingActivities(true);
    refreshAll().finally(() => {
      setLoadingActivities(false);
    });
  }, [refreshAll]);

  useEffect(() => {
    if (externalRefreshKey === undefined || externalRefreshKey === 0) return;
    refreshAll();
  }, [externalRefreshKey, refreshAll]);

  return (
    <section className="crm-card crm-card-padded">
      <div className="mb-6">
        <h2 className="crm-section-title">Commercial Timeline</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Commercial history is generated automatically from completed
          activities and follow-ups.
        </p>
      </div>

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {loadingActivities ? (
        <p className="text-sm text-zinc-500">Loading commercial history...</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No commercial activity has been recorded for this company yet. Log
          activity from the Follow-ups section above.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-zinc-200 pl-6">
          {activities.map((activity) => (
            <li key={activity.id} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[1.625rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-200" />

              <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <time
                      dateTime={activity.activity_at}
                      className="text-sm font-semibold text-zinc-900"
                    >
                      {formatDateTime(activity.activity_at)}
                    </time>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${activityTypeBadgeClass(activity.activity_type)}`}
                    >
                      {ACTIVITY_TYPE_LABELS[activity.activity_type]}
                    </span>
                  </div>

                  {activity.subject &&
                    activity.subject !==
                      ACTIVITY_TYPE_LABELS[activity.activity_type] && (
                      <p className="text-sm font-medium text-zinc-800">
                        {activity.subject}
                      </p>
                    )}

                  {activity.notes && (
                    <p className="whitespace-pre-wrap text-sm text-zinc-600">
                      {activity.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    {activity.brokerEmail && (
                      <span>Broker: {activity.brokerEmail}</span>
                    )}
                    {activity.contactName && (
                      <span>Contact: {activity.contactName}</span>
                    )}
                  </div>

                  {activity.scheduled_follow_up_at && (
                    <p className="text-sm text-sky-700">
                      Next follow-up scheduled for{" "}
                      {formatDateTime(activity.scheduled_follow_up_at)}
                    </p>
                  )}

                  <p className="text-xs text-zinc-400">
                    Recorded on {formatDate(activity.created_at)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
