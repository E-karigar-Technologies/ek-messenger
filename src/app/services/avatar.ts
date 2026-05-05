// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class Avatar {
  
// }


// src/app/services/avatar.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class Avatar {
  baseUrl = 'https://avataaars.io/';

  // topTypes = ['NoHair','ShortHairShortFlat','LongHairStraight','Hat','Hijab'];
  // accessoriesTypes = ['Blank','Prescription01','Sunglasses','Kurt'];
  // hairColors = ['BrownDark','Black','Blonde','Red','PastelPink'];
  // eyeTypes = ['Default','Happy','Squint','Wink','Surprised'];
  // mouthTypes = ['Smile','Serious','Twinkle','Sad','Disbelief'];
  // clotheTypes = ['ShirtCrewNeck','Hoodie','BlazerShirt','GraphicShirt'];
  // skinColors = ['Light','Tanned','Brown','DarkBrown'];

    // More complete option sets from Avataaars API
  topTypes = [
    'NoHair','Eyepatch','Hat','Hijab','Turban',
    'WinterHat1','WinterHat2','WinterHat3','WinterHat4',
    'LongHairBigHair','LongHairBob','LongHairBun','LongHairCurly','LongHairCurvy',
    'LongHairDreads','LongHairFrida','LongHairFro','LongHairFroBand','LongHairNotTooLong',
    'LongHairShavedSides','LongHairMiaWallace','LongHairStraight','LongHairStraight2','LongHairStraightStrand',
    'ShortHairDreads01','ShortHairDreads02','ShortHairFrizzle','ShortHairShaggyMullet','ShortHairShortCurly',
    'ShortHairShortFlat','ShortHairShortRound','ShortHairShortWaved','ShortHairSides','ShortHairTheCaesar',
    'ShortHairTheCaesarSidePart'
  ];

  accessoriesTypes = [
    'Blank','Kurt','Prescription01','Prescription02','Round','Sunglasses','Wayfarers'
  ];

  hairColors = [
    'Auburn','Black','Blonde','BlondeGolden','Brown','BrownDark',
    'PastelPink','Platinum','Red','SilverGray'
  ];

  facialHairTypes = [
    'Blank','BeardMedium','BeardLight','BeardMagestic','MoustacheFancy','MoustacheMagnum'
  ];

  facialHairColors = [
    'Auburn','Black','Blonde','BlondeGolden','Brown','BrownDark',
    'Platinum','Red'
  ];

  clotheTypes = [
    'BlazerShirt','BlazerSweater','CollarSweater','GraphicShirt','Hoodie','Overall',
    'ShirtCrewNeck','ShirtScoopNeck','ShirtVNeck'
  ];

  clotheColors = [
    'Black','Blue01','Blue02','Blue03','Gray01','Gray02','Heather',
    'PastelBlue','PastelGreen','PastelOrange','PastelRed','PastelYellow',
    'Pink','Red','White'
  ];

  eyeTypes = [
    'Close','Cry','Default','Dizzy','EyeRoll','Happy','Hearts','Side',
    'Squint','Surprised','Wink','WinkWacky'
  ];

  eyebrowTypes = [
    'Angry','AngryNatural','Default','DefaultNatural','FlatNatural','RaisedExcited','RaisedExcitedNatural',
    'SadConcerned','SadConcernedNatural','UnibrowNatural','UpDown','UpDownNatural'
  ];

  mouthTypes = [
    'Concerned','Default','Disbelief','Eating','Grimace','Sad','ScreamOpen',
    'Serious','Smile','Tongue','Twinkle','Vomit'
  ];

  skinColors = [
    'Tanned','Yellow','Pale','Light','Brown','DarkBrown','Black'
  ];

  constructor() {}

  private hashStr(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  generateUrl(opts: any = {}, size = 200): string {
    const params = new URLSearchParams({
      avatarStyle: 'Circle',
      topType: opts.topType || this.topTypes[1],
      accessoriesType: opts.accessoriesType || this.accessoriesTypes[0],
      hairColor: opts.hairColor || this.hairColors[0],
      eyeType: opts.eyeType || this.eyeTypes[0],
      mouthType: opts.mouthType || this.mouthTypes[0],
      clotheType: opts.clotheType || this.clotheTypes[0],
      skinColor: opts.skinColor || this.skinColors[0]
    });
    // we don't include &width/&height here if we specifically want raw SVG.
    // But adding width/height is fine; the endpoint usually returns SVG by default.
    return `${this.baseUrl}?${params.toString()}&width=${size}&height=${size}`;
  }

  // generateAvatarUrl alias (supports seedString or options object)
  generateAvatarUrl(seedOrOpts: string | any, optsOrSize?: any | number, maybeSize?: number): string {
    if (typeof seedOrOpts === 'string') {
      const seed = this.hashStr(seedOrOpts);
      const opts = (typeof optsOrSize === 'object' && optsOrSize) || {};
      const pick = (arr: string[], off = 0) => arr[(seed + off) % arr.length];
      const generated = {
        topType: pick(this.topTypes, 1),
        accessoriesType: pick(this.accessoriesTypes, 2),
        hairColor: pick(this.hairColors, 3),
        eyeType: pick(this.eyeTypes, 4),
        mouthType: pick(this.mouthTypes, 5),
        clotheType: pick(this.clotheTypes, 6),
        skinColor: pick(this.skinColors, 7)
      };
      const size = (optsOrSize && (optsOrSize.size || optsOrSize.width)) || maybeSize || 128;
      return this.generateUrl({ ...generated, ...opts }, size);
    } else {
      const size = typeof optsOrSize === 'number' ? optsOrSize : maybeSize || 200;
      return this.generateUrl(seedOrOpts || {}, size);
    }
  }

  /**
   * Fetch the avatar SVG string from the Avataaars endpoint.
   * Returns SVG text (string). Throws if fetch fails.
   */
  async fetchAvatarSvg(url: string): Promise<string> {
    // Request the SVG explicitly
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'image/svg+xml'
      },
      // keep credentials omitted for public API
      mode: 'cors'
    });

    if (!resp.ok) {
      throw new Error(`Failed to fetch avatar SVG: ${resp.status} ${resp.statusText}`);
    }
    const text = await resp.text();
    return text;
  }

  /**
   * Convert SVG string to PNG blob at requested size (px).
   * Returns a Blob of image/png.
   */
  async svgStringToPngBlob(svgText: string, size = 512): Promise<Blob> {
    // Ensure SVG has explicit width/height and xmlns
    let svg = svgText;
    if (!svg.includes('xmlns=')) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    // Add width/height attributes to scale properly
    // Replace or add width/height
    svg = svg.replace(/width="[^"]*"/g, '');
    svg = svg.replace(/height="[^"]*"/g, '');
    // set viewBox if missing (some svgs may have it already)
    if (!/viewBox=/.test(svg)) {
      // try to extract width/height from svg root — fallback to 0 0 512 512 if unknown
      svg = svg.replace('<svg', `<svg viewBox="0 0 ${size} ${size}"`);
    }
    // Create blob from svg text
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      // Create an image and draw to canvas
      const img = new Image();
      // Important for cross-origin images; Avataaars should allow CORS for SVG; if not, this may fail.
      img.crossOrigin = 'anonymous';
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (err) => reject(new Error('Failed to load SVG data into image: ' + (err as any).message));
      });
      img.src = url;
      await loaded;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      // Clear and draw
      ctx.clearRect(0, 0, size, size);
      // For better scaling quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);

      // Convert canvas to blob (PNG)
      const pngBlob: Blob | null = await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png', 0.95));
      if (!pngBlob) throw new Error('Failed to convert canvas to blob');
      return pngBlob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Trigger browser download for a blob with a filename.
   */
  downloadBlob(blob: Blob, filename = 'avatar.png') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

