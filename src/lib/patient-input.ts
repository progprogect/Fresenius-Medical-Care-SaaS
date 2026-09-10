/**
 * Tolerant parsing of the two identifiers patients give over chat and voice.
 *
 * People write "+49 151 12345678", "0151 12345678", "12.04.1985" or
 * "April 12 1985", and speech-to-text adds its own spellings. Demanding one
 * canonical format pushes that burden onto the caller, so the formats are
 * normalised here instead and the agent never has to dictate a shape.
 */

import { spokenNumbersToDigits } from "@/lib/spoken-numbers";

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0", null: "0", nul: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
  // Callers read their number out in their own language.
  eins: "1", ein: "1", zwei: "2", zwo: "2", drei: "3", vier: "4",
  fuenf: "5", sechs: "6", sieben: "7", acht: "8", neun: "9",
  un: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9",
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
  due: "2", tre: "3", quattro: "4", cinque: "5", sei: "6", sette: "7", otto: "8", nove: "9",
};

/**
 * Month names in every language the assistant speaks. A German caller says
 * "25. Januar 1989", and an English-only table silently rejects it, which
 * looked to the patient like the clinic could not find them.
 */
const MONTH_NAMES: Record<number, string[]> = {
  1: ["jan", "january", "januar", "janvier", "enero", "gennaio", "styczen", "stycznia", "januari", "janeiro"],
  2: ["feb", "february", "februar", "fevrier", "febrero", "febbraio", "luty", "lutego", "februari", "fevereiro"],
  3: ["mar", "march", "marz", "maerz", "mars", "marzo", "marzec", "marca", "maart", "marco"],
  4: ["apr", "april", "avril", "abril", "aprile", "kwiecien", "kwietnia"],
  5: ["may", "mai", "mayo", "maggio", "maj", "maja", "mei", "maio"],
  6: ["jun", "june", "juni", "juin", "junio", "giugno", "czerwiec", "czerwca", "junho"],
  7: ["jul", "july", "juli", "juillet", "julio", "luglio", "lipiec", "lipca", "julho"],
  8: ["aug", "august", "aout", "agosto", "sierpien", "sierpnia", "augustus"],
  9: ["sep", "sept", "september", "septembre", "septiembre", "settembre", "wrzesien", "wrzesnia", "setembro"],
  10: ["oct", "october", "oktober", "octobre", "octubre", "ottobre", "pazdziernik", "pazdziernika", "outubro"],
  11: ["nov", "november", "novembre", "noviembre", "listopad", "listopada", "novembro"],
  12: ["dec", "december", "dezember", "decembre", "diciembre", "dicembre", "grudzien", "grudnia", "dezembro"],
};

const MONTHS: Record<string, number> = Object.fromEntries(
  Object.entries(MONTH_NAMES).flatMap(([num, names]) =>
    names.map((name) => [name, Number(num)])
  )
);

/** Words that sit between the parts of a spoken date and carry no meaning. */
const DATE_FILLERS = new Set(["of", "de", "del", "der", "den", "the", "am", "im", "el", "il", "roku", "r"]);

/** Turns spoken number words into digits: "plus four nine, double one" -> "+4911". */
function spokenToDigits(raw: string) {
  const tokens = raw
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  let out = "";
  let repeat = 1;
  for (const token of tokens) {
    if (token === "double") { repeat = 2; continue; }
    if (token === "triple") { repeat = 3; continue; }
    if (token === "plus") { out += "+"; repeat = 1; continue; }
    const digit = DIGIT_WORDS[token];
    if (digit !== undefined) {
      out += digit.repeat(repeat);
      repeat = 1;
      continue;
    }
    if (/^\+?\d+$/.test(token)) {
      out += repeat > 1 ? token.repeat(repeat) : token;
      repeat = 1;
      continue;
    }
    repeat = 1;
  }
  return out;
}

export type PhoneParse = {
  /** E.164 form when a country code is present or inferable. */
  e164: string | null;
  /** Digits only, no country code assumptions. */
  digits: string;
  /** Trailing digits used for tolerant matching against stored numbers. */
  suffix: string | null;
  hasCountryCode: boolean;
};

/**
 * Normalises a phone number as typed or spoken. Matching later uses the
 * trailing digits, so a caller may omit or include the country code and may
 * keep or drop a national trunk zero.
 */
export function parsePhone(raw: string): PhoneParse {
  const input = String(raw ?? "").trim();
  const base = /[a-z]/i.test(input) ? spokenToDigits(input) : input;

  let cleaned = base.replace(/[^\d+]/g, "");
  let hasCountryCode = false;

  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith("+")) {
    hasCountryCode = true;
    cleaned = `+${cleaned.slice(1).replace(/\+/g, "")}`;
  } else {
    cleaned = cleaned.replace(/\+/g, "");
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 6) {
    return { e164: null, digits, suffix: null, hasCountryCode };
  }

  // A national number usually keeps a trunk "0" that the international form drops.
  const national = !hasCountryCode && digits.startsWith("0") ? digits.slice(1) : digits;
  const suffix = national.slice(-9);

  return {
    e164: hasCountryCode ? `+${digits}` : null,
    digits,
    suffix: suffix.length >= 6 ? suffix : null,
    hasCountryCode,
  };
}

