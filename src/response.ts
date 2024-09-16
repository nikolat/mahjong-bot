import { getEventHash, type UnsignedEvent, type EventTemplate, type NostrEvent, type VerifiedEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { Mode, Signer, getTagsAirrep, getTagsReply } from './utils.js';
import {
  mahjongGameStart,
  res_c_naku_call,
  res_c_sutehai_call,
  res_s_debug_call,
  res_s_gamestart_call,
  res_s_join_call,
  res_s_naku_call,
  res_s_reset_call,
  res_s_status_call,
  res_s_sutehai_call,
  startKyoku,
} from './mj_main.js';
import { getServerSignerMap } from './config.js';

const status_kind = 30315;

export const getResponseEvent = async (requestEvent: NostrEvent, signer: Signer, mode: Mode): Promise<VerifiedEvent[] | null> => {
  if (requestEvent.pubkey === signer.getPublicKey()) {
    //自分自身の投稿には反応しない
    return null;
  }
  const res = await selectResponse(requestEvent, mode, signer);
  if (res === null) {
    return null;
  }
  const unsignedEvents: UnsignedEvent[] = res.map((ev) => {
    return {
      ...ev,
      pubkey: signer.getPublicKey(),
    };
  });
  return mineNonceForSort(unsignedEvents).map((ev) => signer.finishEvent(ev));
};

const mineNonceForSort = (events: UnsignedEvent[]): UnsignedEvent[] => {
  const id_max = parseInt('f'.repeat(64), 16);
  const diff = id_max / events.length;
  let i = 0;
  for (let ev of [...events].reverse()) {
    let nonce_n = 0;
    while (!(diff * i <= parseInt(getEventHash(ev), 16) && parseInt(getEventHash(ev), 16) < diff * (i + 1))) {
      const nonceTag = ev.tags.find((tag) => tag.length >= 2 && tag[0] === 'nonce');
      if (nonceTag !== undefined) {
        nonceTag[1] = String(nonce_n++);
      } else {
        ev.tags.push(['nonce', String(nonce_n)]);
      }
    }
    i++;
  }
  return events;
};

const selectResponse = async (event: NostrEvent, mode: Mode, signer: Signer): Promise<EventTemplate[] | null> => {
  const res = await mode_select(event, mode, signer);
  if (res === null) {
    return null;
  }
  const templateEvents: EventTemplate[] = [];
  for (const ev of res) {
    const [content, kind, tags, created_at] = [...ev, event.created_at + 1];
    const templateEvent: EventTemplate = { kind, tags, content, created_at };
    templateEvents.push(templateEvent);
  }
  return templateEvents;
};

const getResmap = (
  mode: Mode,
): [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp, signer: Signer) => [string, number, string[][]][] | null | Promise<null>][] => {
  const resmapServer: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, number, string[][]][] | null][] = [
    [/ping$/, res_ping],
    [/help$/, res_help],
    [/^(nostr:npub1\w{58}\s+)?gamestart/, res_s_gamestart],
    [/join$/, res_s_join],
    [/next$/, res_s_next],
    [/reset$/, res_s_reset],
    [/status$/, res_s_status],
    [/debug\s+(([1-9][mpsz])+)$/, res_s_debug],
    [/sutehai\?\s(sutehai|ankan|kakan|richi|tsumo)\s?([1-9][mpsz])?/, res_s_sutehai],
    [/^(tsumo)$/, res_s_sutehai],
    [/^(sutehai|ankan|kakan|richi)?\s?([1-9][mpsz])/, res_s_sutehai],
    [/naku\?\s(no|ron|kan|pon|chi)\s?([1-9][mpsz])?\s?([1-9][mpsz])?/, res_s_naku],
    [/^(no|ron|kan|pon|chi(\s([1-9][mpsz])){2})$/, res_s_naku],
  ];
  const resmapClient: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, number, string[][]][] | null][] = [
    [/ping$/, res_ping],
    [/join$/, res_c_join],
    [/gamestart$/, res_c_gamestart],
    [/GET\ssutehai\?$/s, res_c_sutehai],
    [/GET\snaku\?\s(((ron|kan|pon|chi)\s)*(ron|kan|pon|chi))$/s, res_c_naku],
  ];
  switch (mode) {
    case Mode.Server:
      return resmapServer;
    case Mode.Client:
      return resmapClient;
    default:
      throw new TypeError(`unknown mode: ${mode}`);
  }
};

const mode_select = async (event: NostrEvent, mode: Mode, signer: Signer): Promise<[string, number, string[][]][] | null> => {
  const resmap = getResmap(mode);
  for (const [reg, func] of resmap) {
    if (reg.test(event.content)) {
      return await func(event, mode, reg, signer);
    }
  }
  return null;
};

const res_ping = (event: NostrEvent): [string, number, string[][]][] => {
  return [['pong', event.kind, getTagsReply(event)]];
};

