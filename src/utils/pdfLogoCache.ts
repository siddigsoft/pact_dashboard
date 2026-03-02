/**
 * Shared PACT logo cache for PDF generation.
 * Fetches the logo once and reuses across all PDF utils to avoid redundant network requests.
 */
let cachedLogoDataUrl: string | null | undefined = undefined;

export async function loadPactLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) {
    return cachedLogoDataUrl;
  }
  try {
    const resp = await fetch('/pact-logo.png');
    const blob = await resp.blob();
    cachedLogoDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return cachedLogoDataUrl;
  } catch {
    cachedLogoDataUrl = null;
    return null;
  }
}
