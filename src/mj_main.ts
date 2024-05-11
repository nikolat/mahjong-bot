import { type NostrEvent, nip19 } from 'nostr-tools';
import { getShanten } from './mjlib/mj_shanten';
import { canRichi, countKantsu, getAnkanHaiBest, getChiMaterial, getChiMaterialBest, getKakanHai, getKakanHaiBest, naniwokiru, shouldDaiminkan, shouldPon, shouldRichi } from './mjlib/mj_ai';
import { getScore } from './mjlib/mj_score';
import { addHai, compareFn, getDoraFromDorahyouji, paikind, removeHai, stringToArrayWithFuro } from './mjlib/mj_common';
import { getMachi } from './mjlib/mj_machi';
import { convertEmoji, getTagsAirrep, getTagsEmoji, getTagsReply } from './utils';

export const res_s_gamestart_call = (pubkey: string): void => {
	reset_game();
	players.push(pubkey);
};

export const res_s_join_call = (pubkey: string): number => {
	if (players.includes(pubkey)) {
		throw Error('You have already joined.');
	}
	if (players.length === 4) {
		throw Error('Sorry, we are full.');
	}
	players.push(pubkey);
	return players.length;
};

export const res_s_reset_call = (): void => {
	reset_game();
};

export const res_s_debug_call = (yama: string): void => {
	debugYama = stringToArrayWithFuro(yama)[0];
};

let debugYama: string[] = [];

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
	if (debugYama.length > 0)
		oyaIndex = 0;
	else
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
let arTehai: string[];
let savedTsumo: string;
let savedDoratsuchi: [string, string[][]] | undefined;
let savedKakan: [string, string[][]][] | undefined;
let savedSutehai: string;
let currentPlayer: number;
let reservedNaku = new Map<string, string[]>();
let reservedTenpai: Map<string, string>;
let dResponseNeed: Map<string, string>;
const arBafu = ['東', '南'];

