import { NetworkModel, type INetwork } from '@/lib/models/Network';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { WithdrawalModel } from '@/lib/models/Withdrawal';
import { networkAddressRule } from '@/lib/models/Network';
import { ADDRESS_FAMILY_LABELS, validateAddress } from '@/lib/crypto-address';

/**
 * Shared reads and rules for the network catalog.
 *
 * Here rather than in the route handlers because three surfaces need the same
 * answers - the console, the trader's deposit screen and the withdrawal flow -
 * and a rule that lives in one route handler is a rule the other two will
 * eventually contradict.
 */

export interface SerializedNetwork {
  id: string;
  key: string;
  name: string;
  description: string;
  addressFamily: string;
  addressFamilyLabel: string;
  addressPrefix: string;
  addressCharset: string;
  addressMinLength: number | null;
  addressMaxLength: number | null;
  memoSupported: boolean;
  memoRequired: boolean;
  coins: string[];
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minWithdrawalMinor: number | null;
  sortOrder: number;
  status: string;
  createdAt: Date;
}

export function serializeNetwork(entry: Record<string, unknown>): SerializedNetwork {
  const family = (entry.addressFamily as string) ?? 'none';
  return {
    id: String(entry._id),
    key: entry.key as string,
    name: entry.name as string,
    description: (entry.description as string) || '',
    addressFamily: family,
    addressFamilyLabel:
      ADDRESS_FAMILY_LABELS[family as keyof typeof ADDRESS_FAMILY_LABELS] ?? family,
    addressPrefix: (entry.addressPrefix as string) || '',
    addressCharset: (entry.addressCharset as string) || 'alphanumeric',
    addressMinLength: (entry.addressMinLength as number | null) ?? null,
    addressMaxLength: (entry.addressMaxLength as number | null) ?? null,
    memoSupported: Boolean(entry.memoSupported),
    memoRequired: Boolean(entry.memoRequired),
    coins: (entry.coins as string[]) ?? [],
    depositEnabled: Boolean(entry.depositEnabled),
    withdrawalEnabled: Boolean(entry.withdrawalEnabled),
    minWithdrawalMinor: (entry.minWithdrawalMinor as number | null) ?? null,
    sortOrder: (entry.sortOrder as number) ?? 100,
    status: (entry.status as string) ?? 'active',
    createdAt: entry.createdAt as Date,
  };
}

/**
 * The subset a trader is allowed to see.
 *
 * Deliberately narrower than the console's view. The address rule is included
 * because the client validates against it before submitting - catching a
 * wrong-chain paste in the browser rather than after a round trip - but the
 * server checks it again regardless. Nothing here is a secret; the point is
 * that a trader has no use for sortOrder or who created the row.
 */
export function serializeNetworkForTrader(entry: Record<string, unknown>) {
  const full = serializeNetwork(entry);
  return {
    key: full.key,
    name: full.name,
    description: full.description,
    addressFamily: full.addressFamily,
    addressPrefix: full.addressPrefix,
    addressCharset: full.addressCharset,
    addressMinLength: full.addressMinLength,
    addressMaxLength: full.addressMaxLength,
    memoSupported: full.memoSupported,
    memoRequired: full.memoRequired,
    coins: full.coins,
    depositEnabled: full.depositEnabled,
    withdrawalEnabled: full.withdrawalEnabled,
    minWithdrawalMinor: full.minWithdrawalMinor,
  };
}

/** An active network by key, or null. The lookup every write path starts with. */
export async function findActiveNetwork(key: string) {
  return NetworkModel.findOne({ key: key.toUpperCase(), status: 'active' }).lean();
}

/**
 * Check an address against a network's rule.
 *
 * The single place both the admin publishing a custody address and the trader
 * saving a payout address go through, so the two can never drift into
 * enforcing different rules for the same chain.
 */
export function checkAddressForNetwork(
  network: Pick<
    INetwork,
    | 'name'
    | 'addressFamily'
    | 'addressPrefix'
    | 'addressCharset'
    | 'addressMinLength'
    | 'addressMaxLength'
  >,
  address: string
): string | null {
  return validateAddress(networkAddressRule(network), address, network.name);
}

/**
 * Whether a memo is acceptable for this network.
 *
 * A memo supplied for a chain that has no concept of one is not harmless: the
 * trader will believe it was transmitted and that the deposit can be matched
 * by it. Better to refuse than to accept and discard.
 */
export function checkMemoForNetwork(
  network: Pick<INetwork, 'name' | 'memoSupported' | 'memoRequired'>,
  memoTag: string | undefined
): string | null {
  const value = (memoTag ?? '').trim();
  if (value && !network.memoSupported) {
    return `${network.name} transfers do not carry a memo or destination tag.`;
  }
  if (!value && network.memoRequired) {
    return `${network.name} requires a memo or destination tag.`;
  }
  return null;
}

/**
 * Why a network cannot be switched off, or null if it can.
 *
 * Deactivating a chain that still has money in flight is the failure this
 * prevents. A published deposit address that traders have saved keeps
 * receiving funds after the row is retired, and an approved withdrawal that
 * has not been sent still has to be sent somewhere. Both need the network to
 * remain resolvable, so the operator is made to unwind them first rather than
 * discovering the problem from a support ticket.
 */
export async function blockersToDeactivate(networkKey: string): Promise<string | null> {
  const [activeAddresses, liveWithdrawals] = await Promise.all([
    DepositAddressModel.countDocuments({ network: networkKey, status: 'active' }),
    WithdrawalModel.countDocuments({
      networkKey,
      status: { $in: ['pending', 'approved'] },
    }),
  ]);

  if (activeAddresses > 0) {
    return `${activeAddresses} deposit address${activeAddresses === 1 ? ' is' : 'es are'} still published on this network. Deactivate ${activeAddresses === 1 ? 'it' : 'them'} first.`;
  }
  if (liveWithdrawals > 0) {
    return `${liveWithdrawals} withdrawal${liveWithdrawals === 1 ? '' : 's'} on this network ${liveWithdrawals === 1 ? 'is' : 'are'} still pending or approved. Settle ${liveWithdrawals === 1 ? 'it' : 'them'} first.`;
  }
  return null;
}
