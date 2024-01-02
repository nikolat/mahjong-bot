export const relayUrl = 'wss://relay.nostr.wirednet.jp';

export const getNsecs = (): (string | undefined)[] => {
	const nsec_jongbari = process.env.NOSTR_PRIVATE_KEY_JONGBARI;
	const nsec_rinrin = process.env.NOSTR_PRIVATE_KEY_RINRIN;
	const nsec_chunchun = process.env.NOSTR_PRIVATE_KEY_CHUNCHUN;
	const nsec_whanwhan = process.env.NOSTR_PRIVATE_KEY_WHANWHAN;
	return [nsec_jongbari, nsec_rinrin, nsec_chunchun, nsec_whanwhan];
};

export const isDebug = false;
