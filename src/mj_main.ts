import type { NostrEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { getShanten } from './mjlib/mj_shanten.js';
import {
  canRichi,
  countKantsu,
  getAnkanHai,
  getAnkanHaiBest,
  getChiMaterial,
  getChiMaterialBest,
  getKakanHai,
  getKakanHaiBest,
  naniwokiru,
  shouldDaiminkan,
  shouldPon,
  shouldRichi,
} from './mjlib/mj_ai.js';
import { getScore } from './mjlib/mj_score.js';
import {
  addFuro,
  addHai,
  compareFn,
  getDoraFromDorahyouji,
  paikind,
  removeHai,
  shuffle,
  stringToArrayPlain,
  stringToArrayWithFuro,
} from './mjlib/mj_common.js';
import { getMachi } from './mjlib/mj_machi.js';
import { convertEmoji, getEmojiTag, getScoreAdd, getScoreAddWithPao, getTagsAirrep, getTagsEmoji, getTagsReply } from './utils.js';

export class MahjongCore {
  #status_kind = 30315;
  #arBafu: string[];
  #debugYama: string[];
  #status: string;
  #players: string[];
  #arScore: number[];
  #tsumibou: number;
  #kyotaku: number;
  #bafu: number;
  #kyoku: number;
  #oyaIndex: number;
  #arYama: string[];
  #arKawa: string[][];
  #arFuritenCheckRichi: string[][];
  #arFuritenCheckTurn: string[][];
  #arRichiJunme: number[];
  #arFuroJunme: number[][];
  #arFuroHistory: [string, number][][];
  #arKakanHistory: string[][];
  #isRinshanChance: boolean;
  #arIppatsuChance: boolean[];
  #arChihouChance: boolean[];
  #arWRichi: boolean[];
  #dorahyouji: string;
  #visiblePai: string;
  #nYamaIndex: number;
  #arTehai: string[];
  #savedTsumo: string;
  #savedDoratsuchi: [string, string[][]] | undefined;
  #savedKakan: [string, string[][]][] | undefined;
  #savedSutehai: string;
  #currentPlayer: number;
  #reservedNaku: Map<string, string[]>;
  #dResponseNeed: Map<string, string>;

  constructor(bafuLength: number = 2) {
    this.#arBafu = ['東', '南', '西', '北'].slice(0, bafuLength);
    this.#debugYama = [];
    this.#status = '';
    this.#players = [];
    this.#arScore = [];
    this.#tsumibou = 0;
    this.#kyotaku = 0;
    this.#bafu = 0;
    this.#kyoku = 0;
    this.#oyaIndex = 0;
    this.#arYama = [];
    this.#arKawa = [];
    this.#arFuritenCheckRichi = [];
    this.#arFuritenCheckTurn = [];
    this.#arRichiJunme = [];
    this.#arFuroJunme = [];
    this.#arFuroHistory = [];
    this.#arKakanHistory = [];
    this.#isRinshanChance = false;
    this.#arIppatsuChance = [];
    this.#arChihouChance = [];
    this.#arWRichi = [];
    this.#dorahyouji = '';
    this.#visiblePai = '';
    this.#nYamaIndex = 0;
    this.#arTehai = [];
    this.#savedTsumo = '';
    this.#savedDoratsuchi = undefined;
    this.#savedKakan = undefined;
    this.#savedSutehai = '';
    this.#currentPlayer = 0;
    this.#reservedNaku = new Map<string, string[]>();
    this.#dResponseNeed = new Map<string, string>();
  }

  res_s_gamestart_call = (event: NostrEvent): [string, number, string[][]][] => {
    if (this.#status) {
      return [['Playing now. Please reset first.', event.kind, getTagsReply(event)]];
    }
    this.#reset_game();
    this.#players.push(event.pubkey);
    this.#status = '募集中 1/4';
    const channedId = event.tags.find((tag) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root')?.at(1)!;
    return [
      [this.#status, this.#status_kind, [['d', channedId]]],
      ['Waiting for players.\nMention "join" to me.', event.kind, getTagsAirrep(event)],
    ];
  };

  res_s_join_call = (event: NostrEvent): [string, number, string[][]][] => {
    if (!this.#status.startsWith('募集中')) {
      return [['Not looking for players.', event.kind, getTagsReply(event)]];
    }
    if (this.#players.includes(event.pubkey)) {
      return [['You have already joined.', event.kind, getTagsReply(event)]];
    }
    if (this.#players.length === 4) {
      return [['Sorry, we are full.', event.kind, getTagsReply(event)]];
    }
    this.#players.push(event.pubkey);
    if (this.#players.length === 4) {
      return this.mahjongGameStart(event);
    } else {
      this.#status = `募集中 ${this.#players.length}/4`;
      const channedId = event.tags.find((tag) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root')?.at(1)!;
      return [
        [this.#status, this.#status_kind, [['d', channedId]]],
        [`${this.#players.length}/4 joined.`, event.kind, getTagsAirrep(event)],
      ];
    }
  };

  res_s_reset_call = (): void => {
    this.#reset_game();
  };

  res_s_debug_call = (yama: string): void => {
    this.#debugYama = stringToArrayWithFuro(yama)[0];
  };

  res_s_status_call = (event: NostrEvent): [string, number, string[][]][] => {
    const a: string[] = [
      `${this.#arBafu[this.#bafu]}${this.#kyoku}局 :${convertEmoji('stick100')}:x${this.#tsumibou} :${convertEmoji('stick1000')}:x${this.#kyotaku}`,
      `${this.#tehaiToEmoji(this.#dorahyouji)}${`:${convertEmoji('back')}:`.repeat((10 - this.#dorahyouji.length) / 2)}`,
      '',
    ];
    const dSeki = this.#getSeki(this.#oyaIndex);
    let emojiHai: string[] = stringToArrayWithFuro(this.#dorahyouji)[0];
    for (let i = 0; i < this.#players.length; i++) {
      a.push(`nostr:${nip19.npubEncode(this.#players[i])} ${dSeki.get(this.#players[i])} ${this.#arScore[i]}点`);
      a.push(this.#tehaiToEmoji(this.#arTehai[i]));
      a.push(
        this.#arKawa[i]
          .map((pai, index) => (this.#arRichiJunme[i] === index ? `:${convertEmoji('stick1000')}:` : '') + this.#tehaiToEmoji(pai))
          .join(''),
      );
      emojiHai = [...emojiHai, ...stringToArrayPlain(this.#arTehai[i]), ...this.#arKawa[i]];
    }
    const content = a.join('\n');
    const tags = [
      ...getTagsAirrep(event),
      getEmojiTag('stick100'),
      getEmojiTag('stick1000'),
      getEmojiTag('back'),
      ...getTagsEmoji(emojiHai.join('')),
    ];
    return [[content, event.kind, tags]];
  };

  mahjongGameStart = (event: NostrEvent): [string, number, string[][]][] => {
    const res: [string, string[][]][] = [];
    this.#arScore = [25000, 25000, 25000, 25000];
    this.#tsumibou = 0;
    this.#kyotaku = 0;
    this.#bafu = 0;
    this.#kyoku = 1;
    if (this.#debugYama.length > 0) this.#oyaIndex = 0;
    else this.#oyaIndex = Math.floor(Math.random() * 4);
    const dSeki = this.#getSeki(this.#oyaIndex);
    for (let i = 0; i < this.#players.length; i++) {
      const content = `nostr:${nip19.npubEncode(this.#players[i])} #gamestart NOTIFY gamestart ${dSeki.get(this.#players[i])} ${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')}`;
      const tags = [...getTagsAirrep(event), ['p', this.#players[i], ''], ['t', 'gamestart']];
      res.push([content, tags]);
    }
    const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
    return [...res2, ...this.#startKyoku(event)];
  };

  #getSeki = (oya: number): Map<string, string> => {
    const seki = ['東', '南', '西', '北'];
    const dSeki = new Map<string, string>();
    const pNames: string[] = [];
    for (let i = 0; i < this.#players.length; i++) {
      pNames.push(this.#players[(i + oya) % 4]);
    }
    for (let i = 0; i < pNames.length; i++) {
      dSeki.set(pNames[i], seki[i]);
    }
    return dSeki;
  };

  res_s_next_call = (event: NostrEvent): [string, number, string[][]][] => {
    if (this.#status !== 'next待ち') {
      return [['We cannot go to the next stage yet.', event.kind, getTagsReply(event)]];
    }
    return this.#startKyoku(event);
  };

  #startKyoku = (event: NostrEvent): [string, number, string[][]][] => {
    const res: [string, string[][]][] = [];
    if (this.#bafu >= this.#arBafu.length) {
      //gameend通知
      const content_gameend = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY gameend ${[0, 1, 2, 3].map((i) => `nostr:${nip19.npubEncode(this.#players[i])} ${this.#arScore[i]}`).join(' ')}`;
      const tags_gameend = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
      res.push([content_gameend, tags_gameend]);
      //点数表示
      const scoremap = new Map<string, number>([0, 1, 2, 3].map((i) => [this.#players[i], this.#arScore[i]]));
      let i = 0;
      const rank = ['🥇', '🥈', '🥉', '🏅'];
      const r = [];
      const sortedScoreMap = new Map([...scoremap].sort((a, b) => b[1] - a[1]));
      for (const [k, v] of sortedScoreMap) {
        r.push(`${rank[i]} nostr:${nip19.npubEncode(k)} ${v}`);
        i++;
      }
      const content_result = r.join('\n');
      const tags_result = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
      res.push([content_result, tags_result]);
      this.#reset_game();
      const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
      const channedId = event.tags.find((tag) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root')?.at(1)!;
      return [['', this.#status_kind, [['d', channedId]]], ...res2];
    }
    this.#status = '対局中';
    if (this.#debugYama.length > 0) {
      this.#arYama = this.#debugYama;
      this.#debugYama = [];
    } else {
      this.#arYama = shuffle([...paikind, ...paikind, ...paikind, ...paikind]);
    }
    for (let i = 0; i < this.#players.length; i++) {
      const t = this.#arYama.slice(0 + 13 * i, 13 + 13 * i);
      t.sort(compareFn);
      this.#arTehai[i] = t.join('');
    }
    this.#arKawa = [[], [], [], []];
    this.#arFuritenCheckRichi = [[], [], [], []];
    this.#arFuritenCheckTurn = [[], [], [], []];
    this.#arRichiJunme = [-1, -1, -1, -1];
    this.#arFuroJunme = [[], [], [], []];
    this.#arFuroHistory = [[], [], [], []];
    this.#arKakanHistory = [[], [], [], []];
    this.#isRinshanChance = false;
    this.#arIppatsuChance = [false, false, false, false];
    this.#arChihouChance = [true, true, true, true];
    this.#arWRichi = [false, false, false, false];
    this.#dorahyouji = this.#arYama[52];
    this.#visiblePai = this.#dorahyouji;
    this.#nYamaIndex = 66; //王牌14枚(from 52 to 65)抜く
    this.#savedTsumo = this.#arYama[this.#nYamaIndex++];
    this.#savedDoratsuchi = undefined;
    this.#savedSutehai = '';
    this.#currentPlayer = this.#oyaIndex;
    this.#reservedNaku = new Map<string, string[]>();
    //	reservedTenpai = new Map<string, string>();
    this.#dResponseNeed = new Map<string, string>(this.#players.map((p) => [p, '']));
    let s: string = '';
    //kyokustart通知
    const content = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} #kyokustart NOTIFY kyokustart ${this.#arBafu[this.#bafu]} nostr:${nip19.npubEncode(this.#players[this.#oyaIndex])} ${this.#tsumibou} ${1000 * this.#kyotaku}`;
    const tags = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, '']), ['t', 'kyokustart']];
    res.push([content, tags]);
    //point通知
    for (let i = 0; i < this.#players.length; i++) {
      const content = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY point nostr:${nip19.npubEncode(this.#players[i])} = ${this.#arScore[i]}`;
      const tags = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
      res.push([content, tags]);
    }
    //haipai通知
    for (let i = 0; i < this.#players.length; i++) {
      const content = `nostr:${nip19.npubEncode(this.#players[i])} NOTIFY haipai nostr:${nip19.npubEncode(this.#players[i])} ${this.#arTehai[i]}\n${this.#tehaiToEmoji(this.#arTehai[i])}`;
      const tags = [...getTagsAirrep(event), ['p', this.#players[i], ''], ...getTagsEmoji(this.#arTehai[i])];
      res.push([content, tags]);
    }
    //dora通知
    const content_dora = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${this.#dorahyouji}`;
    const tags_dora = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
    res.push([content_dora, tags_dora]);
    //ツモ通知
    const content_tsumo = `nostr:${nip19.npubEncode(this.#players[this.#oyaIndex])} NOTIFY tsumo nostr:${nip19.npubEncode(this.#players[this.#oyaIndex])} ${this.#arYama.length - this.#nYamaIndex} ${this.#savedTsumo}`;
    const tags_tsumo = [...getTagsAirrep(event), ['p', this.#players[this.#oyaIndex], '']];
    res.push([content_tsumo, tags_tsumo]);
    //捨て牌問い合わせ
    this.#dResponseNeed.set(this.#players[this.#oyaIndex], 'sutehai?');
    const content_sutehai = `${this.#tehaiToEmoji(this.#arTehai[this.#oyaIndex])} ${this.#tehaiToEmoji(this.#savedTsumo)}\nnostr:${nip19.npubEncode(this.#players[this.#oyaIndex])} GET sutehai?`;
    const tags_sutehai = [
      ...getTagsAirrep(event),
      ['p', this.#players[this.#oyaIndex], ''],
      ...getTagsEmoji(addHai(this.#arTehai[this.#oyaIndex], this.#savedTsumo)),
    ];
    res.push([content_sutehai, tags_sutehai]);
    const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
    const channedId = event.tags.find((tag) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root')?.at(1)!;
    return [[this.#status, this.#status_kind, [['d', channedId]]], ...res2];
  };

  #tehaiToEmoji = (tehai: string): string => {
    return tehai.replaceAll(/[1-9][mpsz]/g, (p) => `:${convertEmoji(p)}:`);
  };

  //東家を先頭にしてリーチ済の他家の現物を返す
  #getGenbutsu = (p: number): string[] => {
    const r: string[] = [];
    let findOya = false;
    let i = 0;
    while (r.length < 4) {
      if (i === this.#oyaIndex) findOya = true;
      if (findOya) {
        if (i !== p && this.#arFuritenCheckRichi[i].length > 0)
          r.push(
            Array.from(new Set<string>(stringToArrayWithFuro(this.#arKawa[i].join('') + this.#arFuritenCheckRichi[i].join(''))[0]))
              .sort(compareFn)
              .join(''),
          );
        else r.push('');
      }
      i = (i + 1) % 4;
    }
    return r;
  };

  //現在見えている牌
  #getVisiblePai = (p: number): string => {
    return this.#visiblePai + stringToArrayWithFuro(this.#arTehai[p])[0].join('');
  };

  #getScoreView = (
    event: NostrEvent,
    nAgariPlayer: number,
    nFurikomiPlayer: number,
    atarihai: string,
    isTsumo: boolean,
  ): [string, number, string[][]][] => {
    const richi: number = this.#arRichiJunme[nAgariPlayer] === 0 ? 2 : this.#arRichiJunme[nAgariPlayer] > 0 ? 1 : 0;
    const arUradorahyouji: string[] = [];
    for (let i = 0; i < stringToArrayWithFuro(this.#dorahyouji)[0].length; i++) {
      arUradorahyouji.push(this.#arYama[59 + i]);
    }
    if (richi > 0) {
      this.#dorahyouji += arUradorahyouji.join('');
    }
    const r = getScore(
      this.#arTehai[nAgariPlayer],
      atarihai,
      ['1z', '2z'][this.#bafu],
      this.#getJifuHai(nAgariPlayer),
      getDoraFromDorahyouji(this.#dorahyouji),
      isTsumo,
      richi,
      this.#arIppatsuChance[nAgariPlayer],
      this.#isRinshanChance && !isTsumo,
      this.#isRinshanChance && isTsumo,
      this.#arYama.length === this.#nYamaIndex,
      this.#arChihouChance[nAgariPlayer],
    );
    let content = '';
    let countYakuman = 0;
    if (r[2].size > 0) {
      for (const [k, v] of r[2]) {
        content += `${k} ${v >= 2 ? `${v}倍` : ''}役満\n`;
        countYakuman += v;
      }
    } else {
      let han = 0;
      for (const [k, v] of r[3]) {
        han += v;
        content += `${k} ${v}翻\n`;
      }
      content += `${r[1]}符${han}翻\n`;
    }
    const point: number[] = getScoreAddWithPao(
      nAgariPlayer,
      nFurikomiPlayer,
      r[0],
      this.#tsumibou,
      this.#kyotaku,
      [],
      -1,
      -1,
      countYakuman,
      this.#oyaIndex,
    );
    content += `${r[0]}点\n`;
    for (let i = 0; i < this.#players.length; i++) {
      if (point[i] !== 0) {
        content += `nostr:${nip19.npubEncode(this.#players[i])} ${point[i] > 0 ? '+' : ''}${point[i]}\n`;
        this.#arScore[i] += point[i];
      }
    }
    content += '\n';
    for (let i = 0; i < this.#players.length; i++) {
      content += `nostr:${nip19.npubEncode(this.#players[i])} ${this.#arScore[i]}\n`;
    }
    const content_view = content + '\n' + `${this.#tehaiToEmoji(this.#arTehai[nAgariPlayer])} :${convertEmoji(atarihai)}:`;
    const tags_view = [...getTagsAirrep(event), ...getTagsEmoji(addHai(this.#arTehai[nAgariPlayer], atarihai))];
    return [
      ...this.#goNextKyoku(event, nAgariPlayer, r[1], r[3], arUradorahyouji, point, [0, 0, 0, 0], true),
      [content_view, event.kind, tags_view],
    ];
  };

  #goNextKyoku = (
    event: NostrEvent,
    nAgariPlayer: number,
    nFu: number,
    dYakuAndHan: Map<string, number>,
    arUradorahyouji: string[],
    arScoreAdd: number[],
    arTenpaiPlayerFlag: number[],
    needNotify: boolean,
  ): [string, number, string[][]][] => {
    const res: [string, string[][]][] = [];
    //通知
    if (needNotify) {
      if (nAgariPlayer >= 0) {
        if (this.#arRichiJunme[nAgariPlayer] >= 0) {
          for (let i = 0; i < arUradorahyouji.length; i++) {
            const content_uradorahyouji = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${arUradorahyouji[i]}`;
            const tags_uradorahyouji = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
            res.push([content_uradorahyouji, tags_uradorahyouji]);
          }
        }
        const a = ['agari', `nostr:${nip19.npubEncode(this.#players[nAgariPlayer])}`, nFu];
        for (const [k, v] of dYakuAndHan) {
          a.push(`${k},${v}`);
        }
        const content_agari = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY ${a.join(' ')}`;
        const tags_agari = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
        res.push([content_agari, tags_agari]);
      } else {
        const content_ryukyoku = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY ryukyoku`;
        const tags_ryukyoku = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
        res.push([content_ryukyoku, tags_ryukyoku]);
        for (let i = 0; i < 4; i++) {
          const say = arTenpaiPlayerFlag[i] !== 0 ? 'tenpai' : 'noten';
          const content_tenpai = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} ${say}`;
          const tags_tenpai = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_tenpai, tags_tenpai]);
        }
      }
      for (let i = 0; i < 4; i++) {
        let fugo = '';
        if (arScoreAdd[i] > 0) fugo = '+';
        else if (arScoreAdd[i] < 0) fugo = '-';
        if (fugo !== '') {
          const content_point = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY point nostr:${nip19.npubEncode(this.#players[i])} ${fugo} ${Math.abs(arScoreAdd[i])}`;
          const tags_point = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_point, tags_point]);
        }
      }
    } else {
      const content_ryukyoku = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY ryukyoku`;
      const tags_ryukyoku = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
      res.push([content_ryukyoku, tags_ryukyoku]);
    }
    const content_kyokuend = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY kyokuend`;
    const tags_kyokuend = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
    res.push([content_kyokuend, tags_kyokuend]);
    this.#status = 'next待ち';
    //連荘判定
    if (nAgariPlayer >= 0) {
      this.#kyotaku = 0;
    }
    if (nAgariPlayer === this.#oyaIndex) {
      this.#tsumibou++;
    } else {
      if (nAgariPlayer >= 0) this.#tsumibou = 0;
      else this.#tsumibou++;
      if (!arTenpaiPlayerFlag[this.#oyaIndex]) {
        this.#kyoku++;
        if (this.#kyoku == 5) {
          this.#kyoku = 1;
          this.#bafu++;
        }
        this.#oyaIndex = (this.#oyaIndex + 1) % 4;
      }
    }
    const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
    const channedId = event.tags.find((tag) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root')?.at(1)!;
    return [[this.#status, this.#status_kind, [['d', channedId]]], ...res2];
  };

  #getJifuHai = (nPlayer: number): string => {
    const seki = ['1z', '2z', '3z', '4z'];
    const dSeki = new Map<string, string>();
    const pNames: string[] = [];
    for (let i = 0; i < this.#players.length; i++) {
      pNames.push(this.#players[(i + this.#oyaIndex) % 4]);
    }
    for (let i = 0; i < pNames.length; i++) {
      dSeki.set(pNames[i], seki[i]);
    }
    return dSeki.get(this.#players[nPlayer]) ?? '';
  };

  res_s_sutehai_call = (event: NostrEvent, action: string, pai: string): [string, number, string[][]][] => {
    const command = 'sutehai?';
    const res: [string, string[][]][] = [];
    if (this.#dResponseNeed.get(event.pubkey) !== command) {
      const content = `You are not required to send "${command}"`;
      const tags = getTagsReply(event);
      return [[content, event.kind, tags]];
    }
    if (this.#savedDoratsuchi !== undefined) {
      res.push(this.#savedDoratsuchi);
      this.#savedDoratsuchi = undefined;
    }
    const i = this.#players.indexOf(event.pubkey);
    this.#currentPlayer = i;
    this.#dResponseNeed.set(event.pubkey, '');
    switch (action) {
      case 'tsumo':
        if (this.#canTsumo(i, this.#savedTsumo)) {
          // 和了
          const content_say = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} tsumo`;
          const tags_say = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_say, tags_say]);
          const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
          return [...res2, ...this.#getScoreView(event, i, -1, this.#savedTsumo, true)];
        } else {
          const content = 'You cannot tsumo.';
          const tags = getTagsReply(event);
          this.#dResponseNeed.set(event.pubkey, command);
          return [[content, event.kind, tags]];
        }
        break;
      case 'richi':
        if (canRichi(this.#arTehai[i], this.#savedTsumo, this.#arRichiJunme[i] >= 0, this.#arYama.length - this.#nYamaIndex, pai)) {
          this.#arRichiJunme[i] = this.#arKawa[i].length;
          const content = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} richi`;
          const tags = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content, tags]);
          this.#savedSutehai = pai;
        } else {
          const content = `You cannot richi ${pai}.`;
          const tags = getTagsReply(event);
          this.#dResponseNeed.set(event.pubkey, command);
          return [[content, event.kind, tags]];
        }
        break;
      case 'sutehai':
        const sutehaikouho = stringToArrayWithFuro(addHai(this.#arTehai[i], this.#savedTsumo))[0];
        if (sutehaikouho.includes(pai) && !(this.#arRichiJunme[i] >= 0 && pai !== this.#savedTsumo)) {
          this.#savedSutehai = pai;
        } else {
          const content = `You cannot sutehai ${pai} .`;
          const tags = getTagsReply(event);
          this.#dResponseNeed.set(event.pubkey, command);
          return [[content, event.kind, tags]];
        }
        break;
      case 'ankan':
        if (this.#canAnkan(i, this.#savedTsumo, pai)) {
          this.#arTehai[i] = addHai(this.#arTehai[i], this.#savedTsumo);
          this.#isRinshanChance = true;
          const furoHai = pai.repeat(4);
          this.#setAnkan(i, pai);
          const strDorahyoujiNew = this.#arYama[52 + this.#dorahyouji.length / 2];
          this.#dorahyouji += strDorahyoujiNew;
          this.#visiblePai += strDorahyoujiNew;
          this.#savedTsumo = this.#arYama[this.#nYamaIndex++];
          //発声通知
          const content_say = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} kan`;
          const tags_say = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_say, tags_say]);
          //晒した牌通知
          const content_open = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(this.#players[i])} ${furoHai}`;
          const tags_open = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_open, tags_open]);
          //ツモ通知
          const content_tsumo = `nostr:${nip19.npubEncode(this.#players[i])} NOTIFY tsumo nostr:${nip19.npubEncode(this.#players[i])} ${this.#arYama.length - this.#nYamaIndex} ${this.#savedTsumo}`;
          const tags_tsumo = [...getTagsAirrep(event), ['p', this.#players[i], '']];
          res.push([content_tsumo, tags_tsumo]);
          //dora通知
          const content_dora = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${strDorahyoujiNew}`;
          const tags_dora = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_dora, tags_dora]);
          //捨て牌問い合わせ
          this.#dResponseNeed.set(this.#players[i], 'sutehai?');
          const content_sutehai = `${this.#tehaiToEmoji(this.#arTehai[i])} ${this.#tehaiToEmoji(this.#savedTsumo)}\nnostr:${nip19.npubEncode(this.#players[i])} GET sutehai?`;
          const tags_sutehai = [
            ...getTagsAirrep(event),
            ['p', this.#players[i], ''],
            ...getTagsEmoji(addHai(this.#arTehai[i], this.#savedTsumo)),
          ];
          res.push([content_sutehai, tags_sutehai]);
          return res.map((r) => [r[0], event.kind, r[1]]);
        } else {
          const content = `You cannot ankan ${pai} .`;
          const tags = getTagsReply(event);
          this.#dResponseNeed.set(event.pubkey, command);
          return [[content, event.kind, tags]];
        }
      case 'kakan':
        if (this.#canKakan(i, this.#savedTsumo, pai)) {
          this.#arTehai[i] = addHai(this.#arTehai[i], this.#savedTsumo);
          this.#isRinshanChance = true;
          const furoHai = pai;
          this.#setKakan(i, pai);
          const strDorahyoujiNew = this.#arYama[52 + this.#dorahyouji.length / 2];
          this.#dorahyouji += strDorahyoujiNew;
          this.#visiblePai += strDorahyoujiNew;
          //発声通知
          const content_say = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} kan`;
          const tags_say = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_say, tags_say]);
          //晒した牌通知
          const content_open = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(this.#players[i])} ${furoHai}`;
          const tags_open = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_open, tags_open]);
          //この時点でロン(槍槓)を受け付ける必要がある
          const naku: [string, string[][]][] = [];
          for (const index of [0, 1, 2, 3].filter((idx) => idx !== i)) {
            const action: string[] = [];
            if (this.#canRon(index, pai)) action.push('ron');
            if (action.length > 0) {
              this.#dResponseNeed.set(this.#players[index], 'naku?');
              const content = `${this.#tehaiToEmoji(this.#arTehai[index])} ${this.#tehaiToEmoji(pai)}\nnostr:${nip19.npubEncode(this.#players[index])} GET naku? ${action.join(' ')}`;
              const tags = [...getTagsAirrep(event), ['p', this.#players[index], ''], ...getTagsEmoji(addHai(this.#arTehai[index], pai))];
              naku.push([content, tags]);
            }
          }
          this.#savedTsumo = this.#arYama[this.#nYamaIndex++];
          this.#savedKakan = [];
          //ツモ通知
          const content_tsumo = `nostr:${nip19.npubEncode(this.#players[i])} NOTIFY tsumo nostr:${nip19.npubEncode(this.#players[i])} ${this.#arYama.length - this.#nYamaIndex} ${this.#savedTsumo}`;
          const tags_tsumo = [...getTagsAirrep(event), ['p', this.#players[i], '']];
          this.#savedKakan.push([content_tsumo, tags_tsumo]);
          //dora通知
          const content_dora = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${strDorahyoujiNew}`;
          const tags_dora = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          this.#savedDoratsuchi = [content_dora, tags_dora];
          //捨て牌問い合わせ
          const content_sutehai = `${this.#tehaiToEmoji(this.#arTehai[i])} ${this.#tehaiToEmoji(this.#savedTsumo)}\nnostr:${nip19.npubEncode(this.#players[i])} GET sutehai?`;
          const tags_sutehai = [
            ...getTagsAirrep(event),
            ['p', this.#players[i], ''],
            ...getTagsEmoji(addHai(this.#arTehai[i], this.#savedTsumo)),
          ];
          this.#savedKakan.push([content_sutehai, tags_sutehai]);
          //槍槓が可能であれば処理を分ける
          if (naku.length > 0) {
            this.#savedSutehai = pai;
            return [...res, ...naku].map((r) => [r[0], event.kind, r[1]]);
          } else {
            this.#dResponseNeed.set(this.#players[i], 'sutehai?');
            const resFinal = [...res, ...this.#savedKakan];
            this.#savedKakan = undefined;
            return resFinal.map((r) => [r[0], event.kind, r[1]]);
          }
        } else {
          const content = `You cannot kakan ${pai} .`;
          const tags = getTagsReply(event);
          this.#dResponseNeed.set(event.pubkey, command);
          return [[content, event.kind, tags]];
        }
        break;
      default:
        throw new TypeError(`action ${action} is not supported`);
    }
    const content_sutehai = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY sutehai nostr:${nip19.npubEncode(this.#players[i])} ${this.#savedSutehai}`;
    const tags_sutehai = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
    res.push([content_sutehai, tags_sutehai]);
    this.#isRinshanChance = false;
    this.#setSutehai(this.#savedSutehai, i);
    if (this.#savedTsumo) this.#arTehai[i] = addHai(this.#arTehai[i], this.#savedTsumo);
    this.#arTehai[i] = removeHai(this.#arTehai[i], this.#savedSutehai);
    const naku: [string, string[][]][] = [];
    for (const index of [0, 1, 2, 3].filter((idx) => idx !== i)) {
      const action: string[] = [];
      if (this.#canRon(index, pai)) action.push('ron');
      if (this.#canPon(index, pai)) action.push('pon');
      if (this.#canDaiminkan(index, pai)) action.push('kan');
      if ((i + 1) % 4 == index && this.#canChi(index, pai)) action.push('chi');
      if (action.length > 0) {
        this.#dResponseNeed.set(this.#players[index], 'naku?');
        const content = `${this.#tehaiToEmoji(this.#arTehai[index])} ${this.#tehaiToEmoji(this.#savedSutehai)}\nnostr:${nip19.npubEncode(this.#players[index])} GET naku? ${action.join(' ')}`;
        const tags = [
          ...getTagsAirrep(event),
          ['p', this.#players[index], ''],
          ...getTagsEmoji(addHai(this.#arTehai[index], this.#savedSutehai)),
        ];
        naku.push([content, tags]);
      }
    }
    if (naku.length > 0) {
      return [...res, ...naku].map((r) => [r[0], event.kind, r[1]]);
    }
    const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
    return [...res2, ...this.#sendNextTurn(event)];
  };

  #setSutehai = (sute: string, nPlayer: number) => {
    this.#arKawa[nPlayer].push(sute);
    this.#visiblePai += sute;
    for (let i = 0; i < this.#players.length; i++) {
      if (this.#arRichiJunme[i] >= 0) this.#arFuritenCheckRichi[i].push(sute);
      if (nPlayer === i) this.#arFuritenCheckTurn[i] = [];
      else this.#arFuritenCheckTurn[i].push(sute);
    }
  };

  #sendNextTurn = (event: NostrEvent, ronPubkeys: string[] = []): [string, number, string[][]][] => {
    const res: [string, string[][]][] = [];
    let reason = '';
    //四風子連打
    if (this.#nYamaIndex == 70 && this.#arChihouChance[this.#currentPlayer]) {
      if ('1z2z3z4z'.includes(this.#savedSutehai) && [1, 2, 3].every((i) => this.#arKawa[0][0] === this.#arKawa[i][0])) reason = '4renda';
    }
    //四開槓
    if (countKantsu(this.#arTehai[this.#currentPlayer]) > 0) {
      if (
        countKantsu(this.#arTehai[0]) + countKantsu(this.#arTehai[1]) + countKantsu(this.#arTehai[2]) + countKantsu(this.#arTehai[3]) ===
          4 &&
        countKantsu(this.#arTehai[this.#currentPlayer]) !== 4
      )
        reason = '4kan';
    }
    //四家立直
    if (this.#arRichiJunme[0] >= 0 && this.#arRichiJunme[1] >= 0 && this.#arRichiJunme[2] >= 0 && this.#arRichiJunme[3] >= 0) {
      reason = '4richi';
    }
    //三家和
    if (ronPubkeys.length === 3) {
      reason = '3ron';
      //発声通知
      for (const p of ronPubkeys) {
        const content = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(p)} ron`;
        const tags = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
        res.push([content, tags]);
      }
    }
    //途中流局
    if (reason.length > 0) {
      let arTenpaiPlayerFlag = [0, 0, 0];
      if (reason === '3ron') {
        arTenpaiPlayerFlag = [1, 1, 1, 1];
        arTenpaiPlayerFlag[this.#currentPlayer] = 0;
      } else if (reason == '4richi') {
        this.#setKyotaku(this.#currentPlayer);
      }
      const rm = new Map<string, string>([
        ['4renda', '四風子連打'],
        ['4kan', '四開槓'],
        ['4richi', '四家立直'],
        ['3ron', '三家和'],
      ]);
      let content = `${rm.get(reason)}\n\n`;
      let emojiHai: string[] = [];
      for (let i = 0; i < this.#players.length; i++) {
        content +=
          `nostr:${nip19.npubEncode(this.#players[i])} ${this.#arScore[i]}\n` +
          `${this.#tehaiToEmoji(this.#arTehai[i])}\n` +
          `${this.#tehaiToEmoji(this.#arKawa[i].join(''))}\n`;
        emojiHai = [...emojiHai, ...stringToArrayPlain(this.#arTehai[i] + this.#arKawa[i].join(''))];
      }
      const tags = [...getTagsAirrep(event), ...getTagsEmoji(emojiHai.join(''))];
      res.push([content, tags]);
      const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
      return [...res2, ...this.#goNextKyoku(event, -1, 0, new Map<string, number>(), [], [], arTenpaiPlayerFlag, false)];
    }
    //流局
    if (this.#arYama[this.#nYamaIndex] === undefined) {
      //流し満貫判定
      const strYaochu = '1m9m1p9p1s9s1z2z3z4z5z6z7z';
      for (let i = 0; i < this.#players.length; i++) {
        if (this.#arFuroJunme[i].length === 0) {
          //鳴かれてない
          let isNagashimangan = true;
          for (let j = 0; j < this.#arKawa[i].length; j++) {
            if (!strYaochu.includes(this.#arKawa[i][j])) {
              isNagashimangan = false;
              break;
            }
          }
          if (isNagashimangan) {
            const score = i == this.#oyaIndex ? 12000 : 8000;
            const point: number[] = getScoreAdd(i, -1, score, this.#tsumibou, this.#kyotaku, this.#oyaIndex, []);
            let content = '流し満貫\n';
            content +=
              `nostr:${nip19.npubEncode(this.#players[i])}\n` +
              `${this.#tehaiToEmoji(this.#arTehai[i])}\n` +
              `${this.#tehaiToEmoji(this.#arKawa[i].join(''))}\n\n`;
            for (let i = 0; i < this.#players.length; i++) {
              content += `nostr:${nip19.npubEncode(this.#players[i])} ${point[i] > 0 ? '+' : ''}${point[i]}\n`;
              this.#arScore[i] += point[i];
            }
            const emojiHai: string[] = stringToArrayPlain(this.#arTehai[i] + this.#arKawa[i].join(''));
            const tags = [...getTagsAirrep(event), ...getTagsEmoji(emojiHai.join(''))];
            res.push([content, tags]);
            const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
            return [...this.#goNextKyoku(event, -1, 0, new Map<string, number>(), [], point, [], false), ...res2];
          }
        }
      }
      const arTenpaiPlayerFlag = this.#arTehai.map((tehai) => (getShanten(tehai)[0] === 0 ? 1 : 0));
      const point: number[] = getScoreAddWithPao(-1, -1, 0, this.#tsumibou, this.#kyotaku, arTenpaiPlayerFlag, -1, -1, 0, this.#oyaIndex);
      let content = '荒牌平局\n';
      for (let i = 0; i < this.#players.length; i++) {
        if (point[i] !== 0) {
          content += `nostr:${nip19.npubEncode(this.#players[i])} ${point[i] > 0 ? '+' : ''}${point[i]}\n`;
          this.#arScore[i] += point[i];
        }
      }
      content += '\n';
      let emojiHai: string[] = [];
      for (let i = 0; i < this.#players.length; i++) {
        content +=
          `nostr:${nip19.npubEncode(this.#players[i])} ${this.#arScore[i]}\n` +
          `${this.#tehaiToEmoji(this.#arTehai[i])}\n` +
          `${this.#tehaiToEmoji(this.#arKawa[i].join(''))}\n`;
        emojiHai = [...emojiHai, ...stringToArrayPlain(this.#arTehai[i]), ...stringToArrayPlain(this.#arKawa[i].join(''))];
      }
      const tags = [...getTagsAirrep(event), ...getTagsEmoji(emojiHai.join(''))];
      res.push([content, tags]);
      const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
      return [...this.#goNextKyoku(event, -1, 0, new Map<string, number>(), [], point, arTenpaiPlayerFlag, true), ...res2];
    }
    this.#setKyotaku(this.#currentPlayer);
    this.#savedTsumo = this.#arYama[this.#nYamaIndex++];
    const i2 = (this.#currentPlayer + 1) % 4;
    //ツモ通知
    const content_tsumo = `nostr:${nip19.npubEncode(this.#players[i2])} NOTIFY tsumo nostr:${nip19.npubEncode(this.#players[i2])} ${this.#arYama.length - this.#nYamaIndex} ${this.#savedTsumo}`;
    const tags_tsumo = [...getTagsAirrep(event), ['p', this.#players[i2], '']];
    res.push([content_tsumo, tags_tsumo]);
    //捨て牌問い合わせ
    this.#dResponseNeed.set(this.#players[i2], 'sutehai?');
    const content_sutehai = `${this.#tehaiToEmoji(this.#arTehai[i2])} ${this.#tehaiToEmoji(this.#savedTsumo)}\nnostr:${nip19.npubEncode(this.#players[i2])} GET sutehai?`;
    const tags_sutehai = [
      ...getTagsAirrep(event),
      ['p', this.#players[i2], ''],
      ...getTagsEmoji(addHai(this.#arTehai[i2], this.#savedTsumo)),
    ];
    res.push([content_sutehai, tags_sutehai]);
    return res.map((r) => [r[0], event.kind, r[1]]);
  };

  #canTsumo = (nPlayer: number, atariHai: string): boolean => {
    if (atariHai === '') return false;
    //和了かどうか(シャンテン数が-1かどうか)検証する
    const shanten = getShanten(addHai(this.#arTehai[nPlayer], atariHai))[0];
    if (shanten !== -1) return false;
    //役があるかどうか検証する
    const richi: number = this.#arRichiJunme[nPlayer] === 0 ? 2 : this.#arRichiJunme[nPlayer] > 0 ? 1 : 0;
    const score = getScore(
      this.#arTehai[nPlayer],
      atariHai,
      ['1z', '2z'][this.#bafu],
      this.#getJifuHai(nPlayer),
      getDoraFromDorahyouji(this.#dorahyouji),
      true,
      richi,
      this.#arIppatsuChance[nPlayer],
      false,
      this.#isRinshanChance,
      this.#arYama.length === this.#nYamaIndex,
      this.#arChihouChance[nPlayer],
    )[0];
    if (score <= 0) return false;
    return true;
  };

  #setKyotaku = (nPlayer: number): void => {
    if (this.#arRichiJunme[nPlayer] === this.#arKawa[nPlayer].length - 1) {
      this.#kyotaku++;
      this.#arScore[nPlayer] -= 1000;
      this.#arIppatsuChance[nPlayer] = true;
      if (this.#arChihouChance[nPlayer]) this.#arWRichi[nPlayer] = true;
    } else {
      this.#arIppatsuChance[nPlayer] = false;
    }
    this.#arChihouChance[nPlayer] = false;
  };

  #setFuro = (nFuroPlayer: number, nSutePlayer: number, sute: string, haiUsed: string): void => {
    this.#arTehai[nFuroPlayer] = removeHai(this.#arTehai[nFuroPlayer], haiUsed);
    this.#arTehai[nFuroPlayer] = addFuro(this.#arTehai[nFuroPlayer], sute + haiUsed, '<', '>');
    this.#arFuroJunme[nSutePlayer].push(this.#arKawa[nSutePlayer].length - 1);
    this.#arFuroHistory[nFuroPlayer].push([sute, nSutePlayer]);
    this.#arIppatsuChance = [false, false, false, false];
    this.#arChihouChance = [false, false, false, false];
    this.#visiblePai += haiUsed;
  };

  #setKakan = (nFuroPlayer: number, kakanHai: string) => {
    this.#arTehai[nFuroPlayer] = removeHai(this.#arTehai[nFuroPlayer], kakanHai);
    this.#arTehai[nFuroPlayer] = this.#arTehai[nFuroPlayer].replace(kakanHai.repeat(3), kakanHai.repeat(4));
    this.#arKakanHistory[nFuroPlayer].push(kakanHai);
    this.#arIppatsuChance = [false, false, false, false];
    this.#arChihouChance = [false, false, false, false];
    this.#visiblePai += kakanHai;
  };

  #setAnkan = (nFuroPlayer: number, ankanHai: string): void => {
    this.#arTehai[nFuroPlayer] = removeHai(this.#arTehai[nFuroPlayer], ankanHai.repeat(4));
    this.#arTehai[nFuroPlayer] = addFuro(this.#arTehai[nFuroPlayer], ankanHai.repeat(4), '(', ')');
    this.#arIppatsuChance = [false, false, false, false];
    this.#arChihouChance = [false, false, false, false];
    this.#visiblePai += ankanHai.repeat(4);
  };

  res_s_naku_call = (event: NostrEvent, action: string, pai1: string, pai2: string): [string, number, string[][]][] | null => {
    const command = 'naku?';
    if (this.#dResponseNeed.get(event.pubkey) !== command) {
      const content = `You are not required to send "${command}"`;
      const tags = getTagsReply(event);
      return [[content, event.kind, tags]];
    }
    this.#reservedNaku.set(event.pubkey, [action, pai1, pai2]);
    this.#dResponseNeed.set(event.pubkey, '');
    for (const [k, v] of this.#dResponseNeed) {
      if (v !== '') {
        return null;
      }
    }
    //副露の優先順位を考慮
    let pubkey: string | undefined;
    let actions: string[] | undefined;
    let ronPubkeys: string[] = [];
    for (const [k, v] of this.#reservedNaku) {
      if (v[0] === 'ron') {
        ronPubkeys.push(k);
      }
    }
    if (ronPubkeys.length === 3) {
      return this.#sendNextTurn(event, ronPubkeys);
    }
    for (const a of ['ron', 'pon', 'kan', 'chi', 'no']) {
      for (const [k, v] of this.#reservedNaku) {
        if (v[0] === a) {
          pubkey = k;
          actions = v;
          break;
        }
      }
      if (pubkey !== undefined) break;
    }
    this.#reservedNaku = new Map<string, string[]>();
    if (pubkey === undefined || actions === undefined) {
      throw new Error('pubkey is undefined');
    }
    return this.#execNaku(event, pubkey, actions);
  };

  #execNaku = (event: NostrEvent, pubkey: string, actions: string[]): [string, number, string[][]][] => {
    const res: [string, string[][]][] = [];
    const i = this.#players.indexOf(pubkey);
    switch (actions[0]) {
      case 'ron':
        if (this.#canRon(i, this.#savedSutehai)) {
          const content_say = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} ron`;
          const tags_say = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_say, tags_say]);
          if (this.#savedDoratsuchi !== undefined) {
            //槍槓
            res.push(this.#savedDoratsuchi);
            this.#savedDoratsuchi = undefined;
          }
          const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
          return [...res2, ...this.#getScoreView(event, i, this.#currentPlayer, this.#savedSutehai, false)];
        } else {
          const content = 'You cannot ron.';
          const tags = getTagsReply(event);
          res.push([content, tags]);
        }
        break;
      case 'kan':
        if (this.#canDaiminkan(i, this.#savedSutehai)) {
          this.#isRinshanChance = true;
          const furoHai = this.#savedSutehai.repeat(4);
          this.#setKyotaku(this.#currentPlayer);
          this.#setFuro(i, this.#currentPlayer, this.#savedSutehai, this.#savedSutehai.repeat(3));
          const strDorahyoujiNew = this.#arYama[52 + this.#dorahyouji.length / 2];
          this.#dorahyouji += strDorahyoujiNew;
          this.#visiblePai += strDorahyoujiNew;
          this.#savedTsumo = this.#arYama[this.#nYamaIndex++];
          //発声通知
          const content_say = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} kan`;
          const tags_say = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_say, tags_say]);
          //晒した牌通知
          const content_open = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(this.#players[i])} ${furoHai}`;
          const tags_open = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content_open, tags_open]);
          //ツモ通知
          const content_tsumo = `nostr:${nip19.npubEncode(this.#players[i])} NOTIFY tsumo nostr:${nip19.npubEncode(this.#players[i])} ${this.#arYama.length - this.#nYamaIndex} ${this.#savedTsumo}`;
          const tags_tsumo = [...getTagsAirrep(event), ['p', this.#players[i], '']];
          res.push([content_tsumo, tags_tsumo]);
          //捨て牌問い合わせ
          this.#dResponseNeed.set(this.#players[i], 'sutehai?');
          const content_sutehai = `${this.#tehaiToEmoji(this.#arTehai[i])} ${this.#tehaiToEmoji(this.#savedTsumo)}\nnostr:${nip19.npubEncode(this.#players[i])} GET sutehai?`;
          const tags_sutehai = [
            ...getTagsAirrep(event),
            ['p', this.#players[i], ''],
            ...getTagsEmoji(addHai(this.#arTehai[i], this.#savedTsumo)),
          ];
          res.push([content_sutehai, tags_sutehai]);
          //dora通知
          const content_dora = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY dora ${strDorahyoujiNew}`;
          const tags_dora = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          this.#savedDoratsuchi = [content_dora, tags_dora];
          return res.map((r) => [r[0], event.kind, r[1]]);
        } else {
          const content = 'You cannot kan.';
          const tags = getTagsReply(event);
          res.push([content, tags]);
        }
        break;
      case 'pon':
        if (this.#canPon(i, this.#savedSutehai)) {
          const furoHai = this.#savedSutehai.repeat(3);
          this.#setKyotaku(this.#currentPlayer);
          this.#setFuro(i, this.#currentPlayer, this.#savedSutehai, this.#savedSutehai.repeat(2));
          this.#savedTsumo = '';
          //発声通知
          const content = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} pon`;
          const tags = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content, tags]);
          //晒した牌通知
          const content2 = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(this.#players[i])} ${furoHai}`;
          const tags2 = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content2, tags2]);
          //捨て牌問い合わせ
          this.#dResponseNeed.set(this.#players[i], 'sutehai?');
          const content3 = `${this.#tehaiToEmoji(this.#arTehai[i])}\nnostr:${nip19.npubEncode(this.#players[i])} GET sutehai?`;
          const tags3 = [...getTagsAirrep(event), ['p', this.#players[i], ''], ...getTagsEmoji(this.#arTehai[i])];
          res.push([content3, tags3]);
          return res.map((r) => [r[0], event.kind, r[1]]);
        } else {
          const content = 'You cannot pon.';
          const tags = getTagsReply(event);
          res.push([content, tags]);
        }
        break;
      case 'chi':
        if (this.#canChi(i, this.#savedSutehai)) {
          const hai1: string = actions[1];
          const hai2: string = actions[2];
          const a: string[] = getChiMaterial(this.#arTehai[i], this.#savedSutehai);
          if (!a.includes(`${hai1}${hai2}`)) {
            const content = `You cannot chi with ${hai1}${hai2}.`;
            const tags = getTagsReply(event);
            res.push([content, tags]);
            break;
          }
          const furoArray = [this.#savedSutehai, hai1, hai2];
          furoArray.sort(compareFn);
          const furoHai = furoArray.join('');
          this.#setKyotaku(this.#currentPlayer);
          this.#setFuro(i, this.#currentPlayer, this.#savedSutehai, hai1 + hai2);
          this.#savedTsumo = '';
          //発声通知
          const content = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY say nostr:${nip19.npubEncode(this.#players[i])} chi`;
          const tags = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content, tags]);
          //晒した牌通知
          const content2 = `${this.#players.map((pubkey) => `nostr:${nip19.npubEncode(pubkey)}`).join(' ')} NOTIFY open nostr:${nip19.npubEncode(this.#players[i])} ${furoHai}`;
          const tags2 = [...getTagsAirrep(event), ...this.#players.map((pubkey) => ['p', pubkey, ''])];
          res.push([content2, tags2]);
          //捨て牌問い合わせ
          this.#dResponseNeed.set(this.#players[i], 'sutehai?');
          const content3 = `${this.#tehaiToEmoji(this.#arTehai[i])}\nnostr:${nip19.npubEncode(this.#players[i])} GET sutehai?`;
          const tags3 = [...getTagsAirrep(event), ['p', this.#players[i], ''], ...getTagsEmoji(this.#arTehai[i])];
          res.push([content3, tags3]);
          return res.map((r) => [r[0], event.kind, r[1]]);
        } else {
          const content = 'You cannot chi.';
          const tags = getTagsReply(event);
          res.push([content, tags]);
        }
        break;
      case 'no':
        break;
      default:
        throw new TypeError(`action "${actions[0]}" is not supported`);
    }
    if (this.#savedKakan !== undefined) {
      this.#dResponseNeed.set(this.#players[i], 'sutehai?');
      const resKakan = this.#savedKakan;
      this.#savedKakan = undefined;
      return [...res, ...resKakan].map((r) => [r[0], event.kind, r[1]]);
    }
    const res2: [string, number, string[][]][] = res.map((r) => [r[0], event.kind, r[1]]);
    return [...res2, ...this.#sendNextTurn(event)];
  };

  #canRon = (nPlayer: number, atariHai: string): boolean => {
    //和了かどうか(シャンテン数が-1かどうか)検証する
    const shanten = getShanten(addHai(this.#arTehai[nPlayer], atariHai))[0];
    if (shanten !== -1) return false;
    //フリテンかどうか検証する
    const arMachi: string[] = stringToArrayWithFuro(getMachi(this.#arTehai[nPlayer]))[0];
    const isRichi = this.#arRichiJunme[nPlayer] >= 0;
    for (const machi of arMachi) {
      if (this.#arKawa[nPlayer].includes(machi)) return false;
      if (isRichi) {
        const index = this.#arFuritenCheckRichi[nPlayer].indexOf(machi);
        if (index >= 0 && index !== this.#arFuritenCheckRichi[nPlayer].length - 1) return false;
      }
      if (this.#arFuritenCheckTurn[nPlayer].includes(machi)) {
        const index = this.#arFuritenCheckTurn[nPlayer].indexOf(machi);
        if (index >= 0 && index !== this.#arFuritenCheckTurn[nPlayer].length - 1) return false;
      }
    }
    //役があるかどうか検証する
    const richi: number = this.#arRichiJunme[nPlayer] === 0 ? 2 : this.#arRichiJunme[nPlayer] > 0 ? 1 : 0;
    const score = getScore(
      this.#arTehai[nPlayer],
      atariHai,
      ['1z', '2z'][this.#bafu],
      this.#getJifuHai(nPlayer),
      getDoraFromDorahyouji(this.#dorahyouji),
      false,
      richi,
      this.#arIppatsuChance[nPlayer],
      this.#isRinshanChance,
      false,
      this.#arYama.length === this.#nYamaIndex,
      this.#arChihouChance[nPlayer],
    )[0];
    if (score <= 0) return false;
    return true;
  };

  #canPon = (nPlayer: number, suteHai: string): boolean => {
    if (this.#arYama.length - this.#nYamaIndex === 0) return false;
    if (this.#arRichiJunme[nPlayer] >= 0) return false;
    const ak: number[] = this.#arTehai.map((t) => countKantsu(t));
    if (ak[0] + ak[1] + ak[2] + ak[3] == 4 && ak[0] != 4 && ak[1] != 4 && ak[2] != 4 && ak[3] != 4) return false;
    if (stringToArrayWithFuro(this.#arTehai[nPlayer])[0].filter((h) => h === suteHai).length >= 2) return true;
    return false;
  };

  #canChi = (nPlayer: number, suteHai: string): boolean => {
    if (this.#arYama.length - this.#nYamaIndex === 0) return false;
    if (this.#arRichiJunme[nPlayer] >= 0) return false;
    const a = getChiMaterial(this.#arTehai[nPlayer], suteHai);
    if (a.length > 0) return true;
    return false;
  };

  #canDaiminkan = (nPlayer: number, suteHai: string): boolean => {
    if (this.#arYama.length - this.#nYamaIndex === 0) return false;
    if (this.#arRichiJunme[nPlayer] >= 0) return false;
    const ak: number[] = this.#arTehai.map((t) => countKantsu(t));
    if (ak[0] + ak[1] + ak[2] + ak[3] === 4) return false;
    if (stringToArrayWithFuro(this.#arTehai[nPlayer])[0].filter((h) => h === suteHai).length >= 3) return true;
    return false;
  };

  #canAnkan = (nPlayer: number, tsumoHai: string, ankanHaiSelected?: string): boolean => {
    if (this.#arYama.length - this.#nYamaIndex === 0) return false;
    const ak: number[] = this.#arTehai.map((t) => countKantsu(t));
    if (ak[0] + ak[1] + ak[2] + ak[3] === 4) return false;
    const arAnkanHai: string[] = getAnkanHai(addHai(this.#arTehai[nPlayer], tsumoHai));
    if (arAnkanHai.length === 0) return false;
    if (ankanHaiSelected !== undefined && !arAnkanHai.includes(ankanHaiSelected)) return false;
    //リーチ後の場合
    if (this.#arRichiJunme[nPlayer] >= 0) {
      //送りカンの場合
      if (!arAnkanHai.includes(tsumoHai)) return false;
      //和了の形が変わる場合
      for (const ankanhai of arAnkanHai) {
        if (ankanhai !== ankanHaiSelected) continue;
        const tehaiNew = removeHai(addHai(this.#arTehai[nPlayer], tsumoHai), ankanhai.repeat(4)) + `(${ankanhai.repeat(4)})`;
        const [shanten, arPattern] = getShanten(tehaiNew);
        if (shanten !== 0) {
          continue;
        }
        for (const pattern of arPattern) {
          const ap = pattern.split(',');
          if (!ap.includes(ankanhai.repeat(3)))
            //常に暗刻でないとダメ
            continue;
        }
        return true;
      }
      return false;
    } else {
      return true;
    }
  };

  #canKakan = (nPlayer: number, tsumoHai: string, kakanHaiSelected?: string): boolean => {
    if (this.#arYama.length - this.#nYamaIndex === 0) return false;
    const ak: number[] = this.#arTehai.map((t) => countKantsu(t));
    if (ak[0] + ak[1] + ak[2] + ak[3] === 4) return false;
    const arKakanHai: string[] = getKakanHai(addHai(this.#arTehai[nPlayer], tsumoHai));
    if (kakanHaiSelected !== undefined && !arKakanHai.includes(kakanHaiSelected)) return false;
    if (arKakanHai.length > 0) return true;
    return false;
  };

  res_c_sutehai_call = (event: NostrEvent): [string, number, string[][]][] => {
    const tsumo = this.#savedTsumo;
    if (!tsumo) {
      return this.#res_c_sutehai_after_furo_call(event);
    }
    const i = this.#players.indexOf(event.tags.filter((tag) => tag.length >= 2 && tag[0] === 'p').map((tag) => tag[1])[0]);
    const shanten = getShanten(addHai(this.#arTehai[i], tsumo))[0];
    const isRichi = this.#arRichiJunme[i] >= 0;
    const isRichiOther = this.#arRichiJunme.filter((v, idx) => idx !== i).some((n) => n >= 0);
    let action: string;
    let select: string;
    let dahai = '';
    let ankanHai: string | undefined;
    let kakanHai: string | undefined;
    if (shanten >= 0) {
      if (isRichi) {
        //リーチ済ならツモ切り
        dahai = tsumo;
      } else {
        dahai = naniwokiru(
          this.#arTehai[i],
          tsumo,
          this.#arKawa[i].join(''),
          ['1z', '2z'][this.#bafu],
          this.#getJifuHai(i),
          this.#dorahyouji,
          this.#arRichiJunme.map((e) => e >= 0),
          [0, 1, 2, 3].map((p) => this.#getGenbutsu(p).join('')),
          this.#getVisiblePai(i),
        );
        if (this.#canKakan(i, tsumo))
          kakanHai = getKakanHaiBest(this.#arTehai[i], tsumo, ['1z', '2z'][this.#bafu], this.#getJifuHai(i), isRichiOther);
      }
      if (this.#canAnkan(i, tsumo))
        ankanHai = getAnkanHaiBest(this.#arTehai[i], tsumo, isRichi, isRichiOther, ['1z', '2z'][this.#bafu], this.#getJifuHai(i));
    }
    if (shanten === -1) {
      const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? tsumo\n:${convertEmoji(tsumo)}:`;
      const tags = [...getTagsReply(event), ...getTagsEmoji(tsumo)];
      return [[content, event.kind, tags]];
    } else if (
      shouldRichi(
        this.#arTehai[i],
        tsumo,
        isRichi,
        this.#arYama.length - this.#nYamaIndex,
        dahai,
        ['1z', '2z'][this.#bafu],
        this.#getJifuHai(i),
      )
    ) {
      action = 'richi';
      select = dahai;
    } else if (ankanHai !== undefined && ankanHai !== '') {
      action = 'ankan';
      select = ankanHai;
    } else if (kakanHai !== undefined && kakanHai !== '') {
      action = 'kakan';
      select = kakanHai;
    } else {
      action = 'sutehai';
      select = dahai;
    }
    const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? ${action} ${select}\n:${convertEmoji(select)}:`;
    const tags = [...getTagsReply(event), ...getTagsEmoji(select)];
    return [[content, event.kind, tags]];
  };

  #res_c_sutehai_after_furo_call = (event: NostrEvent): [string, number, string[][]][] => {
    const i = this.#players.indexOf(event.tags.filter((tag) => tag.length >= 2 && tag[0] === 'p').map((tag) => tag[1])[0]);
    const action = 'sutehai';
    const select = naniwokiru(
      this.#arTehai[i],
      '',
      this.#arKawa[i].join(''),
      ['1z', '2z'][this.#bafu],
      this.#getJifuHai(i),
      this.#dorahyouji,
      this.#arRichiJunme.map((e) => e >= 0),
      [0, 1, 2, 3].map((p) => this.#getGenbutsu(p).join('')),
      this.#getVisiblePai(i),
    );
    const content = `nostr:${nip19.npubEncode(event.pubkey)} sutehai? ${action} ${select}\n:${convertEmoji(select)}:`;
    const tags = [...getTagsReply(event), ...getTagsEmoji(select)];
    return [[content, event.kind, tags]];
  };

  res_c_naku_call = (event: NostrEvent, action: string[]): [string, number, string[][]][] => {
    const i = this.#players.indexOf(event.tags.filter((tag) => tag.length >= 2 && tag[0] === 'p').map((tag) => tag[1])[0]);
    const isRichiOther = this.#arRichiJunme.filter((v, idx) => idx !== i).some((n) => n >= 0);
    let res = 'no';
    if (action.includes('ron')) {
      res = 'ron';
    } else if (action.includes('kan')) {
      if (shouldDaiminkan()) {
        res = 'kan';
      }
    } else if (action.includes('pon')) {
      if (shouldPon(this.#arTehai[i], this.#savedSutehai, ['1z', '2z'][this.#bafu], this.#getJifuHai(i), isRichiOther)) {
        res = 'pon';
      }
    } else if (action.includes('chi')) {
      const s = getChiMaterialBest(this.#arTehai[i], this.#savedSutehai, ['1z', '2z'][this.#bafu], this.#getJifuHai(i), isRichiOther);
      if (s !== '') {
        res = ['chi', s.slice(0, 2), s.slice(2, 4)].join(' ');
      }
    }
    const content = `nostr:${nip19.npubEncode(event.pubkey)} naku? ${res}`;
    const tags = getTagsReply(event);
    return [[content, event.kind, tags]];
  };

  #reset_game = () => {
    this.#status = '';
    this.#players.length = 0;
    this.#debugYama = [];
    this.#arScore = [25000, 25000, 25000, 25000];
    this.#tsumibou = 0;
    this.#kyotaku = 0;
    this.#bafu = 0;
    this.#kyoku = 1;
    this.#oyaIndex = 0;
    this.#arYama = [];
    this.#arKawa = [[], [], [], []];
    this.#arFuritenCheckRichi = [[], [], [], []];
    this.#arFuritenCheckTurn = [[], [], [], []];
    this.#arRichiJunme = [-1, -1, -1, -1];
    this.#arFuroJunme = [[], [], [], []];
    this.#arFuroHistory = [[], [], [], []];
    this.#arKakanHistory = [[], [], [], []];
    this.#isRinshanChance = false;
    this.#arIppatsuChance = [false, false, false, false];
    this.#arChihouChance = [true, true, true, true];
    this.#arWRichi = [true, true, true, true];
    this.#dorahyouji = '';
    this.#visiblePai = '';
    this.#nYamaIndex = 0;
    this.#arTehai = [];
    this.#savedTsumo = '';
    this.#savedDoratsuchi = undefined;
    this.#savedSutehai = '';
    this.#currentPlayer = -1;
    this.#reservedNaku = new Map<string, string[]>();
    this.#dResponseNeed = new Map<string, string>();
  };
}
