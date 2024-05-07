import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { type EventTemplate, type NostrEvent, finalizeEvent, getPublicKey } from 'nostr-tools';

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

export const getTagsEmoji = (pi: string[]): string[][] => {
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