export type DateParse = {
  /** Every reading that is plausible, as yyyy-MM-dd. */
  candidates: string[];
  /** True when day/month order cannot be settled from the input alone. */
  ambiguous: boolean;
};

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  )
    return null;
  const thisYear = new Date().getUTCFullYear();
  if (year < 1900 || year > thisYear) return null;
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Expands a two-digit year into the most recent past century. */
function expandYear(value: number) {
  if (value >= 100) return value;
  const currentTwo = new Date().getUTCFullYear() % 100;
  return value <= currentTwo ? 2000 + value : 1900 + value;
}

/**
 * Reads a date of birth in the shapes people actually use. When day and month
 * order is genuinely ambiguous (03/04/1985) both readings come back and the
 * caller decides, so nothing is silently guessed on the way into the record.
 */
export function parseDateOfBirth(raw: string): DateParse {
  const spoken = String(raw ?? "").trim().toLowerCase();
  if (!spoken) return { candidates: [], ambiguous: false };

  // Speech-to-text writes a spoken date as words, so fold those into digits
  // before anything else looks at the string. Accents and the sharp s go too,
  // because the number tables are written in plain ASCII.
  const input = spokenNumbersToDigits(
    spoken
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00df/g, "ss")
  );

  const add = (set: Set<string>, value: string | null) => {
    if (value) set.add(value);
  };
  const found = new Set<string>();
  let ambiguous = false;

  // 1985-04-12 / 1985.4.12 / 1985 04 12
  const ymd = input.match(/^(\d{4})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})$/);
  if (ymd) {
    add(found, iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])));
    return { candidates: [...found], ambiguous: false };
  }

  // 12.04.1985 / 12/4/85 / 12-04-1985
  const dmy = input.match(/^(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const year = expandYear(Number(dmy[3]));
    const dayFirst = iso(year, b, a); // European reading
    const monthFirst = iso(year, a, b); // American reading
    add(found, dayFirst);
    if (monthFirst && monthFirst !== dayFirst) {
      add(found, monthFirst);
      ambiguous = true;
    }
    return { candidates: [...found], ambiguous };
  }

  // 12 April 1985 / April 12, 1985 / 25. Januar 1989 / 25 de enero de 1989
  const words = input.replace(/(\d+)(st|nd|rd|th|er|ere|eme|o|a)\b/g, "$1");
  const tokens = words.split(/[\s,.\-/]+/).filter(Boolean);
  let month: number | undefined;
  const numbers: number[] = [];
  for (const token of tokens) {
    if (DATE_FILLERS.has(token)) continue;
    if (MONTHS[token] !== undefined) {
      month = MONTHS[token];
      continue;
    }
    if (/^\d{1,4}$/.test(token)) numbers.push(Number(token));
  }
  if (month !== undefined && numbers.length >= 2) {
    const yearToken = numbers.find((n) => n > 31) ?? numbers[numbers.length - 1];
    const dayToken = numbers.find((n) => n !== yearToken && n <= 31);
    if (dayToken !== undefined) {
      add(found, iso(expandYear(yearToken), month, dayToken));
    }
  }

  return { candidates: [...found], ambiguous };
}

/** Strips case, accents and punctuation so "Müller-Schmidt" matches "muller schmidt". */
export function normalizeName(raw: string) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0…1 similarity between two names, 1 being identical once normalised. */
export function nameSimilarity(a: string, b: string) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longest = Math.max(x.length, y.length);
  return Math.max(0, 1 - levenshtein(x, y) / longest);
}

/**
 * How well a spoken name matches a stored one. Speech recognition mangles
 * spelling and callers sometimes give the names the other way round, so both
 * orderings are scored and the better one wins.
 */
export function fullNameSimilarity(
  said: { firstName: string; lastName: string },
  stored: { firstName: string; lastName: string }
) {
  const straight =
    (nameSimilarity(said.firstName, stored.firstName) +
      nameSimilarity(said.lastName, stored.lastName)) /
    2;
  const swapped =
    (nameSimilarity(said.firstName, stored.lastName) +
      nameSimilarity(said.lastName, stored.firstName)) /
    2;
  return Math.max(straight, swapped);
}

/**
 * Words a caller never actually gives as their name. Speech agents reach for
 * them when the patient stayed silent, which is how a record called
 * "Unbekannt Unbekannt" ends up in the registry with no appointments.
 */
const PLACEHOLDER_NAMES = new Set([
  "unknown", "unbekannt", "inconnu", "desconocido", "sconosciuto", "nieznany",
  "onbekend", "desconhecido", "anonymous", "anonym", "anonimo", "nn", "na",
  "none", "null", "nobody", "patient", "caller", "test", "testtest", "xxx",
  "firstname", "lastname", "vorname", "nachname", "name",
]);

/** Rejects blank, one-letter and placeholder names before they reach a record. */
export function isRealName(raw: string) {
  const value = normalizeName(raw);
  if (value.length < 2) return false;
  if (!/[a-z]/.test(value)) return false;
  // "N/A" normalises to "n a"; judge the parts and the whole.
  if (PLACEHOLDER_NAMES.has(value.replace(/\s/g, ""))) return false;
  const parts = value.split(" ");
  // A single letter is fine inside a name (O'Brien, an initial) but a name
  // made only of single letters is not a name.
  if (!parts.some((part) => part.length >= 2)) return false;
  return parts.every((part) => part.length < 2 || !PLACEHOLDER_NAMES.has(part));
}
