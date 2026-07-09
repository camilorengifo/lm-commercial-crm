import * as XLSX from "xlsx";
import {
  COMPANY_PRIORITIES,
  COUNTRY_OPTIONS,
  DEFAULT_SALES_STAGE,
  SALES_STAGES,
  isSalesStage,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import { supabase } from "@/lib/supabaseClient";
import { buildCompanyInsertPayload } from "@/lib/companyCreate";

export const IMPORT_FIELD_DEFINITIONS = [
  { key: "company_name", label: "Company name", required: true },
  { key: "contact_full_name", label: "Contact full name" },
  { key: "first_name", label: "Contact first name" },
  { key: "last_name", label: "Contact last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "job_title", label: "Job title / role" },
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
  { key: "priority", label: "Priority" },
  { key: "sales_stage", label: "Sales stage" },
  { key: "notes", label: "Notes" },
  { key: "commodity", label: "Commodity" },
  { key: "equipment", label: "Equipment" },
  { key: "lane", label: "Lane" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_DEFINITIONS)[number]["key"];

export type ColumnMapping = Record<ImportFieldKey, string | null>;

const COLUMN_ALIASES: Record<ImportFieldKey, string[]> = {
  company_name: [
    "company",
    "company name",
    "customer",
    "prospect",
    "account",
    "business name",
    "account name",
    "client",
    "organization",
    "organisation",
  ],
  contact_full_name: ["contact", "contact name", "full name", "contact person"],
  first_name: ["first name", "firstname", "fname", "given name"],
  last_name: ["last name", "lastname", "lname", "surname", "family name"],
  email: ["email", "e mail", "email address", "mail"],
  phone: ["phone", "telephone", "mobile", "cell", "phone number", "tel"],
  job_title: ["title", "role", "position", "job title", "job"],
  country: ["country", "nation"],
  state: ["state", "province", "region", "st"],
  city: ["city", "town", "location"],
  priority: ["priority", "lead priority"],
  sales_stage: ["sales stage", "stage", "pipeline stage", "account stage"],
  notes: ["notes", "general notes", "comments", "remarks", "description"],
  commodity: ["commodity", "freight", "product"],
  equipment: ["equipment", "equipment type", "trailer type", "mode"],
  lane: ["lane", "route"],
  origin: ["origin", "lane origin", "from", "shipper city", "o city"],
  destination: [
    "destination",
    "lane destination",
    "to",
    "receiver city",
    "d city",
  ],
};

export interface RawImportRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface MappedImportRow {
  rowNumber: number;
  companyName: string | null;
  contactFullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  priority: CompanyPriority | null;
  salesStage: SalesStage | null;
  notes: string | null;
  commodity: string | null;
  equipment: string | null;
  lane: string | null;
  origin: string | null;
  destination: string | null;
  isValid: boolean;
  skipReason: string | null;
  hasContactInfo: boolean;
  resolvedFirstName: string | null;
  resolvedLastName: string | null;
  generalNotes: string | null;
  normalizedCompanyName: string | null;
}

export interface ImportPreview {
  totalRows: number;
  rowsWithCompanyName: number;
  rowsMissingCompanyName: number;
  invalidRows: number;
  fileDuplicateCompanies: number;
  companiesToCreate: number;
  companiesExisting: number;
  contactsToCreate: number;
  sampleRows: MappedImportRow[];
}

export interface ImportResult {
  companiesCreated: number;
  companiesSkippedDuplicate: number;
  companiesUpdated: number;
  contactsCreated: number;
  contactsSkippedDuplicate: number;
  rowsSkipped: number;
  errors: string[];
}

interface ExistingCompany {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  priority: CompanyPriority;
  sales_stage: SalesStage;
  general_notes: string | null;
}

interface ExistingContact {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
}

function emptyMapping(): ColumnMapping {
  return Object.fromEntries(
    IMPORT_FIELD_DEFINITIONS.map((field) => [field.key, null]),
  ) as ColumnMapping;
}

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parsePriority(value: string | null): CompanyPriority | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const match = COMPANY_PRIORITIES.find(
    (priority) => priority.toLowerCase() === normalized,
  );
  return match ?? null;
}

function parseSalesStage(value: string | null): SalesStage | null {
  if (!value) return null;
  const normalized = value.trim();
  if (isSalesStage(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const match = SALES_STAGES.find(
    (stage) => stage.toLowerCase() === lower,
  );
  return match ?? null;
}

function parseCountry(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();

  if (normalized === "usa" || normalized === "us" || normalized === "u s a") {
    return "United States";
  }
  if (normalized === "mx" || normalized === "mex") {
    return "Mexico";
  }
  if (normalized === "ca" || normalized === "can") {
    return "Canada";
  }

  const match = COUNTRY_OPTIONS.find(
    (country) => country.toLowerCase() === normalized,
  );
  return match ?? value.trim();
}

function splitFullName(fullName: string): {
  firstName: string;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: null };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function resolveContactNames(row: MappedImportRow): {
  firstName: string | null;
  lastName: string | null;
} {
  let firstName = row.firstName?.trim() || null;
  let lastName = row.lastName?.trim() || null;

  if (!firstName && row.contactFullName) {
    const split = splitFullName(row.contactFullName);
    firstName = split.firstName || null;
    lastName = lastName || split.lastName;
  }

  if (!firstName && row.email) {
    const localPart = row.email.split("@")[0]?.trim();
    firstName = localPart || "Imported Contact";
  }

  if (!firstName && row.phone) {
    firstName = "Imported Contact";
  }

  return { firstName, lastName };
}

function buildGeneralNotes(row: MappedImportRow): string | null {
  const parts: string[] = [];

  if (row.notes?.trim()) parts.push(row.notes.trim());
  if (row.commodity?.trim()) parts.push(`Commodity: ${row.commodity.trim()}`);
  if (row.equipment?.trim()) parts.push(`Equipment: ${row.equipment.trim()}`);

  const laneFromParts = [row.origin?.trim(), row.destination?.trim()].filter(
    Boolean,
  );
  if (row.lane?.trim()) {
    parts.push(`Lane: ${row.lane.trim()}`);
  } else if (laneFromParts.length > 0) {
    parts.push(`Lane: ${laneFromParts.join(" → ")}`);
  }

  if (parts.length === 0) return null;
  return parts.join("\n");
}

function getMappedValue(
  row: RawImportRow,
  mapping: ColumnMapping,
  field: ImportFieldKey,
): string | null {
  const column = mapping[field];
  if (!column) return null;
  const value = row.values[column];
  return value?.trim() ? value.trim() : null;
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  const usedHeaders = new Set<string>();

  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const fieldOrder: ImportFieldKey[] = [
    "company_name",
    "first_name",
    "last_name",
    "contact_full_name",
    "email",
    "phone",
    "job_title",
    "country",
    "state",
    "city",
    "priority",
    "sales_stage",
    "notes",
    "commodity",
    "equipment",
    "lane",
    "origin",
    "destination",
  ];

  for (const field of fieldOrder) {
    const aliases = COLUMN_ALIASES[field];
    const match = normalizedHeaders.find(
      (header) =>
        !usedHeaders.has(header.original) &&
        aliases.includes(header.normalized),
    );

    if (match) {
      mapping[field] = match.original;
      usedHeaders.add(match.original);
    }
  }

  return mapping;
}

export async function parseSpreadsheetFile(file: File): Promise<{
  headers: string[];
  rows: RawImportRow[];
  error: string | null;
}> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: false });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return { headers: [], rows: [], error: "The file does not contain any sheets." };
    }

    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      sheet,
      { header: 1, defval: "" },
    );

    if (matrix.length === 0) {
      return { headers: [], rows: [], error: "The file is empty." };
    }

    const headerRow = matrix[0] ?? [];
    const headers = headerRow
      .map((cell) => cleanCell(cell))
      .filter((header, index, array) => header || array.slice(index + 1).some(Boolean));

    if (headers.length === 0) {
      return {
        headers: [],
        rows: [],
        error: "No column headers were found in the first row.",
      };
    }

    const rows: RawImportRow[] = [];

    for (let index = 1; index < matrix.length; index += 1) {
      const rowValues = matrix[index] ?? [];
      const values: Record<string, string> = {};
      let hasContent = false;

      for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
        const header = headers[columnIndex];
        const cellValue = cleanCell(rowValues[columnIndex]);
        values[header] = cellValue;
        if (cellValue) hasContent = true;
      }

      if (!hasContent) continue;

      rows.push({
        rowNumber: index + 1,
        values,
      });
    }

    return { headers, rows, error: null };
  } catch {
    return {
      headers: [],
      rows: [],
      error: "Unable to read the file. Please upload a valid .xlsx or .csv file.",
    };
  }
}

