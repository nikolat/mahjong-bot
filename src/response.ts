import { type EventTemplate, type VerifiedEvent, type Event as NostrEvent, type Filter, Relay, nip19, nip47, nip57 } from 'nostr-tools';
import { Mode, Signer } from './utils';
import { hexToBytes } from '@noble/hashes/utils';

export const getResponseEvent = async (requestEvent: NostrEvent, signer: Signer, mode: Mode, relay: Relay): Promise<VerifiedEvent[] | null> => {
	if (requestEvent.pubkey === signer.getPublicKey()) {
		//自分自身の投稿には反応しない
		return null;
	}
	const res = await selectResponse(requestEvent, mode, signer, relay);
	if (res === null) {
		const zapAllowedNpubs = ['npub1dv9xpnlnajj69vjstn9n7ufnmppzq3wtaaq085kxrz0mpw2jul2qjy6uhz'];
		if (zapAllowedNpubs.includes(nip19.npubEncode(requestEvent.pubkey)) && /zap/i.test(requestEvent.content) ) {
			await zapByNIP47(requestEvent, signer, relay, 1, 'Zap test');
		}
		//反応しないことを選択
		return null;
	}
	return res.map(ev => signer.finishEvent(ev));
};

const ohayou_zap = async (event: NostrEvent, signer: Signer, relay: Relay): Promise<void> => {
	await zapByNIP47(event, signer, relay, 3, any(['早起きのご褒美やで', '健康的でええな', 'みんなには内緒やで']));
};

const zapByNIP47 = async (event: NostrEvent, signer: Signer, relay: Relay, sats: number, zapComment: string): Promise<void> => {
	const wc = process.env.NOSTR_WALLET_CONNECT;
	if (wc === undefined) {
		throw Error('NOSTR_WALLET_CONNECT is undefined');
	}
	const { pathname, hostname, searchParams } = new URL(wc);
	const walletPubkey = pathname || hostname;
	const walletRelay = searchParams.get('relay');
	const walletSeckey = searchParams.get('secret');

	const evKind0 = await getKind0(relay, event);
	const zapEndpoint = await nip57.getZapEndpoint(evKind0);
	if (walletPubkey.length === 0 || walletRelay === null || walletSeckey === null || zapEndpoint === null) {
		return;
	}

	const lastZap = await getLastZap(relay, walletPubkey, event.pubkey);
	console.log('[lastZap]', lastZap);
	if (lastZap !== undefined && Math.floor(Date.now() / 1000) - lastZap.created_at < 60 * 60 * 3) {//3時間以内にZapをもらっている
		return;
	}

	const amount = sats * 1000;
	const zapRequest = nip57.makeZapRequest({
		profile: event.pubkey,
		event: event.id,
		amount,
		comment: zapComment,
		relays: [relay.url],
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

const getKind0 = async (relay: Relay, event: NostrEvent): Promise<NostrEvent> => {
	return new Promise(async (resolve) => {
		let r: NostrEvent;
		const filters = [
			{
				kinds: [0],
				authors: [event.pubkey],
			}
		];
		const onevent = async (ev: NostrEvent) => {
			r = ev;
		};
		const oneose = async () => {
			sub.close();
			resolve(r);
		};
		const sub = relay.subscribe(
			filters,
			{ onevent, oneose }
		);
	});
};

const getLastZap = async (relay: Relay, walletPubkey: string, targetPubkey: string): Promise<NostrEvent | undefined> => {
	return new Promise(async (resolve) => {
		let r: NostrEvent | undefined;
		const filters: Filter[] = [
			{
				kinds: [9735],
				authors: [walletPubkey],
				'#p': [targetPubkey],
				limit: 1
			}
		];
		const onevent = async (ev: NostrEvent) => {
			r = ev;
		};
		const oneose = async () => {
			sub.close();
			resolve(r);
		};
		const sub = relay.subscribe(
			filters,
			{ onevent, oneose }
		);
	});
};

const selectResponse = async (event: NostrEvent, mode: Mode, signer: Signer, relay: Relay): Promise<EventTemplate[] | null> => {
	if (!isAllowedToPost(event)) {
		return null;
	}
	const res = await mode_select(event, mode, signer, relay);
	if (res === null) {
		return null;
	}
	const unsignedEvents: EventTemplate[] = [];
	let t = 1;
	for (const ev of res) {
		const [content, kind, tags, created_at] = [...ev, event.created_at + t];
		const unsignedEvent: EventTemplate = { kind, tags, content, created_at };
		unsignedEvents.push(unsignedEvent);
		t++;
	}
	return unsignedEvents;
};

const isAllowedToPost = (event: NostrEvent) => {
	const allowedChannel: string[] = [
		'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723',//Nostr麻雀開発部
		'be8e52c0c70ec5390779202b27d9d6fc7286d0e9a2bc91c001d6838d40bafa4a',//Nostr伺か部
	];
	if (event.kind === 1) {
		return true;
	}
	else if (event.kind === 42) {
		const tagRoot = event.tags.find(tag => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root');
		if (tagRoot !== undefined) {
			return allowedChannel.includes(tagRoot[1]);
		}
		else {
			throw new TypeError('root is not found');
		}
	}
	throw new TypeError(`kind ${event.kind} is not supported`);
};

const getResmap = (mode: Mode): [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp, signer: Signer, relay: Relay) => [string, string[][]][] | null | Promise<null>][] => {
	const resmapServer: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] = [
		[/ping$/, res_ping],
		[/gamestart$/, res_s_gamestart],
		[/join$/, res_s_join],
		[/sutehai\?\s(sutehai|ankan|kakan|richi|tsumo)\s?([1-9][mpsz])?/, res_s_sutehai],
		[/^(sutehai\?)?([1-9][mpsz])/, res_s_sutehai],
		[/naku\?\s(no|ron|kan|pon|chi)\s?([1-9][mpsz])?/, res_s_naku],
		[/^(no|ron|kan|pon|chi)\s?([1-9][mpsz])?/, res_s_naku],
		[/reset$/, res_s_reset],
	];
	const resmapClient: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] = [
		[/ping$/, res_ping],
		[/join$/, res_c_join],
		[/NOTIFY\stsumo\snostr:npub1\w{58}\s\d+\s([0-9][mpsz]).+GET\ssutehai\?$/s, res_c_sutehai],
		[/GET\snaku\?\s(ron|kan|pon|chi)$/s, res_c_naku],
	];
	const resmapUnyu: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp, signer: Signer, relay: Relay) => Promise<null>][] = [
		[/おはよ/, res_ohayo],
	];
	switch (mode) {
		case Mode.Server:
			return resmapServer;
		case Mode.Client:
			return resmapClient;
		case Mode.Unyu:
			return resmapUnyu;
		default:
			throw new TypeError(`unknown mode: ${mode}`);
	}
};

