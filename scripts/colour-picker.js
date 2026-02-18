// Value sliders
const LUMA_SLIDER = document.querySelector("#Luma_input[type=range]");
const LR_SLIDER = document.querySelector("#Lr_input[type=range]");

const LAB_A_SLIDER = document.querySelector("#labA_input[type=range]");
const LAB_B_SLIDER = document.querySelector("#labB_input[type=range]");

const LCH_C_SLIDER = document.querySelector("#lchC_input[type=range]");
const LCH_H_SLIDER = document.querySelector("#lchH_input[type=range]");

const SRGB_R_SLIDER = document.querySelector("#srgbR_input[type=range]");
const SRGB_G_SLIDER = document.querySelector("#srgbG_input[type=range]");
const SRGB_B_SLIDER = document.querySelector("#srgbB_input[type=range]");

const LSRGB_R_SLIDER = document.querySelector("#lsrgbR_input[type=range]");
const LSRGB_G_SLIDER = document.querySelector("#lsrgbG_input[type=range]");
const LSRGB_B_SLIDER = document.querySelector("#lsrgbB_input[type=range]");

const HSV_H_SLIDER = document.querySelector("#hsvH_input[type=range]");
const HSV_S_SLIDER = document.querySelector("#hsvS_input[type=range]");
const HSV_V_SLIDER = document.querySelector("#hsvV_input[type=range]");

const LUMA_FIELD = document.querySelector("#Luma_input[type=number]");
const LR_FIELD = document.querySelector("#Lr_input[type=number]");

const LAB_A_FIELD = document.querySelector("#labA_input[type=number]");
const LAB_B_FIELD = document.querySelector("#labB_input[type=number]");

const LCH_C_FIELD = document.querySelector("#lchC_input[type=number]");
const LCH_H_FIELD = document.querySelector("#lchH_input[type=number]");

const SRGB_R_FIELD = document.querySelector("#srgbR_input[type=number]");
const SRGB_G_FIELD = document.querySelector("#srgbG_input[type=number]");
const SRGB_B_FIELD = document.querySelector("#srgbB_input[type=number]");

const LSRGB_R_FIELD = document.querySelector("#lsrgbR_input[type=number]");
const LSRGB_G_FIELD = document.querySelector("#lsrgbG_input[type=number]");
const LSRGB_B_FIELD = document.querySelector("#lsrgbB_input[type=number]");

const HSV_H_FIELD = document.querySelector("#hsvH_input[type=number]");
const HSV_S_FIELD = document.querySelector("#hsvS_input[type=number]");
const HSV_V_FIELD = document.querySelector("#hsvV_input[type=number]");

const RESOLUTION_SLIDER = document.getElementById("resolution");
const CLIP_GAMUT_CHECKBOX = document.getElementById("clip_gamut");
const CLIP_NEGATIVE_CHECKBOX = document.getElementById("clip_negative");

const PICKER_SWATCH = document.getElementById("picker-swatch");
const OKLAB_OUTPUT = document.getElementById("oklab_out")
const OKLCH_OUTPUT = document.getElementById("oklch_out")
const HEX_OUTPUT = document.getElementById("hex_out")
const RGB_OUTPUT = document.getElementById("srgb_out")
const HSL_OUTPUT = document.getElementById("hsl_out")

const DEFAULT_COLOUR = "#808080";

const K1 = 0.206;
const K2 = 0.03;
const K3 = (1+K1)/(1+K2);

// Internal Values
let L = 0;
let Lr = 0;
let dyn_colour = L >= 0.66 ? "oklab(0.5 0 0)" : "oklab(0.9 0 0)";

let A = 0;
let B = 0;

let C = 0;
let H = 0;

let srgbR = parseFloat(SRGB_R_SLIDER.value);
let srgbG = parseFloat(SRGB_G_SLIDER.value);
let srgbB = parseFloat(SRGB_B_SLIDER.value);

let lsrgbR = 0;
let lsrgbG = 0;
let lsrgbB = 0;

let hsvH = 0;
let hsvS = 0;
let hsvV = 0;

const CANVAS_PADDING = 0.1;

