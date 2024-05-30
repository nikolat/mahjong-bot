import { nip47 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import * as nip57 from 'nostr-tools/nip57';
import { Relay } from 'nostr-tools/relay';
import type { Filter } from 'nostr-tools/filter';
import type { NostrEvent } from 'nostr-tools/core';
import { Mode, Signer } from './utils.js';
import { hexToBytes } from '@noble/hashes/utils';
import { relayUrl } from './config.js';

const res_ohayo = async (event: NostrEvent, mode: Mode, regstr: RegExp, signer: Signer, pool: SimplePool): Promise<null> => {
	await ohayou_zap(event, signer, pool);
	return null;
};

const ohayou_zap = async (event: NostrEvent, signer: Signer, pool: SimplePool): Promise<void> => {
	const h = ((new Date()).getHours() + 9) % 24;
	if (5 <= h && h < 8) {
		await zapByNIP47(event, signer, pool, 3, any(['早起きのご褒美やで', '健康的でええな', 'みんなには内緒やで']));
	}
};

const zapByNIP47 = async (event: NostrEvent, signer: Signer, pool: SimplePool, sats: number, zapComment: string): Promise<void> => {
	const wc = process.env.NOSTR_WALLET_CONNECT;
	if (wc === undefined) {
		throw Error('NOSTR_WALLET_CONNECT is undefined');
	}
	const { pathname, hostname, searchParams } = new URL(wc);
	const walletPubkey = pathname || hostname;
	const walletRelay = searchParams.get('relay');
	const walletSeckey = searchParams.get('secret');

	const evKind0 = await getKind0(pool, event);
	const zapEndpoint = await nip57.getZapEndpoint(evKind0);
	if (walletPubkey.length === 0 || walletRelay === null || walletSeckey === null || zapEndpoint === null) {
		return;
	}

	const lastZap = await getLastZap(event.pubkey);
	if (lastZap !== undefined && Math.floor(Date.now() / 1000) - lastZap.created_at < 60 * 10) {//10分以内に誰かからZapをもらっている
		const evKind9734 = JSON.parse(lastZap.tags.find(tag => tag[0] === 'description')?.at(1) ?? '{}');
		if (evKind9734.pubkey === signer.getPublicKey()) {//自分からのZap
			console.log('[lastZap]', evKind9734);
			return;
		}
	}

	const amount = sats * 1000;
	const zapRequest = nip57.makeZapRequest({
		profile: event.pubkey,
		event: event.id,
		amount,
		comment: zapComment,
		relays: relayUrl,
	});
	const zapRequestEvent = signer.finishEvent(zapRequest);
	const encoded = encodeURI(JSON.stringify(zapRequestEvent));

	const url = `${zapEndpoint}?amount=${amount}&nostr=${encoded}`;

	const response = await fetch(url);
	if (!response.ok) {
		return;
	}
	const { pr: invoice } = await response.json();

	const ev = await nip47.makeNwcRequestEvent(walletPubkey, hexToBytes(walletSeckey), invoice);
	const wRelay = await Relay.connect(walletRelay);
	try {
		await wRelay.publish(ev);
	} catch (error) {
		console.warn(error);
	}
	wRelay.close();
};

const getKind0 = async (pool: SimplePool, event: NostrEvent): Promise<NostrEvent> => {
	return new Promise(async (resolve) => {
		let r: NostrEvent;
		const filters = [
			{
				kinds: [0],
				authors: [event.pubkey],
			}
		];
		const onevent = async (ev: NostrEvent) => {
			if (r === undefined || r.created_at < ev.created_at) {
				r = ev;
			}
		};
		const oneose = async () => {
			sub.close();
			resolve(r);
		};
		const sub = pool.subscribeMany(
			relayUrl,
			filters,
			{ onevent, oneose }
		);
	});
};

const getLastZap = async (targetPubkey: string): Promise<NostrEvent | undefined> => {
	const relayURL = 'wss://relay.nostr.band';
	const relay = await Relay.connect(relayURL);
	return new Promise(async (resolve) => {
		let r: NostrEvent | undefined;
		const filters: Filter[] = [
			{
				kinds: [9735],
				'#p': [targetPubkey],
				limit: 1
			}
		];
		const onevent = async (ev: NostrEvent) => {
			r = ev;
		};
		const oneose = async () => {
			sub.close();
			relay.close();
			resolve(r);
		};
		const sub = relay.subscribe(
			filters,
			{ onevent, oneose }
		);
	});
};

const any = (array: string[]): string => {
	return array[Math.floor(Math.random() * array.length)];
};