const mode_select = async (event: NostrEvent, mode: Mode, signer: Signer, relay: Relay): Promise<[string, number, string[][]][] | null> => {
	const resmap = getResmap(mode);
	for (const [reg, func] of resmap) {
		if (reg.test(event.content)) {
			const res = await func(event, mode, reg, signer, relay);
			if (res === null) {
				return null;
			}
			return res.map(r => [r[0], event.kind, r[1]]);
		} 
	}
	return null;
};

const res_ohayo = async (event: NostrEvent, mode: Mode, regstr: RegExp, signer: Signer, relay: Relay): Promise<null> => {
	await ohayou_zap(event, signer, relay);
	return null;
};

const res_ping = (event: NostrEvent): [string, string[][]][] => {
	return [['pong', getTagsReply(event)]];
};

const getTagsAirrep = (event: NostrEvent): string[][] => {
	if (event.kind === 1) {
		return [['e', event.id, '', 'mention']];
	}
	else if (event.kind === 42) {
		const tagRoot = event.tags.find(tag => tag.length >= 3 && tag[0] === 'e' && tag[3] === 'root');
		if (tagRoot !== undefined) {
			return [tagRoot, ['e', event.id, '', 'mention']];
		}
		else {
			throw new TypeError('root is not found');
		}
	}
	throw new TypeError(`kind ${event.kind} is not supported`);
};

