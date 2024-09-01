import type { VerifiedEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import WebSocket from 'ws';
import {
  createRxForwardReq,
  createRxNostr,
  uniq,
  type EventPacket,
} from 'rx-nostr';
import { verifier } from 'rx-nostr-crypto';
import { Subject } from 'rxjs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  getNowWithoutSecond,
  Mode,
  sendBootReaction,
  sendRequestPassport,
  Signer,
} from './utils.js';
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
  const rxNostr = createRxNostr({
    verifier,
    websocketCtor: WebSocket,
  });
  rxNostr.setDefaultRelays(relayUrls);

  let lastKind1Time = getNowWithoutSecond();
  const nextF1 = async (packet: EventPacket) => {
    //do not sleep
    const nowKind1Time = getNowWithoutSecond();
    if (lastKind1Time < nowKind1Time) {
      lastKind1Time = nowKind1Time;
      const mes = `[${new Date(lastKind1Time * 1000).toISOString()}]`;
      console.log(mes);
      const d = new Date();
      if (d.getHours() === 0 && d.getMinutes() === 0) {
        for (const signer of signerMap.values()) {
          sendRequestPassport(rxNostr, signer);
          await sleep(60 * 1000);
        }
      }
    }
  };
  const nextF2 = async (packet: EventPacket) => {
    const ev = packet.event;
    //出力イベントを取得
    let responseEvents: VerifiedEvent[] = [];
    const targetPubkeys = new Set(
      ev.tags
        .filter(
          (tag) => tag.length >= 2 && tag[0] === 'p' && signerMap.has(tag[1]),
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

  const flushes$ = new Subject<void>();
  if (!isDebug) {
    const serverSigner = Array.from(serverSignerMap.values()).at(0)!;
    sendBootReaction(rxNostr, flushes$, serverSigner);
  }
  //イベントの監視
  const now = Math.floor(Date.now() / 1000);
  const rxReqF1 = createRxForwardReq();
  const subscriptionF1 = rxNostr
    .use(rxReqF1)
    .pipe(uniq(flushes$))
    .subscribe(nextF1);
  rxReqF1.emit({
    //do not sleep
    kinds: [1],
    since: now,
  });
  const rxReqF2 = createRxForwardReq();
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
