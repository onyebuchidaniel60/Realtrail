import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/common/toast";
import { errorMessage, getAppError, inputClass } from "./dialogUtils";

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

export function EditCaseDialog({
  open,
  onClose,
  record,
}: {
  open: boolean;
  onClose: () => void;
  record: Doc<"cases">;
}) {
  const updateFields = useMutation(api.cases.mutations.updateFields);
  const properties = useQuery(api.properties.list, open ? {} : "skip");

  const [title, setTitle] = useState(record.title);
  const [description, setDescription] = useState(record.description);
  const [category, setCategory] = useState<string>(record.category);
  const [priority, setPriority] = useState<string>(record.priority);
  const [propertyId, setPropertyId] = useState<string>(
    record.propertyId ?? "",
  );
  const [buildingId, setBuildingId] = useState<string>(
    record.buildingId ?? "",
  );
  const [unitId, setUnitId] = useState<string>(record.unitId ?? "");
  const [reporterName, setReporterName] = useState(record.reporterName ?? "");
  const [reporterEmail, setReporterEmail] = useState(
    record.reporterEmail ?? "",
  );
  const [nextActionLabel, setNextActionLabel] = useState(
    record.nextActionLabel ?? "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await updateFields({
        caseId: record._id,
        title,
        description,
        category: category as (typeof CATEGORIES)[number],
        priority: priority as (typeof PRIORITIES)[number],
        propertyId:
          propertyId === "" ? null : (propertyId as Id<"properties">),
        buildingId:
          buildingId === "" ? null : (buildingId as Id<"buildings">),
        unitId: unitId === "" ? null : (unitId as Id<"units">),
        reporterName: reporterName.trim() === "" ? undefined : reporterName,
        reporterEmail:
          reporterEmail.trim() === "" ? undefined : reporterEmail,
        nextActionLabel:
          nextActionLabel.trim() === "" ? undefined : nextActionLabel,
      });
      toast.success("Case updated");
      onClose();
    } catch (err) {
      const { code, field } = getAppError(err);
      if (code === "VALIDATION_ERROR" && field) {
        setErrors({ [field]: "This value was rejected. Check and retry." });
      } else {
        setFormError(errorMessage(err));
        toast.error(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit case #{record.caseNumber}</DialogTitle>
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
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
                disabled={submitting}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {record.priority === "URGENT" && priority !== "URGENT" && (
                <span className="text-sm text-muted-foreground">
                  Lowering URGENT priority requires owner or manager — the
                  server enforces this.
                </span>
              )}
              {errors.priority && (
                <span className="text-sm text-destructive">
                  {errors.priority}
                </span>
              )}
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Property</span>
            <select
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setBuildingId("");
                setUnitId("");
              }}
              className={inputClass}
              disabled={submitting}
            >
              <option value="">No property</option>
              {(properties ?? []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Building</span>
              <select
                value={buildingId}
                onChange={(e) => {
                  setBuildingId(e.target.value);
                  setUnitId("");
                }}
                className={inputClass}
                disabled={submitting || propertyId === ""}
              >
                <option value="">No building</option>
                {(buildings ?? []).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Unit</span>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className={inputClass}
                disabled={submitting || buildingId === ""}
              >
                <option value="">No unit</option>
                {(units ?? []).map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reporter name</span>
              <input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reporter email</span>
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
            <span className="font-medium">Next action label</span>
            <input
              value={nextActionLabel}
              onChange={(e) => setNextActionLabel(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
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
              Save changes
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
