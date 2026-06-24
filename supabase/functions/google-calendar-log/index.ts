import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const googleScope = "https://www.googleapis.com/auth/calendar.events";
const googleTokenUrl = "https://oauth2.googleapis.com/token";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const getServiceRoleKey = () => {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed.default) {
        return parsed.default as string;
      }
    } catch {
      // Fall back to the legacy environment variable below.
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} が設定されていません。`);
  }

  return value;
};

const encodeBase64Url = (input: Uint8Array) =>
  btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const pemToArrayBuffer = (pem: string) => {
  const normalized = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const createSignedJwt = async (
  serviceAccountEmail: string,
  privateKey: string
) => {
  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccountEmail,
    scope: googleScope,
    aud: googleTokenUrl,
    exp: issuedAt + 3600,
    iat: issuedAt,
  };

  const encoder = new TextEncoder();
  const encodedHeader = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  return `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
};

const fetchGoogleAccessToken = async () => {
  const serviceAccountEmail = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const assertion = await createSignedJwt(serviceAccountEmail, privateKey);
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google アクセストークン取得に失敗しました: ${errorText}`);
  }

  const payload = await response.json();

  if (!payload.access_token) {
    throw new Error("Google アクセストークンを取得できませんでした。");
  }

  return payload.access_token as string;
};

const createGoogleCalendarEvent = async (
  accessToken: string,
  calendarId: string,
  medicineName: string,
  recordedAt: string
) => {
  const startAt = new Date(recordedAt);

  if (Number.isNaN(startAt.getTime())) {
    throw new Error("recordedAt を日時として解釈できませんでした。");
  }

  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  const timeZone = "Asia/Tokyo";
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `☑️${medicineName}`,
        description: `${medicineName}の服薬記録`,
        start: {
          dateTime: startAt.toISOString(),
          timeZone,
        },
        end: {
          dateTime: endAt.toISOString(),
          timeZone,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google カレンダー登録に失敗しました: ${errorText}`);
  }

  return await response.json();
};

const deleteGoogleCalendarEvent = async (
  accessToken: string,
  calendarId: string,
  eventId: string
) => {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google カレンダーイベント削除に失敗しました: ${errorText}`);
  }
};

const insertMedicationLog = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  medicineId: number,
  recordedAt: string,
  googleCalendarEventId: string | null
) => {
  const payloadWithEventId = {
    medicine_id: medicineId,
    google_calendar_event_id: googleCalendarEventId,
    created_at: recordedAt,
  };
  const insertWithEventId = await supabaseAdmin
    .from("medication_log")
    .insert([payloadWithEventId]);

  if (!insertWithEventId.error) {
    return insertWithEventId;
  }

  const message = insertWithEventId.error.message ?? "";
  const isMissingColumnError =
    message.includes("Could not find the") ||
    message.includes("column") ||
    message.includes("schema cache");

  if (!isMissingColumnError) {
    return insertWithEventId;
  }

  return await supabaseAdmin
    .from("medication_log")
    .insert([{
      medicine_id: medicineId,
      created_at: recordedAt,
    }]);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST のみ対応しています。" }, 405);
  }

  try {
    const serviceRoleKey = getServiceRoleKey();

    if (!serviceRoleKey) {
      throw new Error("Supabase の service role key が取得できませんでした。");
    }

    const { medicineId, recordedAt } = await request.json();

    if (!Number.isInteger(medicineId)) {
      return jsonResponse({ error: "medicineId は整数で指定してください。" }, 400);
    }

    if (typeof recordedAt !== "string") {
      return jsonResponse({ error: "recordedAt は文字列で指定してください。" }, 400);
    }

    const supabaseAdmin = createClient(
      getRequiredEnv("SUPABASE_URL"),
      serviceRoleKey
    );
    const { data: medicine, error: medicineError } = await supabaseAdmin
      .from("medicine")
      .select("*")
      .eq("id", medicineId)
      .single();

    if (medicineError || !medicine) {
      return jsonResponse({ error: "対象のくすりが見つかりません。" }, 404);
    }

    const validColumnName = Object.prototype.hasOwnProperty.call(medicine, "isValid")
      ? "isValid"
      : "is_valid";

    if (!medicine[validColumnName]) {
      return jsonResponse({ error: "無効化されたくすりは登録できません。" }, 400);
    }

    const accessToken = await fetchGoogleAccessToken();
    const calendarId = getRequiredEnv("GOOGLE_CALENDAR_ID");
    const googleEvent = await createGoogleCalendarEvent(
      accessToken,
      calendarId,
      medicine.name,
      recordedAt
    );

    const { error: insertError } = await insertMedicationLog(
      supabaseAdmin,
      medicine.id,
      recordedAt,
      googleEvent.id ?? null
    );

    if (insertError) {
      if (googleEvent.id) {
        await deleteGoogleCalendarEvent(accessToken, calendarId, googleEvent.id);
      }
      throw new Error(`medication_log 保存に失敗しました: ${insertError.message}`);
    }

    return jsonResponse({
      success: true,
      eventId: googleEvent.id ?? null,
      medicineName: medicine.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
    return jsonResponse({ error: message }, 500);
  }
});
