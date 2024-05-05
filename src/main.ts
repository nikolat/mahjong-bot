import { page } from './page';
import {
	nip19,
	validateEvent,
	SimplePool,
	getPublicKey,
	type Filter,
	type NostrEvent,
	type VerifiedEvent,
	useWebSocketImplementation,
} from 'nostr-tools';
useWebSocketImplementation(require('ws'));
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
	const pubkey_rinrin = getPublicKey(nip19.decode(nsec_rinrin as string).data as Uint8Array);
	const pubkey_chunchun = getPublicKey(nip19.decode(nsec_chunchun as string).data as Uint8Array);
	const pubkey_whanwhan = getPublicKey(nip19.decode(nsec_whanwhan as string).data as Uint8Array);
//	const pubkey_unyu = getPublicKey(nip19.decode(nsec_unyu as string).data as Uint8Array);

	//リレーに接続
	const pool = new SimplePool();

	//イベントの監視
	const now = Math.floor(Date.now() / 1000);
	const filters: Filter[] = [
		{
			kinds: [42],
			'#p': Array.from(signermap.keys()),
			since: now
		},
//		{
//			kinds: [1, 42],
//			'#p': [pubkey_unyu],
//			since: now
//		}
	];
	const onevent = async (ev: NostrEvent) => {
		if (!validateEvent(ev)) {
			console.error('Invalid event', ev);
			return;
		}
		//出力イベントを取得
		let responseEvents: VerifiedEvent[] = [];
		const targetPubkeys = new Set(ev.tags.filter(tag => tag.length >= 2 && tag[0] === 'p' && Array.from(signermap.values()).map(signer => signer.getPublicKey()).includes(tag[1])).map(tag => tag[1]));
//		if (/^うにゅう(([くさた]|ちゃ)ん)?、/.test(ev.content)) {
//			targetPubkeys.add(pubkey_unyu);
//		}
		for (const pubkey of targetPubkeys) {
			let rs: VerifiedEvent[] | null;
			const mode = pubkey === pubkey_jongbari ? Mode.Server
				: [pubkey_rinrin, pubkey_chunchun, pubkey_whanwhan].includes(pubkey) ? Mode.Client
//				: pubkey === pubkey_unyu ? Mode.Unyu
				: Mode.Unyu
			try {
				rs = await getResponseEvent(ev, signermap.get(pubkey) as Signer, mode, pool);
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
		console.info((new Date()).toISOString());
		console.info(`REQ from ${nip19.npubEncode(ev.pubkey)}\n${ev.content}`);
		if (responseEvents.length > 0) {
			const posts: Promise<string>[] = [];
			for (const responseEvent of responseEvents) {
				posts.concat(pool.publish(relayUrl, responseEvent));
				console.info(`RES from ${nip19.npubEncode(responseEvent.pubkey)}\n${responseEvent.content}`);
			}
			try {
				for (const post of posts) {
					const results = await post;
					console.log(results);
				}
			} catch (error) {
				console.error(error);
			}
		}
	};
	const oneose = async () => {
		if (!isDebug) {
			//起きた報告
			const filters2 = [
				{
					kinds: [42],
					'#p': [(signermap.get(pubkey_jongbari) as Signer).getPublicKey()],
					limit: 1
				}
			];
			let bootEvent: VerifiedEvent;
			const onevent2 = async (ev2: NostrEvent) => {
				bootEvent = (signermap.get(pubkey_jongbari) as Signer).finishEvent({
					kind: 7,
					tags: getTagsFav(ev2),
					content: '🌅',
					created_at: Math.floor(Date.now() / 1000),
				});
			};
			const oneose2 = async () => {
				const results = await Promise.allSettled(pool.publish(relayUrl, bootEvent));
				console.log(results);
				sub2.close();
			};
			const sub2 = pool.subscribeMany(
				relayUrl,
				filters2,
				{ onevent: onevent2, oneose: oneose2 }
			);
			const getTagsFav = (event: NostrEvent): string[][] => {
				const tagsFav: string[][] = event.tags.filter(tag => tag.length >= 2 && (tag[0] === 'e' || (tag[0] === 'p' && tag[1] !== event.pubkey)));
				tagsFav.push(['e', event.id, '', '']);
				tagsFav.push(['p', event.pubkey, '']);
				tagsFav.push(['k', String(event.kind)]);
				return tagsFav;
			};
		}
		//繋ぎっぱなしにする
	};

	const sub = pool.subscribeMany(
		relayUrl,
		filters,
		{ onevent, oneose }
	);
};

main().catch((e) => console.error(e));
