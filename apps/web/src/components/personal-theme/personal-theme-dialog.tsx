import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { m } from '@/paraglide/messages';
import { ImagePlus, Sparkles } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';

import { usePersonalTheme } from './personal-theme-provider';
import {
  compressThemePhoto,
  contrastRatio,
  defaultPhotoTheme,
  suggestPhotoTheme,
} from './photo-theme';

export function PersonalThemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const theme = usePersonalTheme();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && theme && (
        <ThemeEditor
          initial={theme.current.design}
          onSave={theme.apply}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function ThemeEditor({
  initial,
  onSave,
  close,
}: {
  initial: typeof defaultPhotoTheme;
  onSave: (design: typeof defaultPhotoTheme) => void;
  close: () => void;
}) {
  const [design, setDesign] = useState(initial);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const colors = [
    ['background', m.theme_page_color()],
    ['sidebar', m.theme_sidebar_color()],
    ['foreground', m.theme_text_color()],
    ['sidebarText', m.theme_sidebar_text_color()],
    ['accent', m.theme_accent_color()],
  ] as const;
  const insufficientContrast =
    contrastRatio(design.background, design.foreground) < 4.5 ||
    contrastRatio(design.sidebar, design.sidebarText) < 4.5;

  async function importPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      const photo = await compressThemePhoto(file);
      setDesign((previous) => ({
        ...previous,
        photo,
        placement:
          previous.placement === 'none' ? 'banner' : previous.placement,
        focusX: 50,
        focusY: 50,
      }));
    } catch {
      setError(m.theme_photo_error());
    } finally {
      setWorking(false);
    }
  }

  async function generate() {
    if (!design.photo) return;
    setError('');
    setWorking(true);
    try {
      setDesign(await suggestPhotoTheme(design.photo));
    } catch {
      setError(m.theme_photo_error());
    } finally {
      setWorking(false);
    }
  }

  const photo = design.photo && (
    <img
      src={design.photo}
      alt=""
      className="h-14 w-full rounded-md object-cover"
      style={{ objectPosition: `${design.focusX}% ${design.focusY}%` }}
    />
  );
  return (
    <DialogContent className="grid-cols-1 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{m.theme_customize()}</DialogTitle>
        <DialogDescription>{m.theme_custom_local()}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {colors.map(([field, label]) => (
            <label
              key={field}
              className="flex min-h-9 items-center justify-between gap-2 text-sm"
            >
              <span>{label}</span>
              <input
                type="color"
                value={design[field]}
                disabled={working}
                className="h-8 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                onChange={(event) => {
                  const value = event.target.value;
                  setDesign((previous) => ({ ...previous, [field]: value }));
                }}
              />
            </label>
          ))}
        </div>
        <div
          className="flex min-h-40 overflow-hidden rounded-lg border"
          aria-label={m.theme_custom_preview()}
        >
          <div
            className="w-[40%] shrink-0 space-y-2 p-2 text-sm"
            style={{ background: design.sidebar, color: design.sidebarText }}
          >
            {design.placement === 'sidebar' && photo}
            <p>{m.calendar()}</p>
            <p>{m.ai_settings_tab()}</p>
          </div>
          <div
            className="min-w-0 flex-1 space-y-2 p-2 text-sm"
            style={{ background: design.background, color: design.foreground }}
          >
            {design.placement === 'banner' && photo}
            <p className="font-semibold">{m.theme_custom_preview()}</p>
            <div
              className="h-2 w-12 rounded"
              style={{ background: design.accent }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <label>
            <ImagePlus /> {m.theme_photo_import()}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              disabled={working}
              className="sr-only"
              onChange={importPhoto}
            />
          </label>
        </Button>
        {design.photo && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={generate}
              disabled={working}
            >
              <Sparkles /> {m.theme_photo_generate()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={working}
              onClick={() =>
                setDesign((previous) => ({
                  ...previous,
                  photo: undefined,
                  placement: 'none',
                  focusX: 50,
                  focusY: 50,
                }))
              }
            >
              {m.theme_photo_remove()}
            </Button>
          </>
        )}
      </div>
      {design.photo && (
        <label className="flex items-center justify-between gap-2 text-sm">
          {m.theme_photo_placement()}
          <select
            className="max-w-[65%] rounded-md border bg-background px-2 py-1"
            value={design.placement}
            disabled={working}
            onChange={(event) => {
              const placement = event.target.value as typeof design.placement;
              setDesign((previous) => ({ ...previous, placement }));
            }}
          >
            <option value="banner">{m.theme_photo_banner()}</option>
            <option value="sidebar">{m.theme_photo_sidebar()}</option>
            <option value="none">{m.theme_photo_hidden()}</option>
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}
      {insufficientContrast && (
        <p role="status" className="text-sm text-muted-foreground">
          {m.theme_custom_contrast()}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setDesign(defaultPhotoTheme);
            setError('');
          }}
          disabled={working}
        >
          {m.theme_custom_reset()}
        </Button>
        <Button
          type="button"
          disabled={working}
          onClick={() => {
            try {
              onSave(design);
              close();
            } catch {
              setError(m.theme_custom_save_error());
            }
          }}
        >
          {m.theme_custom_apply()}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
