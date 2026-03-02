import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Signup from "./Signup";
import * as firebaseAuth from "../firebase/firebaseAuth";
import { FirebaseError } from "firebase/app";

// Mock dependencies
vi.mock("../firebase/firebaseAuth", () => ({
  signup: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGithub: vi.fn(),
}));

vi.mock("../firebase/firebase", () => ({
  auth: { currentUser: { emailVerified: false } },
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
  sendEmailVerification: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("Signup Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the signup page", () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );
    expect(screen.getByText(/Sign Up/i)).toBeInTheDocument();
    expect(screen.getByText(/Continue with e-mail/i)).toBeInTheDocument();
  });

  it("shows validation error when fields are empty", async () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    // Click "Continue with e-mail" to reveal form
    const emailBtn = screen.getByText(/Continue with e-mail/i);
    fireEvent.click(emailBtn);

    const submitBtn = screen.getByRole("button", { name: /Sign Up/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Please fill all fields/i)).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText(/Continue with e-mail/i));

    fireEvent.change(screen.getByPlaceholderText(/Email/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password456" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument();
  });

  it("calls signup function on valid submission", async () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText(/Continue with e-mail/i));

    fireEvent.change(screen.getByPlaceholderText(/Email/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    await waitFor(() => {
      expect(firebaseAuth.signup).toHaveBeenCalledWith("test@example.com", "password123");
    });
  });

  it("handles signup error (email already in use)", async () => {
    const error = new FirebaseError("auth/email-already-in-use", "Email already in use");
    vi.mocked(firebaseAuth.signup).mockRejectedValueOnce(error);

    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText(/Continue with e-mail/i));

    fireEvent.change(screen.getByPlaceholderText(/Email/i), {
      target: { value: "existing@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    expect(await screen.findByText(/This email is already in use/i)).toBeInTheDocument();
  });

  it("handles network error", async () => {
    const error = new Error("Network Error");
    vi.mocked(firebaseAuth.signup).mockRejectedValueOnce(error);

    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    // Click "Continue with e-mail" to reveal form
    const emailBtn = screen.getByText(/Continue with e-mail/i);
    fireEvent.click(emailBtn);

    fireEvent.change(screen.getByPlaceholderText(/Email/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    expect(await screen.findByText(/Failed to sign up. Please try again./i)).toBeInTheDocument();
  });
});
