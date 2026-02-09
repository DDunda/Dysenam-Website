// Value sliders
const LumaSlider = document.querySelector("#Luma_input[type=range]");

const labAslider = document.querySelector("#labA_input[type=range]");
const labBslider = document.querySelector("#labB_input[type=range]");

const lchCslider = document.querySelector("#lchC_input[type=range]");
const lchHslider = document.querySelector("#lchH_input[type=range]");

const srgbRslider = document.querySelector("#srgbR_input[type=range]");
const srgbGslider = document.querySelector("#srgbG_input[type=range]");
const srgbBslider = document.querySelector("#srgbB_input[type=range]");

const lsrgbRslider = document.querySelector("#lsrgbR_input[type=range]");
const lsrgbGslider = document.querySelector("#lsrgbG_input[type=range]");
const lsrgbBslider = document.querySelector("#lsrgbB_input[type=range]");

const hsvHslider = document.querySelector("#hsvH_input[type=range]");
const hsvSslider = document.querySelector("#hsvS_input[type=range]");
const hsvVslider = document.querySelector("#hsvV_input[type=range]");

const LumaBox = document.querySelector("#Luma_input[type=number]");

const labABox = document.querySelector("#labA_input[type=number]");
const labBBox = document.querySelector("#labB_input[type=number]");

const lchCBox = document.querySelector("#lchC_input[type=number]");
const lchHBox = document.querySelector("#lchH_input[type=number]");

const srgbRBox = document.querySelector("#srgbR_input[type=number]");
const srgbGBox = document.querySelector("#srgbG_input[type=number]");
const srgbBBox = document.querySelector("#srgbB_input[type=number]");

const lsrgbRBox = document.querySelector("#lsrgbR_input[type=number]");
const lsrgbGBox = document.querySelector("#lsrgbG_input[type=number]");
const lsrgbBBox = document.querySelector("#lsrgbB_input[type=number]");

const hsvHBox = document.querySelector("#hsvH_input[type=number]");
const hsvSBox = document.querySelector("#hsvS_input[type=number]");
const hsvVBox = document.querySelector("#hsvV_input[type=number]");

const Rslider = document.getElementById("resolution");
const clip_gamut = document.getElementById("clip_gamut");
const clip_negative = document.getElementById("clip_negative");

const swatch = document.getElementById("swatch");
const labOut = document.getElementById("oklab_out")
const lchOut = document.getElementById("oklch_out")
const hexOut = document.getElementById("hex_out")
const rgbOut = document.getElementById("srgb_out")
const hslOut = document.getElementById("hsl_out")

const DEFAULT_COLOUR = "#808080";

// Internal Values
let L = 0;
let dyn_colour = L >= 0.66 ? "oklab(0.5 0 0)" : "oklab(0.9 0 0)";

let A = 0;
let B = 0;

let C = 0;
let H = 0;

let srgbR = parseFloat(srgbRslider.value);
let srgbG = parseFloat(srgbGslider.value);
let srgbB = parseFloat(srgbBslider.value);

let lsrgbR = 0;
let lsrgbG = 0;
let lsrgbB = 0;

let hsvH = 0;
let hsvS = 0;
let hsvV = 0;

const padding = 0.1;

let resolution = parseFloat(Rslider.value);
let super_resolution = Math.round(resolution * (1 + 2 * padding));
let clipg = clip_gamut.checked;
let clipn = clip_negative.checked;

// Colour space converters
let toSRGB = culori.converter('rgb');
let toLSRGB = culori.converter('lrgb');
let toLCH = culori.converter('oklch');
let toLAB = culori.converter('oklab');
let toHSV = culori.converter('hsv');

const labCanvas = document.getElementById("LABpicker");
const labCtx = labCanvas.getContext('2d');
labCtx.imageSmoothingEnabled = false;

const labTxt = new OffscreenCanvas(resolution, resolution)
const labTxtCtx = labTxt.getContext('2d');
var labTxtId = labTxtCtx.getImageData(0, 0, resolution, resolution);
var labTxtPixels = labTxtId.data;

