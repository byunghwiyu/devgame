import type { Token } from "@/lib/data/loadTokens";

type ValidationResult = { valid: boolean; reason?: string };

const MAX_COMBO_LENGTH = 4;

function validateLength(tokens: Token[]): ValidationResult | null {
  if (tokens.length > MAX_COMBO_LENGTH) {
    return { valid: false, reason: `콤보 최대 길이는 ${MAX_COMBO_LENGTH}입니다.` };
  }
  return null;
}

export function validateAttackCombo(tokens: Token[]): ValidationResult {
  const lengthError = validateLength(tokens);
  if (lengthError) return lengthError;

  // 시너지는 추가 보너스 역할만 하도록, 토큰 자체는 기본 계산에 항상 반영한다.
  return { valid: true };
}

export function validateDefenseCombo(tokens: Token[]): ValidationResult {
  const lengthError = validateLength(tokens);
  if (lengthError) return lengthError;

  return { valid: true };
}
