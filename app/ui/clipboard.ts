/** Copy-to-clipboard with an optional toast; returns success. */
export async function copyText(
  value: string,
  say?: ((msg: string, kind?: 'ok' | 'err' | 'info') => void) | null,
  what = 'copied to clipboard',
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    say?.(what);
    return true;
  } catch {
    say?.('copy blocked by the browser', 'err');
    return false;
  }
}
