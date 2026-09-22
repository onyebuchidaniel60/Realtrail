import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/common/toast";
import { errorMessage, getAppError, inputClass } from "@/components/cases/dialogs/dialogUtils";
import { CategoryMultiSelect } from "./CategoryMultiSelect";

type Category = Doc<"vendors">["serviceCategories"][number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(fields: {
  name: string;
  serviceCategories: Array<string>;
  email: string;
  phone: string;
  website: string;
  location: string;
  notes: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (fields.name.trim().length < 1 || fields.name.trim().length > 120) {
    errors.name = "Name must be 1..120 characters.";
  }
  if (
    fields.serviceCategories.length < 1 ||
    fields.serviceCategories.length > 5
  ) {
    errors.serviceCategories = "Pick 1 to 5 service categories.";
  }
  if (fields.email.trim() !== "" && !EMAIL_PATTERN.test(fields.email.trim())) {
    errors.email = "Email is invalid.";
  }
  if (fields.phone.trim() !== "" && fields.phone.trim().length > 30) {
    errors.phone = "Phone must be at most 30 characters.";
  }
  if (
    fields.website.trim() !== "" &&
    !(
      fields.website.trim().startsWith("https://") ||
      fields.website.trim().startsWith("http://")
    )
  ) {
    errors.website = "Website must start with https:// or http://.";
  }
  if (
    fields.location.trim() !== "" &&
    (fields.location.trim().length < 1 || fields.location.trim().length > 120)
  ) {
    errors.location = "Location must be 1..120 characters.";
  }
  if (fields.notes.trim().length > 2000) {
    errors.notes = "Notes must be at most 2000 characters.";
  }
  return errors;
}

// No delete flow in MVP — deliberate. Removing a vendor would orphan
// case links and research evidence; deletion needs an explicit
// product decision first.
export function VendorFormDrawer({
  open,
  onClose,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  mode: { kind: "add" } | { kind: "edit"; vendor: Doc<"vendors"> };
}) {
  const saveVendor = useMutation(api.vendors.save);
  const updateVendor = useMutation(api.vendors.update);
  const editing = mode.kind === "edit" ? mode.vendor : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [serviceCategories, setServiceCategories] = useState<Array<string>>(
    editing ? [...editing.serviceCategories] : [],
  );
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [website, setWebsite] = useState(editing?.website ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const fields = { name, serviceCategories, email, phone, website, location, notes };
    const clientErrors = validate(fields);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const trimmedEmail = email.trim();
      const payload = {
        name: name.trim(),
        serviceCategories: serviceCategories as Array<Category>,
        email: trimmedEmail === "" ? undefined : trimmedEmail,
        phone: phone.trim() === "" ? undefined : phone.trim(),
        website: website.trim() === "" ? undefined : website.trim(),
        location: location.trim() === "" ? undefined : location.trim(),
        notes: notes.trim() === "" ? undefined : notes.trim(),
      };
      if (editing) {
        await updateVendor({ vendorId: editing._id, ...payload });
      } else {
        // Source is always manual from this drawer — the UI never lets
        // the user override it. Firecrawl-sourced vendors are created
        // through the discovery save flow.
        await saveVendor({ ...payload, source: "manual" });
      }
      toast.success("Vendor saved");
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

  function fieldError(name: string) {
    return fieldErrors[name] ? (
      <span role="alert" className="text-xs text-destructive">
        {fieldErrors[name]}
      </span>
    ) : null;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit vendor" : "Add vendor"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name"
              className={inputClass}
              disabled={submitting}
            />
            {fieldError("name")}
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Service categories</span>
            <CategoryMultiSelect
              value={serviceCategories}
              onChange={setServiceCategories}
              disabled={submitting}
            />
            {fieldError("serviceCategories")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                className={inputClass}
                disabled={submitting}
              />
              {fieldError("email")}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Phone</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-label="Phone"
                className={inputClass}
                disabled={submitting}
              />
              {fieldError("phone")}
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Website</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              aria-label="Website"
              placeholder="https://…"
              className={inputClass}
              disabled={submitting}
            />
            {fieldError("website")}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label="Location"
              className={inputClass}
              disabled={submitting}
            />
            {fieldError("location")}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-label="Notes"
              rows={3}
              className={inputClass}
              disabled={submitting}
            />
            {fieldError("notes")}
          </label>
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
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