const startKyoku = (event: NostrEvent): [string, string[][]][] => {
	const res: [string, string[][]][] = [];
	if (debugYama.length > 0) {
		arYama = debugYama;
		debugYama = [];
	}
	else {
		arYama = shuffle([...paikind, ...paikind, ...paikind, ...paikind]);
	}
	for (let i = 0; i < players.length; i++) {
		const t = arYama.slice(0 + 13*i, 13 + 13*i);
		t.sort(compareFn);
		arTehai[i] = t.join('');
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
	savedTsumo = arYama[nYamaIndex++];
	savedDoratsuchi = undefined;
	savedSutehai = '';
	currentPlayer = oyaIndex;
	reservedNaku = new Map<string, string[]>();
	reservedTenpai = new Map<string, string>();
	dResponseNeed = new Map<string, string>(players.map(p => [p, '']));
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
		const content = `nostr:${nip19.npubEncode(players[i])} NOTIFY haipai\n${tehaiToEmoji(arTehai[i])}`;
		const tags = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(arTehai[i])];
		res.push([content, tags]);
	}
	//dora通知
	const content_dora = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${dorahyouji}`;
	const tags_dora = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
	res.push([content_dora, tags_dora]);
	//ツモ通知
	const content_tsumo = `nostr:${nip19.npubEncode(players[oyaIndex])} NOTIFY tsumo nostr:${nip19.npubEncode(players[oyaIndex])} ${arYama.length - nYamaIndex} ${savedTsumo}`;
	const tags_tsumo = [...getTagsAirrep(event), ['p', players[oyaIndex], '']];
	res.push([content_tsumo, tags_tsumo]);
	//捨て牌問い合わせ
	dResponseNeed.set(players[oyaIndex], 'sutehai?');
	const content_sutehai = `${tehaiToEmoji(arTehai[oyaIndex])} ${tehaiToEmoji(savedTsumo)}\nnostr:${nip19.npubEncode(players[oyaIndex])} GET sutehai?`;
	const tags_sutehai = [...getTagsAirrep(event), ['p', players[oyaIndex], ''], ...getTagsEmoji(addHai(arTehai[oyaIndex], savedTsumo))];
	res.push([content_sutehai, tags_sutehai]);
	return res;
};

const tehaiToEmoji = (tehai: string): string => {
	const [hai_normal, hai_furo, hai_ankan] = stringToArrayWithFuro(tehai);
	return hai_normal.map(pi => `:${convertEmoji(pi)}:`).join('')
		+ ' ' + hai_furo.map(pi => '<' + stringToArrayWithFuro(pi)[0].map(p => `:${convertEmoji(p)}:`).join('') + '>').join('')
		+ ' ' + hai_ankan.map(pi => '(' + stringToArrayWithFuro(pi)[0].map(p => `:${convertEmoji(p)}:`).join('') + ')').join('')
};

//東家を先頭にしてリーチ済の他家の現物を返す
const getGenbutsu = (p: number): string[] => {
	const r: string[] = [];
	let findOya = false;
	let i = 0;
	while (r.length < 4) {
		if (i === oyaIndex)
			findOya = true;
		if (findOya) {
			if (i !== p && arFuritenCheckRichi[i].length > 0)
				r.push(Array.from(new Set<string>(stringToArrayWithFuro(arKawa[i].join('') + arFuritenCheckRichi[i].join(''))[0])).sort(compareFn).join(''));
			else
				r.push('');
		}
		i = (i + 1) % 4;
	}
	return r;
};

//現在見えている牌
const getVisiblePai = (p: number): string => {
	return visiblePai + stringToArrayWithFuro(arTehai[p])[0].join('');
};

const getScoreView = (i: number, atarihai: string, isTsumo: boolean) => {
	const richi: number = arRichiJunme[i] === 0 ? 2 : arRichiJunme[i] > 0 ? 1 : 0;
	const r = getScore(
		arTehai[i],
		atarihai,
		['1z', '2z'][bafu],
		getJifuHai(i),
		getDoraFromDorahyouji(dorahyouji),
		isTsumo,
		richi,
		arIppatsuChance[i],
		isRinshanChance && !isTsumo,
		isRinshanChance && isTsumo,
		arYama.length === nYamaIndex,
		arChihouChance[i],
	);
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

export const res_s_sutehai_call = (event: NostrEvent, action: string, pai: string): [string, string[][]][] => {
	const command = 'sutehai?';
	const res: [string, string[][]][] = [];
	if (savedDoratsuchi !== undefined) {
		res.push(savedDoratsuchi);
		savedDoratsuchi = undefined;
	}
	const i = players.indexOf(event.pubkey);
	currentPlayer = i;
	if (dResponseNeed.get(event.pubkey) !== command) {
		const content = `You are not required to send "${command}"`;
		const tags = getTagsReply(event);
		return [[content, tags]];
	}
	dResponseNeed.set(event.pubkey, '');
	switch (action) {
		case 'tsumo':
			if (canTsumo(i, savedTsumo)) {// 和了
				const content = getScoreView(i, savedTsumo, true) + '\n'
					+ `${tehaiToEmoji(arTehai[i])} :${convertEmoji(savedTsumo)}:`;
				const tags = [...getTagsAirrep(event), ...getTagsEmoji(addHai(arTehai[i], savedTsumo))];
				reset_game();
				return [[content, tags]];
			}
			else {
				const content = 'You cannot tsumo.';
				const tags = getTagsReply(event);
				res.push([content, tags]);
				savedSutehai = savedTsumo;
			}
			break;
		case 'richi':
			if (canRichi(addHai(arTehai[i], savedTsumo), savedTsumo, arRichiJunme[i] >= 0, arYama.length - nYamaIndex)) {
				arRichiJunme[i] = arKawa[i].length;
				const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(players[i])} richi`;
				const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content, tags]);
				savedSutehai = pai;
			}
			else {
				const content = 'You cannot richi.';
				const tags = getTagsReply(event);
				res.push([content, tags]);
				savedSutehai = savedTsumo;
			}
			break;
		case 'sutehai':
			const sutehaikouho = stringToArrayWithFuro(addHai(arTehai[i], savedTsumo))[0];
			if (sutehaikouho.includes(pai) && !(arRichiJunme[i] >= 0 && pai !== savedTsumo)) {
				savedSutehai = pai;
			}
			else {
				const content = `You cannot sutehai ${pai} .`;
				const tags = getTagsReply(event);
				res.push([content, tags]);
				savedSutehai = savedTsumo;
			}
			break;
		case 'ankan':
			if (canAnkan(i, savedTsumo, pai)) {
				arTehai[i] = addHai(arTehai[i], savedTsumo);
				isRinshanChance = true;
				const furoHai = pai.repeat(4);
				setAnkan(i, pai);
				const strDorahyoujiNew = arYama[52 + dorahyouji.length / 2];
				dorahyouji += strDorahyoujiNew;
				visiblePai += strDorahyoujiNew;
				savedTsumo = arYama[nYamaIndex++];
				//発声通知
				const content_say = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(players[i])} kan`;
				const tags_say = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_say, tags_say]);
				//晒した牌通知
				const content_open = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(players[i])} ${furoHai}`;
				const tags_open = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_open, tags_open]);
				//ツモ通知
				const content_tsumo = `nostr:${nip19.npubEncode(players[i])} NOTIFY tsumo nostr:${nip19.npubEncode(players[i])} ${arYama.length - nYamaIndex} ${savedTsumo}`;
				const tags_tsumo = [...getTagsAirrep(event), ['p', players[i], '']];
				res.push([content_tsumo, tags_tsumo]);
				//dora通知
				const content_dora = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${strDorahyoujiNew}`;
				const tags_dora = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_dora, tags_dora]);
				//捨て牌問い合わせ
				dResponseNeed.set(players[i], 'sutehai?');
				const content_sutehai = `${tehaiToEmoji(arTehai[i])} ${tehaiToEmoji(savedTsumo)}\nnostr:${nip19.npubEncode(players[i])} GET sutehai?`;
				const tags_sutehai = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(addHai(arTehai[i], savedTsumo))];
				res.push([content_sutehai, tags_sutehai]);
				return res;
			}
			else {
				const content = `You cannot ankan ${pai} .`;
				const tags = getTagsReply(event);
				res.push([content, tags]);
				savedSutehai = savedTsumo;
			}
			break;
		case 'kakan':
			if (canKakan(i, savedTsumo, pai)) {
				arTehai[i] = addHai(arTehai[i], savedTsumo);
				isRinshanChance = true;
				const furoHai = pai;
				setKakan(i, pai);
				const strDorahyoujiNew = arYama[52 + dorahyouji.length / 2];
				dorahyouji += strDorahyoujiNew;
				visiblePai += strDorahyoujiNew;
				//発声通知
				const content_say = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(players[i])} kan`;
				const tags_say = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_say, tags_say]);
				//晒した牌通知
				const content_open = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(players[i])} ${furoHai}`;
				const tags_open = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_open, tags_open]);
				//この時点でロン(槍槓)を受け付ける必要がある
				const naku: [string, string[][]][] = [];
				for (const index of [0, 1, 2, 3].filter(idx => idx !== i)) {
					const action: string[] = [];
					if (canRon(index, pai))
						action.push('ron');
					if (action.length > 0) {
						dResponseNeed.set(players[index], 'naku?');
						const content = `${tehaiToEmoji(arTehai[index])} ${tehaiToEmoji(pai)}\nnostr:${nip19.npubEncode(players[index])} GET naku? ${action.join(' ')}`;
						const tags = [...getTagsAirrep(event), ['p', players[index], ''], ...getTagsEmoji(addHai(arTehai[index], pai))];
						naku.push([content, tags]);
					}
				}
				savedTsumo = arYama[nYamaIndex++];
				savedKakan = [];
				//ツモ通知
				const content_tsumo = `nostr:${nip19.npubEncode(players[i])} NOTIFY tsumo nostr:${nip19.npubEncode(players[i])} ${arYama.length - nYamaIndex} ${savedTsumo}`;
				const tags_tsumo = [...getTagsAirrep(event), ['p', players[i], '']];
				savedKakan.push([content_tsumo, tags_tsumo]);
				//dora通知
				const content_dora = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${strDorahyoujiNew}`;
				const tags_dora = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				savedDoratsuchi = [content_dora, tags_dora];
				//捨て牌問い合わせ
				dResponseNeed.set(players[i], 'sutehai?');
				const content_sutehai = `${tehaiToEmoji(arTehai[i])} ${tehaiToEmoji(savedTsumo)}\nnostr:${nip19.npubEncode(players[i])} GET sutehai?`;
				const tags_sutehai = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(addHai(arTehai[i], savedTsumo))];
				savedKakan.push([content_sutehai, tags_sutehai]);
				//槍槓が可能であれば処理を分ける
				if (naku.length > 0) {
					return naku;
				}
				else {
					const resFinal = [...res, ...savedKakan];
					savedKakan = undefined;
					return resFinal;
				}
			}
			else {
				const content = `You cannot ankan ${pai} .`;
				const tags = getTagsReply(event);
				res.push([content, tags]);
				savedSutehai = savedTsumo;
			}
			break;
		default:
			throw new TypeError(`action ${action} is not supported`);
	}
	isRinshanChance = false;
	setSutehai(savedSutehai, i);
	if (savedTsumo)
		arTehai[i] = addHai(arTehai[i], savedTsumo);
	arTehai[i] = removeHai(arTehai[i], savedSutehai);
	const naku: [string, string[][]][] = [];
	for (const index of [0, 1, 2, 3].filter(idx => idx !== i)) {
		const action: string[] = [];
		if (canRon(index, pai))
			action.push('ron');
		if (canPon(index, pai))
			action.push('pon');
		if (canDaiminkan(index, pai))
			action.push('kan');
		if ((i + 1) % 4 == index && canChi(index, pai))
			action.push('chi');
		if (action.length > 0) {
			dResponseNeed.set(players[index], 'naku?');
			const content = `${tehaiToEmoji(arTehai[index])} ${tehaiToEmoji(savedSutehai)}\nnostr:${nip19.npubEncode(players[index])} GET naku? ${action.join(' ')}`;
			const tags = [...getTagsAirrep(event), ['p', players[index], ''], ...getTagsEmoji(addHai(arTehai[index], savedSutehai))];
			naku.push([content, tags]);
		}
	}
	if (naku.length > 0) {
		return [...res, ...naku];
	}
	return [...res, ...sendNextTurn(event)];
};

