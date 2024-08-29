import { type VerifiedEvent, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import WebSocket from 'ws';
import { setTimeout as sleep } from 'node:timers/promises';
import { getTagsFav, Mode, Signer } from './utils.js';
import { relayUrls, getNsecs, isDebug } from './config.js';
import { getResponseEvent } from './response.js';
import { page } from './page.js';
import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  EventPacket,
  uniq,
} from 'rx-nostr';
import { verifier } from 'rx-nostr-crypto';
import { Subject } from 'rxjs';

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
  const rxNostr = createRxNostr({
    verifier,
    websocketCtor: WebSocket,
  });
  rxNostr.setDefaultRelays(relayUrls);
  const rxReqB = createRxBackwardReq();
  const rxReqF1 = createRxForwardReq();
  const rxReqF2 = createRxForwardReq();
  const now = Math.floor(Date.now() / 1000);
  const flushes$ = new Subject<void>();

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
  const nextF1 = async (packet: EventPacket) => {
    const ev = packet.event;
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
  };
  const nextF2 = async (packet: EventPacket) => {
    const ev = packet.event;
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
        rs = await getResponseEvent(ev, signermap.get(pubkey)!, mode);
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
        rxNostr.send(responseEvent).subscribe((packet) => {
          console.info(
            `RES from ${nip19.npubEncode(responseEvent.pubkey)}\n${responseEvent.content}`,
          );
          console.log(packet);
        });
        await sleep(200);
      }
    }
  };

  if (!isDebug) {
    let bootEvent: VerifiedEvent;
    const nextB = (packet: EventPacket) => {
      bootEvent = signermap.get(pubkey_jongbari)!.finishEvent({
        kind: 7,
        tags: getTagsFav(packet.event),
        content: '🌅',
        created_at: Math.floor(Date.now() / 1000),
      });
    };
    const complete = async () => {
      //起きた報告
      rxNostr.send(bootEvent).subscribe((packet) => {
        console.info(
          `RES from ${nip19.npubEncode(bootEvent.pubkey)}\n${bootEvent.content}`,
        );
        console.log(packet);
      });
    };
    const subscriptionB = rxNostr
      .use(rxReqB)
      .pipe(uniq(flushes$))
      .subscribe({ next: nextB, complete });
    rxReqB.emit({
      kinds: [42],
      '#p': [signermap.get(pubkey_jongbari)!.getPublicKey()],
      until: now,
      limit: 1,
    });
    rxReqB.over();
  }
  //イベントの監視
  const subscriptionF1 = rxNostr
    .use(rxReqF1)
    .pipe(uniq(flushes$))
    .subscribe(nextF1);
  rxReqF1.emit({
    //do not sleep
    kinds: [1],
    since: now,
  });
  const subscriptionF2 = rxNostr
    .use(rxReqF2)
    .pipe(uniq(flushes$))
    .subscribe(nextF2);
  rxReqF2.emit({
    kinds: [42],
    '#p': Array.from(signermap.keys()),
    since: now,
  });
};

main().catch((e) => console.error(e));
