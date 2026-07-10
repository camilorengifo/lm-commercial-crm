"use client";

import {
  DEFAULT_CARRIER_COUNTRY,
  SUPPORTED_CARRIER_COUNTRIES,
} from "@/lib/carrierCountries";

export function CarrierCountrySelect({
  id,
  value,
  onChange,
  className = "crm-select w-full",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selectedValue = SUPPORTED_CARRIER_COUNTRIES.includes(
    value as (typeof SUPPORTED_CARRIER_COUNTRIES)[number],
  )
    ? value
    : DEFAULT_CARRIER_COUNTRY;

  return (
    <select
      id={id}
      className={className}
      value={selectedValue}
      onChange={(event) => onChange(event.target.value)}
      required
    >
      {SUPPORTED_CARRIER_COUNTRIES.map((country) => (
        <option key={country} value={country}>
          {country}
        </option>
      ))}
    </select>
  );
}
