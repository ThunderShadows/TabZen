import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Popup } from "./Popup";
import type { Session } from "../lib/types";

describe("Popup", () => {
  it("shows the open tab count and a disabled Tidy Up button with 0 or 1 tabs", () => {
    render(<Popup tabCount={1} sessions={[]} onTidyUp={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/1 tab open/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tidy up/i })).toBeDisabled();
  });

  it("enables Tidy Up with 2+ tabs and calls onTidyUp when clicked", () => {
    const onTidyUp = vi.fn();
    render(<Popup tabCount={5} sessions={[]} onTidyUp={onTidyUp} onRestore={vi.fn()} onDelete={vi.fn()} />);
    const button = screen.getByRole("button", { name: /tidy up/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onTidyUp).toHaveBeenCalledOnce();
  });

  it("renders session cards with restore and delete actions", () => {
    const sessions: Session[] = [
      { id: "s1", createdAt: Date.now(), groups: [{ name: "Research", tabs: [{ title: "Vue docs", url: "https://vuejs.org" }] }] },
    ];
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    render(<Popup tabCount={3} sessions={sessions} onTidyUp={vi.fn()} onRestore={onRestore} onDelete={onDelete} />);
    expect(screen.getByText("Research")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("s1");
  });
});