const getTagsReply = (event: NostrEvent): string[][] => {
	const tagsReply: string[][] = [];
	const tagRoot = event.tags.find(tag => tag.length >= 3 && tag[0] === 'e' && tag[3] === 'root');
	if (tagRoot !== undefined) {
		tagsReply.push(tagRoot);
		tagsReply.push(['e', event.id, '', 'reply']);
	}
	else {
		tagsReply.push(['e', event.id, '', 'root']);
	}
	for (const tag of event.tags.filter(tag => tag.length >= 2 && tag[0] === 'p' && tag[1] !== event.pubkey)) {
		tagsReply.push(tag);
	}
	tagsReply.push(['p', event.pubkey, '']);
	return tagsReply;
};

const players: string[] = [];
let yama: string[] = [];
let nYamaIndex = 0;
let tehai: string[][] = [];
let tsumo: string;

const res_s_gamestart = (event: NostrEvent): [string, string[][]][] | null => {
	reset_game();
	players.push(event.pubkey);
	return [['Waiting for players.\nMention "join" to me.', getTagsAirrep(event)]];
};

const res_s_join = (event: NostrEvent): [string, string[][]][] | null => {
	if (players.includes(event.pubkey)) {
		return [['You have already joined.', getTagsReply(event)]];
	}
	if (players.length === 4) {
		return [['Sorry, we are full.', getTagsReply(event)]];
	}
	players.push(event.pubkey);
	if (players.length === 4) {
		const res: [string, string[][]][] = [];
		const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} gamestart (ここにゲーム開始時に通知すべき情報が入る)`;
		const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
		res.push([content, tags]);
		yama = shuffle([...paikind, ...paikind, ...paikind, ...paikind]);
		for (let i = 0; i <= 3; i++) {
			tehai[i] = yama.slice(0 + 13*i, 13 + 13*i);
			tehai[i].sort(compareFn);
			const content = `nostr:${nip19.npubEncode(players[i])} haipai\n${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')}`;
			const emoijTags = Array.from(new Set(tehai[i])).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
			const tags = [...getTagsAirrep(event), ['p', players[i], ''], ...emoijTags];
			res.push([content, tags]);
		}
		nYamaIndex = 66;//王牌14枚(from 52 to 65)抜く
		tsumo = yama[nYamaIndex];
		nYamaIndex++
		const content2 = `NOTIFY tsumo nostr:${nip19.npubEncode(players[0])} ${yama.length - nYamaIndex} ${tsumo}\n${tehai[0].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nGET sutehai?`;
		const emoijTags = Array.from(new Set(tehai[0].concat(tsumo))).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
		const tags2 = [...getTagsAirrep(event), ['p', players[0], ''], ...emoijTags];
		res.push([content2, tags2]);
		return res;
	}
	return null;
};

const res_s_sutehai = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] | null => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const command = match[1] ?? 'sutehai';
	const pai = match[2];
	const i = players.indexOf(event.pubkey);
	switch (command) {
		case 'tsumo':
			const tehai14 = tehai[i].concat(tsumo);
			tehai14.sort(compareFn);
			const shanten = getShanten(tehai14);
			if (shanten === -1) {
				const content = `${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nCongratulations!`;
				const emoijTags = Array.from(new Set(tehai14)).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
				const tags = [...getTagsAirrep(event), ...emoijTags];
				return [[content, tags]];
			}
			else {
				const content = `shanten is ${shanten}.`;
				const tags = getTagsReply(event);
				return [[content, tags]];
			}
		case 'sutehai':
			tehai[i].push(tsumo);
			tehai[i].splice(tehai[i].indexOf(pai), 1);
			tehai[i].sort(compareFn);
			break;
		default:
			throw new TypeError(`command ${command} is not supported`);
	}
	const naku: [string, string[][]][] = [];
	for (const index of [0, 1, 2, 3].filter(idx => idx !== i)) {
		const tehai14 = tehai[index].concat(pai);
		tehai14.sort(compareFn);
		const shanten = getShanten(tehai14);
		if (shanten === -1) {
			const content = `nostr:${nip19.npubEncode(players[index])}\nGET naku? ron`;
			const tags = [...getTagsAirrep(event), ['p', players[index], '']];
			naku.push([content, tags]);
		}
	}
	if (naku.length > 0) {
		return naku;
	}
	if (yama[nYamaIndex] === undefined) {
		const content = `ryukyoku`;
		const tags = getTagsAirrep(event);
		return [[content, tags]];
	}
	tsumo = yama[nYamaIndex];
	nYamaIndex++
	const i2 = (i + 1) % 4;
	const content = `NOTIFY tsumo nostr:${nip19.npubEncode(players[i2])} ${yama.length - nYamaIndex} ${tsumo}\n${tehai[i2].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nGET sutehai?`;
	const emoijTags = Array.from(new Set(tehai[i2].concat(tsumo))).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
	const tags = [...getTagsAirrep(event), ['p', players[i2], ''], ...emoijTags];
	return [[content, tags]];
};