const res_help = (event: NostrEvent): [string, number, string[][]][] => {
  const content = [
    '【麻雀サーバーbot(私)の使い方】',
    'ping: pongと返します',
    'gamestart: ゲーム開始 メンバーを4人まで募集します',
    'join: ゲームに参加 募集中のゲームに参加します',
    'next: 次の局に移ります',
    'reset: データをクリアします',
    'status: 現在の場の状況を表示します',
    'sutehai? (sutehai|ankan|kakan|richi|tsumo) <牌>: 捨て牌を求められたコマンドに応答します',
    '(例1: sutehai? sutehai 1p, 例2: sutehai? richi 7z, 例3: sutehai? tsumo)',
    'naku? (no|ron|kan|pon|chi) <牌1> <牌2>: 鳴く判断を求められたコマンドに応答します',
    '(例1: naku? no, 例2: naku? pon, 例3: naku? chi 1m 3m)',
    '(sutehai? および naku? は省略可能)(sutehaiも省略可能で単に "7z" で捨て牌となる)',
    'help: このヘルプを表示します',
    '【麻雀クライアントbotの使い方】',
    'gamestart: 麻雀サーバーbotに "gamestart" とメンションします',
    'join: 麻雀サーバーbotに "join" とメンションします',
    'nostr:npub1rnrnclxznfkqqu8nnpt0mwp4hj0xe005mnwjqlafaluv7n2kn80sy53aq2',
    'nostr:npub1chunacswmcejn8ge95vzl22a2g6pd4nfchygslnt9gj9dshqcvqq5amrlj',
    'nostr:npub1whanysx54uf9tgjfeueljg3498kyru3rhwxajwuzh0nw0x0eujss9tlcjh',
    'nostr:npub18ee7ggjpp4uf77aurecqhtfpz5y0j95pd9hadrdsxt5we3pysnnqe8k224',
  ];
  return [[content.join('\n'), event.kind, getTagsReply(event)]];
};

const res_s_gamestart = (event: NostrEvent): [string, number, string[][]][] | null => {
  const status = res_s_gamestart_call(event.pubkey);
  return [
    ['Waiting for players.\nMention "join" to me.', event.kind, getTagsAirrep(event)],
    [status, status_kind, [['d', 'general']]],
  ];
};

const res_s_join = (event: NostrEvent): [string, number, string[][]][] | null => {
  let res_join: [number, string];
  try {
    res_join = res_s_join_call(event.pubkey);
  } catch (error) {
    let mes = 'unknown error';
    if (error instanceof Error) {
      mes = error.message;
    }
    return [[mes, event.kind, getTagsReply(event)]];
  }
  const [count, status] = res_join;
  if (count === 4) {
    return mahjongGameStart(event);
  } else {
    return [
      [`${count}/4 joined.`, event.kind, getTagsAirrep(event)],
      [status, status_kind, [['d', 'general']]],
    ];
  }
};

const res_s_next = (event: NostrEvent): [string, number, string[][]][] | null => {
  return startKyoku(event);
};

const res_s_reset = (event: NostrEvent): [string, number, string[][]][] | null => {
  res_s_reset_call();
  return [
    ['Data cleared.', event.kind, getTagsAirrep(event)],
    ['', status_kind, [['d', 'general']]],
  ];
};

const res_s_status = (event: NostrEvent): [string, number, string[][]][] | null => {
  const res = res_s_status_call(event);
  return res.map((r) => [r[0], event.kind, r[1]]);
};

const res_s_debug = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, number, string[][]][] | null => {
  const match = event.content.match(regstr);
  if (match === null) {
    throw new Error();
  }
  const yama: string = match[1];
  res_s_debug_call(yama);
  return [['Debug mode.', event.kind, getTagsAirrep(event)]];
};

const res_s_sutehai = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, number, string[][]][] => {
  const match = event.content.match(regstr);
  if (match === null) {
    throw new Error();
  }
  const action = match[1] ?? 'sutehai';
  const pai = match[2];
  if (action !== 'tsumo' && !pai) return [['usage: sutehai? sutehai <pi>', event.kind, getTagsReply(event)]];
  return res_s_sutehai_call(event, action, pai);
};

const res_s_naku = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, number, string[][]][] | null => {
  const match = event.content.match(regstr);
  if (match === null) {
    throw new Error();
  }
  const action = match[1];
  const pai1 = match[2];
  const pai2 = match[3];
  if (action === 'chi' && !(/[1-9][mspz]/.test(pai1) && /[1-9][mspz]/.test(pai2)))
    return [['usage: naku? chi <pi1> <pi2>', event.kind, getTagsReply(event)]];
  return res_s_naku_call(event, action, pai1, pai2);
};

const serverPubkey = Array.from(getServerSignerMap().keys()).at(0)!;

const res_c_join = (event: NostrEvent): [string, number, string[][]][] => {
  return [[`nostr:${nip19.npubEncode(serverPubkey)} join`, event.kind, [...getTagsAirrep(event), ['p', serverPubkey, '']]]];
};

const res_c_gamestart = (event: NostrEvent): [string, number, string[][]][] => {
  return [[`nostr:${nip19.npubEncode(serverPubkey)} gamestart`, event.kind, [...getTagsAirrep(event), ['p', serverPubkey, '']]]];
};

const res_c_sutehai = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, number, string[][]][] => {
  const res = res_c_sutehai_call(event);
  return res.map((r) => [r[0], event.kind, r[1]]);
};

const res_c_naku = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, number, string[][]][] => {
  const match = event.content.match(regstr);
  if (match === null) {
    throw new Error();
  }
  const command = match[1].split(/\s/);
  const res = res_c_naku_call(event, command);
  return res.map((r) => [r[0], event.kind, r[1]]);
};
