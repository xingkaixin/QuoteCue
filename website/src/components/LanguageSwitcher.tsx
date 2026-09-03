import { Menu } from "@base-ui/react/menu";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { TranslateIcon } from "@phosphor-icons/react/dist/csr/Translate";

import { Button } from "@/components/ui/button";
import { WEBSITE_LOCALE_CONFIG, WEBSITE_LOCALES, type Locale } from "@/i18n/locales";

interface LanguageSwitcherProps {
  currentLocale: Locale;
  label: string;
}

const itemClassName =
  "font-mono flex h-9 min-w-32 cursor-default items-center justify-between gap-4 rounded-lg px-3 text-xs text-muted outline-none select-none data-highlighted:bg-panel-strong data-highlighted:text-foreground";

export function LanguageSwitcher({ currentLocale, label }: LanguageSwitcherProps) {
  const currentLabel = WEBSITE_LOCALE_CONFIG[currentLocale].label;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            aria-label={`${label}: ${currentLabel}`}
            className="group/language font-mono gap-1.5"
            size="compact"
            variant="ghost"
          />
        }
      >
        <TranslateIcon aria-hidden="true" size={14} weight="bold" />
        <span>{currentLabel}</span>
        <CaretDownIcon
          aria-hidden="true"
          className="transition-transform group-data-[popup-open]/language:rotate-180 motion-reduce:transition-none"
          size={12}
          weight="bold"
        />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner align="end" className="z-[100] outline-none" sideOffset={8}>
          <Menu.Popup className="origin-[var(--transform-origin)] rounded-xl border border-line bg-panel p-1.5 shadow-[var(--surface-shadow)] outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            {WEBSITE_LOCALES.map((locale) => {
              const config = WEBSITE_LOCALE_CONFIG[locale];
              const content = (
                <>
                  <span>{config.label}</span>
                  {locale === currentLocale && (
                    <CheckIcon aria-hidden="true" className="text-accent" size={14} weight="bold" />
                  )}
                </>
              );

              return locale === currentLocale ? (
                <Menu.Item aria-current="page" className={itemClassName} key={locale}>
                  {content}
                </Menu.Item>
              ) : (
                <Menu.LinkItem
                  className={itemClassName}
                  closeOnClick
                  href={config.path}
                  hrefLang={locale}
                  key={locale}
                  lang={locale}
                >
                  {content}
                </Menu.LinkItem>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
