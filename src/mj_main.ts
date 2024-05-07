import { type NostrEvent, nip19 } from 'nostr-tools';
import { getShanten } from './mjlib/mj_shanten';
import { naniwokiru } from './mjlib/mj_core';
import { getScore } from './mjlib/mj_score';
import { compareFn, getDoraFromDorahyouji, paikind, stringToArrayWithFuro } from './mjlib/mj_common';
import { getMachi } from './mjlib/mj_machi';
import { convertEmoji, getTagsAirrep, getTagsEmoji, getTagsReply } from './utils';

export const res_s_gamestart_call = (pubkey: string): void => {
	reset_game();
	players.push(pubkey);
};

export const res_s_join_call = (pubkey: string): void => {
	if (players.includes(pubkey)) {
		throw Error('You have already joined.');
	}
	if (players.length === 4) {
		throw Error('Sorry, we are full.');
	}
	players.push(pubkey);
};

export const res_s_reset_call = (): void => {
	reset_game();
};

const players: string[] = [];
let arScore: number[];
let tsumibou: number;
let kyotaku: number;
let bafu: number;
let kyoku: number;
let oyaIndex: number;
export const mahjongGameStart = (event: NostrEvent): [string, string[][]][] => {
	const res: [string, string[][]][] = [];
	arScore = [25000, 25000, 25000, 25000];
	tsumibou = 0;
	kyotaku = 0;
	bafu = 0;
	kyoku = 1;
	oyaIndex = Math.floor(Math.random() * 4);
	const seki = ['東', '南', '西', '北'];
	const dSeki = new Map<string, string>();
	const pNames: string[] = [];
	for (let i = 0; i < players.length; i++) {
		pNames.push(players[(i + oyaIndex) % 4]);
	}
	for (let i = 0; i < pNames.length; i++) {
		dSeki.set(pNames[i], seki[i]);
	}
	for (let i = 0; i < players.length; i++) {
		const content = `nostr:${nip19.npubEncode(players[i])} NOTIFY gamestart ${dSeki.get(players[i])} ${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')}`;
		const tags = [...getTagsAirrep(event), ['p', players[i], '']];
		res.push([content, tags]);
	}
	return [...res, ...startKyoku(event)];
};

let arYama: string[] = [];
let arKawa: string[][];
let arFuritenCheckRichi: string[][];
let arFuritenCheckTurn: string[][];
let arRichiJunme: number[];
let arFuroJunme: number[][];
let arFuroHistory: [string, number][][];
let arKakanHistory: string[][];
let isRinshanChance: boolean;
let arIppatsuChance: boolean[];
let arChihouChance: boolean[];
let arWRichi: boolean[];
let dorahyouji: string;
let visiblePai: string;
let nYamaIndex = 0;
let tehai: string[][] = [];
let tsumo: string;
let sutehai: string;
let currentPlayer: number;
let reservedNaku: Map<string, string>;
let reservedTenpai: Map<string, string>;
let dResponseNeed: Map<string, string>;
const arBafu = ['東', '南'];

