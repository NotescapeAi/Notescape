import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

function Hello() { return <h1>Hello</h1>; }

describe("Hello", () => {
  it("renders heading", () => {
    render(<Hello />);
    expect(screen.getByRole("heading", { name: /hello/i })).toBeInTheDocument();
  });
});