export function mapImportRows(
  rows: RawImportRow[],
  mapping: ColumnMapping,
): MappedImportRow[] {
  return rows.map((row) => {
    const companyName = getMappedValue(row, mapping, "company_name");
    const contactFullName = getMappedValue(row, mapping, "contact_full_name");
    const firstName = getMappedValue(row, mapping, "first_name");
    const lastName = getMappedValue(row, mapping, "last_name");
    const email = getMappedValue(row, mapping, "email");
    const phone = getMappedValue(row, mapping, "phone");
    const jobTitle = getMappedValue(row, mapping, "job_title");
    const country = parseCountry(getMappedValue(row, mapping, "country"));
    const state = getMappedValue(row, mapping, "state");
    const city = getMappedValue(row, mapping, "city");
    const priority = parsePriority(getMappedValue(row, mapping, "priority"));
    const salesStage = parseSalesStage(
      getMappedValue(row, mapping, "sales_stage"),
    );
    const notes = getMappedValue(row, mapping, "notes");
    const commodity = getMappedValue(row, mapping, "commodity");
    const equipment = getMappedValue(row, mapping, "equipment");
    const lane = getMappedValue(row, mapping, "lane");
    const origin = getMappedValue(row, mapping, "origin");
    const destination = getMappedValue(row, mapping, "destination");

    const draft: MappedImportRow = {
      rowNumber: row.rowNumber,
      companyName,
      contactFullName,
      firstName,
      lastName,
      email,
      phone,
      jobTitle,
      country,
      state,
      city,
      priority,
      salesStage,
      notes,
      commodity,
      equipment,
      lane,
      origin,
      destination,
      isValid: false,
      skipReason: null,
      hasContactInfo: false,
      resolvedFirstName: null,
      resolvedLastName: null,
      generalNotes: null,
      normalizedCompanyName: companyName
        ? normalizeCompanyName(companyName)
        : null,
    };

    if (!companyName) {
      return {
        ...draft,
        skipReason: "Missing company name",
      };
    }

    const { firstName: resolvedFirstName, lastName: resolvedLastName } =
      resolveContactNames(draft);
    const hasContactInfo = Boolean(
      resolvedFirstName || email || phone || jobTitle,
    );

    return {
      ...draft,
      isValid: true,
      resolvedFirstName,
      resolvedLastName,
      hasContactInfo,
      generalNotes: buildGeneralNotes(draft),
    };
  });
}

