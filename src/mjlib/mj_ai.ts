import { addHai, compareFn, getDoraFromDorahyouji, removeHai, stringToArrayWithFuro } from "./mj_common";
import { getMachi } from "./mj_machi";
import { getScore } from "./mj_score";
import { getShanten, getShantenYaku, removeKoritsuHai } from "./mj_shanten";

export const naniwokiru = (
	strTehai13: string,
	strTsumo: string,
	strKawa: string,
	strBafuhai: string,
	strJifuhai: string,
	strDorahyouji: string,
	aryPlayerRichi: boolean[],
	aryPlayerGenbutsu: string[],
	strVisiblePai: string,
): string => {
	const arVisiblePai: string[] = stringToArrayWithFuro(strVisiblePai)[0];
	const arVisibleNum = [
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0
	];
	const sortCode = '1m,2m,3m,4m,5m,6m,7m,8m,9m,1p,2p,3p,4p,5p,6p,7p,8p,9p,1s,2s,3s,4s,5s,6s,7s,8s,9s,1z,2z,3z,4z,5z,6z,7z'.split(',');
	for (const p of arVisiblePai) {
		arVisibleNum[sortCode.indexOf(p)]++
	}
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
				const score = getScore(strTehaiRemoved, machi, strBafuhai, strJifuhai, arDora.join(''), isTsumo)[0];
				if (score > 0) {
					const nNokori = 4 - arVisibleNum[sortCode.indexOf(machi)]
					machiPoint += score * nNokori;
				}
			}
			shantenPoint += 10000;//テンパイを崩してまでオリないこととする
		}
		else {
			const arMentsuPattern = getShanten(strTehaiRemoved)[1];
			for (const strMentsu of arMentsuPattern) {
				let elementPoint = 0;
				if (strMentsu === 'chitoitsu' || strMentsu === 'kokushimusou') {
					elementPoint = 0
				}
				else {
					const ap = strMentsu.split(',');
					const arTatsu = [];
					if (ap[0] !== '') {//雀頭
						const nNokori = 4 - arVisibleNum[sortCode.indexOf(ap[0].slice(0, 2))];
						elementPoint += 20 * nNokori;
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
							const nNokori1 = 4 - arVisibleNum[sortCode.indexOf(`${t1 - 1}${color}`)];
							const nNokori2 = 4 - arVisibleNum[sortCode.indexOf(`${t2 + 1}${color}`)];
							elementPoint += 10 * (nNokori1 + nNokori2);
						}
						else if (t1 === t2) {//対子
							const nNokori = 4 - arVisibleNum[sortCode.indexOf(`${t1}${color}`)];
							elementPoint += 20 * nNokori;
						}
						else if ((t1 === 1) && (t2 === 2) || (t1 === 8) && (t2 === 9)) {//辺張
							let nNokori = 0;
							if (t1 === 1) {
								nNokori = 4 - arVisibleNum[sortCode.indexOf(`3${color}`)];
							}
							else {
								nNokori = 4 - arVisibleNum[sortCode.indexOf(`7${color}`)];
							}
							elementPoint += 10 * nNokori - 5
						}
						else {//嵌張
							const nNokori = 4 - arVisibleNum[sortCode.indexOf(`${t1 + 1}${color}`)];
							elementPoint += 10 * nNokori;
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
		//既に捨てた牌を優先的に切る
		let furitenPoint = 0;
		if (strKawa.includes(sutehai)) {
			furitenPoint = 10;
		}
		//ドラは残しておきたい
		let doraPoint = 0
		if (arDora.includes(sutehai)) {
			doraPoint = -50
		}
		//現物を優先的に切る
		let genbutsuPoint = 0;
		for (let i = 0; i < aryPlayerRichi.length; i++) {
			if (aryPlayerRichi[i]) {
				if (aryPlayerGenbutsu[i].includes(sutehai)) {
					genbutsuPoint += 2000;
					if (i === 0) {//親のリーチは特に避けたい
						genbutsuPoint += 1000;
					}
				}
			}
		}
		const dahaiPoint = shantenPoint + machiPoint + elementMaxPoint + koritsuPoint + furitenPoint + doraPoint + genbutsuPoint;
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
