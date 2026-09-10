/**
 * Tolerant parsing of the two identifiers patients give over chat and voice.
 *
 * People write "+49 151 12345678", "0151 12345678", "12.04.1985" or
 * "April 12 1985", and speech-to-text adds its own spellings. Demanding one
 * canonical format pushes that burden onto the caller, so the formats are
 * normalised here instead and the agent never has to dictate a shape.
 */

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0", null: "0", nul: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

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
  const input = String(raw ?? "").trim().toLowerCase();
  if (!input) return { candidates: [], ambiguous: false };

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

  // 12 April 1985 / April 12, 1985 / 12th of Apr 1985
  const words = input.replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/\bof\b/g, " ");
  const tokens = words.split(/[\s,.\-/]+/).filter(Boolean);
  let month: number | undefined;
  const numbers: number[] = [];
  for (const token of tokens) {
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