export function buildImportPreview(
  mappedRows: MappedImportRow[],
  existingCompanyNames: Set<string>,
): ImportPreview {
  const validRows = mappedRows.filter((row) => row.isValid);
  const rowsWithCompanyName = mappedRows.filter((row) => row.companyName).length;
  const rowsMissingCompanyName = mappedRows.length - rowsWithCompanyName;

  const companyCounts = new Map<string, number>();
  for (const row of validRows) {
    if (!row.normalizedCompanyName) continue;
    companyCounts.set(
      row.normalizedCompanyName,
      (companyCounts.get(row.normalizedCompanyName) ?? 0) + 1,
    );
  }

  const fileDuplicateCompanies = [...companyCounts.values()].filter(
    (count) => count > 1,
  ).length;

  const uniqueCompanyNames = new Set(
    validRows
      .map((row) => row.normalizedCompanyName)
      .filter((name): name is string => Boolean(name)),
  );

  let companiesToCreate = 0;
  let companiesExisting = 0;

  for (const name of uniqueCompanyNames) {
    if (existingCompanyNames.has(name)) {
      companiesExisting += 1;
    } else {
      companiesToCreate += 1;
    }
  }

  const contactsToCreate = validRows.filter((row) => row.hasContactInfo).length;

  return {
    totalRows: mappedRows.length,
    rowsWithCompanyName,
    rowsMissingCompanyName,
    invalidRows: mappedRows.length - validRows.length,
    fileDuplicateCompanies,
    companiesToCreate,
    companiesExisting,
    contactsToCreate,
    sampleRows: mappedRows.slice(0, 8),
  };
}

