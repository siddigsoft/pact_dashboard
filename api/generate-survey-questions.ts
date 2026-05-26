import type { IncomingMessage, ServerResponse } from 'http';

const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.5-pro-preview-03-25',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-thinking-exp-01-21',
];

const unavailableModels    = new Map<string, number>();
const unavailableGroqModels = new Map<string, number>();
const MODEL_UNAVAILABLE_TTL_MS = 23 * 60 * 60 * 1000;

function isModelUnavailable(map: Map<string, number>, model: string): boolean {
  const markedAt = map.get(model);
  if (markedAt === undefined) return false;
  if (Date.now() - markedAt > MODEL_UNAVAILABLE_TTL_MS) { map.delete(model); return false; }
  return true;
}
function markModelUnavailable(map: Map<string, number>, model: string): void {
  map.set(model, Date.now());
}

async function callGroqText(messages: Array<{ role: string; content: string }>): Promise<{ text: string }> {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const TEXT_MODELS = [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'gemma2-9b-it',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.1-8b-instant',
  ];
  for (const model of TEXT_MODELS) {
    if (isModelUnavailable(unavailableGroqModels, model)) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 8192 }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
        const isGone = res.status === 404 || errMsg.toLowerCase().includes('decommission') || errMsg.toLowerCase().includes('not found');
        const isTPM  = errMsg.includes('per minute') || errMsg.includes('TPM') || errMsg.includes('tokens per minute');
        const isRPD  = (errMsg.includes('per day') || errMsg.includes('RPD') || errMsg.includes('requests per day')) && !isTPM;
        if (isGone || (res.status === 429 && isRPD)) { markModelUnavailable(unavailableGroqModels, model); break; }
        if (res.status === 429 && !isRPD) {
          const headerRetry = parseInt(res.headers.get('retry-after') || '0', 10);
          const msgMatch = errMsg.match(/(?:try again in|retry after|in)\s+(\d+(?:\.\d+)?)s/i);
          const waitSec = Math.max(headerRetry, msgMatch ? Math.ceil(parseFloat(msgMatch[1])) : 0, 20);
          await sleep(waitSec * 1000);
          continue;
        }
        break;
      }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { text: data.choices?.[0]?.message?.content || '' };
    }
  }
  throw new Error('All Groq text models unavailable.');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  await new Promise<void>((resolve, reject) => { req.on('end', resolve); req.on('error', reject); });

  try {
    const { topic = '', count = 10, lang = 'en', fileContext = '', fileContextAr = '' } = JSON.parse(Buffer.concat(chunks).toString());
    const hasFile = !!(fileContext || fileContextAr);
    const safeCount = Math.max(1, Number(count) || 10);
    const contextSection   = fileContext   ? `\n\nENGLISH REFERENCE FILE CONTENT:\n${fileContext}\n`   : '';
    const contextArSection = fileContextAr ? `\n\nARABIC REFERENCE FILE CONTENT:\n${fileContextAr}\n` : '';
    const langInstruction =
      lang === 'ar'   ? 'Write "label" in Arabic as the primary label; "label_ar" can be the English translation.' :
      lang === 'both' ? 'Write "label" in English and "label_ar" in Arabic — both fields are mandatory and must be complete, accurate translations of each other. Use the Arabic reference file (if provided) to ensure correct Arabic phrasing.' :
                       'Write "label" in English; provide "label_ar" as the Arabic translation if possible, otherwise null.';

    const prompt = hasFile
      ? `You are an expert humanitarian survey designer (ODK / SurveyCTO standard).
The user has uploaded one or more reference survey files below.
Your task: extract and convert EVERY question and section header found in the file(s) into the JSON format below.
CRITICAL RULES:
- Do NOT skip any question, table, or section title — extract ALL of them
- Do NOT invent new questions
- Do NOT limit the count — include every single item
- For numbered sections (e.g. "SECTION 3. WORKLOAD") use type "section_header"
- For tables with multiple columns (like planning/activity tables), use type "grid_table"
- For questions with checkbox lists, use type "checkbox"
- For yes/no dropdowns ("Choose an item"), use type "yesno"
- For open text answers, use type "textarea"
${contextSection}${contextArSection}
Return ONLY a valid JSON array with no markdown, no explanation.

Standard item schema:
{ "type": string, "label": string, "label_ar": string|null, "required": boolean, "options": string[]|null, "options_ar": string[]|null, "variable_name": string, "settings": object|null }

Allowed types: text, textarea, radio, checkbox, dropdown, rating, scale, number, integer, date, gps, yesno, phone, email, section_header, likert, grid_table

For "section_header": label = the section title text, options = null, settings = null.

For "grid_table" (use for any table/grid in the document):
settings must be: { "grid_columns": [ { "id": "col_1", "label": "Column Header", "type": "text"|"number"|"date"|"dropdown", "options": string[]|null } ], "min_rows": 3, "max_rows": 10 }
options = null for grid_table items.

For "likert": settings = { "likert_rows": string[], "likert_cols": string[] }, options = null.

variable_name: short unique snake_case identifier per item.
options: array only for radio/checkbox/dropdown (English), null otherwise.
options_ar: Arabic translations of options (same order), null if not applicable.
${langInstruction}
${topic.trim() ? `Additional context from user: "${topic}"` : ''}`
      : `You are an expert humanitarian survey designer (ODK / SurveyCTO standard). Generate exactly ${safeCount} survey questions about: "${topic}".
Return ONLY a valid JSON array with no markdown, no explanation.
Each item: { "type": string, "label": string, "label_ar": string|null, "required": boolean, "options": string[]|null, "options_ar": string[]|null, "variable_name": string }
Allowed types: text, textarea, radio, checkbox, dropdown, rating, scale, number, integer, date, gps, yesno, phone, email
variable_name: short snake_case identifier — unique per question.
options: array only for radio/checkbox/dropdown (English), null otherwise.
options_ar: Arabic translations of options (same order), null if not applicable.
${langInstruction}
Use varied question types and make each question clear and specific.`;

    let text = '';
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '' });
      let tried = false;
      for (const model of GEMINI_MODELS) {
        if (isModelUnavailable(unavailableModels, model)) continue;
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 32768 },
          });
          text = (response.text || '').replace(/```json\n?|```\n?/g, '').trim();
          tried = true;
          break;
        } catch (e: any) {
          const msg = e.message || '';
          if (msg.includes('404') || msg.includes('GenerateRequestsPerDay')) { markModelUnavailable(unavailableModels, model); } else throw e;
        }
      }
      if (!tried) throw new Error('Gemini exhausted');
    } catch {
      const GROQ_CTX_MAX = 20000;
      const groqEn = fileContext   ? fileContext.slice(0, GROQ_CTX_MAX)   : '';
      const groqAr = fileContextAr ? fileContextAr.slice(0, GROQ_CTX_MAX) : '';
      const s1 = groqEn ? `\n\nENGLISH FILE CONTENT:\n${groqEn}\n` : '';
      const s2 = groqAr ? `\n\nARABIC FILE CONTENT:\n${groqAr}\n`  : '';
      const groqPrompt = hasFile
        ? `You are an expert humanitarian survey designer (ODK standard).
Extract every question and section header from the file excerpt below. Do not skip any. Do not invent questions.
Use "section_header" for section titles, "checkbox" for checkbox lists, "yesno" for yes/no dropdowns, "grid_table" for tables, "textarea" for open text.
${s1}${s2}
Return ONLY a valid JSON array ([] if empty).
Schema: { "type": string, "label": string, "label_ar": string|null, "required": boolean, "options": string[]|null, "options_ar": string[]|null, "variable_name": string, "settings": object|null }
Allowed types: text, textarea, radio, checkbox, dropdown, rating, scale, number, integer, date, gps, yesno, phone, email, section_header, likert, grid_table
For "grid_table": settings = { "grid_columns": [{"id":"col_1","label":"Column Header","type":"text","options":null}], "min_rows": 3, "max_rows": 10 }
variable_name: short unique snake_case per item. options: array only for radio/checkbox/dropdown, null otherwise.
${langInstruction}${topic.trim() ? '\nAdditional context: ' + topic : ''}`
        : prompt;
      const r = await callGroqText([{ role: 'user', content: groqPrompt }]);
      text = r.text.replace(/```json\n?|```\n?/g, '').trim();
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in AI response');
    let jsonStr = jsonMatch[0];
    let questions: any[];
    try {
      questions = JSON.parse(jsonStr);
    } catch {
      const cleaned = jsonStr.replace(/,\s*([}\]])/g, '$1');
      try {
        questions = JSON.parse(cleaned);
      } catch {
        const lastClose = cleaned.lastIndexOf('}');
        if (lastClose < 0) throw new Error('No JSON array in AI response');
        questions = JSON.parse(cleaned.slice(0, lastClose + 1) + ']');
      }
    }

    return sendJson(res, 200, { questions });
  } catch (err: any) {
    return sendJson(res, 500, { error: String(err?.message ?? err) });
  }
}