const setSutehai = (sute: string, nPlayer: number) => {
	arKawa[nPlayer].push(sute);
	visiblePai += sute;
	for (let i = 0; i < players.length; i++) {
		if (arRichiJunme[i] >= 0)
			arFuritenCheckRichi[i].push(sute);
		if (nPlayer === i)
			arFuritenCheckTurn[i] = [];
		else
			arFuritenCheckTurn[i].push(sute);
	}
};

const sendNextTurn = (event: NostrEvent): [string, string[][]][] => {
	const res: [string, string[][]][] = [];
	if (arYama[nYamaIndex] === undefined) {
		const content = 'ryukyoku';
		const tags = getTagsAirrep(event);
		return [[content, tags]];
	}
	setKyotaku(currentPlayer);
	savedTsumo = arYama[nYamaIndex++];
	const i2 = (currentPlayer + 1) % 4;
	//ツモ通知
	const content_tsumo = `nostr:${nip19.npubEncode(players[i2])} NOTIFY tsumo nostr:${nip19.npubEncode(players[i2])} ${arYama.length - nYamaIndex} ${savedTsumo}`;
	const tags_tsumo = [...getTagsAirrep(event), ['p', players[i2], '']];
	res.push([content_tsumo, tags_tsumo]);
	//捨て牌問い合わせ
	dResponseNeed.set(players[i2], 'sutehai?');
	const content_sutehai = `${tehaiToEmoji(arTehai[i2])} ${tehaiToEmoji(savedTsumo)}\nnostr:${nip19.npubEncode(players[i2])} GET sutehai?`;
	const tags_sutehai = [...getTagsAirrep(event), ['p', players[i2], ''], ...getTagsEmoji(addHai(arTehai[i2], savedTsumo))];
	res.push([content_sutehai, tags_sutehai]);
	return res;
};

