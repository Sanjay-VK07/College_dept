/**
 * Normalizes question identifiers as they appear in source documents (e.g. "1.1.10", "Q28",
 * "Question 28", "1(a)", "1.1.10(a)") into one canonical form, so a question extracted from a
 * question section can be deterministically matched — by exact string equality, never by page
 * proximity or LLM guessing — against an answer-key entry that uses the same numbering scheme
 * hundreds of pages later.
 */
export class QuestionIdNormalizationService {
  public static normalize(raw: string): string {
    if (!raw) return '';

    let s = raw.trim().toLowerCase();

    // Strip a leading "Question" or "Q" label — "Question 28" / "Q28" / "Q. 28" all become "28".
    s = s.replace(/^question\.?\s*/i, '');
    s = s.replace(/^q\.?\s*/i, '');

    // Fold a trailing sub-part in parentheses into a dotted segment: "10(a)" -> "10.a".
    s = s.replace(/\(([a-z0-9]+)\)/g, '.$1');

    // Collapse whitespace and duplicate/edge dots.
    s = s.replace(/\s+/g, '');
    s = s.replace(/\.+/g, '.');
    s = s.replace(/^\.+|\.+$/g, '');

    return s;
  }

  /**
   * True if two raw identifiers normalize to the same canonical id — the only comparison the
   * mapping pipeline is allowed to use to decide a question and an answer-key entry refer to the
   * same question.
   */
  public static matches(rawA: string, rawB: string): boolean {
    return this.normalize(rawA) === this.normalize(rawB);
  }
}
