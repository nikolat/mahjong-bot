import type { Filter } from 'nostr-tools/filter';
import {
  type NostrEvent,
  type VerifiedEvent,
  getPublicKey,
  validateEvent,
} from 'nostr-tools/pure';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import * as nip19 from 'nostr-tools/nip19';
import WebSocket from 'ws';
useWebSocketImplementation(WebSocket);
import { setTimeout as sleep } from 'node:timers/promises';
import { Mode, Signer } from './utils.js';
import { relayUrl, getNsecs, isDebug } from './config.js';
import { getResponseEvent } from './response.js';
import { page } from './page.js';

if (!isDebug) page();

const main = async () => {
  //署名用秘密鍵を準備
  const nsecs: (string | undefined)[] = getNsecs();
  const [
    nsec_jongbari,
    nsec_rinrin,
    nsec_chunchun,
    nsec_whanwhan,
    nsec_bee,
    nsec_unyu,
  ] = nsecs;
  if (nsecs.includes(undefined)) {
    throw Error('NOSTR_PRIVATE_KEY is undefined');
  }
  const signermap = new Map<string, Signer>();
  for (const nsec of nsecs) {
    const dr = nip19.decode(nsec!);
    if (dr.type !== 'nsec') {
      throw Error('NOSTR_PRIVATE_KEY is not `nsec`');
    }
    const seckey = dr.data;
    const signer = new Signer(seckey);
    signermap.set(signer.getPublicKey(), signer);
  }
  const pubkey_jongbari = getPublicKey(
    nip19.decode(nsec_jongbari!).data as Uint8Array,
  );
  const pubkey_rinrin = getPublicKey(
    nip19.decode(nsec_rinrin!).data as Uint8Array,
  );
  const pubkey_chunchun = getPublicKey(
    nip19.decode(nsec_chunchun!).data as Uint8Array,
  );
  const pubkey_whanwhan = getPublicKey(
    nip19.decode(nsec_whanwhan!).data as Uint8Array,
  );
  const pubkey_bee = getPublicKey(nip19.decode(nsec_bee!).data as Uint8Array);
  const pubkey_unyu = getPublicKey(nip19.decode(nsec_unyu!).data as Uint8Array);

  //リレーに接続
  const pool = new SimplePool();

  //イベントの監視
  const now = Math.floor(Date.now() / 1000);
  const filters: Filter[] = [
    {
      kinds: [42],
      '#p': Array.from(signermap.keys()),
      since: now,
    },
    {
      //do not sleep
      kinds: [1],
      since: now,
    },
  ];
  const d = new Date();
  let lastKind1Time = Math.floor(
    new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
    ).getTime() / 1000,
  );
  const onevent = async (ev: NostrEvent) => {
    if (ev.kind === 1) {
      //do not sleep
      const d2 = new Date();
      const nowKind1Time = Math.floor(
        new Date(
          d2.getFullYear(),
          d2.getMonth(),
          d2.getDate(),
          d2.getHours(),
          d2.getMinutes(),
        ).getTime() / 1000,
      );
      if (lastKind1Time < nowKind1Time) {
        lastKind1Time = nowKind1Time;
        const mes = `[${new Date(lastKind1Time * 1000).toISOString()}]`;
        console.log(mes);
      }
      return;
    }
    //出力イベントを取得
    let responseEvents: VerifiedEvent[] = [];
    const targetPubkeys = new Set(
      ev.tags
        .filter(
          (tag) =>
            tag.length >= 2 &&
            tag[0] === 'p' &&
            Array.from(signermap.values())
              .map((signer) => signer.getPublicKey())
              .includes(tag[1]),
        )
        .map((tag) => tag[1]),
    );
    for (const pubkey of targetPubkeys) {
      let rs: VerifiedEvent[] | null;
      const mode =
        pubkey === pubkey_jongbari
          ? Mode.Server
          : [
                pubkey_rinrin,
                pubkey_chunchun,
                pubkey_whanwhan,
                pubkey_bee,
                pubkey_unyu,
              ].includes(pubkey)
            ? Mode.Client
            : Mode.Unknown;
      try {
        rs = await getResponseEvent(ev, signermap.get(pubkey)!, mode, pool);
      } catch (error) {
        console.error(error);
        return;
      }
      if (rs !== null) {
        responseEvents = responseEvents.concat(rs);
      }
    }
    //出力
    console.info('==========');
    console.info(new Date().toISOString());
    console.info(`REQ from ${nip19.npubEncode(ev.pubkey)}\n${ev.content}`);
    if (responseEvents.length > 0) {
      for (const responseEvent of responseEvents) {
        const results = await Promise.allSettled(
          pool.publish(relayUrl, responseEvent),
        );
        console.info(
          `RES from ${nip19.npubEncode(responseEvent.pubkey)}\n${responseEvent.content}`,
        );
        console.log(results);
        await sleep(100);
      }
    }
  };
  const oneose = async () => {
    if (!isDebug) {
      //起きた報告
      const filters2 = [
        {
          kinds: [42],
          '#p': [signermap.get(pubkey_jongbari)!.getPublicKey()],
          limit: 1,
        },
      ];
      let bootEvent: VerifiedEvent;
      const onevent2 = async (ev2: NostrEvent) => {
        bootEvent = signermap.get(pubkey_jongbari)!.finishEvent({
          kind: 7,
          tags: getTagsFav(ev2),
          content: '🌅',
          created_at: Math.floor(Date.now() / 1000),
        });
      };
      const oneose2 = async () => {
        const results = await Promise.allSettled(
          pool.publish(relayUrl, bootEvent),
        );
        console.log(results);
        sub2.close();
      };
      const sub2 = pool.subscribeMany(relayUrl, filters2, {
        onevent: onevent2,
        oneose: oneose2,
      });
      const getTagsFav = (event: NostrEvent): string[][] => {
        const tagsFav: string[][] = [
          ...event.tags.filter(
            (tag) =>
              tag.length >= 2 &&
              (tag[0] === 'e' || (tag[0] === 'p' && tag[1] !== event.pubkey)),
          ),
          ['e', event.id, '', ''],
          ['p', event.pubkey, ''],
          ['k', String(event.kind)],
        ];
        return tagsFav;
      };
    }
    //繋ぎっぱなしにする
  };

  const sub = pool.subscribeMany(relayUrl, filters, { onevent, oneose });
};

main().catch((e) => console.error(e));