const hsvCanvas = document.getElementById("HSVpicker");
const hsvCtx = hsvCanvas.getContext('2d');
hsvCtx.imageSmoothingEnabled = false;

const hsvTxt = new OffscreenCanvas(resolution, resolution)
const hsvTxtCtx = hsvTxt.getContext('2d');
var hsvTxtId = hsvTxtCtx.getImageData(0, 0, resolution, resolution);
var hsvTxtPixels = hsvTxtId.data;

var cur_colour = {mode: "rgb", r: srgbR / 255.0, g: srgbG / 255.0, b: srgbB / 255.0};

function setResolution()
{
	labCanvas.width = super_resolution;
	labCanvas.height = super_resolution;
	labCtx.lineWidth = 0.002 * super_resolution;
	
	labTxt.width = resolution;
	labTxt.height = resolution;

	labTxtId = labTxtCtx.getImageData(0, 0, resolution, resolution);
	labTxtPixels = labTxtId.data;

	hsvCanvas.width = super_resolution;
	hsvCanvas.height = super_resolution;
	hsvCtx.lineWidth = 0.002 * super_resolution;
	
	hsvTxt.width = resolution;
	hsvTxt.height = resolution;

	hsvTxtId = hsvTxtCtx.getImageData(0, 0, resolution, resolution);
	hsvTxtPixels = hsvTxtId.data;
}

function drawLABImage()
{
	let center = super_resolution * 0.5;
	let pad = (super_resolution - resolution) / 2;

	let x = (0.5 + A / 0.8) * resolution + pad;
	let y = (0.5 - B / 0.8) * resolution + pad;
	let r = Math.sqrt(A * A + B * B) / 0.8 * resolution;

	labCtx.clearRect(0, 0, super_resolution, super_resolution);
	labCtx.putImageData(labTxtId, pad, pad);

	labCtx.strokeStyle = dyn_colour;
	labCtx.fillStyle = labCtx.strokeStyle;
	labCtx.globalCompositeOperation = 'source-atop';

	labCtx.beginPath();
	labCtx.moveTo(x, 0);
	labCtx.lineTo(x, super_resolution);
	labCtx.stroke();

	labCtx.beginPath();
	labCtx.moveTo(0, y);
	labCtx.lineTo(super_resolution, y);
	labCtx.stroke();

	labCtx.beginPath();
	labCtx.arc(center, center, r, 0, 2 * Math.PI);
	labCtx.stroke();

	labCtx.beginPath();
	labCtx.moveTo(center, center);
	labCtx.lineTo(x, y);
	labCtx.stroke();
	
	labCtx.strokeStyle = "oklab(0.9 0 0)";
	labCtx.fillStyle = labCtx.strokeStyle;
	labCtx.globalCompositeOperation = 'destination-over';

	labCtx.beginPath();
	labCtx.moveTo(x, 0);
	labCtx.lineTo(x, super_resolution);
	labCtx.stroke();

	labCtx.beginPath();
	labCtx.moveTo(0, y);
	labCtx.lineTo(super_resolution, y);
	labCtx.stroke();

	labCtx.beginPath();
	labCtx.arc(center, center, r, 0, 2 * Math.PI);
	labCtx.stroke();

	labCtx.beginPath();
	labCtx.moveTo(center, center);
	labCtx.lineTo(x, y);
	labCtx.stroke();
	
	labCtx.globalCompositeOperation = 'source-over';	

	labCtx.strokeStyle = dyn_colour;
	labCtx.fillStyle = `oklab(${L} ${A} ${B})`
	labCtx.beginPath();
    labCtx.arc(x, y, super_resolution * 0.01, 0, 2 * Math.PI);
	labCtx.fill();
	labCtx.stroke();
}

