import { page } from './page';
import {
	nip19,
	validateEvent,
	Relay,
	getPublicKey,
	type NostrEvent,
	type VerifiedEvent,
} from 'nostr-tools';
import 'websocket-polyfill';
import { Mode, Signer } from './utils';
import { relayUrl, getNsecs, isDebug } from './config';
import { getResponseEvent } from './response';

if (!isDebug)
	page();

const main = async () => {
	//署名用秘密鍵を準備
	const nsecs: (string | undefined)[] = getNsecs();
	const [nsec_jongbari, nsec_rinrin, nsec_chunchun, nsec_whanwhan] = nsecs;
	if (nsecs.includes(undefined)) {
		throw Error('NOSTR_PRIVATE_KEY is undefined');
	}
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
	const pubkey_jongbari = getPublicKey(nip19.decode(nsec_jongbari as string).data as Uint8Array);

	//リレーに接続
	const relay = await Relay.connect(relayUrl);
	console.info(`connected to ${relay.url}`);

	//イベントの監視
	const filters = [
		{
			kinds: [42],
			'#p': Array.from(signermap.keys()),
			since: Math.floor(Date.now() / 1000)
		}
	];
	const onevent = async (ev: NostrEvent) => {
		if (!validateEvent(ev)) {
			console.error('Invalid event', ev);
			return;
		}
		//出力イベントを取得
		let responseEvents: VerifiedEvent[] = [];
		for (const pubkey of ev.tags.filter(tag => tag.length >= 2 && tag[0] === 'p' && Array.from(signermap.values()).map(signer => signer.getPublicKey()).includes(tag[1])).map(tag => tag[1])) {
			let rs: VerifiedEvent[] | null;
			const mode = pubkey === pubkey_jongbari ? Mode.Server : Mode.Client
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
		console.info('==========');
		console.info((new Date()).toISOString());
		console.info(`REQ from ${nip19.npubEncode(ev.pubkey)}\n${ev.content}`);
		if (responseEvents.length > 0) {
			const posts: Promise<string>[] = [];
			for (const responseEvent of responseEvents) {
				posts.push(relay.publish(responseEvent));
				console.info(`RES from ${nip19.npubEncode(responseEvent.pubkey)}\n${responseEvent.content}`);
			}
			await Promise.all(posts);
		}
	};
	const oneose = async () => {
		if (!isDebug) {
			//起きた報告
			const bootEvent = (signermap.get(pubkey_jongbari) as Signer).finishEvent({
				kind: 42,
				tags: [['e', 'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723', '', 'root']],
				content: '🌅',
				created_at: Math.floor(Date.now() / 1000),
			});
			await relay.publish(bootEvent);
		}
		//繋ぎっぱなしにする
	};
	const sub = relay.subscribe(
		filters,
		{ onevent, oneose }
	);
};

main().catch((e) => console.error(e));
