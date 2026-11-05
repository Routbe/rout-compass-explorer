import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { StudioToggleCard } from "./StudioToggleCard";
import { QuestionsInboxAccordion } from "./QuestionsInboxAccordion";
import { GuestbookAccordion } from "./GuestbookAccordion";
import { AddComponentModal, type WidgetId } from "./AddComponentModal";
import { BadgesPanel } from "@/components/dashboard/BadgesPanel";
import { BadgeActivityPanel } from "@/components/dashboard/BadgeActivityPanel";
import { normalizeDesignLayers, serializeDesignLayers } from "@/lib/design-layers";
import { isProfileSectionKind, PROFILE_SECTION_LABELS } from "@/lib/profile-section-blocks";
import type { ProfileBlock } from "@/lib/profile";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import type { QaSpace } from "@/components/qa/useQaPublic";
import { isStudioWidget } from "@/lib/studio-widget-rules";

type SetPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;

/** Blokken die als widget op het profiel liggen en een afmeting krijgen. */

interface Props {
  blocks: ProfileBlock[];
  onOpenBlockChange: (id: string | null) => void;
  onAddKind: (kind: string, value?: string) => void;
  /** Zet een profielwidget aan vanuit de catalogus. */
  onWidget?: (id: WidgetId) => void;
  /** Zorgt dat een sectieblok bestaat zonder de editor te openen. */
  ensureBlock: (kind: string) => void;
  handle?: string;
  designLayers?: string;
  onDesignLayersChange?: (value: string) => void;
  isWorkspace: boolean;
  qaSpace: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
  prefs: ProfileDisplayPrefs;
  onPref: SetPref;
}

/**
 * 🧩 Widgets — eigen map naast Links & componenten.
 *
 * Anonieme Inbox, Prikbord en Badges & diploma's staan hier altijd klaar met
 * een schakelaar; extra widgets voeg je toe via de catalogus en krijgen een
 * instelbare breedte en hoogte.
 */
export function ProfileWidgetsAccordion({
  blocks,
  onOpenBlockChange,
  onAddKind,
  onWidget,
  ensureBlock,
  handle,
  designLayers,
  onDesignLayersChange,
  isWorkspace,
  qaSpace,
  displayName,
  avatarUrl,
  prefs,
  onPref,
}: Props) {
  const { t } = useTranslation();
  const [libraryOpen, setLibraryOpen] = useState(false);

  const sizedBlocks = blocks.filter(
    (b) => isStudioWidget(b.kind),
  );
  const fixedActive = [
    !isWorkspace && prefs.questionsEnabled && prefs.qaOnHub,
    prefs.guestbookEnabled,
    prefs.badgeShowcaseVisible,
  ].filter(Boolean).length;
  const active = sizedBlocks.filter((b) => !b.hidden).length + fixedActive;

  const blockLabel = (b: ProfileBlock) =>
    b.label || (isProfileSectionKind(b.kind) ? PROFILE_SECTION_LABELS[b.kind] : b.kind.replace("widget:", ""));

  return (
    <AccordionItem value="widgets" className="acrylic-card px-4 sm:px-5">
      <AccordionTrigger className="hover:no-underline">
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium">
            <StudioSectionIcon kind="content" />{t("studio.widgets.title")}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {t("studio.widgets.visible", { count: active })}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">

        {/* Vaste widgets: altijd zichtbaar, direct aan/uit — nooit achter een modal. */}
        <div className="space-y-3">
          {!isWorkspace && (
            <QuestionsInboxAccordion
              space={qaSpace}
              handle={handle ?? ""}
              displayName={displayName}
              avatarUrl={avatarUrl}
              prefs={prefs}
              onPref={(key, value) => {
                onPref(key, value);
                if (key === "qaOnHub" && value === true) ensureBlock("widget:questions");
              }}
            />
          )}
          <GuestbookAccordion
            unframed
            enabled={prefs.guestbookEnabled}
            onEnabledChange={(v) => {
              onPref("guestbookEnabled", v);
              if (v) ensureBlock("widget:guestbook");
            }}
          />
          <StudioToggleCard
            unframed
            icon={<StudioSectionIcon kind="badges" />}
            title={t("studio.badgesFolder").replace(/^\p{Extended_Pictographic}\s*/u, "")}
            subtitle={t("studio.editor.badgesHelp")}
            checked={prefs.badgeShowcaseVisible}
            onCheckedChange={(v) => {
              onPref("badgeShowcaseVisible", v);
              if (v) ensureBlock("widget:badges");
            }}
          >
            <BadgesPanel />
            <BadgeActivityPanel />
          </StudioToggleCard>
        </div>

        {/* Afmetingen per widgetblok */}
        {sizedBlocks.length > 0 && (
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("studio.widgets.sizes")}</p>
            {sizedBlocks.map((b) => {
              const layers = normalizeDesignLayers(designLayers);
              const tile = layers.blockStyles[b.id];
              const patch = (change: { width?: 1 | 2; height?: "auto" | "medium" | "tall" }) =>
                onDesignLayersChange?.(
                  serializeDesignLayers({
                    ...layers,
                    blockStyles: {
                      ...layers.blockStyles,
                      [b.id]: { ...(tile ?? { bg: null, text: null, radius: null, shadow: "none" as const }), ...change },
                    },
                  }),
                );
              return (
                <div key={b.id} className="space-y-2 border-b border-border pb-3 last:border-b-0">
                  <p className="break-words text-sm font-medium">{blockLabel(b)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={String(tile?.width ?? 2)} onValueChange={(v) => patch({ width: v === "1" ? 1 : 2 })}>
                      <SelectTrigger aria-label={`${blockLabel(b)} ${t("studio.widgets.width")}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t("studio.widgets.widthHalf")}</SelectItem>
                        <SelectItem value="2">{t("studio.widgets.widthFull")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={tile?.height ?? "auto"} onValueChange={(v) => patch({ height: v as "auto" | "medium" | "tall" })}>
                      <SelectTrigger aria-label={`${blockLabel(b)} ${t("studio.widgets.height")}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t("studio.widgets.heightAuto")}</SelectItem>
                        <SelectItem value="medium">{t("studio.widgets.heightMedium")}</SelectItem>
                        <SelectItem value="tall">{t("studio.widgets.heightTall")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onOpenBlockChange(b.id)}>
                    {t("studio.widgets.edit")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <Button type="button" variant="outline" className="min-h-12 w-full gap-2 text-sm" onClick={() => setLibraryOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> {t("studio.widgets.add")}
        </Button>
        <AddComponentModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onAdd={onAddKind}
          handle={handle}
          onWidget={onWidget}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
