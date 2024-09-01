import * as nip19 from 'nostr-tools/nip19';
import { Signer } from './utils.js';

export const relayUrls: string[] = [
  'wss://relay.nostr.wirednet.jp/',
  'wss://yabu.me/',
  //'wss://nrelay.c-stellar.net/',
];

export const mahjongChannelId: string =
  'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723';

const mahjongServerNsec: string | undefined =
  process.env.NOSTR_PRIVATE_KEY_JONGBARI;
const mahjongPlayerNsecs: (string | undefined)[] = [
  process.env.NOSTR_PRIVATE_KEY_RINRIN,
  process.env.NOSTR_PRIVATE_KEY_CHUNCHUN,
  process.env.NOSTR_PRIVATE_KEY_WHANWHAN,
  process.env.NOSTR_PRIVATE_KEY_BEE,
  process.env.NOSTR_PRIVATE_KEY_UNYU,
];

export const getServerSignerMap = (): Map<string, Signer> => {
  return getSignerMap([mahjongServerNsec]);
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