const res_s_naku = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] | null => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const command = match[1];
	const pai = match[2];
	const i = players.indexOf(event.pubkey);
	switch (command) {
		case 'ron':
			const content = `${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nCongratulations!`;
			const emoijTags = Array.from(new Set(tehai[i].concat(tsumo))).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
			const tags = [...getTagsAirrep(event), ...emoijTags];
			return [[content, tags]];
		case 'no':
		default:
			throw new TypeError(`command ${command} is not supported`);
	}
};

const res_s_reset = (event: NostrEvent): [string, string[][]][] | null => {
	reset_game();
	return [['Data cleared.', getTagsAirrep(event)]];
};

const res_c_join = (event: NostrEvent): [string, string[][]][] => {
	const npub_jongbari = 'npub1j0ng5hmm7mf47r939zqkpepwekenj6uqhd5x555pn80utevvavjsfgqem2';
	return [[`nostr:${npub_jongbari} join`, [...getTagsAirrep(event), ['p', nip19.decode(npub_jongbari).data, '']]]];
};

const res_c_sutehai = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const tsumo = match[1];
	const i = players.indexOf(event.tags.filter(tag => tag.length >= 2 && tag[0] === 'p').map(tag => tag[1])[0]);
	const tehai14 = tehai[i].concat(tsumo);
	const shanten = getShanten(tehai14);
	if (shanten === -1) {
		const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? tsumo\n:${convertEmoji(tsumo)}:`;
		const emoijTags = Array.from(new Set(tehai14)).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
		const tags = [...getTagsReply(event), ...emoijTags];
		return [[content, tags]];
	}
	let sutehai;
	const uniqTehai = new Set(tehai14);
	const ankos = Array.from(uniqTehai).filter(pai => tehai14.reduce((sum, v) => v === pai ? sum + 1 : sum, 0) >= 3);
	const koritsus = Array.from(uniqTehai).filter(pai => tehai14.reduce((sum, v) => v === pai ? sum + 1 : sum, 0) == 1);
	if (ankos.length > 0) {
		sutehai = any(ankos);
	}
	else {
		sutehai = any(koritsus);
	}
	const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? sutehai ${sutehai}\n:${convertEmoji(sutehai)}:`;
	const tags = [...getTagsReply(event), ['emoji', convertEmoji(sutehai), getEmojiUrl(sutehai)]];
	return [[content, tags]];
};

const res_c_naku = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] => {
	const content = `nostr:${nip19.npubEncode(event.pubkey)} naku? ron`;
	const tags = getTagsReply(event);
	return [[content, tags]];
};

const reset_game = () => {
	players.length = 0;
	yama = [];
	nYamaIndex = 0;
	tehai = [];
	tsumo = '';
};

const getShanten = (tehai14: string[]) => {
	const uniqTehai = new Set(tehai14);
	const nType = uniqTehai.size >= 7 ? 7 : uniqTehai.size;
	const nToitsu = Array.from(uniqTehai).filter(pai => tehai14.reduce((sum, v) => v === pai ? sum + 1 : sum, 0) >= 2).length;
	return 6 - nToitsu + (7 - nType);
}

const paikind = [
	'1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
	'1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
	'1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
	'1z', '2z', '3z', '4z', '5z', '6z', '7z',
];

const shuffle = (array: string[]) => { 
	for (let i = array.length - 1; i > 0; i--) { 
		const j = Math.floor(Math.random() * (i + 1)); 
		[array[i], array[j]] = [array[j], array[i]]; 
	} 
	return array; 
}; 

const compareFn = (a: string, b: string) => {
	if (paikind.indexOf(a) < paikind.indexOf(b)) {
		return -1;
	}
	else if (paikind.indexOf(a) > paikind.indexOf(b)) {
		return 1;
	}
	return 0;
};