function drawHSVImage()
{
	let center = super_resolution * 0.5;
	let pad = (super_resolution - resolution) / 2;

	let x = (Math.cos(hsvH * Math.PI / 180) * hsvS + 1) * (resolution * 0.5) + pad;
	let y = (-Math.sin(hsvH * Math.PI / 180) * hsvS + 1) * (resolution * 0.5) + pad;
	let r = hsvS * resolution / 2;

	hsvCtx.clearRect(0, 0, super_resolution, super_resolution)
	hsvCtx.putImageData(hsvTxtId, pad, pad);

	hsvCtx.strokeStyle = dyn_colour;
	hsvCtx.fillStyle = hsvCtx.strokeStyle;
	hsvCtx.globalCompositeOperation = 'source-atop';

	hsvCtx.beginPath();
	hsvCtx.moveTo(center, center);
	hsvCtx.lineTo(x, y);
	hsvCtx.stroke();

	hsvCtx.beginPath();
	hsvCtx.arc(center, center, r, 0, 2 * Math.PI);
	hsvCtx.stroke();
	
	hsvCtx.strokeStyle = "oklab(0.9 0 0)";
	hsvCtx.fillStyle = hsvCtx.strokeStyle;
	hsvCtx.globalCompositeOperation = 'destination-over';

	hsvCtx.beginPath();
	hsvCtx.moveTo(center, center);
	hsvCtx.lineTo(x, y);
	hsvCtx.stroke();

	hsvCtx.beginPath();
	hsvCtx.arc(center, center, r, 0, 2 * Math.PI);
	hsvCtx.stroke();
	
	hsvCtx.globalCompositeOperation = 'source-over';	

	hsvCtx.strokeStyle = dyn_colour;
	hsvCtx.fillStyle = `oklab(${L} ${A} ${B})`
	hsvCtx.beginPath();
    hsvCtx.arc(x, y, resolution * 0.01, 0, 2 * Math.PI);
	hsvCtx.fill();
	hsvCtx.stroke();
}

function computeLABImage()
{
	let index = resolution * resolution * 4;

	let colour = {mode: "oklab", l: L, a: 0, b: 0};

	const invRes = 0.8 / (resolution - 1);

	if(clipg)
	{
		if(clipn)
		{
			for (let i = resolution; i-- > 0;)
			{
				colour.b = 0.4 - i * invRes;

				for(let j = resolution; j-- > 0;)
				{
					index -= 4;

					colour.a = j * invRes - 0.4;

					const srgb = toSRGB(colour);
					
					if (srgb.r >= 0 && srgb.g >= 0 && srgb.b >= 0 && srgb.r <= 1 && srgb.g <= 1 && srgb.b <= 1)
					{
						labTxtPixels[index+0] = srgb.r * 255;
						labTxtPixels[index+1] = srgb.g * 255;
						labTxtPixels[index+2] = srgb.b * 255;
						labTxtPixels[index+3] = 255;
					}
					else 
					{							
						labTxtPixels[index+3] = 0; // a = 0;
					}
				}
			}
		}
		else
		{
			for (let i = resolution; i-- > 0;)
			{
				colour.b = 0.4 - i * invRes;

				for(let j = resolution; j-- > 0;)
				{
					index -= 4;

					colour.a = j * invRes - 0.4;

					const srgb = toSRGB(colour);
					
					if (srgb.r <= 1 && srgb.g <= 1 && srgb.b <= 1)
					{
						labTxtPixels[index+0] = srgb.r * 255;
						labTxtPixels[index+1] = srgb.g * 255;
						labTxtPixels[index+2] = srgb.b * 255;
						labTxtPixels[index+3] = 255;
					}
					else 
					{							
						labTxtPixels[index+3] = 0; // a = 0;
					}
				}
			}
		}
	}
	else
	{
		if(clipn)
		{
			for (let i = resolution; i-- > 0;)
			{
				colour.b = 0.4 - i * invRes;

				for(let j = resolution; j-- > 0;)
				{
					index -= 4;

					colour.a = j * invRes - 0.4;

					const srgb = toSRGB(colour);
					
					if (srgb.r >= 0 && srgb.g >= 0 && srgb.b >= 0)
					{
						labTxtPixels[index+0] = srgb.r * 255;
						labTxtPixels[index+1] = srgb.g * 255;
						labTxtPixels[index+2] = srgb.b * 255;
						labTxtPixels[index+3] = 255;
					}
					else 
					{							
						labTxtPixels[index+3] = 0; // a = 0;
					}
				}
			}
		}
		else
		{
			for (let i = resolution; i-- > 0;)
			{
				colour.b = 0.4 - i * invRes;

				for(let j = resolution; j-- > 0;)
				{
					index -= 4;

					colour.a = j * invRes - 0.4;

					const srgb = toSRGB(colour);
					
					labTxtPixels[index+0] = srgb.r * 255;
					labTxtPixels[index+1] = srgb.g * 255;
					labTxtPixels[index+2] = srgb.b * 255;
					labTxtPixels[index+3] = 255;
				}
			}
		}
	}
}