let resolution = parseFloat(RESOLUTION_SLIDER.value);
let super_resolution = Math.round(resolution * (1 + 2 * CANVAS_PADDING));
let clipg = CLIP_GAMUT_CHECKBOX.checked;
let clipn = CLIP_NEGATIVE_CHECKBOX.checked;

// Colour space converters
const TO_SRGB = culori.converter('rgb');
const TO_LSRGB = culori.converter('lrgb');
const TO_LCH = culori.converter('oklch');
const TO_LAB = culori.converter('oklab');
const TO_HSV = culori.converter('hsv');

const LAB_CANVAS = document.getElementById("LABpicker");
const LAB_CANVAS_CONTEXT  = LAB_CANVAS.getContext('2d');
LAB_CANVAS_CONTEXT.imageSmoothingEnabled = false;

const LAB_TEXTURE = new OffscreenCanvas(resolution, resolution)
const LAB_TEXTURE_CONTEXT = LAB_TEXTURE.getContext('2d');
var lab_texture_imagedata = LAB_TEXTURE_CONTEXT.getImageData(0, 0, resolution, resolution);
var lab_texture_pixels = lab_texture_imagedata.data;

const HSV_CANVAS = document.getElementById("HSVpicker");
const HSV_CANVAS_CONTEXT = HSV_CANVAS.getContext('2d');
HSV_CANVAS_CONTEXT.imageSmoothingEnabled = false;

const HSV_TEXTURE = new OffscreenCanvas(resolution, resolution)
const HSV_TEXTURE_CONTEXT = HSV_TEXTURE.getContext('2d');
var hsv_texture_imagedata = HSV_TEXTURE_CONTEXT.getImageData(0, 0, resolution, resolution);
var hsv_texture_pixels = hsv_texture_imagedata.data;

var cur_colour = {mode: "rgb", r: srgbR / 255.0, g: srgbG / 255.0, b: srgbB / 255.0};

function setResolution()
{
	LAB_CANVAS.width = super_resolution;
	LAB_CANVAS.height = super_resolution;
	LAB_CANVAS_CONTEXT.lineWidth = 0.002 * super_resolution;
	
	LAB_TEXTURE.width = resolution;
	LAB_TEXTURE.height = resolution;

	lab_texture_imagedata = LAB_TEXTURE_CONTEXT.getImageData(0, 0, resolution, resolution);
	lab_texture_pixels = lab_texture_imagedata.data;

	HSV_CANVAS.width = super_resolution;
	HSV_CANVAS.height = super_resolution;
	HSV_CANVAS_CONTEXT.lineWidth = 0.002 * super_resolution;
	
	HSV_TEXTURE.width = resolution;
	HSV_TEXTURE.height = resolution;

	hsv_texture_imagedata = HSV_TEXTURE_CONTEXT.getImageData(0, 0, resolution, resolution);
	hsv_texture_pixels = hsv_texture_imagedata.data;
}

