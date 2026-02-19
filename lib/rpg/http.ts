export function getUserIdFromSearch(url: string): string {
  const sp = new URL(url).searchParams;
  return (sp.get("userId") ?? "u1").trim() || "u1";
}
