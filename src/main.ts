import type { VerifiedEvent } from 'nostr-tools/pure';
import type { Signer } from 'nostr-tools/signer';
import * as nip19 from 'nostr-tools/nip19';
import { createRxForwardReq, createRxNostr, uniq, type EventPacket } from 'rx-nostr';
import { verifier } from '@rx-nostr/crypto';
import { Subject } from 'rxjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { getNowWithoutSecond, Mode, sendBootReaction, sendRequestPassport, zapSplit } from './utils.js';
import { relayUrls, isDebug, getServerSignerMap, getPlayerSignerMap, mahjongChannelIds } from './config.js';
import { getResponseEvent } from './response.js';
import { page } from './page.js';

if (!isDebug) page();

const main = async () => {
  const serverSignerMap = await getServerSignerMap();
  const playerSignerMap = await getPlayerSignerMap();
  const signerMap = new Map<string, Signer>([...serverSignerMap, ...playerSignerMap]);
  const rxNostr = createRxNostr({
    verifier,
    websocketCtor: WebSocket,
  });
  rxNostr.setDefaultRelays(relayUrls);

  let lastKind1Time = getNowWithoutSecond();
  const nextF1 = async (_packet: EventPacket) => {
    //do not sleep
    const nowKind1Time = getNowWithoutSecond();
    if (lastKind1Time < nowKind1Time) {
      lastKind1Time = nowKind1Time;
      const mes = `[${new Date(lastKind1Time * 1000).toISOString()}]`;
      console.log(mes);
      const d = new Date();
      if ([1, 6].includes(d.getDate() % 10) && d.getHours() === 0 && d.getMinutes() === 0) {
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
    const targetPubkeys = new Set(ev.tags.filter((tag) => tag.length >= 2 && tag[0] === 'p' && signerMap.has(tag[1])).map((tag) => tag[1]));
    for (const pubkey of targetPubkeys) {
      let rs: VerifiedEvent[] | null;
      const mode = serverSignerMap.has(pubkey) ? Mode.Server : playerSignerMap.has(pubkey) ? Mode.Client : Mode.Unknown;
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
      while (Math.floor(Date.now() / 1000) < responseEvent.created_at) {
        await sleep(200);
      }
      rxNostr.send(responseEvent).subscribe((packet) => {
        console.info(`RES from ${nip19.npubEncode(responseEvent.pubkey)}\n${responseEvent.content}`);
        console.log(packet);
      });
      await sleep(200);
    }
  };
  const nextF3 = (packet: EventPacket) => {
    console.log('[Zap]');
    console.log(packet);
    const pubkey = packet.event.tags.find((tag) => tag.length >= 2 && tag[0] === 'p')?.at(1);
    if (pubkey === undefined) {
      return;
    }
    const signer = serverSigners.find(async (signer) => (await signer.getPublicKey()) === pubkey);
    if (signer === undefined) {
      return;
    }
    zapSplit(rxNostr, packet.event, signer);
  };

  const nextF = (packet: EventPacket) => {
    switch (packet.event.kind) {
      case 1:
        nextF1(packet);
        break;
      case 42:
      case 20000:
        nextF2(packet);
        break;
      case 9735:
        nextF3(packet);
        break;
      default:
        break;
    }
  };

  const serverSigners = Array.from(serverSignerMap.values());
  if (!isDebug) {
    for (const serverSigner of serverSigners) {
      sendBootReaction(rxNostr, serverSigner);
    }
  }
  //イベントの監視
  const flushes$ = new Subject<void>();
  const now = Math.floor(Date.now() / 1000);
  const rxReqF = createRxForwardReq();
  const _subscriptionF = rxNostr.use(rxReqF).pipe(uniq(flushes$)).subscribe(nextF);
  rxReqF.emit([
    {
      kinds: [1],
      since: now,
    },
    {
      kinds: [42, 20000],
      '#p': Array.from(signerMap.keys()),
      '#e': mahjongChannelIds,
      since: now,
    },
    {
      kinds: [9735],
      '#p': Array.from(serverSignerMap.keys()),
      since: now,
    },
  ]);
};

main().catch((e) => console.error(e));
