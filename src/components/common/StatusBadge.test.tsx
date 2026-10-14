import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the text label with neutral styling by default", () => {
    render(<StatusBadge>Pending</StatusBadge>);
    const chip = screen.getByText("Pending");
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain("bg-muted");
  });

  it("maps success to the positive color", () => {
    render(<StatusBadge variant="success">Resolved</StatusBadge>);
    const chip = screen.getByText("Resolved");
    expect(chip.className).toContain("bg-green-100");
    expect(chip.className).toContain("text-green-800");
  });

  it("maps warning to the warm yellow color", () => {
    render(<StatusBadge variant="warning">Awaiting</StatusBadge>);
    const chip = screen.getByText("Awaiting");
    expect(chip.className).toContain("bg-yellow-100");
    expect(chip.className).toContain("text-yellow-800");
  });

  it("maps danger to the urgency red", () => {
    render(<StatusBadge variant="danger">Urgent</StatusBadge>);
    const chip = screen.getByText("Urgent");
    expect(chip.className).toContain("bg-red-100");
    expect(chip.className).toContain("text-red-800");
  });

  it("maps brand to the subtle primary tint for AI provenance", () => {
    render(<StatusBadge variant="brand">AI-generated</StatusBadge>);
    const chip = screen.getByText("AI-generated");
    expect(chip.className).toContain("bg-primary/10");
    expect(chip.className).toContain("text-primary");
  });
});
