import { page } from './page';
import {
	relayInit,
	nip19,
	validateEvent,
	verifySignature,
	type VerifiedEvent,
	type Relay,
	getPublicKey,
} from 'nostr-tools';
import 'websocket-polyfill';
import { Mode, Signer } from './utils';
import { getResponseEvent } from './response';

const isDebug = false;

const relayUrl = 'wss://relay.nostr.wirednet.jp';

const post = async (relay: Relay, ev: VerifiedEvent) => {
	await relay.publish(ev);
};

const main = async () => {
	//署名用秘密鍵を準備
	const nsec_jongbari = process.env.NOSTR_PRIVATE_KEY_JONGBARI;
	const nsec_rinrin = process.env.NOSTR_PRIVATE_KEY_RINRIN;
	const nsec_chunchun = process.env.NOSTR_PRIVATE_KEY_CHUNCHUN;
	const nsec_whanwhan = process.env.NOSTR_PRIVATE_KEY_WHANWHAN;
	if ([nsec_jongbari, nsec_rinrin, nsec_chunchun, nsec_whanwhan].includes(undefined)) {
		throw Error('NOSTR_PRIVATE_KEY is undefined');
	}
	const nsecs = [nsec_jongbari, nsec_rinrin, nsec_chunchun, nsec_whanwhan];
	const signermap = new Map<string, Signer>();
	for (const nsec of nsecs) {
		const dr = nip19.decode(nsec as string);
		if (dr.type !== 'nsec') {
			throw Error('NOSTR_PRIVATE_KEY is not `nsec`');
		}
		const seckey = dr.data;
		const signer = new Signer(seckey);
		signermap.set(signer.getPublicKey(), signer);
	}

	//リレーに接続
	const relay = relayInit(relayUrl);
	relay.on('error', () => {
		throw Error('failed to connect');
	});
	await relay.connect();
	console.info(`connected to ${relayUrl}`);

	//起きた報告
	const bootEvent = signermap.get(getPublicKey(nip19.decode(nsec_jongbari as string).data as string))?.finishEvent({
		kind: 42,
		tags: [['e', 'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723', '', 'root']],
		content: '🌅',
		created_at: Math.floor(Date.now() / 1000),
	});
	if (!isDebug && bootEvent !== undefined)
		await post(relay, bootEvent);

	//イベントの監視
	const sub = relay.sub([{kinds: [42], '#p': Array.from(signermap.values()).map(signer => signer.getPublicKey()), since: Math.floor(Date.now() / 1000)}]);
	sub.on('event', async (ev) => {
		if (!validateEvent(ev)) {
			console.error('Invalid event', ev);
			return;
		}
		if (!verifySignature(ev)) {
			console.error('Unverified event', ev);
			return;
		}
		//出力イベントを取得
		let responseEvents: VerifiedEvent[] = [];
		for (const pubkey of ev.tags.filter(tag => tag.length >= 2 && tag[0] === 'p' && Array.from(signermap.values()).map(signer => signer.getPublicKey()).includes(tag[1])).map(tag => tag[1])) {
			let rs: VerifiedEvent[] | null;
			const mode = pubkey === getPublicKey(nip19.decode(nsec_jongbari as string).data as string) ? Mode.Server : Mode.Client
			try {
				rs = await getResponseEvent(ev, signermap.get(pubkey) as Signer, mode);
			} catch (error) {
				if (error instanceof Error) {
					console.error(error.message);
					return;
				}
				else {
					console.error(error);
					return;
				}
			}
			if (rs !== null) {
				responseEvents = responseEvents.concat(rs);
			}
		}
		//出力
		console.info(responseEvents);
		for (const responseEvent of responseEvents) {
			await post(relay, responseEvent);
		}
	});
};

main().catch((e) => console.error(e));

if (!isDebug)
	page();
