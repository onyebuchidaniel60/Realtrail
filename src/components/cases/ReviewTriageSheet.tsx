import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/common/toast";
import {
  errorMessage,
  getAppError,
  inputClass,
} from "@/components/cases/dialogs/dialogUtils";

const CATEGORIES: Array<Doc<"cases">["category"]> = [
  "plumbing",
  "electrical",
  "power_generator",
  "water",
  "hvac",
  "security_access",
  "cleaning",
  "structural",
  "appliance",
  "common_area",
  "other",
];

const PRIORITIES: Array<Doc<"cases">["priority"]> = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];

type Suggestion = {
  title?: unknown;
  summary?: unknown;
  category?: unknown;
  prioritySuggestion?: unknown;
  propertyCandidateId?: unknown;
  buildingCandidateId?: unknown;
  unitCandidateId?: unknown;
  missingInformation?: unknown;
  suggestedNextAction?: unknown;
  possibleRelatedCaseIds?: unknown;
};

function readSuggestion(record: Doc<"cases">): Suggestion {
  const output = record.aiTriageOutput as Suggestion | null | undefined;
  return typeof output === "object" && output !== null ? output : {};
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function asIdList(value: unknown): Array<string> {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function AiHint({ value }: { value: string }) {
  return (
    <p className="text-xs text-muted-foreground">AI suggested: {value}</p>
  );
}

const labelClass = "flex flex-col gap-1 text-sm";
const labelTitleClass = "font-medium";

export function ReviewTriageSheet({
  record,
  open,
  onClose,
}: {
  record: Doc<"cases">;
  open: boolean;
  onClose: () => void;
}) {
  const acceptTriage = useMutation(api.cases.triage.acceptAiTriage);
  const suggestion = readSuggestion(record);

  const [title, setTitle] = useState(record.title);
  const [summary, setSummary] = useState(record.description);
  const [category, setCategory] =
    useState<Doc<"cases">["category"]>(record.category);
  const [priority, setPriority] =
    useState<Doc<"cases">["priority"]>(record.priority);
  const [propertyId, setPropertyId] = useState(record.propertyId ?? "");
  const [buildingId, setBuildingId] = useState(record.buildingId ?? "");
  const [unitId, setUnitId] = useState(record.unitId ?? "");
  const [locationUnknown, setLocationUnknown] = useState(
    record.locationUnknown,
  );
  const [nextActionLabel, setNextActionLabel] = useState(
    record.nextActionLabel ?? "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const properties = useQuery(api.properties.list, open ? {} : "skip");
  const buildings = useQuery(
    api.buildings.listByProperty,
    open && propertyId !== ""
      ? { propertyId: propertyId as Id<"properties"> }
      : "skip",
  );
  const units = useQuery(
    api.units.listByBuilding,
    open && buildingId !== ""
      ? { buildingId: buildingId as Id<"buildings"> }
      : "skip",
  );

  // missingInformation is free-text content, not IDs.
  const missingItems = Array.isArray(suggestion.missingInformation)
    ? suggestion.missingInformation.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim() !== "",
      )
    : [];
  const relatedIds = asIdList(suggestion.possibleRelatedCaseIds);

  function nameFor(
    list: Array<{ _id: string; name?: string; label?: string }> | undefined,
    id: string,
  ): string {
    const found = list?.find((entry) => entry._id === id);
    return found?.name ?? found?.label ?? id;
  }

  const suggestedTitle = asText(suggestion.title);
  const suggestedSummary = asText(suggestion.summary);
  const suggestedCategory = asText(suggestion.category);
  const suggestedPriority = asText(suggestion.prioritySuggestion);
  const suggestedProperty =
    typeof suggestion.propertyCandidateId === "string"
      ? suggestion.propertyCandidateId
      : null;
  const suggestedBuilding =
    typeof suggestion.buildingCandidateId === "string"
      ? suggestion.buildingCandidateId
      : null;
  const suggestedUnit =
    typeof suggestion.unitCandidateId === "string"
      ? suggestion.unitCandidateId
      : null;
  const suggestedNextAction = asText(suggestion.suggestedNextAction);

  async function handleAccept() {
    setFieldErrors({});
    setSubmitting(true);
    try {
      await acceptTriage({
        caseId: record._id,
        title,
        summary,
        category,
        priority,
        propertyId:
          locationUnknown || propertyId === ""
            ? null
            : (propertyId as Id<"properties">),
        buildingId:
          buildingId === "" ? null : (buildingId as Id<"buildings">),
        unitId: unitId === "" ? null : (unitId as Id<"units">),
        nextActionType: record.nextActionType ?? null,
        nextActionLabel:
          nextActionLabel.trim() === "" ? null : nextActionLabel,
        locationUnknown,
      });
      toast.success("Triage accepted");
      onClose();
    } catch (err) {
      const { code, field, message } = getAppError(err);
      if (code === "VALIDATION_ERROR" && field) {
        setFieldErrors({ [field]: message ?? "Invalid value." });
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Review AI triage</SheetTitle>
          <SheetDescription>
            Review and correct the AI&apos;s suggestions before saving.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <details open className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Original report
            </summary>
            {/* Plain text only — the description was auto-created from the
                inbound email and must never render as HTML. */}
            <p className="mt-2 text-sm whitespace-pre-wrap">
              {record.description}
            </p>
          </details>

          <label className={labelClass}>
            <span className={labelTitleClass}>Title</span>
            {suggestedTitle !== undefined && suggestedTitle !== title && (
              <AiHint value={suggestedTitle} />
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Title"
              className={inputClass}
              disabled={submitting}
            />
            {fieldErrors.title && (
              <span role="alert" className="text-xs text-destructive">
                {fieldErrors.title}
              </span>
            )}
          </label>

          <label className={labelClass}>
            <span className={labelTitleClass}>Summary</span>
            {suggestedSummary !== undefined &&
              suggestedSummary !== summary && (
                <AiHint value={suggestedSummary} />
              )}
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              aria-label="Summary"
              rows={4}
              className={inputClass}
              disabled={submitting}
            />
            {fieldErrors.summary && (
              <span role="alert" className="text-xs text-destructive">
                {fieldErrors.summary}
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTitleClass}>Category</span>
              {suggestedCategory !== undefined &&
                suggestedCategory !== category && (
                  <AiHint value={suggestedCategory} />
                )}
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as Doc<"cases">["category"])
                }
                aria-label="Category"
                className={inputClass}
                disabled={submitting}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              <span className={labelTitleClass}>Priority</span>
              {suggestedPriority !== undefined &&
                suggestedPriority !== priority && (
                  <AiHint value={suggestedPriority} />
                )}
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as Doc<"cases">["priority"])
                }
                aria-label="Priority"
                className={inputClass}
                disabled={submitting}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={labelClass}>
            <span className={labelTitleClass}>Property</span>
            {(suggestedProperty ?? "") !== propertyId && (
              <AiHint
                value={
                  suggestedProperty === null
                    ? "none (location unknown)"
                    : nameFor(properties, suggestedProperty)
                }
              />
            )}
            <select
              value={locationUnknown ? "__unknown" : propertyId}
              onChange={(e) => {
                if (e.target.value === "__unknown") {
                  setLocationUnknown(true);
                  setPropertyId("");
                  setBuildingId("");
                  setUnitId("");
                } else {
                  setLocationUnknown(false);
                  setPropertyId(e.target.value);
                  setBuildingId("");
                  setUnitId("");
                }
              }}
              aria-label="Property"
              className={inputClass}
              disabled={submitting}
            >
              <option value="">Select a property…</option>
              {(properties ?? []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
              <option value="__unknown">Location unknown</option>
            </select>
            {fieldErrors.propertyId && (
              <span role="alert" className="text-xs text-destructive">
                {fieldErrors.propertyId}
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTitleClass}>Building</span>
              {(suggestedBuilding ?? "") !== buildingId && (
                <AiHint
                  value={
                    suggestedBuilding === null
                      ? "none"
                      : nameFor(buildings, suggestedBuilding)
                  }
                />
              )}
              <select
                value={buildingId}
                onChange={(e) => {
                  setBuildingId(e.target.value);
                  setUnitId("");
                }}
                aria-label="Building"
                className={inputClass}
                disabled={submitting || propertyId === ""}
              >
                <option value="">None</option>
                {(buildings ?? []).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              <span className={labelTitleClass}>Unit</span>
              {(suggestedUnit ?? "") !== unitId && (
                <AiHint
                  value={
                    suggestedUnit === null
                      ? "none"
                      : nameFor(units, suggestedUnit)
                  }
                />
              )}
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                aria-label="Unit"
                className={inputClass}
                disabled={submitting || buildingId === ""}
              >
                <option value="">None</option>
                {(units ?? []).map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={labelClass}>
            <span className={labelTitleClass}>Next action</span>
            {suggestedNextAction !== undefined &&
              suggestedNextAction !== nextActionLabel && (
                <AiHint value={suggestedNextAction} />
              )}
            <input
              value={nextActionLabel}
              onChange={(e) => setNextActionLabel(e.target.value)}
              aria-label="Next action"
              placeholder="What happens next…"
              className={inputClass}
              disabled={submitting}
            />
          </label>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              AI details
            </summary>
            {missingItems.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Missing information
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {missingItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {relatedIds.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Possibly related cases
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {relatedIds.map((id) => (
                    <li key={id}>
                      <Link
                        to={`/cases?caseId=${id}`}
                        className="underline"
                      >
                        Open related case
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {missingItems.length === 0 && relatedIds.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No additional AI details.
              </p>
            )}
          </details>
        </div>

        <SheetFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Accept triage
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
