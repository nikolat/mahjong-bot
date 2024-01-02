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
