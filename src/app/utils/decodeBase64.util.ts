export function decodeBase64(str: string): string {
  try {
    return decodeURIComponent(escape(window.atob(str)));
  } catch (e) {
    console.error('Base64 decode error:', e);
    return '';
  }
}