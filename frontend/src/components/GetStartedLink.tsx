import { Link } from "react-router-dom";

/** Replace this with your real auth check later */
function isLoggedIn() {
  return !!localStorage.getItem("auth_token"); // or cookie/jwt check
}

export default function GetStartedLink(
  { children = "Get started", className = "" }:
  { children?: React.ReactNode; className?: string }
) {
  const href = isLoggedIn() ? "/classes" : "/signup";
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
