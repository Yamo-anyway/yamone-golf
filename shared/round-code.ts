/** Round invitations have their own QR namespace; personal QR codes cannot join rooms. */
export function normalizeRoundCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 180) return null;
  const value = input.trim();
  const qr =
    /^yamone-golf:\/\/round\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12})$/i.exec(
      value,
    );
  const code = qr
    ? qr[1].toUpperCase()
    : value.replace(/[\s-]/g, "").toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(code) ? code : null;
}
export function roundQRValue(code: string): string {
  return `yamone-golf://round/${code}`;
}
