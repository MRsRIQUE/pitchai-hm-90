export const BUILT_IN_HOT_PRODUCTS_MASTER_EMAILS = ["jpa.costa590@gmail.com"] as const;

export type HotProductsIdentity = {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
};

function csvSet(raw: string | undefined, normalize = false): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (normalize ? value.toLowerCase() : value)),
  );
}

/** Autoriza somente a curadoria de Produtos Quentes, sem conceder papel de admin. */
export function isHotProductsMaster(
  identity: HotProductsIdentity,
  options: { masterUids?: string; masterEmails?: string } = {},
): boolean {
  if (csvSet(options.masterUids).has(identity.uid)) return true;

  const email = identity.email?.trim().toLowerCase();
  if (!email || identity.emailVerified !== true) return false;
  const emails = csvSet(options.masterEmails, true);
  for (const builtIn of BUILT_IN_HOT_PRODUCTS_MASTER_EMAILS) emails.add(builtIn);
  return emails.has(email);
}
