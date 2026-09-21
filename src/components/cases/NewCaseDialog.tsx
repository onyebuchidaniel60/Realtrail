import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSyncStatus } from "@/hooks/useSyncUser";

const CATEGORIES = [
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
] as const;

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function getAppError(err: unknown): { code?: string; field?: string } {
  if (typeof err === "object" && err !== null && "data" in err) {
    const data = (err as { data?: { code?: string; field?: string } }).data;
    return { code: data?.code, field: data?.field };
  }
  return {};
}

const inputClass =
  "rounded-md border bg-background px-3 py-2 disabled:opacity-50";

export function NewCaseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { userId } = useSyncStatus();
  const createCase = useMutation(api.cases.mutations.createManual);
  const properties = useQuery(api.properties.list, open ? {} : "skip");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [locationUnknown, setLocationUnknown] = useState(false);
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("other");
  const [priority, setPriority] =
    useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [assignee, setAssignee] = useState<"unassigned" | "me">("unassigned");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const buildings = useQuery(
    api.buildings.listByProperty,
    open && propertyId !== "" && !locationUnknown
      ? { propertyId: propertyId as Id<"properties"> }
      : "skip",
  );
  const units = useQuery(
    api.units.listByBuilding,
    open && buildingId !== ""
      ? { buildingId: buildingId as Id<"buildings"> }
      : "skip",
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    const localErrors: Record<string, string> = {};
    if (title.trim().length < 3 || title.trim().length > 120) {
      localErrors.title = "Title must be 3–120 characters.";
    }
    if (description.trim().length < 3 || description.trim().length > 10000) {
      localErrors.description = "Description must be 3–10000 characters.";
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setSubmitting(true);
    try {
      await createCase({
        title,
        description,
        propertyId:
          locationUnknown || propertyId === ""
            ? undefined
            : (propertyId as Id<"properties">),
        buildingId:
          locationUnknown || buildingId === ""
            ? undefined
            : (buildingId as Id<"buildings">),
        unitId:
          locationUnknown || unitId === ""
            ? undefined
            : (unitId as Id<"units">),
        category,
        priority,
        reporterName: reporterName.trim() === "" ? undefined : reporterName,
        reporterEmail:
          reporterEmail.trim() === "" ? undefined : reporterEmail,
        assigneeId:
          assignee === "me" && userId !== null ? userId : undefined,
        locationUnknown,
      });
      onClose();
    } catch (err) {
      const { code, field } = getAppError(err);
      if (code === "VALIDATION_ERROR" && field) {
        setErrors({ [field]: "This value was rejected. Check and retry." });
      } else {
        setFormError("Something went wrong. Check your input and retry.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handlePropertyChange(value: string) {
    setPropertyId(value);
    setBuildingId("");
    setUnitId("");
  }

  // TODO(Phase 3-B-2 / member directory): assignee list currently offers
  // only Unassigned + Me. A full workspace member picker needs a
  // member-list query that does not exist yet.
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New case</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
            {errors.title && (
              <span className="text-sm text-destructive">{errors.title}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={inputClass}
              disabled={submitting}
            />
            {errors.description && (
              <span className="text-sm text-destructive">
                {errors.description}
              </span>
            )}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={locationUnknown}
              onChange={(e) => setLocationUnknown(e.target.checked)}
              disabled={submitting}
            />
            <span className="font-medium">Location unknown</span>
          </label>
          {!locationUnknown && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Property (optional)</span>
                <select
                  value={propertyId}
                  onChange={(e) => handlePropertyChange(e.target.value)}
                  className={inputClass}
                  disabled={submitting}
                >
                  <option value="">Select a property</option>
                  {(properties ?? []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Building (optional)</span>
                <select
                  value={buildingId}
                  onChange={(e) => {
                    setBuildingId(e.target.value);
                    setUnitId("");
                  }}
                  className={inputClass}
                  disabled={submitting || propertyId === ""}
                >
                  <option value="">Select a building</option>
                  {(buildings ?? []).map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Unit (optional)</span>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className={inputClass}
                  disabled={submitting || buildingId === ""}
                >
                  <option value="">Select a unit</option>
                  {(units ?? []).map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Category</span>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as (typeof CATEGORIES)[number])
                }
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Priority</span>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as (typeof PRIORITIES)[number])
                }
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
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reporter name (optional)</span>
              <input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
              {errors.reporterName && (
                <span className="text-sm text-destructive">
                  {errors.reporterName}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reporter email (optional)</span>
              <input
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
              {errors.reporterEmail && (
                <span className="text-sm text-destructive">
                  {errors.reporterEmail}
                </span>
              )}
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Assignee</span>
            <select
              value={assignee}
              onChange={(e) =>
                setAssignee(e.target.value as "unassigned" | "me")
              }
              className={inputClass}
              disabled={submitting}
            >
              <option value="unassigned">Unassigned</option>
              <option value="me">Assign to me</option>
            </select>
          </label>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Create case
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
