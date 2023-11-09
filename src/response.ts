import { type EventTemplate, type VerifiedEvent, type Event as NostrEvent, nip19 } from 'nostr-tools';
import { Mode, Signer } from './utils';

export const getResponseEvent = async (requestEvent: NostrEvent, signer: Signer, mode: Mode): Promise<VerifiedEvent[] | null> => {
	if (requestEvent.pubkey === signer.getPublicKey()) {
		//自分自身の投稿には反応しない
		return null;
	}
	const res = await selectResponse(requestEvent, mode);
	if (res === null) {
		//反応しないことを選択
		return null;
	}
	return res.map(ev => signer.finishEvent(ev));
};

const selectResponse = async (event: NostrEvent, mode: Mode): Promise<EventTemplate[] | null> => {
	if (!isAllowedToPost(event)) {
		return null;
	}
	const res = await mode_select(event, mode);
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

const getResmap = (mode: Mode): [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] => {
	const resmapServer: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] = [
		[/ping$/, res_ping],
		[/gamestart$/, res_s_gamestart],
		[/join$/, res_s_join],
		[/sutehai\?\s(sutehai|ankan|kakan|richi|tsumo)\s?([1-9][mpsz])?/, res_s_sutehai],
		[/reset$/, res_s_reset],
	];
	const resmapClient: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] = [
		[/ping$/, res_ping],
		[/join$/, res_c_join],
		[/NOTIFY\stsumo\s([0-9][mpsz]).+GET sutehai\?$/s, res_c_sutehai],
	];
	switch (mode) {
		case Mode.Server:
			return resmapServer;
		case Mode.Client:
			return resmapClient;
		default:
			throw new TypeError(`unknown mode: ${mode}`);
	}
};

const mode_select = async (event: NostrEvent, mode: Mode): Promise<[string, number, string[][]][] | null> => {
	const resmap = getResmap(mode);
	for (const [reg, func] of resmap) {
		if (reg.test(event.content)) {
			const res = await func(event, mode, reg);
			if (res === null) {
				return null;
			}
			return res.map(r => [r[0], event.kind, r[1]]);
		} 
	}
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
	players.push(event.pubkey);
	return [['Waiting for players.\nMention "join" to me.', getTagsAirrep(event)]];
};

const res_s_join = (event: NostrEvent): [string, string[][]][] | null => {
	if (players.length === 4) {
		return [['Sorry, we are full.', getTagsReply(event)]];
	}
	players.push(event.pubkey);
	if (players.length === 4) {
		const res: [string, string[][]][] = [];
		const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} gamestart (ここにゲーム開始時に通知すべき情報が入る)`;
		const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
		res.push([content, tags]);
		yama = shuffle([...pikind, ...pikind, ...pikind, ...pikind]);
		for (let i = 0; i <= 3; i++) {
			tehai[i] = yama.slice(0 + 13*i, 13 + 13*i);
			tehai[i].sort(compareFn);
			const content = `nostr:${nip19.npubEncode(players[i])} haipai\n${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')}`;
			const emoijTags = Array.from(new Set(tehai[i])).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
			const tags = [...getTagsAirrep(event), ['p', players[i], ''], ...emoijTags];
			res.push([content, tags]);
		}
		nYamaIndex = 66;//王牌14枚(from 52 to 65)抜く
		tsumo = yama[nYamaIndex++];
		const content2 = `nostr:${nip19.npubEncode(players[0])} NOTIFY tsumo ${tsumo}\n${tehai[0].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nGET sutehai?`;
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
	const command = match[1];
	const pai = match[2];
	const i = players.indexOf(event.pubkey);
	switch (command) {
		case 'sutehai':
			tehai[i].push(tsumo);
			tehai[i].splice(tehai[i].indexOf(pai), 1);
			tehai[i].sort(compareFn);
			break;
		default:
			throw new TypeError(`command ${command} is not supported`);
	}
	players.push(event.pubkey);
	tsumo = yama[nYamaIndex++];
	const i2 = (i + 1) % 4;
	const content = `nostr:${nip19.npubEncode(players[i2])} NOTIFY tsumo ${tsumo}\n${tehai[i2].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nGET sutehai?`;
	const emoijTags = Array.from(new Set(tehai[i2].concat(tsumo))).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
	const tags = [...getTagsAirrep(event), ['p', players[i2], ''], ...emoijTags];
	return [[content, tags]];
};

const res_s_reset = (event: NostrEvent): [string, string[][]][] | null => {
	players.length = 0;
	yama = [];
	nYamaIndex = 0;
	tehai = [];
	tsumo = '';
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
	const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? sutehai ${tsumo}\n:${convertEmoji(tsumo)}:`;
	const tags = [...getTagsReply(event), ['emoji', convertEmoji(tsumo), getEmojiUrl(tsumo)]];
	return [[content, tags]];
};

const pikind = [
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
	if (pikind.indexOf(a) < pikind.indexOf(b)) {
		return -1;
	}
	else if (pikind.indexOf(a) > pikind.indexOf(b)) {
		return 1;
	}
	return 0;
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