function drawLABImage()
{
	let center = super_resolution * 0.5;
	let pad = (super_resolution - resolution) / 2;

	let x = (0.5 + A / 0.8) * resolution + pad;
	let y = (0.5 - B / 0.8) * resolution + pad;
	let r = Math.sqrt(A * A + B * B) / 0.8 * resolution;

	LAB_CANVAS_CONTEXT.clearRect(0, 0, super_resolution, super_resolution);
	LAB_CANVAS_CONTEXT.putImageData(lab_texture_imagedata, pad, pad);

	LAB_CANVAS_CONTEXT.strokeStyle = dyn_colour;
	LAB_CANVAS_CONTEXT.fillStyle = LAB_CANVAS_CONTEXT.strokeStyle;
	LAB_CANVAS_CONTEXT.globalCompositeOperation = 'source-atop';

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.moveTo(x, 0);
	LAB_CANVAS_CONTEXT.lineTo(x, super_resolution);
	LAB_CANVAS_CONTEXT.stroke();

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.moveTo(0, y);
	LAB_CANVAS_CONTEXT.lineTo(super_resolution, y);
	LAB_CANVAS_CONTEXT.stroke();

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.arc(center, center, r, 0, 2 * Math.PI);
	LAB_CANVAS_CONTEXT.stroke();

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.moveTo(center, center);
	LAB_CANVAS_CONTEXT.lineTo(x, y);
	LAB_CANVAS_CONTEXT.stroke();
	
	LAB_CANVAS_CONTEXT.strokeStyle = "oklab(0.9 0 0)";
	LAB_CANVAS_CONTEXT.fillStyle = LAB_CANVAS_CONTEXT.strokeStyle;
	LAB_CANVAS_CONTEXT.globalCompositeOperation = 'destination-over';

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.moveTo(x, 0);
	LAB_CANVAS_CONTEXT.lineTo(x, super_resolution);
	LAB_CANVAS_CONTEXT.stroke();

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.moveTo(0, y);
	LAB_CANVAS_CONTEXT.lineTo(super_resolution, y);
	LAB_CANVAS_CONTEXT.stroke();

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.arc(center, center, r, 0, 2 * Math.PI);
	LAB_CANVAS_CONTEXT.stroke();

	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.moveTo(center, center);
	LAB_CANVAS_CONTEXT.lineTo(x, y);
	LAB_CANVAS_CONTEXT.stroke();
	
	LAB_CANVAS_CONTEXT.globalCompositeOperation = 'source-over';	

	LAB_CANVAS_CONTEXT.strokeStyle = dyn_colour;
	LAB_CANVAS_CONTEXT.fillStyle = `oklab(${L} ${A} ${B})`
	LAB_CANVAS_CONTEXT.beginPath();
	LAB_CANVAS_CONTEXT.arc(x, y, super_resolution * 0.01, 0, 2 * Math.PI);
	LAB_CANVAS_CONTEXT.fill();
	LAB_CANVAS_CONTEXT.stroke();
}

