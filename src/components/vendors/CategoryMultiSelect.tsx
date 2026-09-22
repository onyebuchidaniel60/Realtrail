import type { Doc } from "../../../convex/_generated/dataModel";

export const VENDOR_CATEGORIES: Array<Doc<"vendors">["serviceCategories"][number]> = [
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

export function CategoryMultiSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: Array<string>;
  onChange: (next: Array<string>) => void;
  disabled?: boolean;
}) {
  function toggle(category: string) {
    if (value.includes(category)) {
      onChange(value.filter((c) => c !== category));
    } else if (value.length < 5) {
      onChange([...value, category]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3">
      {VENDOR_CATEGORIES.map((category) => (
        <label
          key={category}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="checkbox"
            checked={value.includes(category)}
            onChange={() => toggle(category)}
            disabled={disabled || (!value.includes(category) && value.length >= 5)}
          />
          {category}
        </label>
      ))}
      <p className="text-xs text-muted-foreground">
        Select between 1 and 5 categories.
      </p>
    </div>
  );
}
