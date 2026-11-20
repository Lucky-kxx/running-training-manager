import { z } from 'zod';

const color = z.string().regex(/^#[a-f0-9]{6}$/i);
export const photoThemeSchema = z.object({
  background: color,
  sidebar: color,
  foreground: color,
  sidebarText: color,
  accent: color,
  placement: z.enum(['none', 'banner', 'sidebar']),
  photo: z
    .string()
    .max(900_000)
    .regex(/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  focusX: z.number().min(0).max(100),
  focusY: z.number().min(0).max(100),
});

export type PhotoTheme = z.infer<typeof photoThemeSchema>;

export const defaultPhotoTheme: PhotoTheme = {
  background: '#ffffff',
  sidebar: '#f2f3f8',
  foreground: '#050c34',
  sidebarText: '#5e6684',
  accent: '#050c34',
  placement: 'none',
  focusX: 50,
  focusY: 50,
};

const rgb = (hex: string) =>
  [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));

const hex = (colors: number[]) =>
  '#' +
  colors
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('');

function luminance(value: string) {
  const channels = rgb(value).map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.04045
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function contrastingText(surface: string) {
  return contrastRatio(surface, '#ffffff') >= contrastRatio(surface, '#000000')
    ? '#ffffff'
    : '#000000';
}

function loadPhoto(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function compressThemePhoto(file: File) {
  if (
    !/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type) ||
    file.size > 24 * 1024 * 1024
  ) {
    throw new Error('Unsupported photo');
  }
  const source = URL.createObjectURL(file);
  try {
    const image = await loadPhoto(source);
    const canvas = document.createElement('canvas');
    const scale = Math.min(
      1,
      1280 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL('image/jpeg', 0.78);
    return photoThemeSchema.shape.photo.parse(photo)!;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function suggestPhotoTheme(photo: string): Promise<PhotoTheme> {
  const image = await loadPhoto(photo);
  const canvas = document.createElement('canvas');
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const buckets = new Map<number, { total: number; rgb: number[] }>();
  let focusWeight = 0;
  let focusX = 0;
  let focusY = 0;
  let brightness = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const channels = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const chroma = Math.max(...channels) - Math.min(...channels);
    const step = index / 4;
    const x = step % size;
    const y = Math.floor(step / size);
    const id =
      (channels[0] >> 5) * 64 + (channels[1] >> 5) * 8 + (channels[2] >> 5);
    const bucket = buckets.get(id) ?? { total: 0, rgb: [0, 0, 0] };
    bucket.total++;
    bucket.rgb = bucket.rgb.map((sum, channel) => sum + channels[channel]);
    buckets.set(id, bucket);
    brightness +=
      channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    const edge =
      x > 0
        ? channels.reduce(
            (sum, channel, offset) =>
              sum + Math.abs(channel - pixels[index - 4 + offset]),
            0,
          )
        : 0;
    const weight =
      (1 + chroma / 70 + edge / 40) /
      (1 + Math.hypot(x / size - 0.5, y / size - 0.5));
    focusX += (x / (size - 1)) * weight;
    focusY += (y / (size - 1)) * weight;
    focusWeight += weight;
  }
  const palette = [...buckets.values()].map(({ total, rgb: values }) => {
    const shade = values.map((value) => value / total);
    return {
      shade,
      score: total * (1 + (Math.max(...shade) - Math.min(...shade)) / 40),
    };
  });
  palette.sort((a, b) => b.score - a.score);
  const dominant = palette[0].shade;
  const dark = brightness / (size * size) < 108;
  const tint = (amount: number) =>
    hex(
      dominant.map(
        (value) => value * amount + (dark ? 15 : 255) * (1 - amount),
      ),
    );
  const background = tint(0.08);
  const sidebar = tint(0.21);
  return {
    background,
    sidebar,
    foreground: contrastingText(background),
    sidebarText: contrastingText(sidebar),
    accent: hex(dominant),
    placement: image.naturalWidth >= image.naturalHeight ? 'banner' : 'sidebar',
    photo,
    focusX: Math.round((100 * focusX) / focusWeight),
    focusY: Math.round((100 * focusY) / focusWeight),
  };
}
