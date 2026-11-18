export const CUSTOMER_FACING_COMPANY = "Armstrong Transport Group";

export const CUSTOMER_BRAND_RULES = `
Customer-facing company: ${CUSTOMER_FACING_COMPANY}.
Armstrong Transport Group is the name customers see. Logistics Masters is the agency operating the CRM and must not be introduced as the customer's transportation provider.
In every customer-facing email, call script, LinkedIn draft, signature, and introduction, use ${CUSTOMER_FACING_COMPANY}.
Never write Logistics Masters in customer-facing text.
Do not invent legal names, operating authorities, credentials, or affiliations.
`.trim();

export function enforceCustomerBrand(value: string): string {
  return value.replace(/\bLogistics Masters\b/gi, CUSTOMER_FACING_COMPANY);
}

export function namesInternalCompanyAsCarrier(value: string): boolean {
  return /\bLogistics Masters\b/i.test(value);
}
