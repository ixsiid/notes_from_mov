const path = require('path');
const fs = require('fs').promises;
const png = require('pngjs').PNG;
const hsv = require('rgb-hsv');

const window = require('svgdom').createSVGWindow();
const svg = require('svg.js')(window);
const document = window.document;

// const pxs = [...Array(7)].map((_, i) => [92, 108, 128, 151, 166, 202, 215, 239, 259, 277, 300, 313].map(n => parseInt(n + i * 258.5))).flat();
const white = [...Array(7)].map((_, i) => [92, 128, 166, 202, 239, 277, 313].map(n => parseInt(n + i * 258.5))).flat();
const black = [...Array(7)].map((_, i) => [108, 151, 215, 259, 300].map(n => parseInt(n + i * 258.5))).flat();
const keys = white.concat(black).sort((a, b) => a == b ? 0 : a > b ? 1 : -1);

const pxs = { white, black };

process.argv.filter((x, i) => i > 1).forEach(dir => {
	dir = path.join(__dirname, dir);
	(async function () {
		// ファイルハンドラ制限、省メモリ化のため、同期処理を行う部分

		const files = await fs.readdir(dir)
			.then(files => files.filter(x => x.startsWith('image_') && x.endsWith('.png')))
//			.then(files => files.slice(1000, 2000));


		const notes = Object.fromEntries(
			["right", "left"].map(h =>
				[h, Object.fromEntries(keys.map(px => [px, new Uint8Array(files.length)]))]
			));

		for (let i = 0; i < files.length; i++) {
			await fs.readFile(path.join(dir, files[i]))
				.then(data => {
					const image = png.sync.read(data).data;
					keys.forEach(px => {
						const [h, s, v] = [-8, 0, 8]
							.map(offset => hsv(...image.slice((px + offset) * 4, (px + offset) * 4 + 3)))
							.reduce((a, b) => a[2] < b[2] ? a : b);
						notes[h > 180 ? "left" : "right"][px][i] = v;
					});
				});
		}

		/*
		notes {
			left: {
				"92": [v0, v1, v2, v3, ...] (Uint8Array)
				"108": ...
				"128":...
				.. 
			},
			right: {...}
		}
		*/

		return notes;
	})()
		.then(notes => {
			// 2値化
			['left', 'right'].forEach(hand => {
				keys.forEach(px => {
					const n = notes[hand][px];
					const range = n.slice(1).reduce((result, a) => {
						if (result[0] > a) result[0] = a;
						else if (result[1] < a) result[1] = a;
						return result;
					}, [n[0], n[0]]);
					if (range[1] - range[0] < 20) {
						n.forEach((_, i) => n[i] = 0);
						return;
					}
					const threshold = (range[1] - range[0]) / 2 + range[0];
					n.forEach((v, i) => n[i] = (v > threshold ? 1 : 0));
				});
			});

			/*
			notes {
				left: {
					"92": [0, 0, 1, 1, 1, 0, 0, ...] (Uint8Array)
					"108": ...
					"128":...
					.. 
				},
				right: {...}
			}
			*/
			return notes;
		})
		.then(notes => {
			// 両隣がONだった場合、ご認識としてOFFにする
			// 黒鍵だけにする
			black.forEach(px => {
				const i = keys.indexOf(px);
				['left', 'right'].forEach(hand => {
					notes[hand][px].forEach((_, j) => {
						if (notes[hand][keys[i - 1]][j] && notes[hand][keys[i + 1]][j]) notes[hand][px][j] = 0;
					});
				})
			})
			return notes;
		})
		.then(notes => {
			// 音符データ化
			['left', 'right'].forEach(hand => {
				Object.entries(notes[hand]).forEach(([px, n]) => {
					const note = [];
					let inNote = false;
					n.forEach((v, i) => {
						if (v) {
							if (inNote) note[note.length - 1][1] = i;
							else {
								note.push([i, i]);
								inNote = true;
							}
						} else {
							inNote = false;
						}
					});


					notes[hand][px] = note;
				});
			});

			return notes;
		})
		.then(notes => {
			// SVG化
			const draw = svg(document.documentElement).size(1920, 1080);

			const root = draw.group();

			const score = ['left', 'right'].map(hand =>
				[white, black].map(key =>
					key.reduce((keys, px) => {
						const p = keys.group().translate(px, 0);
						notes[hand][px].forEach(([start, finish]) => p.line(0, start, 0, finish));
						return keys;
					}, root.group())
				));

			score[0][0].stroke({ width: 15, color: 'black' }); //  left - white
			score[0][1].stroke({ width: 15, color: 'red' });   //  left - black
			score[1][0].stroke({ width: 15, color: 'green' }); // right - white
			score[1][1].stroke({ width: 15, color: 'blue' });  // right - black
			fs.writeFile('aaa.svg', draw.svg());

			return notes;
		})
		.then(notes => {
			// SMF化
			const buffer = new Uint8Array(2 * 1024 * 1024);
			buffer[0] = 0x4d, buffer[1] = 0x54, buffer[2] = 0x68, buffer[3] = 0x64;
			buffer[4] = 0x00, buffer[5] = 0x00, buffer[6] = 0x00, buffer[7] = 0x06;
			buffer[8] = 0x00, buffer[9] = 0x01;   // Format Version
			buffer[10] = 0x00, buffer[11] = 0x02; // トラック数
			buffer[12] = 0x00, buffer[13] = 0x1e; // 時間単位

			let index = 14;
			['left', 'right'].map(hand =>
				Object.entries(notes[hand]).map(([px, note]) =>
					note.map(([start, finish]) =>
						[[start, keys.indexOf(parseInt(px)) + 0x18, true], [finish, keys.indexOf(parseInt(px)) + 0x18, false]])).flat().flat().sort((a, b) => a[0] == b[0] ? 0 : a[0] > b[0] ? 1 : -1)).forEach(track => {
							buffer[index++] = 0x4d, buffer[index++] = 0x54, buffer[index++] = 0x72, buffer[index++] = 0x6b;
							const length_index = index;
							buffer[index++] = 0x4d, buffer[index++] = 0x54, buffer[index++] = 0x72, buffer[index++] = 0x6b; // データ長

							let length = 0;
							let time = 0;
							let on = false;
							track.forEach(note => {
								(delta => {
									let buffer;
									if (delta > 0x1fffff) {
										buffer = new Uint8Array(4);
										buffer[0] = (delta >> 21) | 0x80;
										buffer[1] = ((delta >> 14) & 0xff) | 0x80;
										buffer[2] = ((delta >> 7) & 0xff) | 0x80;
										buffer[3] = delta & 0x7f;
										length += 4;
									} else if (delta > 0x3fff) {
										buffer = new Uint8Array(3);
										buffer[0] = (delta >> 14) | 0x80;
										buffer[1] = ((delta >> 7) & 0xff) | 0x80;
										buffer[2] = delta & 0x7f;
										length += 3;
									} else if (delta > 0x7f) {
										buffer = new Uint8Array(2);
										buffer[0] = (delta >> 7) | 0x80;
										buffer[1] = delta & 0x7f;
										length += 2;
									} else {
										buffer = new Uint8Array(1);
										buffer[0] = delta & 0x7f;
										length += 1;
									}
									return buffer;
								})(note[0] - time).forEach(t => buffer[index++] = t);
								time = note[0];
								if (note[2] != on) {
									buffer[index++] = (on = note[2]) ? 0x90 : 0x80;
									length += 1;
								}
								buffer[index++] = note[1];
								buffer[index++] = 0x60;

								length += 2;
							});

							buffer[length_index+0] = (length >> 24) & 0xff;
							buffer[length_index+1] = (length >> 16) & 0xff;
							buffer[length_index+2] = (length >> 8) & 0xff;
							buffer[length_index+3] = (length >> 0) & 0xff;
						});


			fs.writeFile('aaa.mid', buffer.slice(0, index));
		})
		.catch(console.error);
});