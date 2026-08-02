export function shouldLoadAccountData(command: string | null | undefined): boolean {
  return command !== "SetUserCookie";
}
