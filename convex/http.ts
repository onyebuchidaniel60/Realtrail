import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

export default http;
