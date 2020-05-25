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

const q_white = rgb => {
	_hsv = hsv(...rgb);
	if (_hsv[2] < 60) return 0;
//	if (_hsv[1] < 41) return 0;
	return _hsv[0] > 180 ? -1 : 1;
};

const q_black = rgb => {
	_hsv = hsv(...rgb);
	if (_hsv[2] < 60) return 0;
//	if (_hsv[1] > 41) return 0;
	return _hsv[0] > 180 ? -1 : 1;
};

process.argv.filter((x, i) => i > 1).forEach(dir => {
	dir = path.join(__dirname, dir);
	(async function () {

		const files = await fs.readdir(dir)
			.then(files => files.filter(x => x.startsWith('image_') && x.endsWith('.png')))
			.then(files => files.slice(1000, 2000));

		const white_buffer = new Int8Array(files.length * white.length);
		const black_buffer = new Int8Array(files.length * black.length);

		for (let i = 0; i < files.length; i++) {
			await fs.readFile(path.join(dir, files[i]))
				.then(data => {
					white.map(px => q_white(png.sync.read(data).data.slice(px * 4, px * 4 + 3)))
						.forEach((rl, j) => {
							white_buffer[i + j * files.length] = rl;
						});
					black.map(px => q_black(png.sync.read(data).data.slice(px * 4, px * 4 + 3)))
						.forEach((rl, j) => {
							black_buffer[i + j * files.length] = rl;
						});
				});
		}

		return {
			white: white.map((_, i) => white_buffer.slice(i * files.length, (i + 1) * files.length)),
			black: black.map((_, i) => black_buffer.slice(i * files.length, (i + 1) * files.length)),
		};
	})()
		.then(d => ({
			white: d.white.map(n => {
				const notes = { right: [], left: [] };
				const t = { "1": "right", "-1": "left" };
				[1, -1].forEach(x => {
					let i = 0;
					while (i < n.length) {
						const start = n.indexOf(x, i);
						if (start < 0) break;
						const end = n.indexOf(0, start + 1);
						if (end < 0) {
							notes[t[x]].push([start, n.length - start]);
							break;
						}
						notes[t[x]].push([start, end - start]);
						i = end + 1;
					}
				});
				return notes;
			}),
			black: d.black.map(n => {
				const notes = { right: [], left: [] };
				const t = { "1": "right", "-1": "left" };
				[1, -1].forEach(x => {
					let i = 0;
					while (i < n.length) {
						const start = n.indexOf(x, i);
						if (start < 0) break;
						const end = n.indexOf(0, start + 1);
						if (end < 0) {
							notes[t[x]].push([start, n.length - start]);
							break;
						}
						notes[t[x]].push([start, end - start]);
						i = end + 1;
					}
				});
				return notes;
			}),
		}))
		.then(notes => {
			const draw = svg(document.documentElement).size(1920, 1080);
			const width = 5;
			const white_right = draw.group().stroke({ width, color: 'black' });
			white.forEach((px, i) => notes.white[i].right.forEach(note => white_right.line(px, note[0], px, note[0] + note[1])));
			const black_right = draw.group().stroke({ width, color: 'red' });
			black.forEach((px, i) => notes.black[i].right.forEach(note => black_right.line(px, note[0], px, note[0] + note[1])));
			const white_left = draw.group().stroke({ width, color: 'green' });
			white.forEach((px, i) => notes.white[i].left.forEach(note => white_left.line(px, note[0], px, note[0] + note[1])));
			const black_left = draw.group().stroke({ width, color: 'blue' });
			black.forEach((px, i) => notes.black[i].left.forEach(note => black_left.line(px, note[0], px, note[0] + note[1])));
			fs.writeFile('aaa.svg', draw.svg());
		})
		.catch(console.error);
});