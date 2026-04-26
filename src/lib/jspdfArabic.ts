import type jsPDF from 'jspdf';

const FONT_NAME = 'Amiri';
const FONT_FILE = 'Amiri-Regular.ttf';
const FONT_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf';
const CACHE_KEY = 'pact_amiri_font_b64_v1';

let inflight: Promise<string | null> | null = null;

async function fetchAmiriBase64(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return cached;
  } catch { /* private mode — ignore */ }

  try {
    const res = await fetch(FONT_URL, { cache: 'force-cache' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    const b64 = btoa(binary);
    try { sessionStorage.setItem(CACHE_KEY, b64); } catch { /* quota / private mode */ }
    return b64;
  } catch (err) {
    console.warn('[jspdfArabic] Amiri font fetch failed; PDF will fall back to default font.', err);
    return null;
  }
}

export async function ensureArabicFont(doc: jsPDF): Promise<boolean> {
  const fonts = (doc as unknown as { getFontList?: () => Record<string, unknown> }).getFontList?.();
  if (fonts && (fonts as Record<string, unknown>)[FONT_NAME]) return true;

  if (!inflight) inflight = fetchAmiriBase64();
  const b64 = await inflight;
  if (!b64) return false;
  try {
    doc.addFileToVFS(FONT_FILE, b64);
    doc.addFont(FONT_FILE, FONT_NAME, 'normal');
    return true;
  } catch (err) {
    console.warn('[jspdfArabic] addFont failed; falling back to default font.', err);
    return false;
  }
}

export function setArabicFont(doc: jsPDF): void {
  try { doc.setFont(FONT_NAME, 'normal'); } catch { /* fall back to current font */ }
}

export function setLatinFont(doc: jsPDF, family = 'helvetica'): void {
  try { doc.setFont(family, 'normal'); } catch { /* ignore */ }
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const hasArabic = (s: string | null | undefined): boolean => !!s && ARABIC_RE.test(s);

export const ARABIC_FONT_NAME = FONT_NAME;
