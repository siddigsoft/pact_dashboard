// Supabase Edge Function: Send message notification via FCM
// Triggers when: new message is sent
// Sends: FCM notification with type="message" to the recipient
//
// Requires secrets:
// - FIREBASE_SERVICE_ACCOUNT_JSON: JSON string of a Firebase service account
// - SUPABASE_SERVICE_ROLE_KEY: for reading user fcm_tokens
//
// Deploy:
//   supabase functions deploy send-message-notification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApps, initializeApp, cert } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type MessageNotificationBody = {
  recipient_user_id: string;    // Who receives the message
  sender_user_id: string;
  sender_name?: string;
  chat_id: string;
  message_id: string;
  message_preview: string;       // First ~100 chars of message
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

async function sendMessageFCM(
  recipientUserId: string,
  senderName: string,
  senderUserId: string,
  chatId: string,
  messageId: string,
  messagePreview: string
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  // Get recipient's FCM tokens
  const { data: userData, error: userError } = await supabase
    .from("profiles")
    .select("fcm_tokens, full_name")
    .eq("id", recipientUserId)
    .single();

  if (userError || !userData?.fcm_tokens || userData.fcm_tokens.length === 0) {
    console.warn(`[Message] No FCM tokens for recipient ${recipientUserId}`);
    return {
      success: false,
      reason: "no_fcm_token",
      message: "No FCM tokens found for recipient",
    };
  }

  const messaging = getMessaging();

  // Truncate preview to 150 chars
  const truncatedPreview =
    messagePreview.length > 150
      ? messagePreview.substring(0, 150) + "..."
      : messagePreview;

  // Send to all registered devices
  const fcmTokens = userData.fcm_tokens as string[];
  let lastResponse = null;

  for (const fcmToken of fcmTokens) {
    // 🔴 HIGH PRIORITY: Send message notification
    const message = {
      notification: {
        title: senderName,
        body: truncatedPreview,
      },
      data: {
        type: "message",
        notification_type: "message",
        sender_name: senderName,
        sender_id: senderUserId,
        chat_id: chatId,
        message_id: messageId,
        message: messagePreview,
        message_text: messagePreview,
        payload: `chat:${senderUserId}`,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "messages",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "mutable-content": 1,
          },
        },
      },
      token: fcmToken,
    };

    try {
      const response = await messaging.send(message as any);
      console.log(
        `[Message] ✅ FCM sent to ${recipientUserId}: messageId=${response}`
      );
      lastResponse = response;

      // Log activity
      await supabase.from("notification_logs").insert({
        user_id: recipientUserId,
        type: "message",
        title: senderName,
        body: truncatedPreview,
        data: {
          sender_id: senderUserId,
          chat_id: chatId,
          message_id: messageId,
        },
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[Message] ❌ FCM error for token:`, error);
    }
  }

  return lastResponse
    ? { success: true, messageId: lastResponse }
    : { success: false, error: "No tokens sent" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    initFirebaseOnce();

    const body: MessageNotificationBody = await req.json();

    // Validate required fields
    const recipientUserId = requireString(body.recipient_user_id, "recipient_user_id");
    const senderUserId = requireString(body.sender_user_id, "sender_user_id");
    const senderName = body.sender_name || "Unknown";
    const chatId = requireString(body.chat_id, "chat_id");
    const messageId = requireString(body.message_id, "message_id");
    const messagePreview = requireString(body.message_preview, "message_preview");

    console.log(
      `[Message] 🔴 MESSAGE NOTIFICATION: recipient=${recipientUserId} sender=${senderName} chatId=${chatId}`
    );

    const result = await sendMessageFCM(
      recipientUserId,
      senderName,
      senderUserId,
      chatId,
      messageId,
      messagePreview
    );

    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error) {
    console.error("[Message] Error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      400
    );
  }
});
