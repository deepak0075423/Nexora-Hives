/**
 * Reading a bulk-import response.
 *
 * The teacher endpoint answers with one JSON body; the student endpoint streams
 * server-sent events so the screen can count rows as they land. Both are parsed
 * here, away from the component, because the interesting case is a body that is
 * only half-arrived: React Native hands us `responseText` mid-flight, so the
 * last frame is routinely cut in two and must be ignored until it completes.
 */

export type RowError = { row: number; name?: string; reason: string };
/**
 * The failed rows as a workbook: the admin's own sheet cut down to what did not
 * import, with the reason alongside. `rows` is how many are in the file and
 * `total` how many failed, which differ only when the server capped a huge run.
 */
export type ErrorFile = { filename: string; base64: string; rows: number; total: number };
export type ImportResult = {
  created: number; updated: number; errors: RowError[]; errorFile: ErrorFile | null;
};
export type ImportProgress = { current: number; total: number; name: string };

/** The `data:` frames that have fully arrived. A partial trailing frame is skipped. */
export function parseSSE(text: string): any[] {
  return text.split('\n\n').reduce<any[]>((acc, chunk) => {
    const frame = chunk.trimStart();
    if (!frame.startsWith('data: ')) return acc;
    try { acc.push(JSON.parse(frame.slice(6))); } catch { /* still arriving */ }
    return acc;
  }, []);
}

/** How far the student import has got, from whatever has streamed in so far. */
export function readProgress(text: string): ImportProgress | null {
  const events = parseSSE(text);
  const total  = events.find((e) => e.type === 'total')?.total;
  if (!total) return null;
  const last = [...events].reverse().find((e) => e.type === 'processing');
  return { total, current: last?.current ?? 0, name: last?.name ?? '' };
}

/**
 * The finished outcome. Throws the server's own message when the import failed,
 * so the caller shows that rather than a generic error.
 */
export function readResult(body: string, streamed: boolean): ImportResult {
  if (!streamed) {
    const json = JSON.parse(body);
    if (!json?.success) throw new Error(json?.message || 'Import failed');
    return {
      created: json.created ?? 0, updated: json.updated ?? 0,
      errors: json.errors ?? [], errorFile: json.errorFile ?? null,
    };
  }
  const events = parseSSE(body);
  const failed = events.find((e) => e.type === 'error');
  if (failed) throw new Error(failed.message || 'Import failed');
  const done = [...events].reverse().find((e) => e.type === 'done');
  if (!done) throw new Error('The import ended without a result');
  return {
    created: done.created ?? 0, updated: done.updated ?? 0,
    errors: done.errors ?? [], errorFile: done.errorFile ?? null,
  };
}