function computeHSVImage()
{
	let index = resolution * resolution * 4;

	let colour = {mode: "hsv", h: 0, s: 0, v: hsvV };

	if(clipg * hsvV > 1 || clipn && hsvV < 0.0) 
	{
		for (let i = resolution * resolution; i-- > 0;)
		{
			index -= 4;
			hsvTxtPixels[index+3] = 0;
		}
		return;
	}

	const center = resolution / 2;
	const under = center - 1.0;

	for (let i = resolution; i-- > 0;)
	{
		let _j = resolution * resolution;

		for(let j = resolution; j-- > 0;)
		{
			index -= 4;

			let r = (i - center) * (i - center) + (j - center) * (j - center);
			//let r = i * i + j * j + resolution * (center - i - j);

			if ( r >= center * center) 
			{
				hsvTxtPixels[index+3] = 0;
				continue;
			}

			r = Math.sqrt(r);

			if (r >= center) continue;

			colour.h = Math.atan2(-(i - center), j - center) * 180 / Math.PI;
			colour.s = r / center;

			const srgb = toSRGB(colour);
			
			hsvTxtPixels[index+0] = srgb.r * 255;
			hsvTxtPixels[index+1] = srgb.g * 255;
			hsvTxtPixels[index+2] = srgb.b * 255;
			hsvTxtPixels[index+3] = (r < center) * (1 - (r > under) * (r - under)) * 255;
		}
	}
}

function setSwatch()
{
	const srgb = toSRGB(cur_colour);
	swatch.style['background-color'] = `rgb(${Math.round(srgb.r*255)},${Math.round(srgb.g*255)},${Math.round(srgb.b*255)})`
}

function setOutputs()
{
	let colour_copy = {
		...cur_colour
	};
	let lab = {
		mode: "oklab",
		l: L,
		a: A,
		b: B
	}
	let lch = {
		mode: "oklch",
		l: L,
		c: C,
		h: H
	}

	lab.l = lab.l.toFixed(3);
	lab.a = lab.a.toFixed(3);
	lab.b = lab.b.toFixed(3);

	lch.l = lch.l.toFixed(3);
	lch.c = lch.c.toFixed(3);
	lch.h = lch.h.toFixed(3);

	labOut.textContent = culori.formatCss(lab);
	lchOut.textContent = culori.formatCss(lch);
	rgbOut.textContent = culori.formatRgb(colour_copy);
	hexOut.textContent = culori.formatHex(colour_copy);
	hslOut.textContent = culori.formatHsl(colour_copy);

	dyn_colour = L >= 0.66 ? "oklab(0.5 0 0)" : "oklab(0.9 0 0)";
}

