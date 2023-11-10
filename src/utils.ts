import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { type EventTemplate, finishEvent, getPublicKey } from 'nostr-tools';

export const enum Mode {
	Server,
	Client,
};

export const buffer = async (readable: Readable) => {
	const chunks: Uint8Array[] = [];
	for await (const chunk of readable) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks);
};

export class Signer {

	#seckey: string;

	constructor(seckey: string) {
		this.#seckey = seckey;
	}

	getPublicKey = () => {
		return getPublicKey(this.#seckey);
	};

	finishEvent = (unsignedEvent: EventTemplate) => {
		return finishEvent(unsignedEvent, this.#seckey);
	};

};

export const relayUrl = 'wss://relay.nostr.wirednet.jp';

export const getNsecs = (): (string | undefined)[] => {
	const nsec_jongbari = process.env.NOSTR_PRIVATE_KEY_JONGBARI;
	const nsec_rinrin = process.env.NOSTR_PRIVATE_KEY_RINRIN;
	const nsec_chunchun = process.env.NOSTR_PRIVATE_KEY_CHUNCHUN;
	const nsec_whanwhan = process.env.NOSTR_PRIVATE_KEY_WHANWHAN;
	return [nsec_jongbari, nsec_rinrin, nsec_chunchun, nsec_whanwhan];
};

export const isDebug = false;
