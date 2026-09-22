import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import { sha256Hex, verifySvixSignature } from "./lib/providers/svix";

const http = httpRouter();

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okResponse(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

http.route({
  path: "/webhooks/agentmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Fast path only: verify, dedupe, schedule, return. No provider fetch
    // and no heavy work here — canonical fetching happens in the scheduled
    // internal action so webhook delivery stays fast and retry-safe.
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (!svixId || !svixTimestamp || !svixSignature || !secret) {
      return errorResponse(
        400,
        "WEBHOOK_INVALID",
        "Missing webhook headers or server secret.",
      );
    }
    // Read the raw body text first: signature verification must run over
    // the exact bytes the provider signed, before any JSON parsing.
    const rawBody = await request.text();
    const verification = await verifySvixSignature({
      secret,
      headers: { svixId, svixTimestamp, svixSignature },
      rawBody,
    });
    if (!verification.ok) {
      return errorResponse(401, verification.code, verification.message);
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      return errorResponse(400, "WEBHOOK_INVALID", "Malformed JSON payload.");
    }
    if (typeof envelope !== "object" || envelope === null) {
      return errorResponse(400, "WEBHOOK_INVALID", "Malformed JSON payload.");
    }
    // Provider envelope mapping, per the documented message.received
    // shape: { event_type, event_id, message: { inbox_id, thread_id,
    // message_id, ... }, thread: {...} }. Documented snake_case names come
    // first; older guesses trail as tolerance, never as primary keys.
    const record = envelope as Record<string, unknown>;
    const messageValue = record.message;
    const messageRecord =
      typeof messageValue === "object" && messageValue !== null
        ? (messageValue as Record<string, unknown>)
        : undefined;
    const providerEventId =
      asOptionalString(record.event_id) ??
      asOptionalString(record.eventId) ??
      asOptionalString(record.providerEventId) ??
      asOptionalString(record.id);
    const providerInboxId =
      (messageRecord !== undefined
        ? asOptionalString(messageRecord.inbox_id)
        : undefined) ??
      asOptionalString(record.inbox_id) ??
      asOptionalString(record.inboxId) ??
      asOptionalString(record.providerInboxId);
    const providerMessageId =
      (messageRecord !== undefined
        ? asOptionalString(messageRecord.message_id)
        : undefined) ??
      asOptionalString(record.message_id) ??
      asOptionalString(record.messageId) ??
      asOptionalString(record.providerMessageId);
    const eventType =
      asOptionalString(record.event_type) ??
      asOptionalString(record.eventType) ??
      asOptionalString(record.type) ??
      "unknown";
    if (!providerEventId || !providerInboxId) {
      return errorResponse(
        400,
        "WEBHOOK_INVALID",
        "Webhook payload is missing event or inbox identity.",
      );
    }
    const payloadHash = await sha256Hex(rawBody);
    const { eventId, wasDuplicate } = await ctx.runMutation(
      internal.email.processInbound.recordInboundEvent,
      {
        providerEventId,
        providerMessageId,
        providerInboxId,
        eventType,
        payloadHash,
      },
    );
    if (wasDuplicate) {
      return okResponse();
    }
    await ctx.scheduler.runAfter(
      0,
      internal.email.processInbound.processInboundEvent,
      { eventId },
    );
    return okResponse();
  }),
});

// Resident confirmation pages (Phase 9-B).
//
// Security contract (ARCHITECTURE.md §11, §18, §28):
// - GET never touches the database: no lookup, no validity signal, no
//   side effects. A timing oracle cannot exist when there is no query.
// - Every error path returns HTTP 200 with byte-identical generic pages,
//   so responses never distinguish unknown / expired / used / conflict.
// - No case data (number, title, reporter, property) appears anywhere.
// - The raw token is the credential. It is echoed only into the GET
//   page's hidden inputs (escaped), never logged, never stored, and
//   never rendered after consumption.
// - No cookies, no sessions, no CSRF tokens: there is no ambient
//   authority to forge, so CSRF checks would only break the flow.
// - No scripts, no external resources; one inline <style> block only.

// Raw tokens are 32 bytes base64url-encoded (43 chars). Anything else
// never reaches the database.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CONFIRM_STYLE = [
  "body{font-family:system-ui,sans-serif;background:#faf9f7;color:#1c1917}",
  "main{max-width:32rem;margin:4rem auto;padding:2rem;background:#fff}",
  "main{border:1px solid #e7e5e4;border-radius:0.75rem}",
  "h1{font-size:1.25rem;margin:0 0 0.5rem}",
  "p{font-size:0.875rem;color:#57534e}",
  "form{margin-top:1rem}",
  "button{display:block;width:100%;margin-top:0.5rem;padding:0.625rem}",
  "button{border-radius:0.5rem;border:1px solid #d6d3d1;background:#1c1917}",
  "button{color:#fafaf9;font-size:0.875rem;font-weight:600;cursor:pointer}",
  "button.secondary{background:#fff;color:#1c1917}",
  "button:disabled{opacity:0.5;cursor:default}",
].join("");

