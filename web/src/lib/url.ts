/** Encode a query value but keep "/" and "@" readable (both are valid in a query string): next=/profile, not next=%2Fprofile. */
export const qs = (v: string) => encodeURIComponent(v).replace(/%2F/gi, "/").replace(/%40/g, "@");
