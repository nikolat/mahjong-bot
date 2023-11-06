import {
	relayInit,
	nip19,
	VerifiedEvent,
	validateEvent,
	verifySignature,
} from 'nostr-tools';
import 'websocket-polyfill';
import { Mode, Signer } from './utils';
import { getResponseEvent } from './response';

const relayUrl = 'wss://yabu.me';
const mode = Mode.Reply;

const main = async () => {
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
	//入力イベントを準備
	const relay = relayInit(relayUrl);
	relay.on('error', () => {
		throw Error('failed to connect');
	});
	await relay.connect();
	console.info('connected to relay');

	const sub = relay.sub([{kinds: [1, 42], '#p': [ signer.getPublicKey() ], since: Math.floor(Date.now() / 1000)}]);

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
		let responseEvent: VerifiedEvent | null;
		try {
			responseEvent = await getResponseEvent(ev, signer, mode);
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
		if (responseEvent === null) {
			return;
		}
		await relay.publish(responseEvent);
	});
};

main().catch((e) => console.error(e));
