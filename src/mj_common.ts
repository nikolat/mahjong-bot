
//数値のみの配列に変換
export const stringArrayToNumArray = (haiArray: string[]): number[] => {
	const ret: number[] = [];
	for (const hai of haiArray) {
		ret.push(Number.parseInt(hai.slice(0, 1)));
	}
	return ret;
};

//1-9までの個数の配列に変換
export const numArrayToCountArray = (haiArray: number[]): number[] => {
	const a = [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0];//a[0]はreserved
	for (const hai of haiArray) {
		a[hai] += 1;
	}
	return a;
};

//NumArrayToCountArrayの逆変換
export const countArrayToNumArray = (haiArray: number[]) => {
	const a: number[] = [];
	for (let i = 1; i < haiArray.length; i++) {
		for (let j = 0; j < haiArray[i]; j++) {
			a.push(i);
		}
	}
	return a;
}

//配列に変換(副露を分離)
export const stringToArrayWithFuro = (tehai: string): [string[], string[], string[]] => {
	const m = tehai.match(/^(([1-9][mspz])+)(<([1-9][mspz]){3,4}>|\(([1-9][mspz]){4}\))*$/);
	if (m === null) {
		throw new TypeError(`${tehai} is invalid`);
	}
	const [_, normal] = m;
	const furo: string[] = [];
	const ankan: string[] = [];
	const matchesIteratorFuro = tehai.matchAll(/<(([1-9][mspz]){3,4})>/g);
	for (const match of matchesIteratorFuro) {
		furo.push(match[1]);
	}
	const matchesIteratorAnkan = tehai.matchAll(/\((([1-9][mspz]){4})\)/g);
	for (const match of matchesIteratorAnkan) {
		ankan.push(match[1]);
	}
	const nm = normal.matchAll(/[1-9][mspz]/g);
	const r: string[] = []
	for (const m of nm) {
		r.push(m[0]);
	}
	return [r, furo, ankan];
};

//指定した要素を削除
export const removeElementByName = (ary: string[], name: string, count: number) => {
	const ret: string[] = [];
	let n = 0;
	for (const elm of ary) {
		if (elm === name && n < count) {
			n++;
		}
		else {
			ret.push(elm);
		}
	}
	return ret;
}

//重複した要素を削除
export const uniq = (ary: string[][]) => {
	const ret: string[][] = [];
	const retCheck: string[] = [];
	for (let elm of ary) {
		const key = removeElementByName(elm, '', 1);
		key.sort();
		if (!retCheck.includes(key.join(''))) {
			retCheck.push(key.join(','));
			ret.push(elm);
		}
	}
	return ret;
};