function confirmPageShell(title: string, inner: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    `<style>${CONFIRM_STYLE}</style>`,
    "</head>",
    "<body>",
    "<main>",
    inner,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function confirmationForm(rawToken: string): string {
  const token = escapeHtml(rawToken);
  const yesForm = [
    '<form method="POST" action="/confirm">',
    `<input type="hidden" name="token" value="${token}">`,
    '<input type="hidden" name="decision" value="yes">',
    '<button type="submit">Yes, it&apos;s resolved</button>',
    "</form>",
  ].join("\n");
  const noForm = [
    '<form method="POST" action="/confirm">',
    `<input type="hidden" name="token" value="${token}">`,
    '<input type="hidden" name="decision" value="no">',
    '<button type="submit" class="secondary">No, still an issue</button>',
    "</form>",
  ].join("\n");
  return [
    "<h1>Realtrail — Issue confirmation</h1>",
    "<p>Please confirm the status of your reported issue.</p>",
    yesForm,
    noForm,
    "<p>If you did not request this, you can safely close this page.</p>",
  ].join("\n");
}

function invalidLinkInner(): string {
  return [
    "<h1>Realtrail — Issue confirmation</h1>",
    "<p>This link is not valid.</p>",
    "<p>If you did not request this, you can safely close this page.</p>",
  ].join("\n");
}

function successInner(): string {
  return [
    "<h1>Thank you</h1>",
    "<p>Your response has been recorded.</p>",
  ].join("\n");
}

// Single generic error body for every failure mode (unknown, expired,
// used, conflict, malformed input). Byte-identical by construction —
// response content is never an oracle.
function errorInner(): string {
  return [
    "<h1>Realtrail</h1>",
    "<p>We couldn&apos;t process this confirmation link. It may have",
    "expired or already been used. If you believe this is a",
    "mistake, please contact your estate manager.</p>",
  ].join("\n");
}

function htmlResponse(
  body: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The token lives in the URL: never leak it via Referer.
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // No scripts, no external resources, same-origin forms only.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      ...extraHeaders,
    },
  });
}

function confirmationErrorCode(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown } | undefined;
    if (typeof data?.code === "string") {
      return data.code;
    }
  }
  return "UNKNOWN";
}

http.route({
  path: "/confirm",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    let rawToken: string | null;
    try {
      rawToken = new URL(request.url).searchParams.get("token");
    } catch {
      return htmlResponse(
        confirmPageShell("Realtrail — Issue confirmation", invalidLinkInner()),
      );
    }
    if (rawToken !== null && TOKEN_PATTERN.test(rawToken)) {
      return htmlResponse(
        confirmPageShell(
          "Realtrail — Issue confirmation",
          confirmationForm(rawToken),
        ),
      );
    }
    // Missing or malformed token: same status, invalid-link page, no
    // form, no database access. Probing learns nothing.
    return htmlResponse(
      confirmPageShell("Realtrail — Issue confirmation", invalidLinkInner()),
    );
  }),
});

http.route({
  path: "/confirm",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const noCacheHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    };
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("application/x-www-form-urlencoded")) {
      return htmlResponse(
        confirmPageShell("Realtrail", errorInner()),
        noCacheHeaders,
      );
    }
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(await request.text());
    } catch {
      return htmlResponse(
        confirmPageShell("Realtrail", errorInner()),
        noCacheHeaders,
      );
    }
    const rawToken = params.get("token");
    const decision = params.get("decision");
    if (
      rawToken === null ||
      !TOKEN_PATTERN.test(rawToken) ||
      (decision !== "yes" && decision !== "no")
    ) {
      return htmlResponse(
        confirmPageShell("Realtrail", errorInner()),
        noCacheHeaders,
      );
    }
    try {
      await ctx.runMutation(
        internal.cases.confirmation.consumeConfirmation,
        { rawToken, decision },
      );
    } catch (error) {
      // Code-level logging only: never the token, its hash, or the body.
      console.warn(`confirmation consume failed: ${confirmationErrorCode(error)}`);
      return htmlResponse(
        confirmPageShell("Realtrail", errorInner()),
        noCacheHeaders,
      );
    }
    return htmlResponse(
      confirmPageShell("Thank you", successInner()),
      noCacheHeaders,
    );
  }),
});

export default http;