function drawHSVImage()
{
	let center = super_resolution * 0.5;
	let pad = (super_resolution - resolution) / 2;

	let x = (Math.cos(hsvH * Math.PI / 180) * hsvS + 1) * (resolution * 0.5) + pad;
	let y = (-Math.sin(hsvH * Math.PI / 180) * hsvS + 1) * (resolution * 0.5) + pad;
	let r = hsvS * resolution / 2;

	HSV_CANVAS_CONTEXT.clearRect(0, 0, super_resolution, super_resolution)
	HSV_CANVAS_CONTEXT.putImageData(hsv_texture_imagedata, pad, pad);

	HSV_CANVAS_CONTEXT.strokeStyle = dyn_colour;
	HSV_CANVAS_CONTEXT.fillStyle = HSV_CANVAS_CONTEXT.strokeStyle;
	HSV_CANVAS_CONTEXT.globalCompositeOperation = 'source-atop';

	HSV_CANVAS_CONTEXT.beginPath();
	HSV_CANVAS_CONTEXT.moveTo(center, center);
	HSV_CANVAS_CONTEXT.lineTo(x, y);
	HSV_CANVAS_CONTEXT.stroke();

	HSV_CANVAS_CONTEXT.beginPath();
	HSV_CANVAS_CONTEXT.arc(center, center, r, 0, 2 * Math.PI);
	HSV_CANVAS_CONTEXT.stroke();
	
	HSV_CANVAS_CONTEXT.strokeStyle = "oklab(0.9 0 0)";
	HSV_CANVAS_CONTEXT.fillStyle = HSV_CANVAS_CONTEXT.strokeStyle;
	HSV_CANVAS_CONTEXT.globalCompositeOperation = 'destination-over';

	HSV_CANVAS_CONTEXT.beginPath();
	HSV_CANVAS_CONTEXT.moveTo(center, center);
	HSV_CANVAS_CONTEXT.lineTo(x, y);
	HSV_CANVAS_CONTEXT.stroke();

	HSV_CANVAS_CONTEXT.beginPath();
	HSV_CANVAS_CONTEXT.arc(center, center, r, 0, 2 * Math.PI);
	HSV_CANVAS_CONTEXT.stroke();
	
	HSV_CANVAS_CONTEXT.globalCompositeOperation = 'source-over';	

	HSV_CANVAS_CONTEXT.strokeStyle = dyn_colour;
	HSV_CANVAS_CONTEXT.fillStyle = `oklab(${L} ${A} ${B})`
	HSV_CANVAS_CONTEXT.beginPath();
	HSV_CANVAS_CONTEXT.arc(x, y, resolution * 0.01, 0, 2 * Math.PI);
	HSV_CANVAS_CONTEXT.fill();
	HSV_CANVAS_CONTEXT.stroke();
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

					const srgb = TO_SRGB(colour);
					
					if (srgb.r >= 0 && srgb.g >= 0 && srgb.b >= 0 && srgb.r <= 1 && srgb.g <= 1 && srgb.b <= 1)
					{
						lab_texture_pixels[index+0] = srgb.r * 255;
						lab_texture_pixels[index+1] = srgb.g * 255;
						lab_texture_pixels[index+2] = srgb.b * 255;
						lab_texture_pixels[index+3] = 255;
					}
					else 
					{							
						lab_texture_pixels[index+3] = 0; // a = 0;
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

					const srgb = TO_SRGB(colour);
					
					if (srgb.r <= 1 && srgb.g <= 1 && srgb.b <= 1)
					{
						lab_texture_pixels[index+0] = srgb.r * 255;
						lab_texture_pixels[index+1] = srgb.g * 255;
						lab_texture_pixels[index+2] = srgb.b * 255;
						lab_texture_pixels[index+3] = 255;
					}
					else 
					{							
						lab_texture_pixels[index+3] = 0; // a = 0;
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

					const srgb = TO_SRGB(colour);
					
					if (srgb.r >= 0 && srgb.g >= 0 && srgb.b >= 0)
					{
						lab_texture_pixels[index+0] = srgb.r * 255;
						lab_texture_pixels[index+1] = srgb.g * 255;
						lab_texture_pixels[index+2] = srgb.b * 255;
						lab_texture_pixels[index+3] = 255;
					}
					else 
					{							
						lab_texture_pixels[index+3] = 0; // a = 0;
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

					const srgb = TO_SRGB(colour);
					
					lab_texture_pixels[index+0] = srgb.r * 255;
					lab_texture_pixels[index+1] = srgb.g * 255;
					lab_texture_pixels[index+2] = srgb.b * 255;
					lab_texture_pixels[index+3] = 255;
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
			hsv_texture_pixels[index+3] = 0;
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
				hsv_texture_pixels[index+3] = 0;
				continue;
			}

			r = Math.sqrt(r);

			if (r >= center) continue;

			colour.h = Math.atan2(-(i - center), j - center) * 180 / Math.PI;
			colour.s = r / center;

			const srgb = TO_SRGB(colour);
			
			hsv_texture_pixels[index+0] = srgb.r * 255;
			hsv_texture_pixels[index+1] = srgb.g * 255;
			hsv_texture_pixels[index+2] = srgb.b * 255;
			hsv_texture_pixels[index+3] = (r < center) * (1 - (r > under) * (r - under)) * 255;
		}
	}
}

function setSwatch()
{
	const srgb = TO_SRGB(cur_colour);
	PICKER_SWATCH.style['background-color'] = `rgb(${Math.round(srgb.r*255)},${Math.round(srgb.g*255)},${Math.round(srgb.b*255)})`
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

	OKLAB_OUTPUT.textContent = culori.formatCss(lab);
	OKLCH_OUTPUT.textContent = culori.formatCss(lch);
	RGB_OUTPUT.textContent = culori.formatRgb(colour_copy);
	HEX_OUTPUT.textContent = culori.formatHex(colour_copy);
	HSL_OUTPUT.textContent = culori.formatHsl(colour_copy);

	dyn_colour = L >= 0.66 ? "oklab(0.5 0 0)" : "oklab(0.9 0 0)";
}

