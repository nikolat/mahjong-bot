import { stringToArrayWithFuro } from './mj_common';

const SHANTEN_MAX = 99;

export const getShanten = (tehai: string): number => {
	const r1 = getShantenChitoitsu(tehai);
	const r2 = getShantenKokushimusou(tehai);
	return Math.min(r1, r2);
};

//七対子
const getShantenChitoitsu = (tehai: string): number => {
	const [hai_normal, hai_furo, hai_ankan] = stringToArrayWithFuro(tehai);
	if (hai_furo.length > 0 || hai_ankan.length > 0) {
		return SHANTEN_MAX;
	}
	let count_toitsu = getToitsu(hai_normal).length;
	let count_koritsu = new Set(hai_normal).size - count_toitsu;
	if (count_toitsu > 7)
		count_toitsu = 7;
	if (count_toitsu + count_koritsu > 7)
		count_koritsu = 7 - count_toitsu;
	return 13 - (2 * count_toitsu) - count_koritsu;
};

//国士無双
const getShantenKokushimusou = (tehai: string): number => {
	const [hai_normal, hai_furo, hai_ankan] = stringToArrayWithFuro(tehai);
	if (hai_furo.length > 0 || hai_ankan.length > 0) {
		return SHANTEN_MAX;
	}
	const yaochu_string = '1m9m1p9p1s9s1z2z3z4z5z6z7z';
	const hai_yaochu: string[] = [];
	for (const hai of hai_normal) {
		if (yaochu_string.includes(hai)) {
			hai_yaochu.push(hai);
		}
	}

	const count_toitsu = getToitsu(hai_yaochu).length;
	const count_type = new Set(hai_yaochu).size;
	let has_toitsu = 0;
	if (count_toitsu > 0) {
		has_toitsu = 1;
	}
	return 13 - count_type - has_toitsu;
};

const getToitsu = (hai: string[]) => {
	return getDuplicatedElement(hai, 2);
};

const getDuplicatedElement = (ary: string[], n: number): string[] => {
	const m = new Map<string, number>();
	for (const str of ary) {
		m.set(str, (m.get(str) ?? 0) + 1);
	}
	const r: string[] = [];
	for (const [k, v] of m) {
		if (v >= n) {
			r.push(k);
		}
	}
	return r;
};
