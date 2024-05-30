import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import type { EventTemplate, NostrEvent } from 'nostr-tools/core';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { stringToArrayPlain } from './mjlib/mj_common.js';

export const enum Mode {
	Server,
	Client,
	Unyu,
	Unknown,
};

export const buffer = async (readable: Readable) => {
	const chunks: Uint8Array[] = [];
	for await (const chunk of readable) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks);
};

export class Signer {

	#seckey: Uint8Array;

	constructor(seckey: Uint8Array) {
		this.#seckey = seckey;
	}

	getPublicKey = () => {
		return getPublicKey(this.#seckey);
	};

	finishEvent = (unsignedEvent: EventTemplate) => {
		return finalizeEvent(unsignedEvent, this.#seckey);
	};

};

export const getTagsAirrep = (event: NostrEvent): string[][] => {
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

export const getTagsReply = (event: NostrEvent): string[][] => {
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

export const getTagsEmoji = (tehai: string): string[][] => {
	const pi = stringToArrayPlain(tehai);
	return Array.from(new Set(pi)).map(pi => ['emoji', convertEmoji(pi), getEmojiUrl(pi)]);
};

export const convertEmoji = (pai: string) => {
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
	'mahjong_m1': 'https://awayuki.github.io/emoji/mahjong-m1.png',
	'mahjong_m2': 'https://awayuki.github.io/emoji/mahjong-m2.png',
	'mahjong_m3': 'https://awayuki.github.io/emoji/mahjong-m3.png',
	'mahjong_m4': 'https://awayuki.github.io/emoji/mahjong-m4.png',
	'mahjong_m5': 'https://awayuki.github.io/emoji/mahjong-m5.png',
	'mahjong_m6': 'https://awayuki.github.io/emoji/mahjong-m6.png',
	'mahjong_m7': 'https://awayuki.github.io/emoji/mahjong-m7.png',
	'mahjong_m8': 'https://awayuki.github.io/emoji/mahjong-m8.png',
	'mahjong_m9': 'https://awayuki.github.io/emoji/mahjong-m9.png',
	'mahjong_p1': 'https://awayuki.github.io/emoji/mahjong-p1.png',
	'mahjong_p2': 'https://awayuki.github.io/emoji/mahjong-p2.png',
	'mahjong_p3': 'https://awayuki.github.io/emoji/mahjong-p3.png',
	'mahjong_p4': 'https://awayuki.github.io/emoji/mahjong-p4.png',
	'mahjong_p5': 'https://awayuki.github.io/emoji/mahjong-p5.png',
	'mahjong_p6': 'https://awayuki.github.io/emoji/mahjong-p6.png',
	'mahjong_p7': 'https://awayuki.github.io/emoji/mahjong-p7.png',
	'mahjong_p8': 'https://awayuki.github.io/emoji/mahjong-p8.png',
	'mahjong_p9': 'https://awayuki.github.io/emoji/mahjong-p9.png',
	'mahjong_s1': 'https://awayuki.github.io/emoji/mahjong-s1.png',
	'mahjong_s2': 'https://awayuki.github.io/emoji/mahjong-s2.png',
	'mahjong_s3': 'https://awayuki.github.io/emoji/mahjong-s3.png',
	'mahjong_s4': 'https://awayuki.github.io/emoji/mahjong-s4.png',
	'mahjong_s5': 'https://awayuki.github.io/emoji/mahjong-s5.png',
	'mahjong_s6': 'https://awayuki.github.io/emoji/mahjong-s6.png',
	'mahjong_s7': 'https://awayuki.github.io/emoji/mahjong-s7.png',
	'mahjong_s8': 'https://awayuki.github.io/emoji/mahjong-s8.png',
	'mahjong_s9': 'https://awayuki.github.io/emoji/mahjong-s9.png',
	'mahjong_east': 'https://awayuki.github.io/emoji/mahjong-east.png',
	'mahjong_south': 'https://awayuki.github.io/emoji/mahjong-south.png',
	'mahjong_west': 'https://awayuki.github.io/emoji/mahjong-west.png',
	'mahjong_north': 'https://awayuki.github.io/emoji/mahjong-north.png',
	'mahjong_white': 'https://awayuki.github.io/emoji/mahjong-white.png',
	'mahjong_green': 'https://awayuki.github.io/emoji/mahjong-green.png',
	'mahjong_red': 'https://awayuki.github.io/emoji/mahjong-red.png',
};

export const getScoreAddWithPao = (
	nAgariPlayer: number,
	nFurikomiPlayer: number,
	score: number,
	nTsumibou: number,
	nKyotaku: number,
	arTenpaiPlayerFlag: number[],
	nPaoPlayerDaisangen: number,
	nPaoPlayerDaisushi: number,
	countYakuman: number,
	nOyaIndex: number,
): number[] => {
	let arScoreAdd = [0, 0, 0, 0];
	let nPaoPlayer = -1;
	let paoScore = 0;
	if (nPaoPlayerDaisangen >= 0) {
		nPaoPlayer = nPaoPlayerDaisangen;
		paoScore = 32000;
	}
	else if (nPaoPlayerDaisushi >= 0) {
		nPaoPlayer = nPaoPlayerDaisushi;
		paoScore = 64000;
	}
	if (nAgariPlayer === nOyaIndex)
		paoScore = 1.5 * paoScore;
	if (nPaoPlayer >= 0) {
		let arScoreAdd1;
		let arScoreAdd2;
		if (nFurikomiPlayer >= 0) {
			arScoreAdd1 = getScoreAdd(nAgariPlayer, nFurikomiPlayer, score - (paoScore / 2), nTsumibou, nKyotaku, nOyaIndex, []);
			arScoreAdd2 = getScoreAdd(nAgariPlayer, nPaoPlayer, paoScore / 2, 0, 0, nOyaIndex, []);
		}
		else {
			if (countYakuman >= 2) {
				arScoreAdd1 = getScoreAdd(nAgariPlayer, -1, score - paoScore, nTsumibou, nKyotaku, nOyaIndex, []);
				arScoreAdd2 = getScoreAdd(nAgariPlayer, nPaoPlayer, paoScore, 0, 0, nOyaIndex, []);
			}
			else {
				arScoreAdd1 = getScoreAdd(nAgariPlayer, nPaoPlayer, score, nTsumibou, nKyotaku, nOyaIndex, []);
				arScoreAdd2 = [0, 0, 0, 0];
			}
		}
		for (let i = 0; i < 4; i++) {
			arScoreAdd[i] = arScoreAdd1[i] + arScoreAdd2[i];
		}
	}
	else {
		arScoreAdd = getScoreAdd(nAgariPlayer, nFurikomiPlayer, score, nTsumibou, nKyotaku, nOyaIndex, arTenpaiPlayerFlag);
	}
	return arScoreAdd;
};

export const getScoreAdd = (
	nAgariPlayer: number,
	nFurikomiPlayer: number,
	score: number,
	nTsumibou: number,
	nKyotaku: number,
	nOyaIndex: number,
	arTenpaiPlayerFlag: number[],
): number[] => {
	const arScoreAdd = [0, 0, 0, 0];
	if (arTenpaiPlayerFlag.length === 0) {
		if (nFurikomiPlayer >= 0) {
			arScoreAdd[nFurikomiPlayer] = -1 * (score + (300 * nTsumibou));
			arScoreAdd[nAgariPlayer] = score + (300 * nTsumibou) + (1000 * nKyotaku);
		}
		else {
			for (let i = 0; i < 4; i++) {
				if (nAgariPlayer === i) {
					if (nAgariPlayer === nOyaIndex) {
						const nShou = Math.floor(score / 300) * 100;
						const nAmari = score % 300;
						let nScore = nShou;
						if (nAmari > 0)
							nScore += 100;
						nScore = 3 * nScore;
						arScoreAdd[i] = nScore + (300 * nTsumibou) + (1000 * nKyotaku);
					}
					else {
						const nShou1 = Math.floor(score / 200) * 100;
						const nAmari1 = score % 200;
						let nScore1 = nShou1;
						if (nAmari1 > 0)
							nScore1 += 100;
						const nShou2 = Math.floor(score / 400) * 100;
						const nAmari2 = score % 400;
						let nScore2 = nShou2;
						if (nAmari2 > 0)
							nScore2 += 100;
						const nScore = nScore1 + (2 * nScore2);
						arScoreAdd[i] = nScore + (300 * nTsumibou) + (1000 * nKyotaku);
					}
				}
				else {
					if (nAgariPlayer === nOyaIndex) {
						const nShou = Math.floor(score / 300) * 100;
						const nAmari = score % 300;
						let nScore = nShou;
						if (nAmari > 0)
							nScore += 100;
						arScoreAdd[i] = -1 * (nScore + (100 * nTsumibou));
					}
					else {
						if (i === nOyaIndex) {
							const nShou = Math.floor(score / 200) * 100;
							const nAmari = score % 200;
							let nScore = nShou;
							if (nAmari > 0)
								nScore += 100;
							arScoreAdd[i] = -1 * (nScore + (100 * nTsumibou));
						}
						else {
							const nShou = Math.floor(score / 400) * 100;
							const nAmari = score % 400;
							let nScore = nShou;
							if (nAmari > 0)
								nScore += 100;
							arScoreAdd[i] = -1 * (nScore + (100 * nTsumibou));
						}
					}
				}
			}
		}
	}
	else {
		let nTenpai = 0;
		for (let i = 0; i < arTenpaiPlayerFlag.length; i++) {
			nTenpai += arTenpaiPlayerFlag[i];
		}
		let plus;
		let minus;
		if (nTenpai === 0 || nTenpai === 4) {
			plus = 0;
			minus = 0;
		}
		else {
			plus = 3000 / nTenpai;
			minus = -3000 / (4 - nTenpai);
		}
		for (let i = 0; i < arTenpaiPlayerFlag.length; i++) {
			if (arTenpaiPlayerFlag[i])
				arScoreAdd[i] = plus;
			else
				arScoreAdd[i] = minus;
		}
	}
	return arScoreAdd;
};
