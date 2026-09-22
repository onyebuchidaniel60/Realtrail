import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AISummaryCard } from "./AISummaryCard";

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: "c1",
    _creationTime: 1,
    workspaceId: "w1",
    caseNumber: 7,
    title: "Low water pressure",
    description: "Pressure dropped.",
    status: "NEW",
    priority: "MEDIUM",
    category: "water",
    aiTriageStatus: "completed",
    aiTriageOutput: {
      summary: "Residents report reduced pressure since yesterday.",
      suggestedNextAction: "Inspect the water pump.",
    },
    lastActivityAt: 2000,
    reopenCount: 0,
    locationUnknown: true,
    createdBy: "u1",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as never;
}

describe("AISummaryCard", () => {
  it("renders the AI label, summary, and next action when completed", () => {
    render(<AISummaryCard record={makeRecord()} onReview={() => {}} />);
    expect(screen.getByText("Realtrail AI")).toBeInTheDocument();
    expect(
      screen.getByText("Residents report reduced pressure since yesterday."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Inspect the water pump."),
    ).toBeInTheDocument();
  });

  it("calls onReview when Review triage is clicked", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(<AISummaryCard record={makeRecord()} onReview={onReview} />);
    await user.click(screen.getByRole("button", { name: "Review triage" }));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("renders a loading state when triage is pending", () => {
    render(
      <AISummaryCard
        record={makeRecord({ aiTriageStatus: "pending" })}
        onReview={() => {}}
      />,
    );
    expect(
      screen.getByText("AI is analyzing this report…"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review triage" }),
    ).not.toBeInTheDocument();
  });

  it("renders an error state when triage failed", () => {
    render(
      <AISummaryCard
        record={makeRecord({ aiTriageStatus: "failed" })}
        onReview={() => {}}
      />,
    );
    expect(
      screen.getByText(/AI triage failed\. You can still triage/),
    ).toBeInTheDocument();
  });

  it("renders nothing when triage never started", () => {
    const { container } = render(
      <AISummaryCard
        record={makeRecord({ aiTriageStatus: "not_started" })}
        onReview={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when completed output is missing", () => {
    const { container } = render(
      <AISummaryCard
        record={makeRecord({ aiTriageOutput: undefined })}
        onReview={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an HTML payload in the summary as text, not markup", () => {
    const { container } = render(
      <AISummaryCard
        record={makeRecord({
          aiTriageOutput: {
            summary: '<script>alert("x")</script> attempt',
            suggestedNextAction: '<img src=x onerror="y()"> action',
          },
        })}
        onReview={() => {}}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText('<script>alert("x")</script> attempt'),
    ).toBeInTheDocument();
  });
});