const canTsumo = (nPlayer: number, atariHai: string): boolean => {
	if (atariHai === '')
		return false;
	//和了かどうか(シャンテン数が-1かどうか)検証する
	const shanten = getShanten(addHai(arTehai[nPlayer], atariHai))[0];
	if (shanten !== -1)
		return false;
	//役があるかどうか検証する
	const richi: number = arRichiJunme[nPlayer] === 0 ? 2 : arRichiJunme[nPlayer] > 0 ? 1 : 0;
	const score = getScore(
		arTehai[nPlayer],
		atariHai,
		['1z', '2z'][bafu],
		getJifuHai(nPlayer),
		getDoraFromDorahyouji(dorahyouji),
		true,
		richi,
		arIppatsuChance[nPlayer],
		false,
		isRinshanChance,
		arYama.length === nYamaIndex,
		arChihouChance[nPlayer],
	)[0];
	if (score <= 0)
		return false;
	return true;
};

const setKyotaku = (nPlayer: number): void => {
	if (arRichiJunme[nPlayer] === arKawa[nPlayer].length - 1) {
		kyotaku++;
		arScore[nPlayer] -= 1000;
		arIppatsuChance[nPlayer] = true;
		if (arChihouChance[nPlayer])
			arWRichi[nPlayer] = true;
	}
	else {
		arIppatsuChance[nPlayer] = false;
	}
	arChihouChance[nPlayer] = false;
};

const setFuro = (nFuroPlayer: number, nSutePlayer: number, sute: string, haiUsed: string): void => {
	arTehai[nFuroPlayer] = removeHai(arTehai[nFuroPlayer], haiUsed);
	arTehai[nFuroPlayer] = addFuro(arTehai[nFuroPlayer], sute + haiUsed, '<', '>');
	arFuroJunme[nSutePlayer].push(arKawa[nSutePlayer].length - 1);
	arFuroHistory[nFuroPlayer].push([sute, nSutePlayer]);
	arIppatsuChance = [false, false, false, false];
	arChihouChance = [false, false, false, false];
	visiblePai += haiUsed;
};

