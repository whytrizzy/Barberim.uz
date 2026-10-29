import { BotError, GrammyError, HttpError } from 'grammy';

/**
 * A log-safe description of a bot failure. Never log grammY's BotError or its context directly:
 * the context holds the bot token (ctx.api) and the user's message text.
 */
export function summarizeBotError(error: unknown): Record<string, unknown> {
  const inner = error instanceof BotError ? error.error : error;
  const updateId = error instanceof BotError ? error.ctx.update.update_id : undefined;
  if (inner instanceof GrammyError) {
    return {
      kind: 'telegram_api',
      method: inner.method,
      code: inner.error_code,
      description: inner.description,
      updateId,
    };
  }
  if (inner instanceof HttpError) {
    return { kind: 'network', message: inner.message, updateId };
  }
  if (inner instanceof Error) {
    return { kind: 'handler', name: inner.name, message: inner.message, updateId };
  }
  return { kind: 'unknown', updateId };
}
