// Supabase Edge Function: Send missed call notification via FCM
// Triggers when: call times out or is rejected
// Sends: FCM notification with type="missed_call" to the caller
//
// Requires secrets:
// - FIREBASE_SERVICE_ACCOUNT_JSON: JSON string of a Firebase service account
// - SUPABASE_SERVICE_ROLE_KEY: for reading user fcm_tokens
//
// Deploy:
//   supabase functions deploy send-missed-call-notification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApps, initializeApp, cert } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type MissedCallBody = {
  caller_user_id: string;         // Who initiated the call (receives notification)
  receiver_user_id: string;       // Who didn't answer
  receiver_name?: string;
  call_id: string;
  reason?: string;                // "timeout", "rejected", "missed"
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
    throw new Error(
      "Server configuration error: FIREBASE_SERVICE_ACCOUNT_JSON not set"
    );
  }
  const serviceAccount = JSON.parse(raw);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

async function sendMissedCallFCM(
  callerUserId: string,
  receiverName: string,
  callId: string,
  reason: string
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  // Get caller's FCM tokens
  const { data: userData, error: userError } = await supabase
    .from("profiles")
    .select("fcm_tokens, full_name")
    .eq("id", callerUserId)
    .single();

  if (userError || !userData?.fcm_tokens || userData.fcm_tokens.length === 0) {
    console.warn(`[MissedCall] No FCM tokens for caller ${callerUserId}`);
    return {
      success: false,
      reason: "no_fcm_token",
      message: "No FCM tokens found for caller",
    };
  }

  const messaging = getMessaging();

  // Send to all registered devices
  const fcmTokens = userData.fcm_tokens as string[];
  let lastResponse = null;

  for (const fcmToken of fcmTokens) {
    // 🔴 HIGH PRIORITY: Send missed call notification
    const message = {
      notification: {
        title: `Missed call - ${receiverName}`,
        body: `${receiverName} didn't answer`,
      },
      data: {
        type: "missed_call",
        notification_type: "missed_call",
        caller_name: receiverName,
        call_id: callId,
        status: "missed",
        reason: reason || "no_answer",
        payload: `missed_call:${callId}`,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "missed_calls",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      token: fcmToken,
    };

    try {
      const response = await messaging.send(message as any);
      console.log(
        `[MissedCall] ✅ FCM sent to ${callerUserId}: messageId=${response}`
      );
      lastResponse = response;

      // Log activity
      await supabase.from("notification_logs").insert({
        user_id: callerUserId,
        type: "missed_call",
        title: `Missed call - ${receiverName}`,
        body: `${receiverName} didn't answer`,
        data: {
          call_id: callId,
          receiver_name: receiverName,
          reason: reason,
        },
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[MissedCall] ❌ FCM error for token:`, error);
    }
  }

  return lastResponse ? { success: true, messageId: lastResponse } : { success: false, error: "No tokens sent" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    initFirebaseOnce();

    const body: MissedCallBody = await req.json();

    // Validate required fields
    const callerUserId = requireString(body.caller_user_id, "caller_user_id");
    const callId = requireString(body.call_id, "call_id");
    const receiverName = body.receiver_name || "Unknown";
    const reason = body.reason || "no_answer";

    console.log(
      `[MissedCall] 🔴 MISSED CALL NOTIFICATION: caller=${callerUserId} receiver=${receiverName} callId=${callId}`
    );

    const result = await sendMissedCallFCM(
      callerUserId,
      receiverName,
      callId,
      reason
    );
    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error) {
    console.error("[MissedCall] Error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      400
    );
  }
});