const setKakan = (nFuroPlayer: number, kakanHai: string) => {
	arTehai[nFuroPlayer] = removeHai(arTehai[nFuroPlayer], kakanHai);
	arTehai[nFuroPlayer] = arTehai[nFuroPlayer].replace(kakanHai.repeat(3), kakanHai.repeat(4));
	arKakanHistory[nFuroPlayer].push(kakanHai);
	arIppatsuChance = [false, false, false, false];
	arChihouChance = [false, false, false, false];
	visiblePai += kakanHai;
};

const setAnkan = (nFuroPlayer: number, ankanHai: string): void => {
	arTehai[nFuroPlayer] = removeHai(arTehai[nFuroPlayer], ankanHai.repeat(4));
	arTehai[nFuroPlayer] = addFuro(arTehai[nFuroPlayer], ankanHai.repeat(4), '(', ')');
	arIppatsuChance = [false, false, false, false];
	arChihouChance = [false, false, false, false];
	visiblePai += ankanHai.repeat(4);
};


const addFuro = (tehai: string, furo: string, s1: string, s2: string): string => {
	const sortedFuro = stringToArrayWithFuro(furo)[0];
	sortedFuro.sort(compareFn);
	const strFuro = sortedFuro.join('');
	const index = tehai.search(/[<\(]/);
	if (index >= 0) {
		return tehai.slice(0, index) + s1 + strFuro + s2 + tehai.slice(index);
	}
	else {
		return tehai + s1 + strFuro + s2;
	}
};

export const res_s_naku_call = (event: NostrEvent, action: string, pai1: string, pai2: string): [string, string[][]][] | null => {
	const command = 'naku?';
	if (dResponseNeed.get(event.pubkey) !== command) {
		const content = `You are not required to send "${command}"`;
		const tags = getTagsReply(event);
		return [[content, tags]];
	}
	reservedNaku.set(event.pubkey, [action, pai1, pai2]);
	dResponseNeed.set(event.pubkey, '');
	for (const [k, v] of dResponseNeed) {
		if (v !== '') {
			return null;
		}
	}
	//副露の優先順位を考慮
	let pubkey: string | undefined;
	let actions: string[] | undefined;
	let ronPubkeys: string[] = [];
	for (const [k, v] of reservedNaku) {
		if (v[0] === 'ron') {
			ronPubkeys.push(k);
		}
	}
	if (ronPubkeys.length === 3) {
		const res: [string, string[][]][] = [];
		for (const p of ronPubkeys) {
			const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(p)} ron`;
			const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
			res.push([content, tags]);
		}
		const content = 'ryukyoku\n三家和';
		const tags = getTagsAirrep(event);
		res.push([content, tags]);
		return res;
	}
	for (const a of ['ron', 'pon', 'kan', 'chi', 'no']) {
		for (const [k, v] of reservedNaku) {
			if (v[0] === a) {
				pubkey = k;
				actions = v;
				break;
			}
		}
		if (pubkey !== undefined)
			break;
	}
	reservedNaku = new Map<string, string[]>();
	if (pubkey === undefined || actions === undefined) {
		throw new Error('pubkey is undefined');
	}
	return execNaku(event, pubkey, actions);
};

const execNaku = (event: NostrEvent, pubkey: string, actions: string[]): [string, string[][]][] => {
	const res: [string, string[][]][] = [];
	const i = players.indexOf(pubkey);
	switch (actions[0]) {
		case 'ron':
			if (canRon(i, savedSutehai)) {
				const content = getScoreView(i, savedSutehai, false) + '\n'
				+ `${tehaiToEmoji(arTehai[i])} :${convertEmoji(savedSutehai)}:`;
				const tags = [...getTagsAirrep(event), ...getTagsEmoji(addHai(arTehai[i], savedSutehai))];
				reset_game();
				return [[content, tags]];
			}
			else {
				const content = 'You cannot ron.';
				const tags = getTagsReply(event);
				res.push([content, tags]);
			}
			break;
		case 'kan':
			if (canDaiminkan(i, savedSutehai)) {
				isRinshanChance = true;
				const furoHai = savedSutehai.repeat(4);
				setKyotaku(currentPlayer);
				setFuro(i, currentPlayer, savedSutehai, savedSutehai.repeat(3));
				const strDorahyoujiNew = arYama[52 + dorahyouji.length / 2];
				dorahyouji += strDorahyoujiNew;
				visiblePai += strDorahyoujiNew;
				savedTsumo = arYama[nYamaIndex++];
				//発声通知
				const content_say = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(players[i])} kan`;
				const tags_say = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_say, tags_say]);
				//晒した牌通知
				const content_open = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(players[i])} ${furoHai}`;
				const tags_open = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content_open, tags_open]);
				//ツモ通知
				const content_tsumo = `nostr:${nip19.npubEncode(players[i])} NOTIFY tsumo nostr:${nip19.npubEncode(players[i])} ${arYama.length - nYamaIndex} ${savedTsumo}`;
				const tags_tsumo = [...getTagsAirrep(event), ['p', players[i], '']];
				res.push([content_tsumo, tags_tsumo]);
				//捨て牌問い合わせ
				dResponseNeed.set(players[i], 'sutehai?');
				const content_sutehai = `${tehaiToEmoji(arTehai[i])} ${tehaiToEmoji(savedTsumo)}\nnostr:${nip19.npubEncode(players[i])} GET sutehai?`;
				const tags_sutehai = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(addHai(arTehai[i], savedTsumo))];
				res.push([content_sutehai, tags_sutehai]);
				//dora通知
				const content_dora = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${strDorahyoujiNew}`;
				const tags_dora = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				savedDoratsuchi = [content_dora, tags_dora];
				return res;
			}
			else {
				const content = 'You cannot pon.';
				const tags = getTagsReply(event);
				res.push([content, tags]);
			}
			break;
		case 'pon':
			if (canPon(i, savedSutehai)) {
				const furoHai = savedSutehai.repeat(3);
				setKyotaku(currentPlayer);
				setFuro(i, currentPlayer, savedSutehai, savedSutehai.repeat(2));
				savedTsumo = '';
				//発声通知
				const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(players[i])} pon`;
				const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content, tags]);
				//晒した牌通知
				const content2 = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(players[i])} ${furoHai}`;
				const tags2 = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content2, tags2]);
				//捨て牌問い合わせ
				dResponseNeed.set(players[i], 'sutehai?');
				const content3 = `${tehaiToEmoji(arTehai[i])}\nnostr:${nip19.npubEncode(players[i])} GET sutehai?`;
				const tags3 = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(arTehai[i])];
				res.push([content3, tags3]);
				return res;
			}
			else {
				const content = 'You cannot pon.';
				const tags = getTagsReply(event);
				res.push([content, tags]);
			}
			break;
		case 'chi':
			if (canChi(i, savedSutehai)) {
				const hai1: string = actions[1];
				const hai2: string = actions[2];
				const a: string[] = getChiMaterial(arTehai[i], savedSutehai);
				if (!a.includes(`${hai1}${hai2}`)) {
					const content = 'You cannot chi with ${hai1}${hai2}.';
					const tags = getTagsReply(event);
					res.push([content, tags]);
					break;
				}
				const furoArray = [savedSutehai, hai1, hai2];
				furoArray.sort(compareFn);
				const furoHai = furoArray.join('');
				setKyotaku(currentPlayer);
				setFuro(i, currentPlayer, savedSutehai, hai1 + hai2);
				savedTsumo = '';
				//発声通知
				const content = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(players[i])} chi`;
				const tags = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content, tags]);
				//晒した牌通知
				const content2 = `${players.map(pubkey => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(players[i])} ${furoHai}`;
				const tags2 = [...getTagsAirrep(event), ...players.map(pubkey => ['p', pubkey, ''])];
				res.push([content2, tags2]);
				//捨て牌問い合わせ
				dResponseNeed.set(players[i], 'sutehai?');
				const content3 = `${tehaiToEmoji(arTehai[i])}\nnostr:${nip19.npubEncode(players[i])} GET sutehai?`;
				const tags3 = [...getTagsAirrep(event), ['p', players[i], ''], ...getTagsEmoji(arTehai[i])];
				res.push([content3, tags3]);
				return res;
			}
			else {
				const content = 'You cannot chi.';
				const tags = getTagsReply(event);
				res.push([content, tags]);
			}
			break;
		case 'no':
			if (savedKakan !== undefined) {
				const resKakan = savedKakan;
				savedKakan = undefined;
				return resKakan;
			}
			break;
		default:
			throw new TypeError(`action "${actions[0]}" is not supported`);
	}
	return [...res, ...sendNextTurn(event)];
};

const canRon = (nPlayer: number, atariHai: string): boolean => {
	//和了かどうか(シャンテン数が-1かどうか)検証する
	const shanten = getShanten(addHai(arTehai[nPlayer], atariHai))[0];
	if (shanten !== -1)
		return false;
	//フリテンかどうか検証する
	const arMachi: string[] = stringToArrayWithFuro(getMachi(arTehai[nPlayer]))[0];
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
	const richi: number = arRichiJunme[nPlayer] === 0 ? 2 : arRichiJunme[nPlayer] > 0 ? 1 : 0;
	const score = getScore(
		arTehai[nPlayer],
		atariHai,
		['1z', '2z'][bafu],
		getJifuHai(nPlayer),
		getDoraFromDorahyouji(dorahyouji),
		false,
		richi,
		arIppatsuChance[nPlayer],
		isRinshanChance,
		false,
		arYama.length === nYamaIndex,
		arChihouChance[nPlayer],
	)[0];
	if (score <= 0)
		return false;
	return true;
};

const canPon = (nPlayer: number, suteHai: string): boolean => {
	if (arYama.length - nYamaIndex === 0)
		return false;
	if (arRichiJunme[nPlayer] >= 0)
		return false;
	const ak: number[] = arTehai.map(t => countKantsu(t));
	if (ak[0] + ak[1] + ak[2] + ak[3] == 4 && ak[0] != 4 && ak[1] != 4 && ak[2] != 4 && ak[3] != 4)
		return false;
	if (stringToArrayWithFuro(arTehai[nPlayer])[0].filter(h => h === suteHai).length >= 2)
		return true;
	return false;
};

const canChi = (nPlayer: number, suteHai: string): boolean => {
	if (arYama.length - nYamaIndex === 0)
		return false;
	if (arRichiJunme[nPlayer] >= 0)
		return false;
	const a = getChiMaterial(arTehai[nPlayer], suteHai);
	if (a.length > 0)
		return true;
	return false;
}

const canDaiminkan = (nPlayer: number, suteHai: string): boolean => {
	if (arYama.length - nYamaIndex === 0)
		return false;
	if (arRichiJunme[nPlayer] >= 0)
		return false;
	const ak: number[] = arTehai.map(t => countKantsu(t));
	if (ak[0] + ak[1] + ak[2] + ak[3] === 4)
		return false;
	if (stringToArrayWithFuro(arTehai[nPlayer])[0].filter(h => h === suteHai).length >= 3)
		return true;
	return false;
};

const canAnkan = (nPlayer: number, tsumoHai: string, ankanHaiSelected?: string): boolean => {
	if (arYama.length - nYamaIndex === 0)
		return false;
	const ak: number[] = arTehai.map(t => countKantsu(t));
	if (ak[0] + ak[1] + ak[2] + ak[3] === 4)
		return false;
	const arAnkanHai: string[] = getAnkanHai(addHai(arTehai[nPlayer], tsumoHai));
	if (arAnkanHai.length === 0)
		return false;
	if (ankanHaiSelected !== undefined && !arAnkanHai.includes(ankanHaiSelected))
		return false;
	//リーチ後の場合
	if (arRichiJunme[nPlayer] >= 0) {
		//送りカンの場合
		if (!arAnkanHai.includes(tsumoHai))
			return false;
		//和了の形が変わる場合
		for (const ankanhai of arAnkanHai) {
			if (ankanhai !== ankanHaiSelected)
				continue
			const tehaiNew = removeHai(addHai(arTehai[nPlayer], tsumoHai), ankanhai.repeat(4)) + `(${ankanhai.repeat(3)})`;
			const [shanten, arPattern] = getShanten(tehaiNew);
			if (shanten !== 0) {
				continue;
			}
			for (const pattern of arPattern) {
				const ap = pattern.split(',');
				if (!ap.includes(ankanhai.repeat(3)))//常に暗刻でないとダメ
					continue;
			}
			return true;
		}
		return false;
	}
	else {
		return true;
	}
};

const getAnkanHai = (hai: string): string[] => {
	const arHai: string[] = stringToArrayWithFuro(hai)[0];
	const arRet: string[] = [];
	for (const h of new Set<string>(arHai)) {
		if (arHai.filter(e => e === h).length >= 4)
			arRet.push(h);
	}
	return arRet;
};

const canKakan = (nPlayer: number, tsumoHai: string, kakanHaiSelected?: string): boolean => {
	if (arYama.length - nYamaIndex === 0)
		return false;
	const ak: number[] = arTehai.map(t => countKantsu(t));
	if (ak[0] + ak[1] + ak[2] + ak[3] === 4)
		return false;
	const arKakanHai: string[] = getKakanHai(addHai(arTehai[nPlayer], tsumoHai));
	if (kakanHaiSelected !== undefined && !arKakanHai.includes(kakanHaiSelected))
		return false;
	if (arKakanHai.length > 0)
		return true;
	return false;
};

export const res_c_sutehai_call = (event: NostrEvent): [string, string[][]][] => {
	const tsumo = savedTsumo;
	if (!tsumo) {
		return res_c_sutehai_after_furo_call(event);
	}
	const i = players.indexOf(event.tags.filter(tag => tag.length >= 2 && tag[0] === 'p').map(tag => tag[1])[0]);
	const shanten = getShanten(addHai(arTehai[i], tsumo))[0];
	const isRichi = arRichiJunme[i] >= 0;
	let action: string;
	let select: string;
	let dahai = '';
	let ankanHai: string | undefined;
	let kakanHai: string | undefined;
	if (shanten >= 0) {
		if (isRichi) {//リーチ済ならツモ切り
			dahai = tsumo;
		}
		else {
			dahai = naniwokiru(
				arTehai[i],
				tsumo,
				arKawa[i].join(''),
				['1z', '2z'][bafu],
				getJifuHai(i),
				dorahyouji,
				arRichiJunme.map(e => e >= 0),
				[0, 1, 2, 3].map(p => getGenbutsu(p).join('')),
				getVisiblePai(i),
			);
			if (canKakan(i, tsumo))
				kakanHai = getKakanHaiBest(arTehai[i], tsumo, ['1z', '2z'][bafu], getJifuHai(i), arRichiJunme);
		}
		if (canAnkan(i, tsumo))
			ankanHai = getAnkanHaiBest(tsumo, isRichi);
	}
	if (shanten === -1) {
		const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? tsumo\n:${convertEmoji(tsumo)}:`;
		const tags = [...getTagsReply(event), ...getTagsEmoji(tsumo)];
		return [[content, tags]];
	}
	else if (shouldRichi(arTehai[i], tsumo, isRichi, arYama.length - nYamaIndex, dahai, ['1z', '2z'][bafu], getJifuHai(i), dorahyouji)) {
		action = 'richi';
		select = dahai;
	}
	else if (ankanHai !== undefined) {
		action = 'ankan';
		select = ankanHai;
	}
	else if (kakanHai !== undefined) {
		action = 'kakan';
		select = kakanHai;
	}
	else {
		action = 'sutehai';
		select = dahai;
	}
	const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? ${action} ${select}\n:${convertEmoji(dahai)}:`;
	const tags = [...getTagsReply(event), ...getTagsEmoji(dahai)];
	return [[content, tags]];
};

export const res_c_sutehai_after_furo_call = (event: NostrEvent): [string, string[][]][] => {
	const i = players.indexOf(event.tags.filter(tag => tag.length >= 2 && tag[0] === 'p').map(tag => tag[1])[0]);
	const action = 'sutehai';
	const select = naniwokiru(
		arTehai[i],
		'',
		arKawa[i].join(''),
		['1z', '2z'][bafu],
		getJifuHai(i),
		dorahyouji,
		arRichiJunme.map(e => e >= 0),
		[0, 1, 2, 3].map(p => getGenbutsu(p).join('')),
		getVisiblePai(i),
	);
	const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? ${action} ${select}\n:${convertEmoji(select)}:`;
	const tags = [...getTagsReply(event), ...getTagsEmoji(select)];
	return [[content, tags]];
};

