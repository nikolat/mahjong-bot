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
	const [arTehai13Normal, hai_furo, hai_ankan] = stringToArrayWithFuro(strTehai13);
	const arTehai14Normal = arTehai13Normal.concat(strTsumo);
	arTehai14Normal.sort(compareFn);
	const strTehai14Normal = arTehai14Normal.join('') + hai_furo.map(h => `<${h}>`).join('') + hai_ankan.map(h => `(${h})`).join('');
	const [_, arKoritsuhai] = removeKoritsuHai(arTehai14Normal);
	const arSutehaiKouho = new Set(arTehai14Normal)
	//ドラ
	const arDorahyouji = stringToArrayWithFuro(strDorahyouji ?? '')[0];
	const arDora: string[] = arDorahyouji.map(d => getDoraFromDorahyouji(d));
	let arDahai: string[] = [];
	let point = -1;
	for (const sutehai of arSutehaiKouho) {
		const strTehaiRemoved = strTehai14Normal.replace(new RegExp(sutehai), '');
		const [shanten, _] = getShantenYaku(strTehaiRemoved, strBafuhai ?? '', strJifuhai ?? '');
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
