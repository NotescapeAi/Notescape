import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export default function PublicLayout({ children, className = "" }: Props) {
  const contentClasses = [
    "public-shell__content",
    "mx-auto",
    "w-full",
    "px-4",
    "sm:px-6",
    "lg:px-8",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="public-shell min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-x-hidden">
      <Navbar />
      <main className="flex-1 w-full pt-[calc(var(--nav-height)+var(--nav-gap)+12px)]">
        <div className={contentClasses.trim()}>{children}</div>
      </main>
      <Footer />
    </div>
  );
}
