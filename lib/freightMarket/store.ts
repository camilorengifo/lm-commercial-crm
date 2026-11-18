import type { SupabaseClient } from "@supabase/supabase-js";
import type { FreightMarketAssessment, MarketDirection } from "@/lib/freightMarket/assess";

export interface StoredMarketReport {
  id: string;
  companyId: string;
  origin: string | null;
  destination: string | null;
  equipment: string | null;
  commodity: string | null;
  researchPeriodStart: string | null;
  researchPeriodEnd: string | null;
  marketDirection: MarketDirection;
  reportSummary: string;
  createdAt: string;
  expiresAt: string;
  sources: Array<{
    sourceName: string;
    sourceUrl: string;
    sourceType: string;
    publicationDate: string | null;
    retrievedAt: string;
    supportingFinding: string;
  }>;
}

function missingTable(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("market_research") ||
    message.includes("could not find the table")
  );
}

function internalSummary(
  assessment: FreightMarketAssessment,
  comparison: string | null,
): string {
  return JSON.stringify({
    direction: assessment.direction,
    comparison,
    emailGuidance: assessment.emailGuidance,
    unavailable: assessment.unavailable,
    conflicts: assessment.conflicts,
    limitation: assessment.limitation,
    findings: assessment.findings.map((finding) => ({
      insight: finding.insight,
      sourceName: finding.sourceName,
      sourceUrl: finding.sourceUrl,
      sourceType: finding.sourceType ?? null,
      publishedAt: finding.publishedAt,
      retrievedAt: finding.retrievedAt ?? assessment.searchedAt,
      scope: finding.scope,
      relevance: finding.relevance,
      cadence: finding.cadence ?? null,
    })),
  });
}

export async function saveMarketResearchReport(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    createdBy: string;
    assessment: FreightMarketAssessment;
  },
): Promise<string | null> {
  const { assessment } = input;
  const previous = await supabase
    .from("market_research_reports")
    .select("market_direction, created_at")
    .eq("company_id", input.companyId)
    .eq("origin", assessment.origin)
    .eq("destination", assessment.destination)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previous.error && !missingTable(previous.error)) {
    console.error("[market-research] previous report lookup failed", previous.error.message);
  }

  const prior =
    previous.data && typeof previous.data.market_direction === "string"
      ? `Previous stored direction on ${String(previous.data.created_at).slice(0, 10)} was ${previous.data.market_direction}. This retrieval is ${assessment.direction}. Do not present the stored report as a new weekly update.`
      : null;

  const expires = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const inserted = await supabase
    .from("market_research_reports")
    .insert({
      company_id: input.companyId,
      created_by: input.createdBy,
      origin: assessment.origin,
      destination: assessment.destination,
      equipment: assessment.equipment,
      commodity: assessment.commodity,
      research_period_start: assessment.periodStart,
      research_period_end: assessment.periodEnd,
      market_direction: assessment.direction,
      report_summary: internalSummary(assessment, prior),
      expires_at: expires,
    })
    .select("id")
    .maybeSingle();

  if (inserted.error || !inserted.data?.id) {
    if (!missingTable(inserted.error)) {
      console.error("[market-research] report insert failed", inserted.error?.message);
    }
    return null;
  }

  const reportId = String(inserted.data.id);
  const sources = assessment.findings
    .filter((finding) => finding.sourceUrl)
    .map((finding) => ({
      report_id: reportId,
      source_name: finding.sourceName,
      source_url: finding.sourceUrl,
      source_type: finding.sourceType ?? "other",
      publication_date: finding.publishedAt,
      retrieved_at: finding.retrievedAt ?? assessment.searchedAt,
      supporting_finding: finding.insight,
    }));

  if (sources.length > 0) {
    const sourceInsert = await supabase.from("market_research_sources").insert(sources);
    if (sourceInsert.error) {
      console.error("[market-research] source insert failed", sourceInsert.error.message);
    }
  }

  return reportId;
}

export async function getMarketResearchReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<StoredMarketReport | null> {
  const report = await supabase
    .from("market_research_reports")
    .select(
      "id, company_id, origin, destination, equipment, commodity, research_period_start, research_period_end, market_direction, report_summary, created_at, expires_at",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (report.error || !report.data) return null;

  const sources = await supabase
    .from("market_research_sources")
    .select(
      "source_name, source_url, source_type, publication_date, retrieved_at, supporting_finding",
    )
    .eq("report_id", reportId);

  const row = report.data;
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    origin: row.origin ?? null,
    destination: row.destination ?? null,
    equipment: row.equipment ?? null,
    commodity: row.commodity ?? null,
    researchPeriodStart: row.research_period_start ?? null,
    researchPeriodEnd: row.research_period_end ?? null,
    marketDirection: row.market_direction as MarketDirection,
    reportSummary: String(row.report_summary ?? ""),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    sources: ((sources.data ?? []) as Array<Record<string, string | null>>).map((source) => ({
      sourceName: source.source_name ?? "",
      sourceUrl: source.source_url ?? "",
      sourceType: source.source_type ?? "",
      publicationDate: source.publication_date,
      retrievedAt: source.retrieved_at ?? "",
      supportingFinding: source.supporting_finding ?? "",
    })),
  };
}