function LtoLr(L)
{
	return (K3 * L - K1 + Math.sqrt(Math.pow(K3 * L - K1, 2) + 4 * K2 * K3 * L)) / 2;
}
function LrtoL(Lr)
{
	return (Lr * (Lr + K1)) / (K3 * (Lr + K2))
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

	const srgb = TO_SRGB(cur_colour);
	const lsrgb = TO_LSRGB(cur_colour);
	const hsv = TO_HSV(cur_colour);

	if(hsvV != hsv.v)
	{
		HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LUMA_FIELD.value = LUMA_SLIDER.value = L;
	LR_FIELD.value = LR_SLIDER.value = Lr;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR = srgb.r * 255.0;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG = srgb.g * 255.0;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB = srgb.b * 255.0;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR = lsrgb.r;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG = lsrgb.g;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB = lsrgb.b;
	HSV_H_SLIDER.value = hsvH = hsv.h ? hsv.h : hsvH;
	HSV_S_SLIDER.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromLAB()
{
	cur_colour = {mode: "oklab", l: L, a: A, b: B};

	//const lab = TO_LAB(cur_colour);
	const lch = TO_LCH(cur_colour);
	const srgb = TO_SRGB(cur_colour);
	const lsrgb = TO_LSRGB(cur_colour);
	const hsv = TO_HSV(cur_colour);

	if(hsvV != hsv.v)
	{
		HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LUMA_FIELD.value = LUMA_SLIDER.value = L;
	LR_FIELD.value = LR_SLIDER.value = Lr;
	LAB_A_FIELD.value = LAB_A_SLIDER.value = A;
	LAB_B_FIELD.value = LAB_B_SLIDER.value = B;
	LCH_C_FIELD.value = LCH_C_SLIDER.value = C = lch.c;
	LCH_H_FIELD.value = LCH_H_SLIDER.value = H = lch.h ? lch.h : H;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR = srgb.r * 255.0;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG = srgb.g * 255.0;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB = srgb.b * 255.0;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR = lsrgb.r;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG = lsrgb.g;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB = lsrgb.b;
	HSV_H_FIELD.value = HSV_H_SLIDER.value = hsvH = hsv.h ? hsv.h : hsvH;
	HSV_S_FIELD.value = HSV_S_SLIDER.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromLCH()
{
	cur_colour = {mode: "oklch", l: L, c: C, h: H};

	const lab = TO_LAB(cur_colour);
	//const lch = TO_LCH(cur_colour);
	const srgb = TO_SRGB(cur_colour);
	const lsrgb = TO_LSRGB(cur_colour);
	const hsv = TO_HSV(cur_colour);

	if(hsvV != hsv.v)
	{
		HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LUMA_FIELD.value = LUMA_SLIDER.value = L;
	LR_FIELD.value = LR_SLIDER.value = Lr;
	LAB_A_FIELD.value = LAB_A_SLIDER.value = A = lab.a;
	LAB_B_FIELD.value = LAB_B_SLIDER.value = B = lab.b;
	LCH_C_FIELD.value = LCH_C_SLIDER.value = C;
	LCH_H_FIELD.value = LCH_H_SLIDER.value = H;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR = srgb.r * 255.0;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG = srgb.g * 255.0;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB = srgb.b * 255.0;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR = lsrgb.r;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG = lsrgb.g;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB = lsrgb.b;
	HSV_H_FIELD.value = HSV_H_SLIDER.value = hsvH = hsv.h ? hsv.h : hsvH;
	HSV_S_FIELD.value = HSV_S_SLIDER.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromSRGB()
{
	cur_colour = {mode: "rgb", r: srgbR / 255.0, g: srgbG / 255.0, b: srgbB / 255.0};

	const lab = TO_LAB(cur_colour);
	const lch = TO_LCH(cur_colour);
	//const srgb = toRGB(cur_colour);
	const lsrgb = TO_LSRGB(cur_colour);
	const hsv = TO_HSV(cur_colour);

	if(L != lab.l)
	{
		LUMA_FIELD.value = LUMA_SLIDER.value = L = lab.l;
		LR_FIELD.value = LR_SLIDER.value = Lr = LtoLr(L);
		computeLABImage();
	}

	if(hsvV != hsv.v)
	{
		HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LAB_A_FIELD.value = LAB_A_SLIDER.value = A = lab.a;
	LAB_B_FIELD.value = LAB_B_SLIDER.value = B = lab.b;
	LCH_C_FIELD.value = LCH_C_SLIDER.value = C = lch.c;
	LCH_H_FIELD.value = LCH_H_SLIDER.value = H = lch.h ? lch.h : H;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR = lsrgb.r;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG = lsrgb.g;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB = lsrgb.b;
	HSV_H_FIELD.value = HSV_H_SLIDER.value = hsvH = hsv.h ? hsv.h : hsvH;
	HSV_S_FIELD.value = HSV_S_SLIDER.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromLSRGB()
{
	cur_colour = {mode: "lrgb", r: lsrgbR, g: lsrgbG, b: lsrgbB};

	const lab = TO_LAB(cur_colour);
	const lch = TO_LCH(cur_colour);
	const srgb = TO_SRGB(cur_colour);
	//const lsrgb = toLRGB(cur_colour);
	const hsv = TO_HSV(cur_colour);

	if(L != lab.l)
	{
		LUMA_FIELD.value = LUMA_SLIDER.value = L = lab.l;
		LR_FIELD.value = LR_SLIDER.value = Lr = LtoLr(L);
		computeLABImage();
	}

	if(hsvV != hsv.v)
	{
		HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LAB_A_FIELD.value = LAB_A_SLIDER.value = A = lab.a;
	LAB_B_FIELD.value = LAB_B_SLIDER.value = B = lab.b;
	LCH_C_FIELD.value = LCH_C_SLIDER.value = C = lch.c;
	LCH_H_FIELD.value = LCH_H_SLIDER.value = H = lch.h ? lch.h : H;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR = srgb.r * 255.0;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG = srgb.g * 255.0;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB = srgb.b * 255.0;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB;
	HSV_H_FIELD.value = HSV_H_SLIDER.value = hsvH = hsv.h ? hsv.h : hsvH;
	HSV_S_FIELD.value = HSV_S_SLIDER.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function setFromHSV()
{
	cur_colour = {mode: "hsv", h: hsvH, s: hsvS, v: hsvV};

	const lab = TO_LAB(cur_colour);
	const lch = TO_LCH(cur_colour);
	const srgb = TO_SRGB(cur_colour);
	const lsrgb = TO_LSRGB(cur_colour);
	//const hsv = TO_HSV(cur_colour);

	if(L != lab.l)
	{
		LUMA_FIELD.value = LUMA_SLIDER.value = L = lab.l;
		LR_FIELD.value = LR_SLIDER.value = Lr = LtoLr(L);
		computeLABImage();
	}

	LAB_A_FIELD.value = LAB_A_SLIDER.value = A = lab.a;
	LAB_B_FIELD.value = LAB_B_SLIDER.value = B = lab.b;
	LCH_C_FIELD.value = LCH_C_SLIDER.value = C = lch.c;
	LCH_H_FIELD.value = LCH_H_SLIDER.value = H = lch.h ? lch.h : H;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR = srgb.r * 255.0;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG = srgb.g * 255.0;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB = srgb.b * 255.0;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR = lsrgb.r;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG = lsrgb.g;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB = lsrgb.b;
	HSV_H_FIELD.value = HSV_H_SLIDER.value = hsvH;
	HSV_S_FIELD.value = HSV_S_SLIDER.value = hsvS;
	HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV;
	
	setSwatch();
	setOutputs();
}

function setFromURL()
{
	let hex = location.hash;
	if (hex == "" || hex == undefined) hex = DEFAULT_COLOUR;
	cur_colour = culori.parse(hex);

	const lab = TO_LAB(cur_colour);
	const lch = TO_LCH(cur_colour);
	const srgb = TO_SRGB(cur_colour);
	const lsrgb = TO_LSRGB(cur_colour);
	const hsv = TO_HSV(cur_colour);

	if(L != lab.l)
	{
		LUMA_FIELD.value = LUMA_SLIDER.value = L = lab.l;
		LR_FIELD.value = LR_SLIDER.value = Lr = LtoLr(L);
		computeLABImage();
	}

	if(hsvV != hsv.v)
	{
		HSV_V_FIELD.value = HSV_V_SLIDER.value = hsvV = hsv.v;
		computeHSVImage();
	}

	LAB_A_FIELD.value = LAB_A_SLIDER.value = A = lab.a;
	LAB_B_FIELD.value = LAB_B_SLIDER.value = B = lab.b;
	LCH_C_FIELD.value = LCH_C_SLIDER.value = C = lch.c;
	LCH_H_FIELD.value = LCH_H_SLIDER.value = H = lch.h ? lch.h : H;
	SRGB_R_FIELD.value = SRGB_R_SLIDER.value = srgbR = srgb.r * 255.0;
	SRGB_G_FIELD.value = SRGB_G_SLIDER.value = srgbG = srgb.g * 255.0;
	SRGB_B_FIELD.value = SRGB_B_SLIDER.value = srgbB = srgb.b * 255.0;
	LSRGB_R_FIELD.value = LSRGB_R_SLIDER.value = lsrgbR = lsrgb.r;
	LSRGB_G_FIELD.value = LSRGB_G_SLIDER.value = lsrgbG = lsrgb.g;
	LSRGB_B_FIELD.value = LSRGB_B_SLIDER.value = lsrgbB = lsrgb.b;
	HSV_H_FIELD.value = HSV_H_SLIDER.value = hsvH = hsv.h ? hsv.h : hsvH;
	HSV_S_FIELD.value = HSV_S_SLIDER.value = hsvS = hsv.s;
	
	setSwatch();
	setOutputs();
}

function onMoveLAB(event)
{
	var left = LAB_CANVAS.offsetLeft + LAB_CANVAS.clientLeft;
	var top = LAB_CANVAS.offsetTop + LAB_CANVAS.clientTop;
	var width = LAB_CANVAS.clientWidth;
	var height = LAB_CANVAS.clientHeight;

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
	if (window.location.hash == HEX_OUTPUT.textContent) return;

	window.location.hash = HEX_OUTPUT.textContent;
}

function onDownLAB(event)
{
	onMoveLAB(event);
	LAB_CANVAS.addEventListener('mousemove', onMoveLAB, false);
}

function onUpLAB(event)
{
	onMoveLAB(event);
	LAB_CANVAS.removeEventListener('mousemove', onMoveLAB, false);
	checkColourChange();
}

function onMoveHSV(event)
{
	var left = HSV_CANVAS.offsetLeft + HSV_CANVAS.clientLeft;
	var top = HSV_CANVAS.offsetTop + HSV_CANVAS.clientTop;
	var width = HSV_CANVAS.clientWidth;
	var height = HSV_CANVAS.clientHeight;

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
	HSV_CANVAS.addEventListener('mousemove', onMoveHSV, false);
}

function onUpHSV(event)
{
	onMoveHSV(event);
	HSV_CANVAS.removeEventListener('mousemove', onMoveHSV, false);
	checkColourChange();
}

LAB_CANVAS.addEventListener('mousedown', onDownLAB, false);
LAB_CANVAS.addEventListener('mouseup', onUpLAB, false);

HSV_CANVAS.addEventListener('mousedown', onDownHSV, false);
HSV_CANVAS.addEventListener('mouseup', onUpHSV, false);

LUMA_FIELD.oninput = LUMA_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == L) return;
	L = parseFloat(this.value);
	Lr = LtoLr(L)
	
	computeLABImage();

	setFromL(); 
	drawLABImage();
	drawHSVImage();
};

LR_FIELD.oninput = LR_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == Lr) return;
	Lr = parseFloat(this.value);
	L = LrtoL(Lr)
	
	computeLABImage();

	setFromL(); 
	drawLABImage();
	drawHSVImage();
};

LAB_A_FIELD.oninput = LAB_A_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == A) return;
	A = parseFloat(this.value);

	setFromLAB();
	drawLABImage();
	drawHSVImage();
};

LAB_B_FIELD.oninput = LAB_B_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == B) return;
	B = parseFloat(this.value);

	setFromLAB();
	drawLABImage();
	drawHSVImage();
};

LCH_C_FIELD.oninput = LCH_C_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == C) return;
	C = parseFloat(this.value);

	setFromLCH();
	drawLABImage();
	drawHSVImage();
};

