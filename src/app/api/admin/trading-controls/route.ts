import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingControlModel, loadRiskLimits } from '@/lib/models/TradingControl';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { tradingControlSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { describeExchangeConfig } from '@/lib/exchange/config';
import { getExchange } from '@/lib/exchange';

/**
 * The trading brakes, over HTTP.
 *
 * Three actions with two different authorities. Halting is grantable, because
 * stopping the platform is the safe direction and should never wait on one
 * person being awake. Resuming and changing limits are MainAdmin-only, because
 * both end with customer money at a venue. See src/lib/admin/permissions.ts.
 */

export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'trading.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const limits = await loadRiskLimits();
  const { config } = getExchange();

  return adminJson({
    limits,
    // describeExchangeConfig returns no credential material, not even a masked
    // prefix - this response ends up in a console page and probably a
    // screenshot.
    exchange: describeExchangeConfig(config),
  });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'trading.read');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, tradingControlSchema);
  if (invalid) return invalid;

  /*
   * The per-action gate. `trading.read` got the caller this far; each action
   * names the authority it actually needs, so widening one cannot silently
   * widen the others.
   */
  const needed = body.action === 'halt' ? 'trading.halt' : 'trading.manage';
  if (!ctx.permissions.includes(needed)) {
    return adminJson(
      {
        error:
          body.action === 'halt'
            ? 'You do not have permission to stop trading.'
            : 'Only the MainAdmin can resume trading or change the risk limits.',
      },
      { status: 403 }
    );
  }

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const before = await loadRiskLimits();

  const update: Record<string, unknown> = { updatedByAdminId: ctx.admin.id };

  if (body.action === 'halt') {
    update.tradingHalted = true;
    update.haltedReason = body.reason;
    update.haltedAt = new Date();
    update.haltedByAdminId = ctx.admin.id;
  } else if (body.action === 'resume') {
    update.tradingHalted = false;
    update.haltedReason = '';
    update.haltedAt = null;
    update.haltedByAdminId = null;
  } else {
    update.maxOrderNotionalMinor = body.maxOrderNotionalMinor;
    update.maxBotPositionMinor = body.maxBotPositionMinor;
    update.maxUserExposureMinor = body.maxUserExposureMinor;
    update.maxDailyLossMinor = body.maxDailyLossMinor;
    update.minSecondsBetweenOrders = body.minSecondsBetweenOrders;
  }

  const doc = await TradingControlModel.findOneAndUpdate(
    { scope: 'global' },
    { $set: update, $setOnInsert: { scope: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const after = await loadRiskLimits();

  await recordAdminAction(ctx, {
    action: `trading.${body.action}`,
    targetType: 'trading_control',
    targetId: doc?._id?.toString() ?? 'global',
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
    reason: body.action === 'limits' ? 'Risk limits changed.' : body.reason,
  });

  return adminJson({ limits: after });
}
