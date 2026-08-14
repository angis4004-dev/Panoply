import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { traderCreateSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { hashPassword } from '@/lib/auth-store';
import { generateInitialPassword } from '@/lib/admin/credentials';

/**
 * The trader roster.
 *
 * Scoped to `role: 'Trader'`. After the migration that is every user, but the
 * filter is explicit so that an account which somehow still reads 'Admin' does
 * not appear here as a trader to be edited.
 */

const PAGE_SIZE = 50;

function serialize(user: Record<string, unknown>) {
  return {
    id: String(user._id),
    name: user.name as string,
    email: user.email as string,
    status: (user.status as string) || 'active',
    kycStatus: (user.kycStatus as string) || 'unverified',
    riskProfile: (user.riskProfile as string) || 'Balanced',
    walletBalanceMinor: (user.walletBalanceMinor as number) ?? 0,
    createdAt: user.createdAt as Date,
    lastActiveDate: (user.lastActiveDate as Date | null) ?? null,
    notes: (user.notes as string) || '',
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'trader.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const search = (params.get('search') ?? '').trim();
  const status = params.get('status');
  const kycStatus = params.get('kycStatus');

  const query: Record<string, unknown> = { role: 'Trader' };
  if (status) query.status = status;
  if (kycStatus) query.kycStatus = kycStatus;
  if (search) {
    // Escaped: an operator pasting an address or a name containing regex
    // metacharacters should search for it, not compile it.
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }];
  }

  const [rows, total] = await Promise.all([
    UserModel.find(query)
      .select(
        'name email status kycStatus riskProfile walletBalanceMinor createdAt lastActiveDate notes'
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    UserModel.countDocuments(query),
  ]);

  return adminJson({
    traders: rows.map((row) => serialize(row as unknown as Record<string, unknown>)),
    page,
    pageSize: PAGE_SIZE,
    total,
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'trader.create');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, traderCreateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const existing = await UserModel.exists({ email: body.email });
  if (existing) {
    return adminJson({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  // When the operator does not supply one, generate it. A password invented on
  // the spot for someone else is reused across accounts and never changed;
  // this one is shown once, in the response, and nowhere else.
  const password = body.password ?? generateInitialPassword();

  const user = await UserModel.create({
    name: body.name,
    email: body.email,
    role: 'Trader',
    passwordHash: hashPassword(password),
    status: 'onboarding',
    kycStatus: 'unverified',
  });

  await recordAdminAction(ctx, {
    action: 'trader.create',
    targetType: 'user',
    targetId: user._id.toString(),
    affectedUserId: user._id,
    after: { email: user.email, role: 'Trader', status: user.status },
    reason: 'Trader account created from the admin console.',
  });

  return adminJson(
    {
      trader: { id: user._id.toString(), name: user.name, email: user.email },
      // Returned once. It is not stored anywhere in the clear and cannot be
      // retrieved again - the operator has to hand it over now or reset it.
      initialPassword: body.password ? undefined : password,
    },
    { status: 201 }
  );
}
