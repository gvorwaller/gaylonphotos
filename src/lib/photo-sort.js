/**
 * Chronological photo sort with deterministic tiebreaker.
 * Sorts by ISO timestamp ascending, falling back to filename
 * when timestamps are equal (burst shots) or both missing.
 * Photos without a date are placed at the end.
 */
export function byChronological(a, b) {
	if (!a.date && !b.date) return (a.filename || '').localeCompare(b.filename || '');
	if (!a.date) return 1;
	if (!b.date) return -1;
	const c = a.date.localeCompare(b.date);
	if (c !== 0) return c;
	return (a.filename || '').localeCompare(b.filename || '');
}
