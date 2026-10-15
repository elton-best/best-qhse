/** Score 0-4 : longueur ≥ 8, majuscule+minuscule, chiffre, caractère spécial. */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

export type PasswordRequirement = { label: string; ok: boolean };

/**
 * Politique appliquée par le serveur (SuperAdminSettingsService::passwordRules) :
 * 8 caractères minimum avec une majuscule, une minuscule et un chiffre.
 */
export function passwordRequirements(pw: string): PasswordRequirement[] {
  return [
    { label: "Au moins 8 caractères", ok: pw.length >= 8 },
    { label: "Une lettre majuscule", ok: /[A-Z]/.test(pw) },
    { label: "Une lettre minuscule", ok: /[a-z]/.test(pw) },
    { label: "Un chiffre", ok: /[0-9]/.test(pw) },
  ];
}

export function meetsPasswordPolicy(pw: string): boolean {
  return passwordRequirements(pw).every((requirement) => requirement.ok);
}