const any = (array: string[]): string => {
	return array[Math.floor(Math.random() * array.length)];
};

const convertEmoji = (pai: string) => {
	if (['m', 'p', 's'].includes(pai.at(1) ?? '')) {
		return `mahjong_${pai.at(1)}${pai.at(0)}`;
	}
	else if (pai.at(1) === 'z') {
		switch (pai.at(0)) {
			case '1':
				return 'mahjong_east';
			case '2':
				return 'mahjong_south';
			case '3':
				return 'mahjong_west';
			case '4':
				return 'mahjong_north';
			case '5':
				return 'mahjong_white';
			case '6':
				return 'mahjong_green';
			case '7':
				return 'mahjong_red';
			default:
				throw TypeError(`Unknown pai: ${pai}`);
		}
	}
	else {
		throw TypeError(`Unknown pai: ${pai}`);
	}
};

const getEmojiUrl = (pai: string): string => {
	return awayuki_mahjong_emojis[convertEmoji(pai)];
};

const awayuki_mahjong_emojis: any = {
	"mahjong_m1": "https://awayuki.github.io/emoji/mahjong-m1.png",
	"mahjong_m2": "https://awayuki.github.io/emoji/mahjong-m2.png",
	"mahjong_m3": "https://awayuki.github.io/emoji/mahjong-m3.png",
	"mahjong_m4": "https://awayuki.github.io/emoji/mahjong-m4.png",
	"mahjong_m5": "https://awayuki.github.io/emoji/mahjong-m5.png",
	"mahjong_m6": "https://awayuki.github.io/emoji/mahjong-m6.png",
	"mahjong_m7": "https://awayuki.github.io/emoji/mahjong-m7.png",
	"mahjong_m8": "https://awayuki.github.io/emoji/mahjong-m8.png",
	"mahjong_m9": "https://awayuki.github.io/emoji/mahjong-m9.png",
	"mahjong_p1": "https://awayuki.github.io/emoji/mahjong-p1.png",
	"mahjong_p2": "https://awayuki.github.io/emoji/mahjong-p2.png",
	"mahjong_p3": "https://awayuki.github.io/emoji/mahjong-p3.png",
	"mahjong_p4": "https://awayuki.github.io/emoji/mahjong-p4.png",
	"mahjong_p5": "https://awayuki.github.io/emoji/mahjong-p5.png",
	"mahjong_p6": "https://awayuki.github.io/emoji/mahjong-p6.png",
	"mahjong_p7": "https://awayuki.github.io/emoji/mahjong-p7.png",
	"mahjong_p8": "https://awayuki.github.io/emoji/mahjong-p8.png",
	"mahjong_p9": "https://awayuki.github.io/emoji/mahjong-p9.png",
	"mahjong_s1": "https://awayuki.github.io/emoji/mahjong-s1.png",
	"mahjong_s2": "https://awayuki.github.io/emoji/mahjong-s2.png",
	"mahjong_s3": "https://awayuki.github.io/emoji/mahjong-s3.png",
	"mahjong_s4": "https://awayuki.github.io/emoji/mahjong-s4.png",
	"mahjong_s5": "https://awayuki.github.io/emoji/mahjong-s5.png",
	"mahjong_s6": "https://awayuki.github.io/emoji/mahjong-s6.png",
	"mahjong_s7": "https://awayuki.github.io/emoji/mahjong-s7.png",
	"mahjong_s8": "https://awayuki.github.io/emoji/mahjong-s8.png",
	"mahjong_s9": "https://awayuki.github.io/emoji/mahjong-s9.png",
	"mahjong_east": "https://awayuki.github.io/emoji/mahjong-east.png",
	"mahjong_south": "https://awayuki.github.io/emoji/mahjong-south.png",
	"mahjong_west": "https://awayuki.github.io/emoji/mahjong-west.png",
	"mahjong_north": "https://awayuki.github.io/emoji/mahjong-north.png",
	"mahjong_white": "https://awayuki.github.io/emoji/mahjong-white.png",
	"mahjong_green": "https://awayuki.github.io/emoji/mahjong-green.png",
	"mahjong_red": "https://awayuki.github.io/emoji/mahjong-red.png",
};
