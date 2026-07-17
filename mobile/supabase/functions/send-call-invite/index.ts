// Supabase Edge Function: Send incoming call invite via FCM
// Requires secrets:
// - FIREBASE_SERVICE_ACCOUNT_JSON: JSON string of a Firebase service account
// - SUPABASE_SERVICE_ROLE_KEY: for reading callee fcm_tokens
//
// Deploy:
//   supabase functions deploy send-call-invite
//
// This function is invoked by the caller's device at call start to ensure the callee
// can ring when the app is backgrounded or killed (WhatsApp-style).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApps, initializeApp, cert } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type InviteBody = {
  callee_user_id?: string;
  channel_name?: string;
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  caller_avatar?: string | null;
  is_audio_only?: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireString(v: unknown, field: string) {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return v.trim();
}

function initFirebaseOnce() {
  if (getApps().length > 0) return;
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error("Server configuration error: FIREBASE_SERVICE_ACCOUNT_JSON not set");
  }
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("Server configuration error: FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  initializeApp({
    credential: cert(serviceAccount as any),
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth: require Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Server configuration error: Supabase env not set" }, 500);
    }

    // Validate the JWT belongs to a real user
    const supabaseAuthed = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authError } = await supabaseAuthed.auth.getUser(jwt);
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized: Invalid or expired token" }, 401);
    }

    // Parse request body
    let body: InviteBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const calleeUserId = requireString(body.callee_user_id, "callee_user_id");
    const channelName = requireString(body.channel_name, "channel_name");
    const callId = requireString(body.call_id, "call_id");
    const callerId = requireString(body.caller_id, "caller_id");
    const callerName = requireString(body.caller_name, "caller_name");
    const callerAvatar =
      typeof body.caller_avatar === "string" ? body.caller_avatar : "";
    const isAudioOnly = body.is_audio_only === true;

    // Read callee tokens using service role (never from client)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("fcm_tokens, fcm_token")
      .eq("id", calleeUserId)
      .maybeSingle();

    if (profileErr) {
      return jsonResponse({ error: `Failed to fetch callee tokens: ${profileErr.message}` }, 500);
    }

    let tokens: string[] = [];

    if (Array.isArray(profile?.fcm_tokens)) {
      tokens = (profile!.fcm_tokens as unknown[])
        .filter((t) => typeof t === "string" && t.length > 0) as string[];
    }

    // Backwards-compat: fall back to legacy single fcm_token column when array is empty
    if (tokens.length === 0 && typeof profile?.fcm_token === "string" && profile.fcm_token.length > 0) {
      tokens = [profile.fcm_token as string];
    }

    if (tokens.length === 0) {
      // Not an error; user may not have registered tokens yet
      return jsonResponse({ ok: true, sent: 0, reason: "no_tokens" }, 200);
    }

    // Send FCM (data message). All values must be strings.
    initFirebaseOnce();
    const messaging = getMessaging();

    const dataPayload: Record<string, string> = {
      type: "incoming_call",
      call_id: callId,
      channel_name: channelName,
      caller_id: callerId,
      caller_name: callerName,
      caller_avatar: callerAvatar,
      is_audio_only: isAudioOnly ? "true" : "false",
    };

    const multicast = {
      tokens,
      data: dataPayload,
      android: {
        priority: "high" as const,
        ttl: 30_000,
        // Data-only message: no `notification` block so that FCM always delivers
        // to onBackgroundMessage (even when app is backgrounded/killed).
        // The Dart background handler shows a local notification with full call payload.
      },
      apns: {
        headers: {
          // high priority; may be ignored for non-VoIP pushes depending on iOS settings
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            // Ensure the app can process it when in background.
            // (Full CallKit/VoIP requires PushKit; this is best-effort with FCM.)
            "content-available": 1,
            alert: {
              title: "Incoming Call",
              body: `${callerName} is calling...`,
            },
          },
        },
      },
    };

    const result = await messaging.sendEachForMulticast(multicast as any);

    const failures = result.responses
      .map((r: any, idx: number) => {
        if (r?.success) return null;
        const err = r?.error;
        return {
          idx,
          token_suffix: typeof tokens[idx] === "string"
            ? tokens[idx].slice(-12)
            : null,
          code: err?.code ?? null,
          message: err?.message ?? null,
        };
      })
      .filter(Boolean);

    // Remove tokens that are permanently invalid (unregistered / not found).
    // This prevents stale tokens from blocking future calls.
    const staleTokenCodes = new Set([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ]);
    const tokensToRemove = result.responses
      .map((r: any, idx: number) => {
        const code: string = r?.error?.code ?? "";
        return staleTokenCodes.has(code) ? tokens[idx] : null;
      })
      .filter((t): t is string => t !== null);

    if (tokensToRemove.length > 0) {
      try {
        const { data: currentProfile } = await supabaseAdmin
          .from("profiles")
          .select("fcm_tokens, fcm_token")
          .eq("id", calleeUserId)
          .maybeSingle();

        const freshTokens = (
          Array.isArray(currentProfile?.fcm_tokens)
            ? (currentProfile!.fcm_tokens as string[])
            : []
        ).filter((t) => !tokensToRemove.includes(t));

        const currentLegacy = typeof currentProfile?.fcm_token === "string"
          ? currentProfile!.fcm_token as string
          : null;
        const legacyIsStale = currentLegacy !== null && tokensToRemove.includes(currentLegacy);

        await supabaseAdmin.from("profiles").update({
          fcm_tokens: freshTokens,
          ...(legacyIsStale ? { fcm_token: null } : {}),
        }).eq("id", calleeUserId);

        console.log(
          `[send-call-invite] Removed ${tokensToRemove.length} stale token(s) for user ${calleeUserId}`,
        );
      } catch (cleanupErr) {
        // Non-fatal: log and continue
        console.warn("[send-call-invite] Failed to clean stale tokens:", cleanupErr);
      }
    }

    return jsonResponse({
      ok: true,
      sent: result.successCount,
      failed: result.failureCount,
      failures,
    });
  } catch (err) {
    console.error("send-call-invite error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
});