function setFromL()
{
	if(cur_colour.mode == "oklab" || cur_colour.mode == "oklch")
	{
		cur_colour.l = L;
	}
	else
	{
		cur_colour = {mode: "oklch", l: L, c: C, h: H};
	}

	const srgb = toSRGB(cur_colour);
	const lsrgb = toLSRGB(cur_colour);
	const hsv = toHSV(cur_colour);

	if(hsvV != hsv.v)
	{
		hsvVBox.value = hsvVslider.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LumaBox.value = LumaSlider.value = L;
	srgbRBox.value = srgbRslider.value = srgbR = srgb.r * 255.0;
	srgbGBox.value = srgbGslider.value = srgbG = srgb.g * 255.0;
	srgbBBox.value = srgbBslider.value = srgbB = srgb.b * 255.0;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR = lsrgb.r;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG = lsrgb.g;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB = lsrgb.b;
	hsvHslider.value = hsvH = hsv.h ? hsv.h : hsvH;
	hsvSslider.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromLAB()
{
	cur_colour = {mode: "oklab", l: L, a: A, b: B};

	//const lab = toLAB(cur_colour);
	const lch = toLCH(cur_colour);
	const srgb = toSRGB(cur_colour);
	const lsrgb = toLSRGB(cur_colour);
	const hsv = toHSV(cur_colour);

	if(hsvV != hsv.v)
	{
		hsvVBox.value = hsvVslider.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LumaBox.value = LumaSlider.value = L;
	labABox.value = labAslider.value = A;
	labBBox.value = labBslider.value = B;
	lchCBox.value = lchCslider.value = C = lch.c;
	lchHBox.value = lchHslider.value = H = lch.h ? lch.h : H;
	srgbRBox.value = srgbRslider.value = srgbR = srgb.r * 255.0;
	srgbGBox.value = srgbGslider.value = srgbG = srgb.g * 255.0;
	srgbBBox.value = srgbBslider.value = srgbB = srgb.b * 255.0;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR = lsrgb.r;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG = lsrgb.g;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB = lsrgb.b;
	hsvHBox.value = hsvHslider.value = hsvH = hsv.h ? hsv.h : hsvH;
	hsvSBox.value = hsvSslider.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromLCH()
{
	cur_colour = {mode: "oklch", l: L, c: C, h: H};

	const lab = toLAB(cur_colour);
	//const lch = toLCH(cur_colour);
	const srgb = toSRGB(cur_colour);
	const lsrgb = toLSRGB(cur_colour);
	const hsv = toHSV(cur_colour);

	if(hsvV != hsv.v)
	{
		hsvVBox.value = hsvVslider.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LumaBox.value = LumaSlider.value = L;
	labABox.value = labAslider.value = A = lab.a;
	labBBox.value = labBslider.value = B = lab.b;
	lchCBox.value = lchCslider.value = C;
	lchHBox.value = lchHslider.value = H;
	srgbRBox.value = srgbRslider.value = srgbR = srgb.r * 255.0;
	srgbGBox.value = srgbGslider.value = srgbG = srgb.g * 255.0;
	srgbBBox.value = srgbBslider.value = srgbB = srgb.b * 255.0;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR = lsrgb.r;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG = lsrgb.g;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB = lsrgb.b;
	hsvHBox.value = hsvHslider.value = hsvH = hsv.h ? hsv.h : hsvH;
	hsvSBox.value = hsvSslider.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromSRGB()
{
	cur_colour = {mode: "rgb", r: srgbR / 255.0, g: srgbG / 255.0, b: srgbB / 255.0};

	const lab = toLAB(cur_colour);
	const lch = toLCH(cur_colour);
	//const srgb = toRGB(cur_colour);
	const lsrgb = toLSRGB(cur_colour);
	const hsv = toHSV(cur_colour);

	if(L != lab.l)
	{
		LumaBox.value = LumaSlider.value = L = lab.l;
		computeLABImage();
	}

	if(hsvV != hsv.v)
	{
		hsvVBox.value = hsvVslider.value = hsvV = hsv.v;
		computeHSVImage();
	}

	labABox.value = labAslider.value = A = lab.a;
	labBBox.value = labBslider.value = B = lab.b;
	lchCBox.value = lchCslider.value = C = lch.c;
	lchHBox.value = lchHslider.value = H = lch.h ? lch.h : H;
	srgbRBox.value = srgbRslider.value = srgbR;
	srgbGBox.value = srgbGslider.value = srgbG;
	srgbBBox.value = srgbBslider.value = srgbB;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR = lsrgb.r;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG = lsrgb.g;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB = lsrgb.b;
	hsvHBox.value = hsvHslider.value = hsvH = hsv.h ? hsv.h : hsvH;
	hsvSBox.value = hsvSslider.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromLSRGB()
{
	cur_colour = {mode: "lrgb", r: lsrgbR, g: lsrgbG, b: lsrgbB};

	const lab = toLAB(cur_colour);
	const lch = toLCH(cur_colour);
	const srgb = toSRGB(cur_colour);
	//const lsrgb = toLRGB(cur_colour);
	const hsv = toHSV(cur_colour);

	if(L != lab.l)
	{
		LumaBox.value = LumaSlider.value = L = lab.l;
		computeLABImage();
	}

	if(hsvV != hsv.v)
	{
		hsvVBox.value = hsvVslider.value = hsvV = hsv.v;
		computeHSVImage();
	}

	labABox.value = labAslider.value = A = lab.a;
	labBBox.value = labBslider.value = B = lab.b;
	lchCBox.value = lchCslider.value = C = lch.c;
	lchHBox.value = lchHslider.value = H = lch.h ? lch.h : H;
	srgbRBox.value = srgbRslider.value = srgbR = srgb.r * 255.0;
	srgbGBox.value = srgbGslider.value = srgbG = srgb.g * 255.0;
	srgbBBox.value = srgbBslider.value = srgbB = srgb.b * 255.0;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB;
	hsvHBox.value = hsvHslider.value = hsvH = hsv.h ? hsv.h : hsvH;
	hsvSBox.value = hsvSslider.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromHSV()
{
	cur_colour = {mode: "hsv", h: hsvH, s: hsvS, v: hsvV};

	const lab = toLAB(cur_colour);
	const lch = toLCH(cur_colour);
	const srgb = toSRGB(cur_colour);
	const lsrgb = toLSRGB(cur_colour);
	//const hsv = toHSV(cur_colour);

	if(L != lab.l)
	{
		LumaBox.value = LumaSlider.value = L = lab.l;
		computeLABImage();
	}

	labABox.value = labAslider.value = A = lab.a;
	labBBox.value = labBslider.value = B = lab.b;
	lchCBox.value = lchCslider.value = C = lch.c;
	lchHBox.value = lchHslider.value = H = lch.h ? lch.h : H;
	srgbRBox.value = srgbRslider.value = srgbR = srgb.r * 255.0;
	srgbGBox.value = srgbGslider.value = srgbG = srgb.g * 255.0;
	srgbBBox.value = srgbBslider.value = srgbB = srgb.b * 255.0;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR = lsrgb.r;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG = lsrgb.g;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB = lsrgb.b;
	hsvHBox.value = hsvHslider.value = hsvH;
	hsvSBox.value = hsvSslider.value = hsvS;
	hsvVBox.value = hsvVslider.value = hsvV;
	
	setSwatch();
	setOutputs();
}

function setFromURL()
{
	let hex = location.hash;
	if (hex == "" || hex == undefined) hex = DEFAULT_COLOUR;
	cur_colour = culori.parse(hex);

	const lab = toLAB(cur_colour);
	const lch = toLCH(cur_colour);
	const srgb = toSRGB(cur_colour);
	const lsrgb = toLSRGB(cur_colour);
	const hsv = toHSV(cur_colour);

	if(L != lab.l)
	{
		LumaBox.value = LumaSlider.value = L = lab.l;
		computeLABImage();
	}

	if(hsvV != hsv.v)
	{
		hsvVBox.value = hsvVslider.value = hsvV = hsv.v;
		computeHSVImage();
	}

	labABox.value = labAslider.value = A = lab.a;
	labBBox.value = labBslider.value = B = lab.b;
	lchCBox.value = lchCslider.value = C = lch.c;
	lchHBox.value = lchHslider.value = H = lch.h ? lch.h : H;
	srgbRBox.value = srgbRslider.value = srgbR = srgb.r * 255.0;
	srgbGBox.value = srgbGslider.value = srgbG = srgb.g * 255.0;
	srgbBBox.value = srgbBslider.value = srgbB = srgb.b * 255.0;
	lsrgbRBox.value = lsrgbRslider.value = lsrgbR = lsrgb.r;
	lsrgbGBox.value = lsrgbGslider.value = lsrgbG = lsrgb.g;
	lsrgbBBox.value = lsrgbBslider.value = lsrgbB = lsrgb.b;
	hsvHBox.value = hsvHslider.value = hsvH = hsv.h ? hsv.h : hsvH;
	hsvSBox.value = hsvSslider.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function onMoveLAB(event)
{
	var left = labCanvas.offsetLeft + labCanvas.clientLeft;
	var top = labCanvas.offsetTop + labCanvas.clientTop;
	var width = labCanvas.clientWidth;
	var height = labCanvas.clientHeight;

	var x = (event.pageX - left) / width;
	var y = 1 - (event.pageY - top) / height;

	x = (x - 0.5) * (super_resolution / resolution) + 0.5;
	y = (y - 0.5) * (super_resolution / resolution) + 0.5;

	var _A = Math.max(-1,Math.min(1, x * 2 - 1)) * 0.4;
	var _B = Math.max(-1,Math.min(1, y * 2 - 1)) * 0.4;

	if (_A == A && _B == B) return;

	A = _A;
	B = _B;

	setFromLAB();
	drawLABImage();
	drawHSVImage();
}

function checkColourChange()
{
	if (window.location.hash == hexOut.textContent) return;

	window.location.hash = hexOut.textContent;
}

function onDownLAB(event)
{
	onMoveLAB(event);
	labCanvas.addEventListener('mousemove', onMoveLAB, false);
}

function onUpLAB(event)
{
	onMoveLAB(event);
	labCanvas.removeEventListener('mousemove', onMoveLAB, false);
	checkColourChange();
}

function onMoveHSV(event)
{
	var left = hsvCanvas.offsetLeft + hsvCanvas.clientLeft;
	var top = hsvCanvas.offsetTop + hsvCanvas.clientTop;
	var width = hsvCanvas.clientWidth;
	var height = hsvCanvas.clientHeight;

	var x = (event.pageX - left) / width;
	var y = 1 - (event.pageY - top) / height;

	x = (x - 0.5) * (super_resolution / resolution) + 0.5;
	y = (y - 0.5) * (super_resolution / resolution) + 0.5;

	var _S = Math.min(Math.sqrt((x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5)) * 2, 1);
	var _H = _S > 0 ? ((Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 360) % 360 : hsvH;

	if (_H == hsvH && _S == hsvS) return;

	hsvH = _H;
	hsvS = _S;

	setFromHSV();
	drawLABImage();
	drawHSVImage();
}

function onDownHSV(event)
{
	onMoveHSV(event);
	hsvCanvas.addEventListener('mousemove', onMoveHSV, false);
}

function onUpHSV(event)
{
	onMoveHSV(event);
	hsvCanvas.removeEventListener('mousemove', onMoveHSV, false);
	checkColourChange();
}

labCanvas.addEventListener('mousedown', onDownLAB, false);
labCanvas.addEventListener('mouseup', onUpLAB, false);

hsvCanvas.addEventListener('mousedown', onDownHSV, false);
hsvCanvas.addEventListener('mouseup', onUpHSV, false);

LumaBox.oninput = LumaSlider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == L) return;
	L = parseFloat(this.value);
	
	computeLABImage();

	setFromL(); 
	drawLABImage();
	drawHSVImage();
};

labABox.oninput = labAslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == A) return;
	A = parseFloat(this.value);

	setFromLAB();
	drawLABImage();
	drawHSVImage();
};

labBBox.oninput = labBslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == B) return;
	B = parseFloat(this.value);

	setFromLAB();
	drawLABImage();
	drawHSVImage();
};

lchCBox.oninput = lchCslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == C) return;
	C = parseFloat(this.value);

	setFromLCH();
	drawLABImage();
	drawHSVImage();
};

lchHBox.oninput = lchHslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == H) return;
	H = parseFloat(this.value);

	setFromLCH();
	drawLABImage();
	drawHSVImage();
};

