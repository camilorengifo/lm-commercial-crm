import assert from "node:assert/strict";
import {
  companyMatchesSearch,
  filterCompaniesBySearch,
  normalizeOptionalMainPhone,
  type CompanyRecord,
} from "./companies";

function company(
  partial: Partial<CompanyRecord> & Pick<CompanyRecord, "name">,
): CompanyRecord {
  return {
    id: "company-1",
    user_id: "user-1",
    name: partial.name,
    main_phone: partial.main_phone ?? null,
    city: partial.city ?? null,
    state: partial.state ?? null,
    country: partial.country ?? null,
    priority: partial.priority ?? "Medium",
    sales_stage: "New Lead",
    general_notes: null,
    last_contact_at: null,
    next_follow_up_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

assert.deepEqual(normalizeOptionalMainPhone(""), { phone: null, error: null });
assert.deepEqual(normalizeOptionalMainPhone("   "), { phone: null, error: null });
assert.deepEqual(normalizeOptionalMainPhone(null), { phone: null, error: null });
assert.deepEqual(normalizeOptionalMainPhone(undefined), {
  phone: null,
  error: null,
});

assert.deepEqual(normalizeOptionalMainPhone("+1 555 123 4567"), {
  phone: "+1 555 123 4567",
  error: null,
});
assert.deepEqual(normalizeOptionalMainPhone("  +52 55 1234 5678  "), {
  phone: "+52 55 1234 5678",
  error: null,
});
assert.deepEqual(normalizeOptionalMainPhone("+57 601 123 4567"), {
  phone: "+57 601 123 4567",
  error: null,
});

assert.equal(normalizeOptionalMainPhone("call the office").phone, null);
assert.ok(normalizeOptionalMainPhone("call the office").error);
assert.equal(normalizeOptionalMainPhone("+".repeat(41)).phone, null);

const withPhone = company({
  name: "Andes Freight",
  city: "Bogota",
  main_phone: "+57 601 123 4567",
});
const withoutPhone = company({
  name: "Existing Mills",
  city: "Dallas",
  main_phone: null,
});

assert.equal(companyMatchesSearch(withPhone, "+57"), true);
assert.equal(companyMatchesSearch(withPhone, "6011234567"), true);
assert.equal(companyMatchesSearch(withoutPhone, "Existing"), true);
assert.equal(companyMatchesSearch(withoutPhone, "+57"), false);
assert.equal(companyMatchesSearch(withoutPhone, "Dallas"), true);

assert.deepEqual(
  filterCompaniesBySearch([withPhone, withoutPhone], "").map((row) => row.name),
  ["Andes Freight", "Existing Mills"],
);
assert.deepEqual(
  filterCompaniesBySearch([withPhone, withoutPhone], "+52").map((row) => row.name),
  [],
);

console.log("company main phone checks passed");
