import { useMutation, useQuery } from "convex/react";
import { Building2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { QueryErrorBoundary } from "@/components/common/ErrorBoundary";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import {
  StatusBadge,
  occupancyVariant,
} from "@/components/common/StatusBadge";
import { LoadingSkeleton as PageSkeleton } from "@/components/layout/ProtectedRoute";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSyncStatus } from "@/hooks/useSyncUser";

function getAppError(err: unknown): { code?: string; field?: string } {
  if (typeof err === "object" && err !== null && "data" in err) {
    const data = (err as { data?: { code?: string; field?: string } }).data;
    return { code: data?.code, field: data?.field };
  }
  return {};
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
    </label>
  );
}

const inputClass =
  "rounded-md border bg-background px-3 py-2 disabled:opacity-50";

function PropertyDialog({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (propertyId: Id<"properties">) => void;
  editing: Doc<"properties"> | null;
}) {
  const createProperty = useMutation(api.properties.create);
  const updateProperty = useMutation(api.properties.update);
  const [name, setName] = useState(editing?.name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [city, setCity] = useState(editing?.city ?? "");
  const [country, setCountry] = useState(editing?.country ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const result = editing
        ? await updateProperty({
            propertyId: editing._id,
            name,
            address,
            city: city.trim() === "" ? undefined : city,
            country: country.trim() === "" ? undefined : country,
          })
        : await createProperty({
            name,
            address,
            city: city.trim() === "" ? undefined : city,
            country: country.trim() === "" ? undefined : country,
          });
      onSaved(result.propertyId);
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit property" : "Add property"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Name" error={errors.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Address" error={errors.address}>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="City (optional)" error={errors.city}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Country (optional)" error={errors.country}>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
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
              {editing ? "Save changes" : "Create property"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BuildingDialog({
  open,
  onClose,
  propertyId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: Id<"properties">;
  editing: Doc<"buildings"> | null;
}) {
  const createBuilding = useMutation(api.buildings.create);
  const updateBuilding = useMutation(api.buildings.update);
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      if (editing) {
        await updateBuilding({
          buildingId: editing._id,
          name,
          code: code.trim() === "" ? undefined : code,
        });
      } else {
        await createBuilding({
          propertyId,
          name,
          code: code.trim() === "" ? undefined : code,
        });
      }
      onClose();
    } catch (err) {
      const { code: errCode, field } = getAppError(err);
      if (errCode === "VALIDATION_ERROR" && field) {
        setErrors({ [field]: "This value was rejected. Check and retry." });
      } else {
        setFormError("Something went wrong. Check your input and retry.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit building" : "Add building"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Name" error={errors.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Block C"
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Code (optional)" error={errors.code}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BLKC"
              className={inputClass}
              disabled={submitting}
            />
          </Field>
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
              {editing ? "Save changes" : "Create building"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnitDialog({
  open,
  onClose,
  buildingId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  buildingId: Id<"buildings">;
  editing: Doc<"units"> | null;
}) {
  const createUnit = useMutation(api.units.create);
  const updateUnit = useMutation(api.units.update);
  const [label, setLabel] = useState(editing?.label ?? "");
  const [occupancyStatus, setOccupancyStatus] = useState<
    "occupied" | "vacant" | "unknown"
  >(editing?.occupancyStatus ?? "unknown");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      if (editing) {
        await updateUnit({ unitId: editing._id, label, occupancyStatus });
      } else {
        await createUnit({ buildingId, label, occupancyStatus });
      }
      onClose();
    } catch (err) {
      const { code: errCode, field } = getAppError(err);
      if (errCode === "VALIDATION_ERROR" && field) {
        setErrors({ [field]: "This value was rejected. Check and retry." });
      } else {
        setFormError("Something went wrong. Check your input and retry.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit unit" : "Add unit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Label" error={errors.label}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Flat 4B"
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Occupancy">
            <select
              value={occupancyStatus}
              onChange={(e) =>
                setOccupancyStatus(
                  e.target.value as "occupied" | "vacant" | "unknown",
                )
              }
              className={inputClass}
              disabled={submitting}
            >
              <option value="occupied">Occupied</option>
              <option value="vacant">Vacant</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
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
              {editing ? "Save changes" : "Create unit"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PropertiesPage() {
  return (
    <QueryErrorBoundary
      fallback={(_error, reset) => (
        <ErrorState message="Could not load properties." onRetry={reset} />
      )}
    >
      <PropertiesBody />
    </QueryErrorBoundary>
  );
}

function PropertiesBody() {
  const { synced } = useSyncStatus();
  const properties = useQuery(api.properties.list, synced ? {} : "skip");

  const [selectedPropertyId, setSelectedPropertyId] =
    useState<Id<"properties"> | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] =
    useState<Id<"buildings"> | null>(null);
  const [propertyDialog, setPropertyDialog] = useState<{
    open: boolean;
    editing: Doc<"properties"> | null;
  }>({ open: false, editing: null });
  const [buildingDialog, setBuildingDialog] = useState<{
    open: boolean;
    editing: Doc<"buildings"> | null;
  }>({ open: false, editing: null });
  const [unitDialog, setUnitDialog] = useState<{
    open: boolean;
    editing: Doc<"units"> | null;
  }>({ open: false, editing: null });

  const effectivePropertyId =
    selectedPropertyId ?? properties?.[0]?._id ?? null;
  const buildings = useQuery(
    api.buildings.listByProperty,
    effectivePropertyId ? { propertyId: effectivePropertyId } : "skip",
  );
  const selectedProperty =
    properties?.find((p) => p._id === effectivePropertyId) ?? null;

  const effectiveBuildingId =
    selectedBuildingId ?? buildings?.[0]?._id ?? null;
  const units = useQuery(
    api.units.listByBuilding,
    effectiveBuildingId ? { buildingId: effectiveBuildingId } : "skip",
  );
  const selectedBuilding =
    buildings?.find((b) => b._id === effectiveBuildingId) ?? null;

  if (properties === undefined) {
    return <PageSkeleton />;
  }

  function selectProperty(id: Id<"properties">) {
    setSelectedPropertyId(id);
    setSelectedBuildingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Properties</h1>
          <p className="text-sm text-muted-foreground">
            Estate structure: properties, buildings, units
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPropertyDialog({ open: true, editing: null })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add property
        </button>
      </header>

      {properties.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-8" />}
          title="No properties yet"
          description="Add your first property to start structuring the estate."
          action={
            <button
              type="button"
              onClick={() => setPropertyDialog({ open: true, editing: null })}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Add property
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row">
          <section
            aria-label="Property list"
            className="flex gap-2 overflow-x-auto pb-1 xl:w-2/5 xl:flex-col xl:overflow-visible"
          >
            {properties.map((property) => (
              <button
                key={property._id}
                type="button"
                onClick={() => selectProperty(property._id)}
                className={`min-w-52 shrink-0 rounded-xl border p-4 text-left xl:min-w-0 ${
                  property._id === effectivePropertyId
                    ? "border-primary bg-accent"
                    : "bg-card hover:bg-accent/50"
                }`}
              >
                <p className="font-medium">{property.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {property.address}
                </p>
              </button>
            ))}
          </section>

          <section className="flex flex-1 flex-col gap-6">
            {selectedProperty === null ? (
              <LoadingSkeleton rows={3} />
            ) : (
              <>
                <div className="rounded-xl border bg-card p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-medium">
                        {selectedProperty.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedProperty.address}
                        {selectedProperty.city
                          ? ` · ${selectedProperty.city}`
                          : ""}
                        {selectedProperty.country
                          ? ` · ${selectedProperty.country}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Edit ${selectedProperty.name}`}
                      onClick={() =>
                        setPropertyDialog({
                          open: true,
                          editing: selectedProperty,
                        })
                      }
                      className="rounded-md p-2 hover:bg-accent"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Buildings</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setBuildingDialog({ open: true, editing: null })
                      }
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                      <Plus className="size-4" /> Add building
                    </button>
                  </div>
                  {buildings === undefined ? (
                    <div className="mt-4">
                      <LoadingSkeleton rows={2} />
                    </div>
                  ) : buildings.length === 0 ? (
                    <div className="mt-4">
                      <EmptyState
                        title="No buildings yet"
                        description="Add the first building for this property."
                        action={
                          <button
                            type="button"
                            onClick={() =>
                              setBuildingDialog({ open: true, editing: null })
                            }
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                          >
                            Create first building
                          </button>
                        }
                      />
                    </div>
                  ) : (
                    <ul className="mt-4 flex flex-col gap-2">
                      {buildings.map((building) => (
                        <li key={building._id}>
                          <div
                            className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${
                              building._id === effectiveBuildingId
                                ? "border-primary bg-accent"
                                : "hover:bg-accent/50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedBuildingId(building._id)
                              }
                              className="flex flex-1 items-center gap-2 text-left"
                            >
                              <span className="font-medium">
                                {building.name}
                              </span>
                              {building.code && (
                                <StatusBadge>{building.code}</StatusBadge>
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit ${building.name}`}
                              onClick={() =>
                                setBuildingDialog({
                                  open: true,
                                  editing: building,
                                })
                              }
                              className="rounded-md p-2 hover:bg-accent"
                            >
                              <Pencil className="size-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selectedBuilding !== null && (
                  <div className="rounded-xl border bg-card p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">
                        Units · {selectedBuilding.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          setUnitDialog({ open: true, editing: null })
                        }
                        className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                      >
                        <Plus className="size-4" /> Add unit
                      </button>
                    </div>
                    {units === undefined ? (
                      <div className="mt-4">
                        <LoadingSkeleton rows={2} />
                      </div>
                    ) : units.length === 0 ? (
                      <div className="mt-4">
                        <EmptyState
                          title="No units yet"
                          description="Add the first unit for this building."
                          action={
                            <button
                              type="button"
                              onClick={() =>
                                setUnitDialog({ open: true, editing: null })
                              }
                              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                            >
                              Create first unit
                            </button>
                          }
                        />
                      </div>
                    ) : (
                      <ul className="mt-4 flex flex-col gap-2">
                        {units.map((unit) => (
                          <li
                            key={unit._id}
                            className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                          >
                            <span className="flex items-center gap-2">
                              <span className="font-medium">{unit.label}</span>
                              <StatusBadge
                                variant={occupancyVariant(
                                  unit.occupancyStatus,
                                )}
                              >
                                {unit.occupancyStatus}
                              </StatusBadge>
                            </span>
                            <button
                              type="button"
                              aria-label={`Edit ${unit.label}`}
                              onClick={() =>
                                setUnitDialog({ open: true, editing: unit })
                              }
                              className="rounded-md p-2 hover:bg-accent"
                            >
                              <Pencil className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {propertyDialog.open && (
        <PropertyDialog
          open
          editing={propertyDialog.editing}
          onClose={() => setPropertyDialog({ open: false, editing: null })}
          onSaved={(propertyId) => selectProperty(propertyId)}
        />
      )}
      {buildingDialog.open && effectivePropertyId && (
        <BuildingDialog
          open
          propertyId={effectivePropertyId}
          editing={buildingDialog.editing}
          onClose={() => setBuildingDialog({ open: false, editing: null })}
        />
      )}
      {unitDialog.open && effectiveBuildingId && (
        <UnitDialog
          open
          buildingId={effectiveBuildingId}
          editing={unitDialog.editing}
          onClose={() => setUnitDialog({ open: false, editing: null })}
        />
      )}
    </div>
  );
}
