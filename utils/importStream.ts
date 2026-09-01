/**
 * Reading a bulk-import response.
 *
 * Both endpoints now stream server-sent events so the screen can count rows as
 * they land. The shape is worked out from the body rather than from which
 * endpoint was called: the app ships separately from the server, so a phone on
 * the new build can still be talking to a server where the teacher import is
 * the older single JSON body.
 *
 * Parsing lives here, away from the component, because the interesting case is
 * a body that is only half-arrived: React Native hands us `responseText`
 * mid-flight, so the last frame is routinely cut in two and must be ignored
 * until it completes.
 */

export type RowError = { row: number; name?: string; reason: string };
/**
 * The failed rows as a workbook: the admin's own sheet cut down to what did not
 * import, with the reason alongside. `rows` is how many are in the file and
 * `total` how many failed, which differ only when the server capped a huge run.
 */
export type ErrorFile = { filename: string; base64: string; rows: number; total: number };
export type ImportResult = {
  created: number;
  updated: number;
  errors: RowError[];
  errorFile: ErrorFile | null;
  /**
   * Rows in the uploaded sheet. `created + updated + errors` should equal it —
   * a shortfall means the run stopped before the end of the sheet, which the
   * screen says out loud rather than passing off as a finished import. Absent
   * when an older server answered with a plain JSON body, which omits it.
   */
  total: number | null;
};
export type ImportProgress = {
  current: number; total: number; name: string;
  created: number; updated: number; errors: number;
};

/** The `data:` frames that have fully arrived. A partial trailing frame is skipped. */
export function parseSSE(text: string): any[] {
  return text.split('\n\n').reduce<any[]>((acc, chunk) => {
    const frame = chunk.trimStart();
    if (!frame.startsWith('data: ')) return acc;
    try { acc.push(JSON.parse(frame.slice(6))); } catch { /* still arriving */ }
    return acc;
  }, []);
}

/**
 * How far the student import has got.
 *
 * `responseText` only ever grows, so each call parses just the text that has
 * arrived since the last one and keeps the running tallies. Re-reading the
 * whole body on every progress tick — which is what this replaced — meant a
 * 500-row sheet re-parsed ~1500 frames on each tick and locked up the JS
 * thread on the phone well before the import finished.
 */
export function createProgressReader() {
  let consumed = 0;   // characters of `responseText` already handled
  let carry    = '';  // trailing frame that had not finished arriving
  const at: ImportProgress = { current: 0, total: 0, name: '', created: 0, updated: 0, errors: 0 };

  return (text: string): ImportProgress | null => {
    // A shorter body than last time means this is a different response.
    if (text.length < consumed) { consumed = 0; carry = ''; }
    const fresh = carry + text.slice(consumed);
    consumed = text.length;

    const chunks = fresh.split('\n\n');
    carry = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const frame = chunk.trimStart();
      if (!frame.startsWith('data: ')) continue;
      let evt: any;
      try { evt = JSON.parse(frame.slice(6)); } catch { continue; }

      if (evt.type === 'total') {
        at.total = evt.total ?? 0;
      } else if (evt.type === 'processing') {
        at.current = evt.current ?? at.current;
        at.name    = evt.name ?? '';
      } else if (evt.type === 'row_done') {
        // A row that matched an account already on file is an update, not a
        // creation — the two are counted apart so a re-uploaded sheet does not
        // report everyone it already has as newly created.
        if (!evt.success) at.errors++;
        else if (evt.action === 'updated') at.updated++;
        else at.created++;
      }
    }
    return at.total ? { ...at } : null;
  };
}

/**
 * The finished outcome. Throws the server's own message when the import failed,
 * so the caller shows that rather than a generic error.
 *
 * An SSE body is recognised by its first frame, so this handles both a
 * streaming server and an older one that answers with a single JSON object.
 */
export function readResult(body: string): ImportResult {
  if (!body.trimStart().startsWith('data:')) {
    const json = JSON.parse(body);
    if (!json?.success) throw new Error(json?.message || 'Import failed');
    return {
      created: json.created ?? 0, updated: json.updated ?? 0,
      errors: json.errors ?? [], errorFile: json.errorFile ?? null,
      total: json.total ?? null,
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
    total: done.total ?? null,
  };
}
