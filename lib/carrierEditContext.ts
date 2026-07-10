export type CarrierPageContext = "my" | "network";

export type CarrierEditContext = CarrierPageContext;

export function parseCarrierPageContext(
  value: string | null | undefined,
): CarrierPageContext {
  return value === "my" ? "my" : "network";
}

export function carrierDetailHref(
  carrierId: string,
  context: CarrierPageContext,
  options?: { edit?: boolean },
): string {
  const params = new URLSearchParams();
  params.set("from", context);
  if (options?.edit) {
    params.set("edit", "1");
  }
  return `/carrier-directory/${carrierId}?${params.toString()}`;
}
