import { compareFn, getDoraFromDorahyouji, stringToArrayWithFuro } from "./mj_common";
import { getMachi } from "./mj_machi";
import { getScore } from "./mj_score";
import { getShanten, getShantenYaku, removeKoritsuHai } from "./mj_shanten";

export const naniwokiru = (
	strTehai13: string,
	strTsumo: string,
	strKawa?: string,
	strBafuhai?: string,
	strJifuhai?: string,
	strDorahyouji?: string,
	aryPlayerRichi?: boolean[],
	aryPlayerGenbutsu?: string[],
	strVisiblePai?: string,
): string => {
	const strTehai14 = addHai(strTehai13, strTsumo);
	const arTehai14Normal = stringToArrayWithFuro(strTehai14)[0];
	const arKoritsuhai = removeKoritsuHai(arTehai14Normal)[1];
	const arSutehaiKouho = new Set(arTehai14Normal)
	//ドラ
	const arDorahyouji = stringToArrayWithFuro(strDorahyouji ?? '')[0];
	const arDora: string[] = arDorahyouji.map(d => getDoraFromDorahyouji(d));
	let arDahai: string[] = [];
	let point = -1;
	for (const sutehai of arSutehaiKouho) {
		const strTehaiRemoved = removeHai(strTehai14, sutehai);
		const shanten = getShantenYaku(strTehaiRemoved, strBafuhai ?? '', strJifuhai ?? '')[0];
		let shantenPoint = 1000 * (10 - shanten);
		let machiPoint = 0;
		let elementMaxPoint = 0;
		//テンパイ時は待ちの広さ・和了点の高さを考慮
		if (shanten === 0) {
			const arMachi = stringToArrayWithFuro(getMachi(strTehaiRemoved))[0];
			for (const machi of arMachi) {
				const isTsumo = true;//ツモった場合を想定
				const score = getScore(strTehaiRemoved, machi, strBafuhai ?? '', strJifuhai ?? '', arDora.join(''), isTsumo)[0];
				if (score > 0) {
					machiPoint += score;
				}
			}
			shantenPoint += 10000;//テンパイを崩してまでオリないこととする
		}
		else {
			const [_, arMentsuPattern] = getShanten(strTehaiRemoved);
			for (const strMentsu of arMentsuPattern) {
				let elementPoint = 0;
				if (strMentsu === 'chitoitsu' || strMentsu === 'kokushimusou') {
					elementPoint = 0
				}
				else {
					const ap = strMentsu.split(',');
					const arTatsu = [];
					if (ap[0] !== '') {//雀頭
						elementPoint += 20;
					}
					ap.shift();
					for (const p of ap) {
						if (p.length === 6) {//面子
							elementPoint += 90;
						}
						else if (p.length === 4) {//塔子・対子
							arTatsu.push(p);
						}
					}
					for (const tatsu of arTatsu) {
						const t1 = Number.parseInt(tatsu.slice(0, 1));
						const t2 = Number.parseInt(tatsu.slice(2, 3));
						const color = tatsu.slice(1, 2);
						if ((t1 !== 1) && (t1 + 1 === t2) && (t2 !== 9)) {//両面
							elementPoint += 40;
						}
						else if (t1 === t2) {//対子
							elementPoint += 20;
						}
						else if ((t1 === 1) && (t2 === 2) || (t1 === 8) && (t2 === 9)) {//辺張
							elementPoint += 5;
						}
						else {//嵌張
							elementPoint += 10;
						}
					}
				}
				if (elementMaxPoint < elementPoint) {
					elementMaxPoint = elementPoint;
				}
			}
		}
		//孤立牌を優先的に切る
		let koritsuPoint = 0;
		if (arKoritsuhai.includes(sutehai)) {
			koritsuPoint = 500;
		}
		//ドラは残しておきたい
		let doraPoint = 0
		if (arDora.includes(sutehai)) {
			doraPoint = -50
		}
		const dahaiPoint = shantenPoint + machiPoint + elementMaxPoint + koritsuPoint + doraPoint;
		if (point < dahaiPoint) {
			point = dahaiPoint;
			arDahai = [sutehai];
		}
		else if (point === dahaiPoint) {
			arDahai.push(sutehai);
		}
	}
	return any(arDahai);
};

const any = (array: string[]): string => {
	return array[Math.floor(Math.random() * array.length)];
};

export const shouldRichi = (
	strTehai13: string,
	shanten: number,
	isRichi: boolean,
	nokori: number,
	strTsumo: string,
	dahai: string,
	strBafuhai: string,
	strJifuhai: string,
	strDorahyouji: string,
): boolean => {
	if (!canRichi(strTehai13, shanten, isRichi, nokori)) {
		return false;
	}
	//親ならリーチする
	if (strJifuhai === '1z') {
		return true;
	}
	//待ちが悪い場合は様子を見る
	const tehaiNew = removeHai(addHai(strTehai13, strTsumo), dahai);
	const arMachi = stringToArrayWithFuro(getMachi(tehaiNew))[0];
	if (arMachi.length < 2) {
		return false;
	}
	//役があるならヤミテンでもいいのでは
	const arDorahyouji = stringToArrayWithFuro(strDorahyouji)[0];
	const arDora: string[] = arDorahyouji.map(d => getDoraFromDorahyouji(d));
	const strDora = arDora.join('');
	const isTsumo = true;
	for (const machi of arMachi) {
		const score = getScore(tehaiNew, machi, strBafuhai, strJifuhai, strDora, isTsumo)[0];
		if (score > 0) {
			return false;
		}
	}
	return true;
};

const canRichi = (
	tehai: string,
	shanten: number,
	isRichi: boolean,
	nokori: number,
): boolean => {
	if (!tehai.includes('<') && shanten === 0 && !isRichi && nokori >= 4) {
		return true;
	}
	return false;
};

const addHai = (tehai: string, hai: string): string => {
	const [arTehaiBaseNormal, hai_furo, hai_ankan] = stringToArrayWithFuro(tehai);
	const arTehaiNewNormal = arTehaiBaseNormal.concat(hai);
	arTehaiNewNormal.sort(compareFn);
	const strTehaiNew = arTehaiNewNormal.join('') + hai_furo.map(h => `<${h}>`).join('') + hai_ankan.map(h => `(${h})`).join('');
	return strTehaiNew;
};

const removeHai = (tehai: string, hai: string): string => {
	return tehai.replace(new RegExp(hai), '');
};