LCH_H_FIELD.oninput = LCH_H_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == H) return;
	H = parseFloat(this.value);

	setFromLCH();
	drawLABImage();
	drawHSVImage();
};

SRGB_R_FIELD.oninput = SRGB_R_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == srgbR) return;
	srgbR = parsed;

	setFromSRGB();
	drawLABImage();
	drawHSVImage();
};

SRGB_G_FIELD.oninput = SRGB_G_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == srgbG) return;
	srgbG = parsed;

	setFromSRGB();
	drawLABImage();
	drawHSVImage();
};

SRGB_B_FIELD.oninput = SRGB_B_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == srgbB) return;
	srgbB = parsed;

	setFromSRGB();
	drawLABImage();
	drawHSVImage();
};

LSRGB_R_FIELD.oninput = LSRGB_R_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == lsrgbR) return;
	lsrgbR = parsed;

	setFromLSRGB();
	drawLABImage();
	drawHSVImage();
};

LSRGB_G_FIELD.oninput = LSRGB_G_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == lsrgbG) return;
	lsrgbG = parsed;

	setFromLSRGB();
	drawLABImage();
	drawHSVImage();
};

LSRGB_B_FIELD.oninput = LSRGB_B_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == lsrgbB) return;
	lsrgbB = parsed;

	setFromLSRGB();
	drawLABImage();
	drawHSVImage();
};