function mergeGeneralNotes(
  existing: string | null,
  incoming: string | null,
): string | null {
  if (!incoming) return existing;
  if (!existing?.trim()) return incoming;
  if (existing.includes(incoming)) return existing;
  return `${existing.trim()}\n${incoming}`;
}

function buildCompanyUpdates(
  existing: ExistingCompany,
  row: MappedImportRow,
): Record<string, string | CompanyPriority | SalesStage> | null {
  const updates: Record<string, string | CompanyPriority | SalesStage> = {};

  if (!existing.city && row.city) updates.city = row.city;
  if (!existing.state && row.state) updates.state = row.state;
  if (!existing.country && row.country) updates.country = row.country;
  if (existing.priority === "Medium" && row.priority) {
    updates.priority = row.priority;
  } else if (!existing.priority && row.priority) {
    updates.priority = row.priority;
  }
  if (existing.sales_stage === DEFAULT_SALES_STAGE && row.salesStage) {
    updates.sales_stage = row.salesStage;
  }

  const mergedNotes = mergeGeneralNotes(existing.general_notes, row.generalNotes);
  if (mergedNotes && mergedNotes !== existing.general_notes) {
    updates.general_notes = mergedNotes;
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

function contactDuplicateKey(input: {
  companyId: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
}): string {
  if (input.email) {
    return `${input.companyId}::email::${normalizeEmail(input.email)}`;
  }

  const nameKey = [input.firstName, input.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  return `${input.companyId}::name::${nameKey}`;
}

export async function fetchExistingImportData(userId: string) {
  const [companiesResult, contactsResult] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, city, state, country, priority, sales_stage, general_notes",
      )
      .eq("user_id", userId),
    supabase
      .from("contacts")
      .select("id, company_id, first_name, last_name, email")
      .eq("user_id", userId),
  ]);

  return {
    companies: (companiesResult.data as ExistingCompany[]) ?? [],
    contacts: (contactsResult.data as ExistingContact[]) ?? [],
    error: companiesResult.error ?? contactsResult.error,
  };
}

