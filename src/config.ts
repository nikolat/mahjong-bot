export const relayUrls = [
  'wss://relay.nostr.wirednet.jp/',
  'wss://yabu.me/',
  //'wss://nostr-relay.nokotaro.com/',
  //'wss://nrelay.c-stellar.net/',
  //'wss://relay.mymt.casa/',
];

export const getNsecs = (): (string | undefined)[] => {
  const nsec_jongbari = process.env.NOSTR_PRIVATE_KEY_JONGBARI;
  const nsec_rinrin = process.env.NOSTR_PRIVATE_KEY_RINRIN;
  const nsec_chunchun = process.env.NOSTR_PRIVATE_KEY_CHUNCHUN;
  const nsec_whanwhan = process.env.NOSTR_PRIVATE_KEY_WHANWHAN;
  const nsec_bee = process.env.NOSTR_PRIVATE_KEY_BEE;
  const nsec_unyu = process.env.NOSTR_PRIVATE_KEY_UNYU;
  return [nsec_jongbari, nsec_rinrin, nsec_chunchun, nsec_whanwhan, nsec_bee, nsec_unyu];
};

export const isDebug = false;