HSV_H_FIELD.oninput = HSV_H_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == hsvH) return;
	hsvH = parsed;

	setFromHSV();
	drawLABImage();
	drawHSVImage();
};

HSV_S_FIELD.oninput = HSV_S_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == hsvS) return;
	hsvS = parsed;

	setFromHSV();
	drawLABImage();
	drawHSVImage();
};

HSV_V_FIELD.oninput = HSV_V_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == hsvV) return;
	hsvV = parsed;

	computeHSVImage();

	setFromHSV();
	drawLABImage();
	drawHSVImage();
};

RESOLUTION_SLIDER.oninput = function()
{
	let parsed = parseFloat(this.value);
	if(isNaN(parsed) || parsed == resolution) return;
	resolution = parseFloat(this.value);
	super_resolution = Math.round(resolution * (1 + 2 * CANVAS_PADDING));

	setResolution();
	computeLABImage();
	computeHSVImage();
	drawLABImage();
	drawHSVImage();
};

CLIP_GAMUT_CHECKBOX.onclick = function()
{
	if(CLIP_GAMUT_CHECKBOX.checked == clipg) return;
	clipg = CLIP_GAMUT_CHECKBOX.checked;
	computeLABImage();
	computeHSVImage();
	drawLABImage();
	drawHSVImage();
};

