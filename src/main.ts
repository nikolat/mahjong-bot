import { page } from './page';
import {
	relayInit,
	nip19,
	validateEvent,
	verifySignature,
	type VerifiedEvent,
	type Relay,
} from 'nostr-tools';
import 'websocket-polyfill';
import { Mode, Signer } from './utils';
import { getResponseEvent } from './response';

const isDebug = false;

const relayUrlToRead = 'wss://yabu.me';
const relayUrlToWrite = 'wss://relay.nostr.wirednet.jp';
const mode = Mode.Reply;

const post = async (relay: Relay, ev: VerifiedEvent) => {
	await relay.publish(ev);
};

const main = async () => {
	//署名用秘密鍵を準備
	const nsec = process.env.NOSTR_PRIVATE_KEY;
	if (nsec === undefined) {
		throw Error('NOSTR_PRIVATE_KEY is undefined');
	}
	const dr = nip19.decode(nsec);
	if (dr.type !== 'nsec') {
		throw Error('NOSTR_PRIVATE_KEY is not `nsec`');
	}
	const seckey = dr.data;
	const signer = new Signer(seckey);

	//リレーに接続
	const relayRead = relayInit(relayUrlToRead);
	relayRead.on('error', () => {
		throw Error('failed to connect');
	});
	await relayRead.connect();
	console.info(`connected to ${relayUrlToRead}`);
	const relayWrite = relayInit(relayUrlToWrite);
	relayWrite.on('error', () => {
		throw Error('failed to connect');
	});
	await relayWrite.connect();
	console.info(`connected to ${relayUrlToWrite}`);

	//起きた報告
	const bootEvent = signer.finishEvent({
		kind: 42,
		tags: [['e', 'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723', '', 'root']],
		content: '🌅',
		created_at: Math.floor(Date.now() / 1000),
	});
	if (!isDebug)
		await post(relayWrite, bootEvent);

	//イベントの監視
	const sub = relayRead.sub([{kinds: [42], '#p': [ signer.getPublicKey() ], since: Math.floor(Date.now() / 1000)}]);
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
		let responseEvents: VerifiedEvent[] | null;
		try {
			responseEvents = await getResponseEvent(ev, signer, mode);
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
		//出力
		if (responseEvents === null) {
			return;
		}
		console.info(responseEvents);
		for (const responseEvent of responseEvents) {
			await post(relayWrite, responseEvent);
		}
	});
};

main().catch((e) => console.error(e));

if (!isDebug)
	page();
