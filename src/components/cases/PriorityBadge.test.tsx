import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriorityBadge, type Priority } from "./PriorityBadge";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

describe("PriorityBadge", () => {
  it("renders a text label for every priority (never color-only)", () => {
    for (const priority of PRIORITIES) {
      const { unmount } = render(<PriorityBadge priority={priority} />);
      expect(screen.getByText(priority)).toBeInTheDocument();
      unmount();
    }
  });

  it("signals URGENT in danger red and HIGH in warning yellow", () => {
    const { unmount } = render(<PriorityBadge priority="URGENT" />);
    expect(screen.getByText("URGENT").className).toContain("bg-red-100");
    unmount();
    render(<PriorityBadge priority="HIGH" />);
    expect(screen.getByText("HIGH").className).toContain("bg-yellow-100");
  });
});