CLIP_NEGATIVE_CHECKBOX.onclick = function()
{
	if(CLIP_NEGATIVE_CHECKBOX.checked == clipn) return;
	clipn = CLIP_NEGATIVE_CHECKBOX.checked;
	computeLABImage();
	computeHSVImage();
	drawLABImage();
	drawHSVImage();
};

LAB_CANVAS.width = super_resolution;
LAB_CANVAS.height = super_resolution;
HSV_CANVAS.width = super_resolution;
HSV_CANVAS.height = super_resolution;	

setFromURL();
computeHSVImage();
computeLABImage();
drawHSVImage();
drawLABImage();

LUMA_FIELD.onchange = LUMA_SLIDER.onchange =
LR_FIELD.onchange = LR_SLIDER.onchange =
LAB_A_FIELD.onchange = LAB_A_SLIDER.onchange =
LAB_B_FIELD.onchange = LAB_B_SLIDER.onchange =
LCH_C_FIELD.onchange = LCH_C_SLIDER.onchange =
LCH_H_FIELD.onchange = LCH_H_SLIDER.onchange =
SRGB_R_FIELD.onchange = SRGB_R_SLIDER.onchange =
SRGB_G_FIELD.onchange = SRGB_G_SLIDER.onchange =
SRGB_B_FIELD.onchange = SRGB_B_SLIDER.onchange =
LSRGB_R_FIELD.onchange = LSRGB_R_SLIDER.onchange =
LSRGB_G_FIELD.onchange = LSRGB_G_SLIDER.onchange =
LSRGB_B_FIELD.onchange = LSRGB_B_SLIDER.onchange =
HSV_H_FIELD.onchange = HSV_H_SLIDER.onchange =
HSV_S_FIELD.onchange = HSV_S_SLIDER.onchange =
HSV_V_FIELD.onchange = HSV_V_SLIDER.onchange = function(){checkColourChange();}