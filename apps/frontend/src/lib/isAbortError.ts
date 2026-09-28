export function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === 'AbortError')
    || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError');
}
