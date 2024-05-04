
export const stringToArrayWithFuro = (tehai: string): [string[], string[], string[]] => {
	const m = tehai.match(/^(([1-9][mspz])+)(<([1-9][mspz]){3}>|\(([1-9][mspz]){4}\))*$/);
	if (m === null) {
		throw new TypeError(`${tehai} is invalid`);
	}
	const [_, normal] = m;
	const furo: string[] = [];
	const ankan: string[] = [];
	const matchesIteratorFuro = tehai.matchAll(/<(([1-9][mspz]){3})>/g);
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
