import type { EventTemplate, NostrEvent, VerifiedEvent } from 'nostr-tools/pure';
import type { SimplePool } from 'nostr-tools/pool';
import * as nip19 from 'nostr-tools/nip19';
import { Mode, Signer, getTagsAirrep, getTagsReply } from './utils.js';
import { mahjongGameStart, res_c_naku_call, res_c_sutehai_call, res_s_debug_call, res_s_gamestart_call, res_s_join_call, res_s_naku_call, res_s_reset_call, res_s_status_call, res_s_sutehai_call, startKyoku } from './mj_main.js';

export const getResponseEvent = async (requestEvent: NostrEvent, signer: Signer, mode: Mode, pool: SimplePool): Promise<VerifiedEvent[] | null> => {
	if (requestEvent.pubkey === signer.getPublicKey()) {
		//自分自身の投稿には反応しない
		return null;
	}
	const res = await selectResponse(requestEvent, mode, signer, pool);
	if (res === null) {
		return null;
	}
	return res.map(ev => signer.finishEvent(ev));
};

const selectResponse = async (event: NostrEvent, mode: Mode, signer: Signer, pool: SimplePool): Promise<EventTemplate[] | null> => {
	if (!isAllowedToPost(event)) {
		return null;
	}
	const res = await mode_select(event, mode, signer, pool);
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

const getResmap = (mode: Mode): [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp, signer: Signer, pool: SimplePool) => [string, string[][]][] | null | Promise<null>][] => {
	const resmapServer: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] = [
		[/ping$/, res_ping],
		[/help$/, res_help],
		[/^(nostr:npub1\w{58}\s+)?gamestart/, res_s_gamestart],
		[/join$/, res_s_join],
		[/next$/, res_s_next],
		[/reset$/, res_s_reset],
		[/status$/, res_s_status],
		[/debug\s+(([1-9][mpsz])+)$/, res_s_debug],
		[/sutehai\?\s(sutehai|ankan|kakan|richi|tsumo)\s?([1-9][mpsz])?/, res_s_sutehai],
		[/^(tsumo)$/, res_s_sutehai],
		[/^(sutehai|ankan|kakan|richi)?\s?([1-9][mpsz])/, res_s_sutehai],
		[/naku\?\s(no|ron|kan|pon|chi)\s?([1-9][mpsz])?\s?([1-9][mpsz])?/, res_s_naku],
		[/^(no|ron|kan|pon|chi)\s?([1-9][mpsz])?\s?([1-9][mpsz])?/, res_s_naku],
	];
	const resmapClient: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]][] | null][] = [
		[/ping$/, res_ping],
		[/join$/, res_c_join],
		[/gamestart$/, res_c_gamestart],
		[/GET\ssutehai\?$/s, res_c_sutehai],
		[/GET\snaku\?\s(((ron|kan|pon|chi)\s)*(ron|kan|pon|chi))$/s, res_c_naku],
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

const mode_select = async (event: NostrEvent, mode: Mode, signer: Signer, pool: SimplePool): Promise<[string, number, string[][]][] | null> => {
	const resmap = getResmap(mode);
	for (const [reg, func] of resmap) {
		if (reg.test(event.content)) {
			const res = await func(event, mode, reg, signer, pool);
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

const res_help = (event: NostrEvent): [string, string[][]][] => {
	const content = [
		'【麻雀サーバーbot(私)の使い方】',
		'ping: pongと返します',
		'gamestart: ゲーム開始 メンバーを4人まで募集します',
		'join: ゲームに参加 募集中のゲームに参加します',
		'next: 次の局に移ります',
		'reset: データをクリアします',
		'status: 現在の場の状況を表示します',
		'sutehai? (sutehai|ankan|kakan|richi|tsumo) <牌>: 捨て牌を求められたコマンドに応答します',
		'(例1: sutehai? sutehai 1p, 例2: sutehai? richi 7z, 例3: sutehai? tsumo)',
		'naku? (no|ron|kan|pon|chi) <牌1> <牌2>: 鳴く判断を求められたコマンドに応答します',
		'(例1: naku? no, 例2: naku? pon, 例3: naku? chi 1m 3m)',
		'(sutehai? および naku? は省略可能)(sutehaiも省略可能で単に "7z" で捨て牌となる)',
		'help: このヘルプを表示します',
		'【麻雀クライアントbotの使い方】',
		'gamestart: 麻雀サーバーbotに "gamestart" とメンションします',
		'join: 麻雀サーバーbotに "join" とメンションします',
		'nostr:npub1rnrnclxznfkqqu8nnpt0mwp4hj0xe005mnwjqlafaluv7n2kn80sy53aq2',
		'nostr:npub1chunacswmcejn8ge95vzl22a2g6pd4nfchygslnt9gj9dshqcvqq5amrlj',
		'nostr:npub1whanysx54uf9tgjfeueljg3498kyru3rhwxajwuzh0nw0x0eujss9tlcjh',
		'nostr:npub18ee7ggjpp4uf77aurecqhtfpz5y0j95pd9hadrdsxt5we3pysnnqe8k224',
	];
	return [[content.join('\n'), getTagsReply(event)]];
};

const res_s_gamestart = (event: NostrEvent): [string, string[][]][] | null => {
	res_s_gamestart_call(event.pubkey);
	return [['Waiting for players.\nMention "join" to me.', getTagsAirrep(event)]];
};

const res_s_join = (event: NostrEvent): [string, string[][]][] | null => {
	let count: number;
	try {
		count = res_s_join_call(event.pubkey);
	} catch (error) {
		let mes = 'unknown error';
		if (error instanceof Error) {
			mes = error.message;
		}
		return [[mes, getTagsReply(event)]];
	}
	if (count === 4) {
		return mahjongGameStart(event);
	}
	else {
		return [[`${count}/4 joined.`, getTagsAirrep(event)]];
	}
};

const res_s_next = (event: NostrEvent): [string, string[][]][] | null => {
	return startKyoku(event);
};

const res_s_reset = (event: NostrEvent): [string, string[][]][] | null => {
	res_s_reset_call();
	return [['Data cleared.', getTagsAirrep(event)]];
};

const res_s_status = (event: NostrEvent): [string, string[][]][] | null => {
	return res_s_status_call(event);
};

const res_s_debug = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] | null => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const yama: string = match[1];
	res_s_debug_call(yama);
	return [['Debug mode.', getTagsAirrep(event)]];
};

const res_s_sutehai = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const action = match[1] ?? 'sutehai';
	const pai = match[2];
	if (action !== 'tsumo' && !pai)
		return [['usage: sutehai? sutehai <pi>', getTagsReply(event)]];
	return res_s_sutehai_call(event, action, pai);
};

const res_s_naku = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] | null => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const action = match[1];
	const pai1 = match[2];
	const pai2 = match[3];
	if (action === 'chi' && !(/[1-9][mspz]/.test(pai1) && /[1-9][mspz]/.test(pai2)))
		return [['usage: naku? chi <pi1> <pi2>', getTagsReply(event)]];
	return res_s_naku_call(event, action, pai1, pai2);
};

const res_c_join = (event: NostrEvent): [string, string[][]][] => {
	const npub_jongbari = 'npub1j0ng5hmm7mf47r939zqkpepwekenj6uqhd5x555pn80utevvavjsfgqem2';
	return [[`nostr:${npub_jongbari} join`, [...getTagsAirrep(event), ['p', nip19.decode(npub_jongbari).data, '']]]];
};

const res_c_gamestart = (event: NostrEvent): [string, string[][]][] => {
	const npub_jongbari = 'npub1j0ng5hmm7mf47r939zqkpepwekenj6uqhd5x555pn80utevvavjsfgqem2';
	return [[`nostr:${npub_jongbari} gamestart`, [...getTagsAirrep(event), ['p', nip19.decode(npub_jongbari).data, '']]]];
};

const res_c_sutehai = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] => {
	return res_c_sutehai_call(event);
};

const res_c_naku = (event: NostrEvent, mode: Mode, regstr: RegExp): [string, string[][]][] => {
	const match = event.content.match(regstr);
	if (match === null) {
		throw new Error();
	}
	const command = match[1].split(/\s/);
	return res_c_naku_call(event, command);
};
