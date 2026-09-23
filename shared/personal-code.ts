// Public identifiers only. Never accept arbitrary URLs or treat a QR as authentication.
export function normalizePersonalCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 180) return null;
  const value = input.trim();
  const qr = /^yamone-golf:\/\/player\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12})$/i.exec(value);
  const code = qr ? qr[1].toUpperCase() : value.replace(/[\s-]/g, '').toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(code) ? code : null;
}
