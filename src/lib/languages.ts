/** Languages the assistant can hold a conversation in. */
export const SUPPORTED_LANGUAGES = [
  { code: "de", label: "German" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pl", label: "Polish" },
  { code: "nl", label: "Dutch" },
  { code: "pt", label: "Portuguese" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const BY_CODE = new Map(SUPPORTED_LANGUAGES.map((l) => [l.code, l]));

export function languageLabel(code: string) {
  return BY_CODE.get(code as LanguageCode)?.label ?? code.toUpperCase();
}

export function isSupportedLanguage(code: string): code is LanguageCode {
  return BY_CODE.has(code as LanguageCode);
}

/** Narrows a browser tag such as "de-AT" to a language we actually support. */
export function normalizeLanguageTag(tag: string | undefined | null) {
  if (!tag) return null;
  const base = tag.toLowerCase().split("-")[0];
  return isSupportedLanguage(base) ? base : null;
}

/**
 * "Answer only in this language", written in that language. Returned by the
 * set_language tool so the last thing the model reads before replying is the
 * target language itself, not an English instruction.
 */
const CONTINUE_IN: Record<string, string> = {
  de: "Antworte ab sofort ausschliesslich auf Deutsch.",
  en: "From now on, answer only in English.",
  fr: "À partir de maintenant, réponds uniquement en français.",
  es: "A partir de ahora, responde únicamente en español.",
  it: "D'ora in poi, rispondi soltanto in italiano.",
  pl: "Od teraz odpowiadaj wyłącznie po polsku.",
  nl: "Antwoord vanaf nu uitsluitend in het Nederlands.",
  pt: "A partir de agora, responde apenas em português.",
};

export function continueInLanguage(code: string) {
  return CONTINUE_IN[code] ?? `From now on, answer only in ${languageLabel(code)}.`;
}
