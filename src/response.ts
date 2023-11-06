import type { EventTemplate, VerifiedEvent, Event as NostrEvent } from 'nostr-tools';
import { Mode, Signer } from './utils';

export const getResponseEvent = async (requestEvent: NostrEvent, signer: Signer, mode: Mode): Promise<VerifiedEvent | null> => {
	if (requestEvent.pubkey === signer.getPublicKey()) {
		//自分自身の投稿には反応しない
		return null;
	}
	const res = await selectResponse(requestEvent, mode);
	if (res === null) {
		//反応しないことを選択
		return null;
	}
	return signer.finishEvent(res);
};

const selectResponse = async (event: NostrEvent, mode: Mode): Promise<EventTemplate | null> => {
	if (!isAllowedToPost(event)) {
		return null;
	}
	let res;
	switch (mode) {
		case Mode.Normal:
			res = await mode_normal(event);
			break;
		case Mode.Reply:
			res = await mode_reply(event);
			break;
		case Mode.Fav:
			res = mode_fav(event);
			break;
		default:
			throw new TypeError(`unknown mode: ${mode}`);
	}
	if (res === null) {
		return null;
	}
	const [content, kind, tags, created_at] = [...res, event.created_at + 1];
	const unsignedEvent: EventTemplate = { kind, tags, content, created_at };
	return unsignedEvent;
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

const getResmap = (mode: Mode): [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => Promise<[string, string[][]]> | [string, string[][]]][] => {
	const resmapNormal: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => [string, string[][]]][] = [
		[/ping$/, res_ping],
	];
	const resmapReply: [RegExp, (event: NostrEvent, mode: Mode, regstr: RegExp) => Promise<[string, string[][]]> | [string, string[][]]][] = [
	];
	switch (mode) {
		case Mode.Normal:
			return resmapNormal;
		case Mode.Reply:
			return [...resmapNormal, ...resmapReply];
		default:
			throw new TypeError(`unknown mode: ${mode}`);
	}
};

const mode_normal = async (event: NostrEvent): Promise<[string, number, string[][]] | null> => {
	//自分への話しかけはreplyで対応する
	//自分以外に話しかけている場合は割り込まない
	if (event.tags.some(tag => tag.length >= 2 && (tag[0] === 'p'))) {
		return null;
	}
	const resmap = getResmap(Mode.Normal);
	for (const [reg, func] of resmap) {
		if (reg.test(event.content)) {
			const [content, tags] = await func(event, Mode.Normal, reg);
			return [content, event.kind, tags];
		} 
	}
	return null;
};

const mode_reply = async (event: NostrEvent): Promise<[string, number, string[][]] | null> => {
	const resmap = getResmap(Mode.Reply);
	for (const [reg, func] of resmap) {
		if (reg.test(event.content)) {
			const [content, tags] = await func(event, Mode.Reply, reg);
			return [content, event.kind, tags];
		} 
	}
	return null;
};

const mode_fav = (event: NostrEvent): [string, number, string[][]] | null => {
	const reactionmap: [RegExp, string][] = [
	];
	for (const [reg, content] of reactionmap) {
		if (reg.test(event.content)) {
			const kind: number = 7;
			const tags: string[][] = getTagsFav(event);
			return [content, kind, tags];
		} 
	}
	return null;
};

const res_ping = (event: NostrEvent): [string, string[][]] => {
	return ['pong', getTagsReply(event)];
};

const getTags = (event: NostrEvent, mode: Mode): string[][] => {
	if (mode === Mode.Normal) {
		return getTagsAirrep(event);
	}
	else if (mode === Mode.Reply) {
		return getTagsReply(event);
	}
	else {
		throw new TypeError(`unknown mode: ${mode}`);
	}
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

const getTagsFav = (event: NostrEvent): string[][] => {
	const tagsFav: string[][] = event.tags.filter(tag => tag.length >= 2 && (tag[0] === 'e' || (tag[0] === 'p' && tag[1] !== event.pubkey)));
	tagsFav.push(['e', event.id, '', '']);
	tagsFav.push(['p', event.pubkey, '']);
	tagsFav.push(['k', String(event.kind)]);
	return tagsFav;
};