const startKyoku = (event: NostrEvent): [string, string[][]][] => {
	const res: [string, string[][]][] = [];
	arYama = shuffle([...paikind, ...paikind, ...paikind, ...paikind]);
	for (let i = 0; i < players.length; i++) {
		tehai[i] = arYama.slice(0 + 13*i, 13 + 13*i);
		tehai[i].sort(compareFn);
	}
	arKawa = [[], [], [], []];
	arFuritenCheckRichi = [[], [], [], []];
	arFuritenCheckTurn = [[], [], [], []];
	arRichiJunme = [-1, -1, -1, -1];
	arFuroJunme = [[], [], [], []];
	arFuroHistory = [[], [], [], []];
	arKakanHistory = [[], [], [], []];
	isRinshanChance = false;
	arIppatsuChance = [false, false, false, false];
	arChihouChance = [true, true, true, true];
	arWRichi = [false, false, false, false];
	dorahyouji = arYama[52];
	visiblePai = dorahyouji;
	nYamaIndex = 66;//王牌14枚(from 52 to 65)抜く
	reservedNaku = new Map<string, string>();
	reservedTenpai = new Map<string, string>();
	dResponseNeed = new Map<string, string>();
	tsumo = arYama[nYamaIndex++];
	currentPlayer = oyaIndex;
	let s: string = '';
	//kyokustart通知
	const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY kyokustart ${arBafu[bafu]} nostr:${nip19.npubEncode(players[oyaIndex])} ${tsumibou} ${kyotaku}`;
	const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
	res.push([content, tags]);
	//point通知
	for (let i = 0; i < players.length; i++) {
		const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY point nostr:${nip19.npubEncode(players[i])} = ${arScore[i]}`;
		const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
		res.push([content, tags]);
	}
	//haipai通知
	for (let i = 0; i <= 3; i++) {
		const content = `nostr:${nip19.npubEncode(players[i])} NOTIFY haipai\n${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')}`;
		const tags = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(tehai[i])];
		res.push([content, tags]);
	}
	//dora通知
	const content_dora = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${dorahyouji}`;
	const tags_dora = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
	res.push([content_dora, tags_dora]);
	//ツモ通知 捨て牌要求
	const content_sutehai = `NOTIFY tsumo nostr:${nip19.npubEncode(players[oyaIndex])} ${arYama.length - nYamaIndex} ${tsumo}\n${tehai[oyaIndex].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nGET sutehai?`;
	const tags_sutehai = [...getTagsAirrep(event), ['p', players[oyaIndex], ''], ...getTagsEmoji(tehai[oyaIndex].concat(tsumo))];
	res.push([content_sutehai, tags_sutehai]);
	return res;
};

const getScoreView = (i: number, atarihai: string, isTsumo: boolean) => {
	const r = getScore(tehai[i].join(''), atarihai, ['1z', '2z'][bafu], getJifuHai(i), getDoraFromDorahyouji(dorahyouji), isTsumo);
	let content = '';
	if (r[2].size > 0) {
		for (const [k, v] of r[2]) {
			content += `${k} ${v >= 2 ? `${v}倍` : ''}役満\n`;
		}
	}
	else {
		let han = 0;
		for (const [k, v] of r[3]) {
			han += v;
			content += `${k} ${v}翻\n`;
		}
		content	+= `${r[1]}符${han}翻\n`;
	}
	content	+= `${r[0]}点\n `
		+ `nostr:${nip19.npubEncode(players[i])} +${r[0]}`;
	return content;
};

const getJifuHai = (nPlayer: number): string => {
	const seki = ['1z', '2z', '3z', '4z'];
	const dSeki = new Map<string, string>();
	const pNames: string[] = [];
	for (let i = 0; i < players.length; i++) {
		pNames.push(players[(i + oyaIndex) % 4]);
	}
	for (let i = 0; i < pNames.length; i++) {
		dSeki.set(pNames[i], seki[i]);
	}
	return dSeki.get(players[nPlayer]) ?? '';
};

export const res_s_sutehai_call = (event: NostrEvent, command: string, pai: string): [string, string[][]][] => {
	const i = players.indexOf(event.pubkey);
	currentPlayer = i;
	switch (command) {
		case 'tsumo':
			if (canTsumo(i, tsumo)) {// 和了
				const content = getScoreView(i, tsumo, true) + '\n'
					+ `${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:`;
				const tags = [...getTagsAirrep(event), ...getTagsEmoji(tehai[i].concat(tsumo))];
				reset_game();
				return [[content, tags]];
			}
			else {
				const content = 'You cannot tsumo.';
				const tags = getTagsReply(event);
				return [[content, tags]];
			}
		case 'sutehai':
			tehai[i].push(tsumo);
			tehai[i].splice(tehai[i].indexOf(pai), 1);
			tehai[i].sort(compareFn);
			sutehai = pai;
			break;
		default:
			throw new TypeError(`command ${command} is not supported`);
	}
	const naku: [string, string[][]][] = [];
	for (const index of [0, 1, 2, 3].filter(idx => idx !== i)) {
		if (canRon(index, pai)) {
			const content = `nostr:${nip19.npubEncode(players[index])}\nGET naku? ron`;
			const tags = [...getTagsAirrep(event), ['p', players[index], '']];
			naku.push([content, tags]);
		}
	}
	if (naku.length > 0) {
		return naku;
	}
	return sendNextTurn(event);
};

const sendNextTurn = (event: NostrEvent): [string, string[][]][] => {
	if (arYama[nYamaIndex] === undefined) {
		const content = `ryukyoku`;
		const tags = getTagsAirrep(event);
		return [[content, tags]];
	}
	tsumo = arYama[nYamaIndex];
	nYamaIndex++
	const i2 = (currentPlayer + 1) % 4;
	const content = `NOTIFY tsumo nostr:${nip19.npubEncode(players[i2])} ${arYama.length - nYamaIndex} ${tsumo}\n${tehai[i2].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(tsumo)}:\nGET sutehai?`;
	const tags = [...getTagsAirrep(event), ['p', players[i2], ''], ...getTagsEmoji(tehai[i2].concat(tsumo))];
	return [[content, tags]];
};

const canTsumo = (nPlayer: number, atariHai: string): boolean => {
	if (atariHai === '')
		return false;
	//和了かどうか(シャンテン数が-1かどうか)検証する
	const tehai14 = tehai[nPlayer].concat(atariHai);//fix me
	tehai14.sort(compareFn);
	const shanten = getShanten(tehai14.join(''))[0];
	if (shanten !== -1)
		return false;
	//役があるかどうか検証する
	const score = getScore(tehai[nPlayer].join(''), atariHai, ['1z', '2z'][bafu], getJifuHai(nPlayer), getDoraFromDorahyouji(dorahyouji), true)[0];//fix me
	if (score <= 0)
		return false;
	return true;
};

export const res_s_naku_call = (event: NostrEvent, command: string, pai: string): [string, string[][]][] | null => {
	const i = players.indexOf(event.pubkey);
	switch (command) {
		case 'ron':
			if (canRon(i, sutehai)) {
				const content = getScoreView(i, sutehai, false) + '\n'
				+ `${tehai[i].map(pi => `:${convertEmoji(pi)}:`).join('')} :${convertEmoji(sutehai)}:`;
				const tags = [...getTagsAirrep(event), ...getTagsEmoji(tehai[i].concat(sutehai))];
				reset_game();
				return [[content, tags]];
			}
			else {
				const content = 'You cannot ron.';
				const tags = getTagsReply(event);
				return [[content, tags]];
			}
		case 'no':
			return sendNextTurn(event);
		default:
			throw new TypeError(`command ${command} is not supported`);
	}
};

const canRon = (nPlayer: number, atariHai: string): boolean => {
	//和了かどうか(シャンテン数が-1かどうか)検証する
	const tehai14 = tehai[nPlayer].concat(atariHai);//fix me
	tehai14.sort(compareFn);
	const shanten = getShanten(tehai14.join(''))[0];
	if (shanten !== -1)
		return false;
	//フリテンかどうか検証する
	const arMachi: string[] = stringToArrayWithFuro(getMachi(tehai[nPlayer].join('')))[0];
	const isRichi = arRichiJunme[nPlayer] >= 0;
	for (const machi of arMachi) {
		if (arKawa[nPlayer].includes(machi))
			return false;
		if (isRichi) {
			const index = arFuritenCheckRichi[nPlayer].indexOf(machi);
			if (index >= 0 && index !== arFuritenCheckRichi[nPlayer].length - 1)
				return false;
		}
		if (arFuritenCheckTurn[nPlayer].includes(machi)) {
			const index = arFuritenCheckTurn[nPlayer].indexOf(machi);
			if (index >= 0 && index !== arFuritenCheckTurn[nPlayer].length - 1)
				return false;
		}
	}
	//役があるかどうか検証する
	const score = getScore(tehai[nPlayer].join(''), atariHai, ['1z', '2z'][bafu], getJifuHai(nPlayer), getDoraFromDorahyouji(dorahyouji), false)[0];//fix me
	if (score <= 0)
		return false;
	return true;
};

export const res_c_sutehai_call = (event: NostrEvent, tsumo: string): [string, string[][]][] => {
	const i = players.indexOf(event.tags.filter(tag => tag.length >= 2 && tag[0] === 'p').map(tag => tag[1])[0]);
	const tehai14 = tehai[i].concat(tsumo);
	const [shanten, _] = getShanten(tehai14.join(''));
	if (shanten === -1) {
		const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? tsumo\n:${convertEmoji(tsumo)}:`;
		const tags = [...getTagsReply(event), ...getTagsEmoji(tehai14)];
		return [[content, tags]];
	}
	const sutehai = naniwokiru(tehai[i].join(''), tsumo, undefined, ['1z', '2z'][bafu], getJifuHai(i), dorahyouji);
	const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? sutehai ${sutehai}\n:${convertEmoji(sutehai)}:`;
	const tags = [...getTagsReply(event), ...getTagsEmoji([sutehai])];
	return [[content, tags]];
};

export const res_c_naku_call = (event: NostrEvent, command: string[]): [string, string[][]][] => {
	let res = 'no';
	if (command.includes('ron')) {
		res = 'ron';
	}
	const content = `nostr:${nip19.npubEncode(event.pubkey)} naku? ${res}`;
	const tags = getTagsReply(event);
	return [[content, tags]];
};

const reset_game = () => {
	players.length = 0;
	arYama = [];
	tehai = [];
	arKawa = [[], [], [], []];
	arFuritenCheckRichi = [[], [], [], []];
	arFuritenCheckTurn = [[], [], [], []];
	arRichiJunme = [-1, -1, -1, -1];
	arFuroJunme = [[], [], [], []];
	arFuroHistory = [[], [], [], []];
	arKakanHistory = [[], [], [], []];
	isRinshanChance = false;
	arIppatsuChance = [false, false, false, false];
	arChihouChance = [true, true, true, true];
	arWRichi = [true, true, true, true];
	dorahyouji = '';
	visiblePai = '';
	nYamaIndex = 0;
	sutehai = '';
	tsumo = '';
};

const shuffle = (array: string[]) => { 
	for (let i = array.length - 1; i > 0; i--) { 
		const j = Math.floor(Math.random() * (i + 1)); 
		[array[i], array[j]] = [array[j], array[i]]; 
	} 
	return array; 
}; 

