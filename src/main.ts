import type { VerifiedEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import WebSocket from 'ws';
import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  EventPacket,
  uniq,
} from 'rx-nostr';
import { verifier } from 'rx-nostr-crypto';
import { Subject } from 'rxjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { getTagsFav, Mode, Signer } from './utils.js';
import {
  relayUrls,
  isDebug,
  getServerSignerMap,
  getPlayerSignerMap,
  mahjongChannelId,
} from './config.js';
import { getResponseEvent } from './response.js';
import { page } from './page.js';

if (!isDebug) page();

const main = async () => {
  const serverSignerMap = getServerSignerMap();
  const playerSignerMap = getPlayerSignerMap();
  const signerMap = new Map<string, Signer>([
    ...serverSignerMap,
    ...playerSignerMap,
  ]);
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
            signerMap.has(tag[1]),
        )
        .map((tag) => tag[1]),
    );
    for (const pubkey of targetPubkeys) {
      let rs: VerifiedEvent[] | null;
      const mode = serverSignerMap.has(pubkey)
        ? Mode.Server
        : playerSignerMap.has(pubkey)
          ? Mode.Client
          : Mode.Unknown;
      try {
        rs = await getResponseEvent(ev, signerMap.get(pubkey)!, mode);
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
    for (const responseEvent of responseEvents) {
      rxNostr.send(responseEvent).subscribe((packet) => {
        console.info(
          `RES from ${nip19.npubEncode(responseEvent.pubkey)}\n${responseEvent.content}`,
        );
        console.log(packet);
      });
      await sleep(200);
    }
  };

  if (!isDebug) {
    const serverSigner = Array.from(serverSignerMap.values()).at(0)!;
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
      '#p': [serverSigner.getPublicKey()],
      '#e': [mahjongChannelId],
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
    '#p': Array.from(signerMap.keys()),
    '#e': [mahjongChannelId],
    since: now,
  });
};

main().catch((e) => console.error(e));