export async function executeSpreadsheetImport(
  userId: string,
  mappedRows: MappedImportRow[],
  existingCompanies: ExistingCompany[],
  existingContacts: ExistingContact[],
): Promise<ImportResult> {
  const result: ImportResult = {
    companiesCreated: 0,
    companiesSkippedDuplicate: 0,
    companiesUpdated: 0,
    contactsCreated: 0,
    contactsSkippedDuplicate: 0,
    rowsSkipped: 0,
    errors: [],
  };

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser || authUser.id !== userId) {
    result.errors.push(
      "Import aborted: authenticated user does not match the import owner.",
    );
    return result;
  }

  const ownerUserId = authUser.id;

  const companyByNormalizedName = new Map<string, ExistingCompany>();
  for (const company of existingCompanies) {
    companyByNormalizedName.set(normalizeCompanyName(company.name), company);
  }

  const initialCompanyNames = new Set(companyByNormalizedName.keys());
  const matchedExistingCompanies = new Set<string>();
  const updatedCompanies = new Set<string>();

  const contactKeys = new Set<string>();
  for (const contact of existingContacts) {
    contactKeys.add(
      contactDuplicateKey({
        companyId: contact.company_id,
        email: contact.email,
        firstName: contact.first_name,
        lastName: contact.last_name,
      }),
    );
  }

  for (const row of mappedRows) {
    if (!row.isValid || !row.companyName || !row.normalizedCompanyName) {
      result.rowsSkipped += 1;
      continue;
    }

    let companyId: string | null = null;
    let companyRecord =
      companyByNormalizedName.get(row.normalizedCompanyName) ?? null;
    const existedBeforeImport = initialCompanyNames.has(row.normalizedCompanyName);

    if (companyRecord && existedBeforeImport) {
      companyId = companyRecord.id;
      matchedExistingCompanies.add(row.normalizedCompanyName);

      const updates = buildCompanyUpdates(companyRecord, row);
      if (updates) {
        const { error } = await supabase
          .from("companies")
          .update(updates)
          .eq("id", companyRecord.id)
          .eq("user_id", ownerUserId);

        if (error) {
          result.errors.push(
            `Row ${row.rowNumber}: failed to update "${row.companyName}" — ${error.message}`,
          );
        } else {
          updatedCompanies.add(companyRecord.id);
          companyRecord = { ...companyRecord, ...updates };
          companyByNormalizedName.set(row.normalizedCompanyName, companyRecord);
        }
      }
    } else if (companyRecord) {
      companyId = companyRecord.id;
    } else {
      const { data, error } = await supabase
        .from("companies")
        .insert(
          buildCompanyInsertPayload(ownerUserId, {
            name: row.companyName.trim(),
            city: row.city,
            state: row.state,
            country: row.country,
            priority: row.priority ?? "Medium",
            sales_stage: row.salesStage ?? DEFAULT_SALES_STAGE,
            general_notes: row.generalNotes,
            last_contact_at: null,
          }),
        )
        .select(
          "id, name, city, state, country, priority, sales_stage, general_notes",
        )
        .single();

      if (error || !data) {
        result.errors.push(
          `Row ${row.rowNumber}: failed to create "${row.companyName}" — ${error?.message ?? "Unknown error"}`,
        );
        result.rowsSkipped += 1;
        continue;
      }

      const created = data as ExistingCompany;
      companyId = created.id;
      companyRecord = created;
      companyByNormalizedName.set(row.normalizedCompanyName, created);
      result.companiesCreated += 1;
    }

    if (!companyId || !row.hasContactInfo || !row.resolvedFirstName) {
      continue;
    }

    const duplicateKey = contactDuplicateKey({
      companyId,
      email: row.email,
      firstName: row.resolvedFirstName,
      lastName: row.resolvedLastName,
    });

    if (contactKeys.has(duplicateKey)) {
      result.contactsSkippedDuplicate += 1;
      continue;
    }

    const { error: contactError } = await supabase.from("contacts").insert({
      user_id: ownerUserId,
      company_id: companyId,
      first_name: row.resolvedFirstName,
      last_name: row.resolvedLastName,
      email: row.email,
      phone: row.phone,
      job_title: row.jobTitle,
      notes: null,
      is_primary: false,
    });

    if (contactError) {
      result.errors.push(
        `Row ${row.rowNumber}: failed to create contact for "${row.companyName}" — ${contactError.message}`,
      );
      continue;
    }

    contactKeys.add(duplicateKey);
    result.contactsCreated += 1;
  }

  result.companiesSkippedDuplicate = matchedExistingCompanies.size;
  result.companiesUpdated = updatedCompanies.size;

  return result;
}
