import * as nip19 from 'nostr-tools/nip19';
import { Signer } from './utils.js';

export const relayUrls: string[] = ['wss://relay.nostr.wirednet.jp/', 'wss://yabu.me/'];

export const mahjongChannelIds: string[] = [
  'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723',
  '06ddcb27b27f667d6487b5128625f25cb2148cf87bff0502aaffe5ca705dc626',
];

export const getBafuLength = (channelId: string): number => {
  const r = new Map<string, number>([
    [mahjongChannelIds[0], 2], //半荘戦
    [mahjongChannelIds[1], 1], //東風戦
  ]);
  return r.get(channelId) ?? 2;
};

const mahjongServerNsecs: (string | undefined)[] = [process.env.NOSTR_PRIVATE_KEY_JONGBARI];
const mahjongPlayerNsecs: (string | undefined)[] = [
  process.env.NOSTR_PRIVATE_KEY_RINRIN,
  process.env.NOSTR_PRIVATE_KEY_CHUNCHUN,
  process.env.NOSTR_PRIVATE_KEY_WHANWHAN,
  process.env.NOSTR_PRIVATE_KEY_BEE,
  process.env.NOSTR_PRIVATE_KEY_UNYU,
];
export const nostrWalletConnect: string | undefined = process.env.NOSTR_WALLET_CONNECT;

export const pubkeysOfRelayOwnerToZap: string[] = [
  'npub1vd9ar8jusldjze24eq2tlz8xdt8pwkq99ydxh6gtzkkrkgj8m2dsndwen9',
  'npub1kurad0nlm8xfuxhws05pcwv5z4k0ea6da4dsjygexr77a666pssqsftsm7',
].map((npub) => nip19.decode(npub).data as string);

export const getServerSignerMap = (): Map<string, Signer> => {
  return getSignerMap(mahjongServerNsecs);
};

export const getPlayerSignerMap = (): Map<string, Signer> => {
  return getSignerMap(mahjongPlayerNsecs);
};

const getSignerMap = (nsecs: (string | undefined)[]): Map<string, Signer> => {
  const m = new Map<string, Signer>();
  for (const nsec of nsecs) {
    if (nsec === undefined) {
      throw Error('NOSTR_PRIVATE_KEY is undefined');
    }
    const dr = nip19.decode(nsec);
    if (dr.type !== 'nsec') {
      throw Error('NOSTR_PRIVATE_KEY is not `nsec`');
    }
    const seckey: Uint8Array = dr.data;
    const signer = new Signer(seckey);
    m.set(signer.getPublicKey(), signer);
  }
  return m;
};

export const isDebug = false;