export const res_c_naku_call = (event: NostrEvent, action: string[]): [string, string[][]][] => {
	const i = players.indexOf(event.tags.filter(tag => tag.length >= 2 && tag[0] === 'p').map(tag => tag[1])[0]);
	let res = 'no';
	if (action.includes('ron')) {
		res = 'ron';
	}
	else if (action.includes('kan')) {
		if (shouldDaiminkan()) {
			res = 'kan';
		}
	}
	else if (action.includes('pon')) {
		if (shouldPon(arTehai[i], savedSutehai, ['1z', '2z'][bafu], getJifuHai(i), arRichiJunme)) {
			res = 'pon';
		}
	}
	else if (action.includes('chi')) {
		const s = getChiMaterialBest(arTehai[i], savedSutehai, ['1z', '2z'][bafu], getJifuHai(i), arRichiJunme);
		if (s !== '') {
			res = ['chi', s.slice(0, 2), s.slice(2, 4)].join(' ');
		}
	}
	const content = `nostr:${nip19.npubEncode(event.pubkey)} naku? ${res}`;
	const tags = getTagsReply(event);
	return [[content, tags]];
};

const reset_game = () => {
	players.length = 0;
	arYama = [];
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
	arTehai = [];
	savedTsumo = '';
	savedDoratsuchi = undefined;
	savedSutehai = '';
	currentPlayer = -1;
	reservedNaku = new Map<string, string[]>();
	//reservedTenpai = new Map<string, string>();
	dResponseNeed = new Map<string, string>();
};

const shuffle = (array: string[]) => { 
	for (let i = array.length - 1; i > 0; i--) { 
		const j = Math.floor(Math.random() * (i + 1)); 
		[array[i], array[j]] = [array[j], array[i]]; 
	} 
	return array; 
}; 

