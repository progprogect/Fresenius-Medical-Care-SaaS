/**
 * Numbers a caller says out loud, as speech-to-text writes them down.
 *
 * A German speaker saying their date of birth produces one compound word —
 * "neunzehnhundertsechsundachtzig" — and an English speaker produces three
 * ("nineteen eighty six"). Neither contains a digit, so a parser that only
 * looks for digits rejects a perfectly clear answer; the assistant then blames
 * a technical problem and asks again, which is what a real caller experienced.
 */
const DE_SMALL: Record<string, number> = {
  null: 0, ein: 1, eins: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, funf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwolf: 12,
  dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17,
  achtzehn: 18, neunzehn: 19,
  // ASCII spellings of the umlauts, which both people and ASR produce.
  fuenf: 5, zwoelf: 12, fuenfzehn: 15,
};

const DE_TENS: Record<string, number> = {
  zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50,
  sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
  fuenfzig: 50, dreissigste: 30,
};

/** Ordinals that are not just the cardinal plus a suffix. */
const DE_IRREGULAR_ORDINALS: Record<string, number> = {
  erste: 1, ersten: 1, erster: 1, erstes: 1,
  dritte: 3, dritten: 3, dritter: 3, drittes: 3,
  siebte: 7, siebten: 7, siebter: 7, siebtes: 7,
  achte: 8, achten: 8, achter: 8, achtes: 8,
};

const DE_ORDINAL_SUFFIXES = ["sten", "ster", "stes", "ste", "ten", "ter", "tes", "te"];

/** 0-99 written the German way, where the ones come first: "sechsundachtzig". */
function deUnderHundred(word: string): number | null {
  if (word in DE_SMALL) return DE_SMALL[word];
  if (word in DE_TENS) return DE_TENS[word];
  const joined = word.indexOf("und");
  if (joined > 0) {
    const ones = DE_SMALL[word.slice(0, joined)];
    const tens = DE_TENS[word.slice(joined + 3)];
    if (ones !== undefined && ones < 10 && tens !== undefined) return ones + tens;
  }
  return null;
}

function deCardinal(word: string): number | null {
  if (!word) return null;
  const thousand = word.indexOf("tausend");
  if (thousand >= 0) {
    const head = word.slice(0, thousand);
    const tail = word.slice(thousand + 7);
    const multiplier = head ? deUnderHundred(head) : 1;
    if (multiplier === null) return null;
    if (!tail) return multiplier * 1000;
    const rest = deCardinal(tail);
    return rest === null ? null : multiplier * 1000 + rest;
  }
  const hundred = word.indexOf("hundert");
  if (hundred >= 0) {
    const head = word.slice(0, hundred);
    const tail = word.slice(hundred + 7);
    const multiplier = head ? deUnderHundred(head) : 1;
    if (multiplier === null) return null;
    if (!tail) return multiplier * 100;
    const rest = deUnderHundred(tail);
    return rest === null ? null : multiplier * 100 + rest;
  }
  return deUnderHundred(word);
}

function deOrdinal(word: string): number | null {
  if (word in DE_IRREGULAR_ORDINALS) return DE_IRREGULAR_ORDINALS[word];
  for (const suffix of DE_ORDINAL_SUFFIXES) {
    if (!word.endsWith(suffix)) continue;
    const value = deCardinal(word.slice(0, -suffix.length));
    if (value !== null) return value;
  }
  return null;
}

const EN_SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const EN_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const EN_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, thirtieth: 30,
};

/** A single word that carries a number, in either language. */
function wordValue(word: string): { value: number; scale?: "hundred" | "thousand" } | null {
  if (word === "hundred") return { value: 100, scale: "hundred" };
  if (word === "thousand") return { value: 1000, scale: "thousand" };
  if (word in EN_ORDINALS) return { value: EN_ORDINALS[word] };
  if (word in EN_SMALL) return { value: EN_SMALL[word] };
  if (word in EN_TENS) return { value: EN_TENS[word] };
  const german = deOrdinal(word) ?? deCardinal(word);
  return german === null ? null : { value: german };
}

/**
 * Folds one run of number words into a single number. Handles the English
 * habit of saying a year as two halves ("nineteen eighty six" = 1986) as well
 * as the arithmetic form ("one thousand nine hundred eighty six").
 */
function foldRun(values: Array<{ value: number; scale?: "hundred" | "thousand" }>): number {
  let total = 0;
  let current = 0;
  for (const item of values) {
    if (item.scale === "hundred") {
      current = (current || 1) * 100;
      continue;
    }
    if (item.scale === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    // "nineteen" followed by "eighty" is a spoken year, not a sum.
    if (current >= 10 && current < 100 && item.value >= 20 && item.value < 100) {
      current = current * 100 + item.value;
      continue;
    }
    current += item.value;
  }
  return total + current;
}

/**
 * Rewrites runs of number words as digits, leaving digits and every other word
 * untouched. Only runs made purely of words are folded, so "1986 07 10" keeps
 * its three separate numbers.
 */
export function spokenNumbersToDigits(text: string): string {
  const out: string[] = [];
  let run: Array<{ value: number; scale?: "hundred" | "thousand" }> = [];

  const flush = () => {
    if (run.length === 0) return;
    out.push(String(foldRun(run)));
    run = [];
  };

  for (const token of text.split(/\s+/).filter(Boolean)) {
    const bare = token.replace(/[^a-z]/g, "");
    const value = bare && bare === token.replace(/[^a-z0-9]/g, "") ? wordValue(bare) : null;
    if (value) {
      run.push(value);
      continue;
    }
    // "und" only glues numbers together; anything else ends the run.
    if (run.length > 0 && (bare === "und" || bare === "and")) continue;
    flush();
    out.push(token);
  }
  flush();
  return out.join(" ");
}
