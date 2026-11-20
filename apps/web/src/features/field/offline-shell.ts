export const shellUrl = "/tech-offline";
export const shellCache = "runline-field-shell-v1";

export function isFieldNavigation(path: string) {
  return path === "/tech" || path.startsWith("/tech/jobs/");
}
