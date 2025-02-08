import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { type EventTemplate, type NostrEvent, type VerifiedEvent, finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import * as nip19 from 'nostr-tools/nip19';
import * as nip57 from 'nostr-tools/nip57';
import { nip47 } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { type EventPacket, type RxNostr, createRxBackwardReq } from 'rx-nostr';
import { mahjongChannelIds, nostrWalletConnect, pubkeysOfRelayOwnerToZap, relayUrls } from './config.js';
import { stringToArrayPlain } from './mjlib/mj_common.js';

export const enum Mode {
  Server,
  Client,
  Unknown,
}

export const buffer = async (readable: Readable) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

export class Signer {
  #seckey: Uint8Array;

  constructor(seckey: Uint8Array) {
    this.#seckey = seckey;
  }

  getPublicKey = () => {
    return getPublicKey(this.#seckey);
  };

  finishEvent = (unsignedEvent: EventTemplate) => {
    return finalizeEvent(unsignedEvent, this.#seckey);
  };
}

export const getNowWithoutSecond = (): number => {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime() / 1000);
};

export const sendBootReaction = (rxNostr: RxNostr, serverSigner: Signer) => {
  const rxReqB = createRxBackwardReq();
  let bootEvent: VerifiedEvent;
  const nextB = (packet: EventPacket) => {
    bootEvent = serverSigner.finishEvent({
      kind: 7,
      tags: getTagsFav(packet.event),
      content: '🌅',
      created_at: Math.floor(Date.now() / 1000),
    });
  };
  const complete = async () => {
    //起きた報告
    rxNostr.send(bootEvent).subscribe((packet) => {
      console.info(`RES from ${nip19.npubEncode(bootEvent.pubkey)}\n${bootEvent.content}`);
      console.log(packet);
    });
  };
  const _subscriptionB = rxNostr.use(rxReqB).subscribe({ next: nextB, complete });
  rxReqB.emit({
    kinds: [42],
    '#p': [serverSigner.getPublicKey()],
    '#e': mahjongChannelIds,
    until: Math.floor(Date.now() / 1000),
    limit: 1,
  });
  rxReqB.over();
};

export const sendRequestPassport = (rxNostr: RxNostr, signer: Signer) => {
  const npub_yabumi = 'npub1823chanrkmyrfgz2v4pwmu22s8fjy0s9ps7vnd68n7xgd8zr9neqlc2e5r';
  const mahjongChannelId = mahjongChannelIds.at(0);
  if (mahjongChannelId === undefined) {
    console.warn('mahjongChannelIds is undefined');
    return;
  }
  const requestEvent: VerifiedEvent = signer.finishEvent({
    kind: 42,
    tags: [
      ['e', mahjongChannelId, '', 'root'],
      ['p', nip19.decode(npub_yabumi).data, ''],
    ],
    content: `nostr:${npub_yabumi} passport`,
    created_at: Math.floor(Date.now() / 1000),
  });
  rxNostr.send(requestEvent).subscribe((packet) => {
    console.info(`RES from ${nip19.npubEncode(requestEvent.pubkey)}\n${requestEvent.content}`);
    console.log(packet);
  });
};

export const zapSplit = async (rxNostr: RxNostr, event: NostrEvent, signer: Signer): Promise<void> => {
  //kind9734の検証
  let event9734;
  try {
    event9734 = JSON.parse(event.tags.find((tag: string[]) => tag.length >= 2 && tag[0] === 'description')?.at(1) ?? '{}');
  } catch (error) {
    console.warn(error);
    return;
  }
  if (!verifyEvent(event9734)) {
    console.warn('Invalid kind 9734 event');
    return;
  }
  //kind9735の検証
  const evKind0: NostrEvent | null = await getKind0(rxNostr, signer.getPublicKey());
  if (evKind0 === null) {
    console.warn('Cannot get kind 0 event');
    return;
  }
  const lud16: string = JSON.parse(evKind0.content).lud16;
  const m = lud16.match(/^([^@]+)@([^@]+)$/);
  if (m === null) {
    console.warn('Invalid lud16 field');
    return;
  }
  const url = `https://${m[2]}/.well-known/lnurlp/${m[1]}`;
  const response = await fetch(url);
  const json = await response.json();
  const nostrPubkey: string = json.nostrPubkey;
  if (!nostrPubkey) {
    console.warn('nostrPubkey does not exist');
    return;
  }
  if (event.pubkey !== nostrPubkey) {
    console.warn('Fake Zap');
    return;
  }
  //Zap Split
  const amountStr = event9734.tags.find((tag: string[]) => tag.length >= 2 && tag[0] === 'amount')?.at(1);
  if (amountStr === undefined || !/^\d+$/.test(amountStr)) {
    console.warn('Invalid an amount');
    return;
  }
  const amount = parseInt(amountStr);
  if (amount < 2 * 1000) {
    console.log('Too small an amount');
    return;
  }
  const sats = Math.floor(amount / (1000 * pubkeysOfRelayOwnerToZap.length));
  for (const pubkey of pubkeysOfRelayOwnerToZap) {
    try {
      await zapByNIP47(rxNostr, pubkey, signer, sats, 'for your relay');
    } catch (error) {
      console.warn(error);
    }
  }
};

const getKind0 = async (rxNostr: RxNostr, pubkey: string): Promise<NostrEvent | null> => {
  const eventsKind0: NostrEvent[] = await getGeneralEvents(rxNostr, [
    {
      kinds: [0],
      authors: [pubkey],
      until: Math.floor(Date.now() / 1000),
    },
  ]);
  if (eventsKind0.length === 0) {
    return null;
  }
  const evKind0: NostrEvent = eventsKind0.reduce((accumulator: NostrEvent, currentValue: NostrEvent) => {
    if (accumulator.created_at < currentValue.created_at) {
      return currentValue;
    } else {
      return accumulator;
    }
  });
  return evKind0;
};

const zapByNIP47 = async (rxNostr: RxNostr, pubkey: string, signer: Signer, sats: number, zapComment: string): Promise<void> => {
  const wc = nostrWalletConnect;
  if (wc === undefined) {
    throw Error('NOSTR_WALLET_CONNECT is undefined');
  }
  const { pathname, hostname, searchParams } = new URL(wc);
  const walletPubkey = pathname || hostname;
  const walletRelay = searchParams.get('relay');
  const walletSeckey = searchParams.get('secret');
  if (walletPubkey.length === 0 || walletRelay === null || walletSeckey === null) {
    throw Error('NOSTR_WALLET_CONNECT is invalid connection string');
  }
  const evKind0 = await getKind0(rxNostr, pubkey);
  if (evKind0 === null) {
    throw Error('Cannot get kind 0 event');
  }
  const zapEndpoint = await nip57.getZapEndpoint(evKind0);
  if (zapEndpoint === null) {
    throw Error('Cannot get zap endpoint');
  }
  const amount = sats * 1000;
  const zapRequest = nip57.makeZapRequest({
    profile: pubkey,
    event: null,
    amount,
    comment: zapComment,
    relays: relayUrls,
  });
  const zapRequestEvent = signer.finishEvent(zapRequest);
  const encoded = encodeURI(JSON.stringify(zapRequestEvent));

  const url = `${zapEndpoint}?amount=${amount}&nostr=${encoded}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw Error('Cannot get invoice');
  }
  const { pr: invoice } = await response.json();

  const ev: VerifiedEvent = await nip47.makeNwcRequestEvent(walletPubkey, hexToBytes(walletSeckey), invoice);
  rxNostr.send(ev, { on: { relays: [walletRelay] } });
};

const getGeneralEvents = (rxNostr: RxNostr, filters: Filter[]): Promise<NostrEvent[]> => {
  return new Promise((resolve) => {
    const events: NostrEvent[] = [];
    const rxReq = createRxBackwardReq();
    rxNostr.use(rxReq).subscribe({
      next: (packet: EventPacket) => {
        events.push(packet.event);
      },
      complete: () => {
        resolve(events);
      },
    });
    rxReq.emit(filters);
    rxReq.over();
  });
};

export const getTagsAirrep = (event: NostrEvent): string[][] => {
  return getTagsReply(event, false);
};

export const getTagsReply = (event: NostrEvent, addPTag: boolean = true): string[][] => {
  const tagsReply: string[][] = [];
  const tagRoot = event.tags.find((tag: string[]) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root');
  if (tagRoot !== undefined) {
    tagsReply.push(tagRoot);
    tagsReply.push(['e', event.id, '', 'reply', event.pubkey]);
  } else {
    tagsReply.push(['e', event.id, '', 'root', event.pubkey]);
  }
  if (addPTag) {
    for (const tag of event.tags.filter((tag: string[]) => tag.length >= 2 && tag[0] === 'p' && tag[1] !== event.pubkey)) {
      tagsReply.push(tag);
    }
    tagsReply.push(['p', event.pubkey]);
  }
  return tagsReply;
};

export const getTagsFav = (event: NostrEvent): string[][] => {
  const tagsFav: string[][] = [
    ...event.tags.filter((tag) => tag.length >= 2 && (tag[0] === 'e' || (tag[0] === 'p' && tag[1] !== event.pubkey))),
    ['e', event.id],
    ['p', event.pubkey],
    ['k', String(event.kind)],
  ];
  return tagsFav;
};

export const getTagsEmoji = (tehai: string): string[][] => {
  const pi = stringToArrayPlain(tehai);
  return Array.from(new Set(pi)).map((pi) => getEmojiTag(pi));
};

export const getEmojiTag = (pi: string): string[] => {
  return ['emoji', convertEmoji(pi), getEmojiUrl(pi)];
};

export const convertEmoji = (pai: string) => {
  if (pai === 'back') return 'mahjong_back';
  if (pai === 'stick100') return 'mahjong_stick100';
  if (pai === 'stick1000') return 'mahjong_stick1000';
  if (['m', 'p', 's'].includes(pai.at(1) ?? '')) {
    return `mahjong_${pai.at(1)}${pai.at(0)}`;
  } else if (pai.at(1) === 'z') {
    switch (pai.at(0)) {
      case '1':
        return 'mahjong_east';
      case '2':
        return 'mahjong_south';
      case '3':
        return 'mahjong_west';
      case '4':
        return 'mahjong_north';
      case '5':
        return 'mahjong_white';
      case '6':
        return 'mahjong_green';
      case '7':
        return 'mahjong_red';
      default:
        throw TypeError(`Unknown pai: ${pai}`);
    }
  } else {
    throw TypeError(`Unknown pai: ${pai}`);
  }
};

const getEmojiUrl = (pai: string): string => {
  return awayuki_mahjong_emojis[convertEmoji(pai)];
};

const awayuki_mahjong_emojis: { [shortcode: string]: string } = {
  mahjong_m1: 'https://awayuki.github.io/emoji/mahjong-m1.png',
  mahjong_m2: 'https://awayuki.github.io/emoji/mahjong-m2.png',
  mahjong_m3: 'https://awayuki.github.io/emoji/mahjong-m3.png',
  mahjong_m4: 'https://awayuki.github.io/emoji/mahjong-m4.png',
  mahjong_m5: 'https://awayuki.github.io/emoji/mahjong-m5.png',
  mahjong_m6: 'https://awayuki.github.io/emoji/mahjong-m6.png',
  mahjong_m7: 'https://awayuki.github.io/emoji/mahjong-m7.png',
  mahjong_m8: 'https://awayuki.github.io/emoji/mahjong-m8.png',
  mahjong_m9: 'https://awayuki.github.io/emoji/mahjong-m9.png',
  mahjong_p1: 'https://awayuki.github.io/emoji/mahjong-p1.png',
  mahjong_p2: 'https://awayuki.github.io/emoji/mahjong-p2.png',
  mahjong_p3: 'https://awayuki.github.io/emoji/mahjong-p3.png',
  mahjong_p4: 'https://awayuki.github.io/emoji/mahjong-p4.png',
  mahjong_p5: 'https://awayuki.github.io/emoji/mahjong-p5.png',
  mahjong_p6: 'https://awayuki.github.io/emoji/mahjong-p6.png',
  mahjong_p7: 'https://awayuki.github.io/emoji/mahjong-p7.png',
  mahjong_p8: 'https://awayuki.github.io/emoji/mahjong-p8.png',
  mahjong_p9: 'https://awayuki.github.io/emoji/mahjong-p9.png',
  mahjong_s1: 'https://awayuki.github.io/emoji/mahjong-s1.png',
  mahjong_s2: 'https://awayuki.github.io/emoji/mahjong-s2.png',
  mahjong_s3: 'https://awayuki.github.io/emoji/mahjong-s3.png',
  mahjong_s4: 'https://awayuki.github.io/emoji/mahjong-s4.png',
  mahjong_s5: 'https://awayuki.github.io/emoji/mahjong-s5.png',
  mahjong_s6: 'https://awayuki.github.io/emoji/mahjong-s6.png',
  mahjong_s7: 'https://awayuki.github.io/emoji/mahjong-s7.png',
  mahjong_s8: 'https://awayuki.github.io/emoji/mahjong-s8.png',
  mahjong_s9: 'https://awayuki.github.io/emoji/mahjong-s9.png',
  mahjong_east: 'https://awayuki.github.io/emoji/mahjong-east.png',
  mahjong_south: 'https://awayuki.github.io/emoji/mahjong-south.png',
  mahjong_west: 'https://awayuki.github.io/emoji/mahjong-west.png',
  mahjong_north: 'https://awayuki.github.io/emoji/mahjong-north.png',
  mahjong_white: 'https://awayuki.github.io/emoji/mahjong-white.png',
  mahjong_green: 'https://awayuki.github.io/emoji/mahjong-green.png',
  mahjong_red: 'https://awayuki.github.io/emoji/mahjong-red.png',
  mahjong_back: 'https://awayuki.github.io/emoji/mahjong-back.png',
  mahjong_stick100: 'https://awayuki.github.io/emoji/mahjong-stick100.png',
  mahjong_stick1000: 'https://awayuki.github.io/emoji/mahjong-stick1000.png',
};

export const getScoreAddWithPao = (
  nAgariPlayer: number,
  nFurikomiPlayer: number,
  score: number,
  nTsumibou: number,
  nKyotaku: number,
  arTenpaiPlayerFlag: number[],
  nPaoPlayerDaisangen: number,
  nPaoPlayerDaisushi: number,
  countYakuman: number,
  nOyaIndex: number,
): number[] => {
  let arScoreAdd = [0, 0, 0, 0];
  let nPaoPlayer = -1;
  let paoScore = 0;
  if (nPaoPlayerDaisangen >= 0) {
    nPaoPlayer = nPaoPlayerDaisangen;
    paoScore = 32000;
  } else if (nPaoPlayerDaisushi >= 0) {
    nPaoPlayer = nPaoPlayerDaisushi;
    paoScore = 64000;
  }
  if (nAgariPlayer === nOyaIndex) paoScore = 1.5 * paoScore;
  if (nPaoPlayer >= 0) {
    let arScoreAdd1;
    let arScoreAdd2;
    if (nFurikomiPlayer >= 0) {
      arScoreAdd1 = getScoreAdd(nAgariPlayer, nFurikomiPlayer, score - paoScore / 2, nTsumibou, nKyotaku, nOyaIndex, []);
      arScoreAdd2 = getScoreAdd(nAgariPlayer, nPaoPlayer, paoScore / 2, 0, 0, nOyaIndex, []);
    } else {
      if (countYakuman >= 2) {
        arScoreAdd1 = getScoreAdd(nAgariPlayer, -1, score - paoScore, nTsumibou, nKyotaku, nOyaIndex, []);
        arScoreAdd2 = getScoreAdd(nAgariPlayer, nPaoPlayer, paoScore, 0, 0, nOyaIndex, []);
      } else {
        arScoreAdd1 = getScoreAdd(nAgariPlayer, nPaoPlayer, score, nTsumibou, nKyotaku, nOyaIndex, []);
        arScoreAdd2 = [0, 0, 0, 0];
      }
    }
    for (let i = 0; i < 4; i++) {
      arScoreAdd[i] = arScoreAdd1[i] + arScoreAdd2[i];
    }
  } else {
    arScoreAdd = getScoreAdd(nAgariPlayer, nFurikomiPlayer, score, nTsumibou, nKyotaku, nOyaIndex, arTenpaiPlayerFlag);
  }
  return arScoreAdd;
};

export const getScoreAdd = (
  nAgariPlayer: number,
  nFurikomiPlayer: number,
  score: number,
  nTsumibou: number,
  nKyotaku: number,
  nOyaIndex: number,
  arTenpaiPlayerFlag: number[],
): number[] => {
  const arScoreAdd = [0, 0, 0, 0];
  if (arTenpaiPlayerFlag.length === 0) {
    if (nFurikomiPlayer >= 0) {
      arScoreAdd[nFurikomiPlayer] = -1 * (score + 300 * nTsumibou);
      arScoreAdd[nAgariPlayer] = score + 300 * nTsumibou + 1000 * nKyotaku;
    } else {
      for (let i = 0; i < 4; i++) {
        if (nAgariPlayer === i) {
          if (nAgariPlayer === nOyaIndex) {
            const nShou = Math.floor(score / 300) * 100;
            const nAmari = score % 300;
            let nScore = nShou;
            if (nAmari > 0) nScore += 100;
            nScore = 3 * nScore;
            arScoreAdd[i] = nScore + 300 * nTsumibou + 1000 * nKyotaku;
          } else {
            const nShou1 = Math.floor(score / 200) * 100;
            const nAmari1 = score % 200;
            let nScore1 = nShou1;
            if (nAmari1 > 0) nScore1 += 100;
            const nShou2 = Math.floor(score / 400) * 100;
            const nAmari2 = score % 400;
            let nScore2 = nShou2;
            if (nAmari2 > 0) nScore2 += 100;
            const nScore = nScore1 + 2 * nScore2;
            arScoreAdd[i] = nScore + 300 * nTsumibou + 1000 * nKyotaku;
          }
        } else {
          if (nAgariPlayer === nOyaIndex) {
            const nShou = Math.floor(score / 300) * 100;
            const nAmari = score % 300;
            let nScore = nShou;
            if (nAmari > 0) nScore += 100;
            arScoreAdd[i] = -1 * (nScore + 100 * nTsumibou);
          } else {
            if (i === nOyaIndex) {
              const nShou = Math.floor(score / 200) * 100;
              const nAmari = score % 200;
              let nScore = nShou;
              if (nAmari > 0) nScore += 100;
              arScoreAdd[i] = -1 * (nScore + 100 * nTsumibou);
            } else {
              const nShou = Math.floor(score / 400) * 100;
              const nAmari = score % 400;
              let nScore = nShou;
              if (nAmari > 0) nScore += 100;
              arScoreAdd[i] = -1 * (nScore + 100 * nTsumibou);
            }
          }
        }
      }
    }
  } else {
    let nTenpai = 0;
    for (let i = 0; i < arTenpaiPlayerFlag.length; i++) {
      nTenpai += arTenpaiPlayerFlag[i];
    }
    let plus;
    let minus;
    if (nTenpai === 0 || nTenpai === 4) {
      plus = 0;
      minus = 0;
    } else {
      plus = 3000 / nTenpai;
      minus = -3000 / (4 - nTenpai);
    }
    for (let i = 0; i < arTenpaiPlayerFlag.length; i++) {
      if (arTenpaiPlayerFlag[i]) arScoreAdd[i] = plus;
      else arScoreAdd[i] = minus;
    }
  }
  return arScoreAdd;
};