srgbRBox.oninput = srgbRslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == srgbR) return;
	srgbR = parsed;

	setFromSRGB();
	drawLABImage();
	drawHSVImage();
};

srgbGBox.oninput = srgbGslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == srgbG) return;
	srgbG = parsed;

	setFromSRGB();
	drawLABImage();
	drawHSVImage();
};

srgbBBox.oninput = srgbBslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == srgbB) return;
	srgbB = parsed;

	setFromSRGB();
	drawLABImage();
	drawHSVImage();
};

lsrgbRBox.oninput = lsrgbRslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == lsrgbR) return;
	lsrgbR = parsed;

	setFromLSRGB();
	drawLABImage();
	drawHSVImage();
};

lsrgbGBox.oninput = lsrgbGslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == lsrgbG) return;
	lsrgbG = parsed;

	setFromLSRGB();
	drawLABImage();
	drawHSVImage();
};

lsrgbBBox.oninput = lsrgbBslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == lsrgbB) return;
	lsrgbB = parsed;

	setFromLSRGB();
	drawLABImage();
	drawHSVImage();
};

hsvHBox.oninput = hsvHslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == hsvH) return;
	hsvH = parsed;

	setFromHSV();
	drawLABImage();
	drawHSVImage();
};

hsvSBox.oninput = hsvSslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == hsvS) return;
	hsvS = parsed;

	setFromHSV();
	drawLABImage();
	drawHSVImage();
};

