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

/**
 * The one sentence the platform says in its own voice, when the model failed
 * and there is no reply to pass on. It has to be in the patient's language,
 * so an outage does not also switch them into English.
 */
const TECHNICAL_TROUBLE: Record<string, string> = {
  de: "Entschuldigung, gerade gibt es bei mir ein technisches Problem. Bitte versuchen Sie es gleich noch einmal.",
  en: "Sorry, I am having a technical problem right now. Please try again in a moment.",
  fr: "Désolée, j'ai un problème technique en ce moment. Réessayez dans un instant.",
  es: "Lo siento, ahora mismo tengo un problema técnico. Inténtelo de nuevo en un momento.",
  it: "Mi scusi, ho un problema tecnico in questo momento. Riprovi tra un attimo.",
  pl: "Przepraszam, mam teraz problem techniczny. Proszę spróbować za chwilę.",
  nl: "Sorry, ik heb nu een technisch probleem. Probeert u het zo nog eens.",
  pt: "Desculpe, estou com um problema técnico. Tente novamente daqui a pouco.",
};

export function technicalTrouble(code: string | null | undefined) {
  return TECHNICAL_TROUBLE[code ?? "de"] ?? TECHNICAL_TROUBLE.de;
}