hsvVBox.oninput = hsvVslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == hsvV) return;
	hsvV = parsed;

	computeHSVImage();

	setFromHSV();
	drawLABImage();
	drawHSVImage();
};

Rslider.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == resolution) return;
	resolution = parseFloat(this.value);
	super_resolution = Math.round(resolution * (1 + 2 * padding));

	setResolution();
	computeLABImage();
	computeHSVImage();
	drawLABImage();
	drawHSVImage();
};

clip_gamut.onclick = function()
{
	if(clip_gamut.checked == clipg) return;
	clipg = clip_gamut.checked;
	computeLABImage();
	computeHSVImage();
	drawLABImage();
	drawHSVImage();
};

clip_negative.onclick = function()
{
	if(clip_negative.checked == clipn) return;
	clipn = clip_negative.checked;
	computeLABImage();
	computeHSVImage();
	drawLABImage();
	drawHSVImage();
};

labCanvas.width = super_resolution;
labCanvas.height = super_resolution;
hsvCanvas.width = super_resolution;
hsvCanvas.height = super_resolution;	

setFromURL();
computeHSVImage();
computeLABImage();
drawHSVImage();
drawLABImage();

LumaBox.onchange = LumaSlider.onchange =
labABox.onchange = labAslider.onchange =
labBBox.onchange = labBslider.onchange =
lchCBox.onchange = lchCslider.onchange =
lchHBox.onchange = lchHslider.onchange =
srgbRBox.onchange = srgbRslider.onchange =
srgbGBox.onchange = srgbGslider.onchange =
srgbBBox.onchange = srgbBslider.onchange =
lsrgbRBox.onchange = lsrgbRslider.onchange =
lsrgbGBox.onchange = lsrgbGslider.onchange =
lsrgbBBox.onchange = lsrgbBslider.onchange =
hsvHBox.onchange = hsvHslider.onchange =
hsvSBox.onchange = hsvSslider.onchange =
hsvVBox.onchange = hsvVslider.onchange = function(){checkColourChange();}